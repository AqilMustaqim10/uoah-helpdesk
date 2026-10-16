// Decides whether an incoming email is AUTOMATIC mail (bounces, auto-replies, newsletters, our own mail).
// Automatic mail must never become a ticket, and must never get a reply, or two machines could
// answer each other forever (a "mail loop").
import type { ParsedMail } from "mailparser";
import { config } from "../config/env";

export interface Verdict {
  auto: boolean;
  reason?: string;
}

/** Our own addresses (the mailbox we read, and the one we send from). */
export function ownAddresses(): Set<string> {
  const set = new Set<string>();
  const add = (value: string) => {
    const m = /<([^>]+)>/.exec(value); // "UOA IT Helpdesk <helpdesk@x.com>" -> helpdesk@x.com
    const address = (m ? m[1] : value).trim().toLowerCase();
    if (address.includes("@")) set.add(address);
  };
  add(config.pop3.user);
  add(config.smtp.user);
  add(config.smtp.from);
  return set;
}

/** The text of a header, whatever shape the parser gave it (text, list, or an object). */
function headerText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(headerText).join(" ");
  if (typeof v === "object") {
    const o = v as { text?: unknown; value?: unknown };
    if (typeof o.text === "string") return o.text;
    if (typeof o.value === "string") return o.value;
    if (Array.isArray(o.value))
      return o.value.map((x: any) => x?.address ?? "").join(" ");
  }
  return String(v);
}

// Senders that are machines, judged by the part before the @
const SYSTEM_SENDER =
  /^(mailer-daemon|postmaster|no[-_.]?reply|do[-_.]?not[-_.]?reply|bounces?|daemon)([-_.+]|$)/i;

// Subjects that are automatic answers or delivery reports
const AUTO_SUBJECT =
  /^(auto(matic)?[\s-]*(reply|response)|autoreply|out of (the )?office|undeliverable|undelivered mail|delivery status notification|mail delivery (failed|failure|system)|returned mail|failure notice|delivery failure)/i;

export function classifyMessage(mail: ParsedMail): Verdict {
  const h = mail.headers;
  const text = (name: string) => headerText(h.get(name)).trim();

  const from = mail.from?.value?.[0]?.address?.toLowerCase() ?? "";

  if (from && ownAddresses().has(from))
    return { auto: true, reason: "sent from our own mailbox" };

  const local = from.split("@")[0] ?? "";
  if (local && SYSTEM_SENDER.test(local))
    return { auto: true, reason: "sent by a system address" };

  const autoSubmitted = text("auto-submitted").toLowerCase();
  if (autoSubmitted && !/^no\b/.test(autoSubmitted))
    return { auto: true, reason: "Auto-Submitted header" };

  if (/^(bulk|junk|list)$/i.test(text("precedence")))
    return { auto: true, reason: "Precedence: bulk" };

  if (h.has("x-auto-response-suppress"))
    return { auto: true, reason: "X-Auto-Response-Suppress header" };
  if (h.has("x-autoreply") || h.has("x-autorespond"))
    return { auto: true, reason: "auto-reply header" };
  if (h.has("x-failed-recipients"))
    return { auto: true, reason: "delivery failure report" };

  // A bounce has an EMPTY return path: "<>"
  if (
    h.has("return-path") &&
    text("return-path").replace(/[<>\s]/g, "") === ""
  ) {
    return { auto: true, reason: "empty Return-Path" };
  }

  if (text("content-type").toLowerCase().startsWith("multipart/report")) {
    return { auto: true, reason: "delivery report" };
  }

  if (AUTO_SUBJECT.test((mail.subject ?? "").trim()))
    return { auto: true, reason: "auto-reply subject" };

  return { auto: false };
}
