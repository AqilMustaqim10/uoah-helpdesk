// Emails about tickets. Every function here is "fire and forget":
//  - call it AFTER the database transaction has committed
//  - it returns immediately and does its work in the background
//  - a failure is only logged, so a mail problem can never break the action that triggered it
// Rules: internal notes are never emailed, the person who did the action is never emailed about it,
// and people whose accounts are disabled are skipped. (Addresses ending in .local are skipped by the mailer.)
import { pool } from "../db/pool";
import { config } from "../config/env";
import { ticketRef } from "../lib/sql";
import { renderHtml, sendMail } from "./mailer";

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Awaiting your confirmation",
  CLOSED: "Closed",
};

/** Runs a job in the background. Any error is logged and swallowed. */
function background(label: string, job: () => Promise<void>): void {
  setImmediate(() => {
    job().catch((err) =>
      console.error(`[notify] ${label} failed:`, (err as Error).message),
    );
  });
}

interface TicketInfo {
  id: number;
  title: string;
  status: string;
  created_by: number;
  requester_email: string;
  requester_name: string;
  requester_active: boolean;
  assigned_to: number | null;
  assignee_name: string | null;
  assignee_email: string | null;
  assignee_active: boolean | null;
}

async function loadTicket(id: number): Promise<TicketInfo | null> {
  const r = await pool.query(
    `SELECT t.id, t.title, t.status, t.created_by, t.requester_email, t.assigned_to,
            ru.name AS requester_name, ru.is_active AS requester_active,
            au.name AS assignee_name, au.email AS assignee_email, au.is_active AS assignee_active
       FROM tickets t
       JOIN users ru ON ru.id = t.created_by
       LEFT JOIN users au ON au.id = t.assigned_to
      WHERE t.id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}

async function userName(id: number): Promise<string> {
  const r = await pool.query("SELECT name FROM users WHERE id = $1", [id]);
  return r.rows[0]?.name ?? "Someone";
}

/** A short piece of text for the email (the full text stays in the helpdesk). */
function excerpt(text: string, max = 1500): string {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** Builds and sends one ticket email. The [TKT-n] tag goes FIRST in the subject so replies can be matched. */
async function emailAbout(
  t: TicketInfo,
  to: string,
  lead: string,
  paragraphs: string[],
  includeLogo = true,
): Promise<void> {
  const ref = ticketRef(t.id);
  const ticketUrl = `${config.appUrl}/tickets/${ref}`;
  const canReply = !!config.pop3.host;
  const footer = canReply
    ? `You can reply to this email to add to the ticket. Please keep ${ref} in the subject.`
    : "This is an automatic message from UOA IT Helpdesk. Please do not reply.";

  const text = [
    ...paragraphs,
    "",
    `Open your ticket: ${ticketUrl}`,
    "",
    footer,
  ].join("\n");

  await sendMail({
    to,
    subject: `[${ref}] ${lead}: ${t.title}`,
    text,
    // renderHtml escapes every piece of text, so ticket titles and replies can never become HTML
    html: renderHtml({
      heading: lead,
      paragraphs,
      link: { url: ticketUrl, label: `Open ${ref}` },
      footer,
      logo: includeLogo,
    }),
    logo: includeLogo,
    headers: { "X-Helpdesk-Ticket": ref },
  });
}

// ---------------------------------------------------------------------------
// A ticket was created (on the web or from an email): acknowledge it to the requester.
// This is sent even when the requester created it themselves on the web.
// ---------------------------------------------------------------------------
export function notifyTicketCreated(ticketId: number): void {
  background("acknowledgment", async () => {
    const t = await loadTicket(ticketId);
    if (!t || !t.requester_active) return;
    await emailAbout(
      t,
      t.requester_email,
      "Request received",
      [
        `Hello ${t.requester_name},`,
        `Thanks for contacting UOA IT Helpdesk. We have received your request and created ticket ${ticketRef(t.id)}.`,
        `Request: ${t.title}`,
        "Our IT team will review it and follow up if we need more information.",
      ],
      true,
    );
  });
}

// ---------------------------------------------------------------------------
// The status changed: tell the requester (unless they made the change themselves).
// ---------------------------------------------------------------------------
export function notifyStatusChanged(
  ticketId: number,
  actorId: number,
  from: string,
  to: string,
): void {
  background("status change", async () => {
    const t = await loadTicket(ticketId);
    if (!t || !t.requester_active || t.created_by === actorId) return;

    const fromLabel = STATUS_LABEL[from] ?? from;
    const toLabel = STATUS_LABEL[to] ?? to;
    const lines = [
      `Hello ${t.requester_name},`,
      `There is an update to your request "${t.title}" (${ticketRef(t.id)}).`,
      `Status updated: ${fromLabel} -> ${toLabel}.`,
    ];
    if (to === "RESOLVED") {
      lines.push(
        "Please confirm the fix by opening the ticket and selecting \"Confirm resolved & close\", or reply with \"mark as resolved\". If you still need help, reply to this email and we will take another look.",
      );
    }
    await emailAbout(
      t,
      t.requester_email,
      `Status changed to ${toLabel}`,
      lines,
    );
  });
}

// ---------------------------------------------------------------------------
// The ticket was assigned to someone: tell them (unless they assigned it to themselves).
// ---------------------------------------------------------------------------
export function notifyAssigned(
  ticketId: number,
  actorId: number,
  assigneeId: number,
): void {
  background("assignment", async () => {
    if (assigneeId === actorId) return;
    const t = await loadTicket(ticketId);
    if (!t) return;

    const a = await pool.query(
      "SELECT name, email, is_active FROM users WHERE id = $1",
      [assigneeId],
    );
    const assignee = a.rows[0];
    if (!assignee || !assignee.is_active) return;

    const actor = await userName(actorId);
    await emailAbout(t, assignee.email, "Ticket assigned to you", [
      `Hello ${assignee.name},`,
      `${actor} assigned you a helpdesk request.`,
      `Request: ${t.title}`,
      `Ticket: ${ticketRef(t.id)}`,
      `Requester: ${t.requester_name}`,
      "Open the ticket to review the details and respond.",
    ]);
  });
}

// ---------------------------------------------------------------------------
// A public reply was added (never call this for internal notes; it also checks):
//   - the requester replied   -> email the assignee
//   - someone else replied    -> email the requester
// The author is never emailed about their own reply.
// ---------------------------------------------------------------------------
export function notifyReply(
  ticketId: number,
  commentId: number,
  actorId: number,
): void {
  background("reply", async () => {
    const c = await pool.query(
      `SELECT c.body, c.is_internal, c.author_id, u.name AS author_name, ka.title AS kb_title
         FROM comments c
         JOIN users u ON u.id = c.author_id
         LEFT JOIN articles ka ON ka.id = c.linked_kb_id AND ka.status = 'PUBLISHED'
        WHERE c.id = $1 AND c.ticket_id = $2`,
      [commentId, ticketId],
    );
    const comment = c.rows[0];
    if (!comment || comment.is_internal) return; // internal notes are NEVER emailed

    const t = await loadTicket(ticketId);
    if (!t) return;

    if (comment.author_id === t.created_by) {
      // The requester wrote: tell the assignee
      if (
        !t.assigned_to ||
        !t.assignee_email ||
        !t.assignee_active ||
        t.assigned_to === actorId
      )
        return;
      await emailAbout(t, t.assignee_email, "New reply from the requester", [
        `Hello ${t.assignee_name},`,
        `${comment.author_name} added a reply to the request "${t.title}" (${ticketRef(t.id)}):`,
        excerpt(comment.body),
        // Only the title of the linked article goes into the email (the article itself stays in the helpdesk)
        ...(comment.kb_title ? [`Suggested article: ${comment.kb_title}`] : []),
      ]);
    } else {
      // Someone from IT wrote: tell the requester
      if (!t.requester_active || t.created_by === actorId) return;
      await emailAbout(t, t.requester_email, "New reply", [
        `Hello ${t.requester_name},`,
        `${comment.author_name} replied to your request "${t.title}" (${ticketRef(t.id)}):`,
        excerpt(comment.body),
      ]);
    }
  });
}

// ---------------------------------------------------------------------------
// Sent by the email worker to an unknown sender (at most once per 24 hours per address).
// It never repeats anything the stranger wrote.
// ---------------------------------------------------------------------------
export function sendRejectionEmail(to: string): void {
  background("rejection", async () => {
    const p1 =
      "We received your email, but this address is not linked to an active UOA IT Helpdesk account. We could not create a ticket.";
    const p2 =
      "Please register or sign in using this email address, then submit your request through the helpdesk.";
    const p3 =
      "For your privacy, we send this notice no more than once every 24 hours.";
    await sendMail({
      to,
      subject: "[UOA IT Helpdesk] We could not process your email",
      text: [p1, "", p2, "", `Register here: ${config.appUrl}`, "", p3].join(
        "\n",
      ),
      logo: true,
      html: renderHtml({
        heading: "We could not process your email",
        paragraphs: [p1, p2, p3],
        link: { url: config.appUrl, label: "Register or sign in" },
        logo: true,
      }),
    });
  });
}
