// The email a person receives when an administrator or IT creates an account for them.
// It carries NO password: the person chooses their own with the normal "Forgot password" screen.
// Sent in the background after the account is saved; a mail failure is only logged.
import { config } from "../config/env";
import { renderHtml, sendMail } from "./mailer";

export function sendInvitationEmail(o: {
  to: string;
  name: string;
  createdBy: string;
  role: string;
}): void {
  const staff = o.role === "ADMIN" || o.role === "IT";

  const intro = `Hello ${o.name}, ${o.createdBy} created a UOA IT Helpdesk account for you.`;
  const why =
    "To start, choose your own password. Nobody else will ever know it:";
  const steps = [
    `1. Open the helpdesk: ${config.appUrl}`,
    '2. Click "Forgot password?" and enter this email address.',
    "3. Type the 6-digit code we email you, then choose your password.",
  ];
  const extra = staff
    ? "Because of your role, you will also set up an authenticator app (two-factor authentication) the first time you sign in."
    : "";
  const footer = "If you did not expect this email, you can ignore it.";

  void sendMail({
    to: o.to,
    subject: "Your UOA IT Helpdesk account is ready",
    text: [
      intro,
      "",
      why,
      ...steps,
      ...(extra ? ["", extra] : []),
      "",
      footer,
    ].join("\n"),
    // renderHtml escapes every piece of text, so a name can never become HTML
    html: renderHtml({
      heading: "Your account is ready",
      paragraphs: [intro, why, ...steps, ...(extra ? [extra] : [])],
      link: { url: config.appUrl, label: "Open the helpdesk" },
      footer,
    }),
  });
}
