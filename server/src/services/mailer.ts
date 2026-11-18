// Sends email through your SMTP server. Used by sign up / reset now, and by notifications later.
// sendMail NEVER throws: a mail problem must never break the action that triggered it.
import nodemailer, { Transporter } from "nodemailer";
import path from "node:path";
import { config } from "../config/env";
import { escapeHtml, safeSubject } from "../lib/validate";

let transporter: Transporter | null = null;

export const EMAIL_LOGO_CID = "uoa-helpdesk-logo";
export const EMAIL_LOGO_PATH = path.resolve(
  path.dirname(config.clientDist),
  "public",
  "email-reply-logo.jpeg",
);

/** Creates the SMTP connection once and reuses it. Returns null if SMTP is not configured. */
function getTransporter(): Transporter | null {
  if (!config.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure, // true for port 465, false for 587
      auth: config.smtp.user
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
}

export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  logo?: boolean;
  attachments?: NonNullable<Parameters<Transporter["sendMail"]>[0]["attachments"]>;
  /** Extra headers (used later for threading), never taken from user input. */
  headers?: Record<string, string>;
}

/**
 * Sends one email. Returns true if the SMTP server accepted it, false otherwise.
 * Every email we send is marked as automatic so other mail systems don't auto-reply to it
 * (this prevents mail loops).
 */
export async function sendMail(m: MailInput): Promise<boolean> {
  try {
    const to = m.to.trim().toLowerCase();

    // Must be exactly one plain address (no commas, spaces, or line breaks)
    if (!/^[^\s,;<>]+@[^\s,;<>]+$/.test(to)) {
      console.warn("[mail] skipped: invalid address");
      return false;
    }
    // Addresses ending in .local are internal/test addresses that can't receive mail
    if (to.endsWith(".local")) {
      console.warn("[mail] skipped: .local address");
      return false;
    }

    const t = getTransporter();
    if (!t) {
      console.warn("[mail] skipped: SMTP_HOST is not set in server/.env");
      return false;
    }

    const attachments = [...(m.attachments ?? [])];
    if (m.logo) {
      attachments.push({
        filename: "email-reply-logo.jpeg",
        path: EMAIL_LOGO_PATH,
        cid: EMAIL_LOGO_CID,
      });
    }

    await t.sendMail({
      from: config.smtp.from || config.smtp.user,
      to,
      subject: safeSubject(m.subject), // line breaks removed so no header injection
      text: m.text,
      html: m.html,
      attachments: attachments.length ? attachments : undefined,
      headers: {
        "Auto-Submitted": "auto-generated",
        "X-Auto-Response-Suppress": "All",
        Precedence: "bulk",
        ...(m.headers ?? {}),
      },
    });
    return true;
  } catch (err) {
    console.error("[mail] send failed:", (err as Error).message);
    return false;
  }
}

// ---------------- HTML email layout ----------------

export interface HtmlParts {
  heading: string;
  paragraphs: string[];
  code?: string; // big 6-digit code box
  link?: { url: string; label: string }; // button-style link (url is built by us, never from users)
  footer?: string;
  logo?: boolean;
}

/**
 * Builds a simple, clean HTML email. EVERY piece of text is escaped,
 * so user-supplied text can never turn into HTML or scripts.
 */
export function renderHtml(p: HtmlParts): string {
  // Keep deliberate line breaks in ticket replies, while escaping the source text first.
  const formattedText = (text: string) => escapeHtml(text).replace(/\r?\n/g, "<br>");
  const paras = p.paragraphs
    .map(
      (t) =>
        `<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6">${formattedText(t)}</p>`,
    )
    .join("");

  const code = p.code
    ? `<div style="margin:24px 0;padding:18px 16px;background:#f1f5f9;border:1px solid #dbe5ef;border-radius:8px;text-align:center;` +
      `font-family:Consolas,Menlo,monospace;font-size:30px;font-weight:700;letter-spacing:7px;color:#0f172a">${escapeHtml(p.code)}</div>`
    : "";

  // Only http(s) links are allowed
  const link =
    p.link && /^https?:\/\//.test(p.link.url)
      ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0"><tr><td style="border-radius:7px;background:#0f5c4b">` +
        `<a href="${escapeHtml(p.link.url)}" style="display:inline-block;padding:12px 20px;background:#0f5c4b;color:#ffffff;text-decoration:none;border-radius:7px;font-size:14px;font-weight:700;line-height:20px">` +
        `${escapeHtml(p.link.label)}</a></td></tr></table>`
      : "";

  const footer = escapeHtml(
    p.footer ??
      "This is an automatic message from UOA IT Helpdesk. Please do not reply.",
  );

  return (
    `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1.0">` +
    `<meta name="x-apple-disable-message-reformatting"></head><body style="margin:0;padding:0;background:#f3f6f8;font-family:Segoe UI,Arial,sans-serif">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">UOA IT Helpdesk — ${escapeHtml(p.heading)}</div>` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f3f6f8"><tr><td style="padding:32px 16px">` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #dfe7eb;border-radius:12px">` +
    `<tr><td style="height:5px;background:#0f5c4b;border-radius:12px 12px 0 0;font-size:0;line-height:5px">&nbsp;</td></tr>` +
    `<tr><td style="padding:28px 32px 12px">` +
    (p.logo
      ? `<p style="margin:0 0 22px;text-align:center"><img src="cid:${EMAIL_LOGO_CID}" alt="UOA IT Helpdesk" width="536" style="display:block;width:100%;max-width:536px;height:auto;margin:0 auto"></p>`
      : "") +
    `<p style="margin:0 0 8px;color:#0f5c4b;font-size:12px;font-weight:700;letter-spacing:.8px;text-transform:uppercase">UOA IT Helpdesk</p>` +
    `<h1 style="margin:0 0 20px;color:#102a43;font-size:24px;font-weight:700;line-height:1.3">${escapeHtml(p.heading)}</h1>` +
    `${paras}${code}${link}` +
    `<div style="height:1px;background:#e5ebee;margin:24px 0 16px;font-size:0;line-height:1px">&nbsp;</div>` +
    `<p style="margin:0;color:#6b7c8f;font-size:12px;line-height:1.5">${footer}</p>` +
    `</td></tr></table></td></tr></table></body></html>`
  );
}
