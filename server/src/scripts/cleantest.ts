// Checks the email cleaner on sample messages. Run:  npx tsx src/scripts/cleantest.ts
import assert from "node:assert/strict";
import { cleanBody } from "../ingest/cleaner";

// 1) Your Outlook email: text, signature, company block and a legal disclaimer
const outlookMail = [
  "Test Send Out",
  "",
  " ",
  "Aqil Mustaqim",
  "",
  "Officer, Information Technology",
  "",
  " ",
  "E.  <mailto:aqil.mustaqim@uoahospitality.com.my>",
  "aqil.mustaqim@uoahospitality.com.my  M. 010-4454212",
  "",
  "UOA HOSPITALITY SDN BHD 201101021157 (949294-W)",
  "Suite G-1, Vertical Corporate Tower B, Avenue 10, The Vertical, Bangsar",
  "South City,",
  "No. 8, Jalan Kerinchi, 59200 Kuala Lumpur",
  "www.uoahospitality.com.my",
  "",
  '"This email may be confidential and legally privileged. It is intended',
  "solely for the addressee stated, and access to this email by any",
  'unauthorised person or entity is strictly prohibited."',
].join("\n");
assert.equal(cleanBody(outlookMail), "Test Send Out");
assert.equal(
  cleanBody(outlookMail, { names: ["Aqil Mustaqim"] }),
  "Test Send Out",
);

// 2) A reply with the old message quoted underneath
assert.equal(
  cleanBody(
    "Thanks, it works now.\n\nOn Mon, 12 Oct 2026 at 3:04 PM Helpdesk <h@x.com> wrote:\n> We fixed it.",
  ),
  "Thanks, it works now.",
);

// 3) Phone numbers and links INSIDE the message must stay
const withDetails =
  "Cannot open https://portal.example.com\nError on line 3\nCall me on 012-3456789";
assert.equal(cleanBody(withDetails), withDetails);

// 4) IP addresses are not phone numbers
assert.equal(
  cleanBody("Printer 192.168.1.20 is offline\nPlease check"),
  "Printer 192.168.1.20 is offline\nPlease check",
);

// 5) A plain closing line
assert.equal(
  cleanBody("Please reset my password.\n\nThanks,\nAli"),
  "Please reset my password.",
);

// 6) The sender's own name starts the signature
assert.equal(
  cleanBody("Printer is jammed\n\nSiti Aminah\nHR Executive", {
    names: ["Siti Aminah"],
  }),
  "Printer is jammed",
);

// 7) Never end up with nothing
assert.notEqual(cleanBody("Regards,\nAli").length, 0);

console.log("cleantest.ts: all checks passed");
console.log(
  "\nYour Outlook sample becomes:\n---\n" + cleanBody(outlookMail) + "\n---",
);
