// Checks your SMTP settings. Run:  npx tsx src/scripts/mailtest.ts someone@example.com
import { sendMail, renderHtml } from "../services/mailer";

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error("Usage: npx tsx src/scripts/mailtest.ts you@example.com");
    process.exit(1);
  }
  const ok = await sendMail({
    to,
    subject: "UOA IT Helpdesk test email",
    text: "If you can read this, outgoing email works.",
    html: renderHtml({
      heading: "Test email",
      paragraphs: ["If you can read this, outgoing email works."],
    }),
  });
  console.log(
    ok
      ? `Sent to ${to}. Check the inbox (and spam folder).`
      : "FAILED. See the [mail] message above.",
  );
}

main();
