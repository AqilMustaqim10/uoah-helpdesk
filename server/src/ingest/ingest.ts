// One pass over the helpdesk mailbox: new mail becomes tickets and replies.
//  - each message is tracked by its UIDL (UNIQUE in the database), so it is never handled twice
//  - the first ever run only records what is already in the mailbox ("baseline"), no tickets
//  - every message is CLAIMED and acted on inside ONE database transaction
//  - a database lock makes sure two workers never run at the same time
import { simpleParser, type ParsedMail } from "mailparser";
import { DEFAULT_PRIORITY } from "../config/constants";
import { audit } from "../db/audit";
import { pool, withTx } from "../db/pool";
import type { Db } from "../db/pool";
import { ticketRef } from "../lib/sql";
import { isAllowedDomain, tryNormEmail } from "../lib/validate";
import { canSeeTicketRow } from "../security/scope";
import {
  notifyReply,
  notifyTicketCreated,
  sendRejectionEmail,
} from "../services/notify";
import { classifyMessage } from "./classify";
import { cleanBody, cleanSubject, sanitizeBody } from "./cleaner";
import { Pop3Client, pop3FromConfig, type MailboxEntry } from "./pop3";
import { config } from "../config/env";

type Outcome =
  | "IGNORED_AUTO"
  | "COMMENT_ADDED"
  | "TICKET_CREATED"
  | "UNKNOWN_REJECTED"
  | "UNKNOWN_IGNORED"
  | "ERROR_SKIPPED";

interface Done {
  note: string; // one line for the log
  after?: () => void; // runs AFTER the transaction has committed (sends emails)
}

interface KnownUser {
  id: number;
  email: string;
  name: string;
  role: "ADMIN" | "IT" | "USER";
  business_unit_id: number | null;
}

const BASELINE_KEY = "__helpdesk_baseline_done__";
const LOCK_KEY = 727_001; // any fixed number; shared by every worker
const MAX_PER_RUN = 50; // at most this many new messages per pass
const MAX_MESSAGE_BYTES = 10 * 1024 * 1024; // bigger messages are skipped (attachments are not imported)
const MAX_ATTEMPTS = 3; // a message that keeps failing is skipped after this many tries

const failures = new Map<string, number>();

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function senderOf(mail: ParsedMail): string | null {
  const address = mail.from?.value?.[0]?.address;
  return address ? tryNormEmail(address) : null;
}

/** "[HD-12]" in the subject -> 12 */
function threadedTicketId(subject: string): number | null {
  const m = /\[HD-(\d{1,15})\]/i.exec(subject);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

async function recordSkip(uidl: string, from: string | null): Promise<void> {
  await pool.query(
    `INSERT INTO processed_messages (uidl, outcome, from_email) VALUES ($1, 'ERROR_SKIPPED', $2)
     ON CONFLICT (uidl) DO NOTHING`,
    [uidl, from],
  );
}

// ---------------------------------------------------------------------------
// creating a ticket or a reply from an email (inside the claim transaction)
// ---------------------------------------------------------------------------

// CHANGED: new parameter "names" (the sender's names, used to spot their signature)
async function addComment(
  c: Db,
  u: KnownUser,
  ticketId: number,
  text: string,
  names: string[],
): Promise<number> {
  const body =
    sanitizeBody(cleanBody(text, { names }), 10000) || "(empty message)"; // CHANGED
  const raw = sanitizeBody(text, 100000) || null;

  const ins = await c.query(
    `INSERT INTO comments (ticket_id, author_id, body, raw_body, is_internal, source)
     VALUES ($1, $2, $3, $4, FALSE, 'EMAIL') RETURNING id`,
    [ticketId, u.id, body, raw], // email can only ever make PUBLIC replies, never internal notes
  );
  await c.query("UPDATE tickets SET updated_at = now() WHERE id = $1", [
    ticketId,
  ]);
  await audit(c, {
    actorId: u.id,
    action: "COMMENT_ADDED",
    entityType: "comment",
    entityId: ins.rows[0].id,
    ticketId,
    details: { internal: false, source: "EMAIL" },
  });
  return ins.rows[0].id as number;
}

// CHANGED: new parameter "names"
async function createTicket(
  c: Db,
  u: KnownUser,
  subject: string,
  text: string,
  followUpOf: number | null,
  names: string[],
): Promise<number> {
  let title = cleanSubject(subject);
  if (title.length < 3) title = "Email request";

  let description =
    sanitizeBody(cleanBody(text, { names }), 19000) || "Email without text."; // CHANGED
  if (followUpOf)
    description = `Follow-up to ${ticketRef(followUpOf)} (closed).\n\n${description}`;
  const raw = sanitizeBody(text, 100000) || null;

  const ins = await c.query(
    `INSERT INTO tickets (title, description, raw_body, priority, business_unit_id, created_by, requester_email, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'EMAIL') RETURNING id`,
    [
      title,
      description,
      raw,
      DEFAULT_PRIORITY,
      u.business_unit_id,
      u.id,
      u.email,
    ],
  );
  const id: number = ins.rows[0].id;
  await audit(c, {
    actorId: u.id,
    action: "TICKET_CREATED",
    entityType: "ticket",
    entityId: id,
    ticketId: id,
    details: {
      priority: DEFAULT_PRIORITY,
      business_unit_id: u.business_unit_id,
      source: "EMAIL",
      ...(followUpOf ? { follow_up_of: followUpOf } : {}),
    },
  });
  return id;
}

// ---------------------------------------------------------------------------
// one message
// ---------------------------------------------------------------------------

async function handleMessage(uidl: string, mail: ParsedMail): Promise<void> {
  const from = senderOf(mail);
  const subject = mail.subject ?? "";
  const text = mail.text ?? "";
  const verdict = classifyMessage(mail);

  const result: Done | null = await withTx(async (c) => {
    // CLAIM: if another process already handled this message, the insert does nothing and we stop
    const claim = await c.query(
      `INSERT INTO processed_messages (uidl, outcome, from_email) VALUES ($1, 'ERROR_SKIPPED', $2)
       ON CONFLICT (uidl) DO NOTHING RETURNING id`,
      [uidl, from],
    );
    if (!claim.rows[0]) return null;
    const claimId: number = claim.rows[0].id;

    const finish = (outcome: Outcome, ticketId: number | null = null) =>
      c.query(
        "UPDATE processed_messages SET outcome = $2, ticket_id = $3 WHERE id = $1",
        [claimId, outcome, ticketId],
      );

    // 1) Automatic mail, or no usable sender: ignore (and never answer it)
    if (verdict.auto || !from) {
      await finish("IGNORED_AUTO");
      return {
        note: `ignored automatic mail (${verdict.reason ?? "no valid sender"})`,
      };
    }

    // 2) Who is the sender? Disabled people count as unknown.
    const found = await c.query(
      "SELECT id, email, name, role, is_active, business_unit_id FROM users WHERE email = $1",
      [from],
    );
    const u = found.rows[0];

    if (!u || !u.is_active) {
      // Unknown sender: only addresses on an allowed domain get ONE polite reply per 24 hours
      if (isAllowedDomain(from)) {
        const slot = await c.query(
          `INSERT INTO email_rejections (email, last_sent_at) VALUES ($1, now())
           ON CONFLICT (email) DO UPDATE SET last_sent_at = now()
             WHERE email_rejections.last_sent_at < now() - interval '24 hours'
           RETURNING email`,
          [from],
        );
        if (slot.rows[0]) {
          await finish("UNKNOWN_REJECTED");
          return {
            note: `unknown sender ${from}: rejection email queued`,
            after: () => sendRejectionEmail(from),
          };
        }
      }
      await finish("UNKNOWN_IGNORED");
      return { note: `unknown sender ${from}: ignored` };
    }

    const user: KnownUser = u;

    // CHANGED: the names a signature may start with (the account name and the name in the From header)
    const names = [user.name, mail.from?.value?.[0]?.name ?? ""];

    // 3) A reply to an existing ticket? Only if the sender may SEE that ticket.
    const threadId = threadedTicketId(subject);
    let target: { id: number; status: string } | null = null;
    if (threadId) {
      const t = await c.query(
        "SELECT id, status, created_by, business_unit_id FROM tickets WHERE id = $1 FOR UPDATE",
        [threadId],
      );
      const row = t.rows[0];
      if (row && canSeeTicketRow(user, row))
        target = { id: row.id, status: row.status };
      // otherwise: treated as a brand new ticket (nothing is revealed about the other ticket)
    }

    if (target && target.status !== "CLOSED") {
      const commentId = await addComment(c, user, target.id, text, names); // CHANGED
      await finish("COMMENT_ADDED", target.id);
      return {
        note: `reply added to ${ticketRef(target.id)} from ${from}`,
        after: () => notifyReply(target!.id, commentId, user.id),
      };
    }

    // 4) A new ticket (also used for replies to CLOSED tickets: closed tickets stay read-only)
    if (user.business_unit_id == null) {
      await finish("ERROR_SKIPPED");
      return {
        note: `skipped mail from ${from}: the account has no business unit`,
      };
    }
    const ticketId = await createTicket(
      c,
      user,
      subject,
      text,
      target ? target.id : null,
      names,
    ); // CHANGED
    await finish("TICKET_CREATED", ticketId);
    return {
      note: `${ticketRef(ticketId)} created from ${from}`,
      after: () => notifyTicketCreated(ticketId),
    };
  });

  if (result) {
    console.log(`[ingest] ${result.note}`);
    result.after?.(); // emails go out only AFTER the commit
  }
}

// ---------------------------------------------------------------------------
// the whole pass
// ---------------------------------------------------------------------------

/** First run ever: remember everything that is already in the mailbox, create nothing. */
async function recordBaseline(messages: MailboxEntry[]): Promise<void> {
  await withTx(async (c) => {
    await c.query(
      `INSERT INTO processed_messages (uidl, outcome)
       SELECT u, 'BASELINE' FROM unnest($1::text[]) AS u
       ON CONFLICT (uidl) DO NOTHING`,
      [messages.map((m) => m.uidl)],
    );
    await c.query(
      `INSERT INTO processed_messages (uidl, outcome) VALUES ($1, 'BASELINE') ON CONFLICT (uidl) DO NOTHING`,
      [BASELINE_KEY],
    );
  });
}

async function processFresh(
  client: Pop3Client,
  m: MailboxEntry,
): Promise<void> {
  if (m.size > MAX_MESSAGE_BYTES) {
    await recordSkip(m.uidl, null);
    console.warn(
      `[ingest] skipped a message larger than ${MAX_MESSAGE_BYTES / 1024 / 1024} MB`,
    );
    return;
  }

  // A problem while downloading (a broken connection) stops the whole pass; the next pass retries.
  const raw = await client.retrieve(m.number);

  // A problem with the message itself is counted; after MAX_ATTEMPTS it is skipped for good.
  try {
    const mail = await simpleParser(raw);
    await handleMessage(m.uidl, mail);
    failures.delete(m.uidl);
  } catch (err) {
    const tries = (failures.get(m.uidl) ?? 0) + 1;
    failures.set(m.uidl, tries);
    console.error(
      `[ingest] could not process a message (attempt ${tries}/${MAX_ATTEMPTS}):`,
      (err as Error).message,
    );
    if (tries >= MAX_ATTEMPTS) {
      await recordSkip(m.uidl, null);
      failures.delete(m.uidl);
      console.error(
        "[ingest] giving up on that message and marking it as skipped",
      );
    }
  }
}

async function doRun(): Promise<void> {
  const client = await Pop3Client.connect(pop3FromConfig());
  try {
    await client.login(config.pop3.user, config.pop3.pass);
    const messages = await client.list();

    const baseline = await pool.query(
      "SELECT 1 FROM processed_messages WHERE uidl = $1",
      [BASELINE_KEY],
    );
    if (!baseline.rows[0]) {
      await recordBaseline(messages);
      console.log(
        `[ingest] Baseline recorded: ${messages.length} existing message(s) will be ignored. New mail from now on becomes tickets.`,
      );
      await client.quit();
      return;
    }

    const known = await pool.query(
      "SELECT uidl FROM processed_messages WHERE uidl = ANY($1::text[])",
      [messages.map((m) => m.uidl)],
    );
    const done = new Set<string>(known.rows.map((r) => r.uidl));
    const fresh = messages.filter((m) => !done.has(m.uidl));

    if (fresh.length === 0) {
      console.log("[ingest] no new mail");
    } else {
      console.log(
        `[ingest] ${fresh.length} new message(s)${fresh.length > MAX_PER_RUN ? `, handling the first ${MAX_PER_RUN}` : ""}`,
      );
    }

    for (const m of fresh.slice(0, MAX_PER_RUN)) {
      await processFresh(client, m);
    }
    await client.quit();
  } finally {
    client.destroy();
  }
}

/** Runs one pass. Safe to call from several processes: a database lock lets only one run at a time. */
export async function runIngestOnce(): Promise<void> {
  const lockClient = await pool.connect();
  try {
    const got = await lockClient.query(
      "SELECT pg_try_advisory_lock($1::bigint) AS ok",
      [LOCK_KEY],
    );
    if (!got.rows[0].ok) {
      console.log(
        "[ingest] another worker is already running, skipping this pass",
      );
      return;
    }
    try {
      await doRun();
    } finally {
      await lockClient.query("SELECT pg_advisory_unlock($1::bigint)", [
        LOCK_KEY,
      ]);
    }
  } finally {
    lockClient.release();
  }
}
