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

    await t.sendMail({
      from: config.smtp.from || config.smtp.user,
      to,
      subject: safeSubject(m.subject), // line breaks removed so no header injection
      text: m.text,
      html: m.html,
      attachments: m.attachments,
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
  const paras = p.paragraphs
    .map(
      (t) =>
        `<p style="margin:0 0 12px;color:#334155;font-size:14px;line-height:1.5">${escapeHtml(t)}</p>`,
    )
    .join("");

  const code = p.code
    ? `<p style="margin:16px 0;padding:12px;background:#f1f5f9;border-radius:8px;text-align:center;` +
      `font-family:Consolas,monospace;font-size:28px;letter-spacing:6px;color:#0f172a">${escapeHtml(p.code)}</p>`
    : "";

  // Only http(s) links are allowed
  const link =
    p.link && /^https?:\/\//.test(p.link.url)
      ? `<p style="margin:16px 0"><a href="${escapeHtml(p.link.url)}" style="display:inline-block;padding:10px 16px;` +
        `background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px">` +
        `${escapeHtml(p.link.label)}</a></p>`
      : "";

  const footer = escapeHtml(
    p.footer ??
      "This is an automatic message from UOA IT Helpdesk. Please do not reply.",
  );

  return (
    `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif">` +
    `<div${p.logo ? ` align="center"` : ""} style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px${p.logo ? ";text-align:center" : ""}">` +
    (p.logo
      ? `<p style="margin:0 0 16px;text-align:center"><img src="cid:${EMAIL_LOGO_CID}" alt="UOA" width="600" style="display:block;width:600px;max-width:100%;height:auto;margin:0 auto"></p>`
      : "") +
    `<h2 style="margin:0 0 16px;font-size:18px;color:#0f172a">${escapeHtml(p.heading)}</h2>` +
    `${paras}${code}${link}` +
    `<p style="margin:16px 0 0;color:#94a3b8;font-size:12px">${footer}</p>` +
    `</div></body></html>`
  );
}
