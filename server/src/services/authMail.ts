// The two kinds of email used by sign up / password reset.
// Both are "fire and forget": we do not wait for them, and a failure is only logged.
import { CODE_TTL_MINUTES, CodePurpose } from "../lib/codes";
import { config } from "../config/env";
import { renderHtml, sendMail } from "./mailer";

/** Sends the 6-digit code. */
export function sendCodeEmail(
  to: string,
  purpose: CodePurpose,
  code: string,
): void {
  const isSignup = purpose === "SIGNUP";
  const subject = isSignup
    ? "Your UOA IT Helpdesk sign-up code"
    : "Your UOA IT Helpdesk password reset code";
  const intro = isSignup
    ? "Use this code to finish creating your account."
    : "Use this code to reset your password.";
  const expiry = `The code expires in ${CODE_TTL_MINUTES} minutes. If you did not ask for it, you can ignore this email.`;

  void sendMail({
    to,
    subject,
    text: `${intro}\n\nYour code: ${code}\n\n${expiry}`,
    html: renderHtml({ heading: subject, paragraphs: [intro, expiry], code }),
  });
}

/**
 * Sent when someone tries to sign up with an email that already has an account.
 * (The web page shows the same message either way, so nobody can use sign up to find out who is registered.)
 */
export function sendAccountExistsEmail(to: string): void {
  const subject = "UOA IT Helpdesk: you already have an account";
  const line1 =
    "Someone tried to create an account with this email address, but an account already exists.";
  const line2 =
    'If it was you, sign in, or use "Forgot password" if you cannot remember your password.';

  void sendMail({
    to,
    subject,
    text: `${line1}\n\n${line2}`,
    html: renderHtml({
      heading: subject,
      paragraphs: [line1, line2],
      link: { url: config.appUrl, label: "Open the helpdesk" },
    }),
  });
}
