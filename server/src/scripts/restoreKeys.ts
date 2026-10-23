// Opens the encrypted keys of a backup (disaster recovery). Run:
//   npx tsx src/scripts/restorekeys.ts "D:\HelpdeskBackups\helpdesk-2026-10-21_0200\keys.enc"
// It asks for the backup passphrase (BACKUP_PASSPHRASE), then prints the two lines for the new server/.env.
import "dotenv/config";
import fs from "node:fs";
import readline from "node:readline";
import { openKeys } from "../lib/keyVault";

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    }),
  );
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error(
      'Usage: npx tsx src/scripts/restorekeys.ts "<path to keys.enc>"',
    );
    process.exit(1);
  }
  const passphrase =
    (process.env.BACKUP_PASSPHRASE ?? "").trim() ||
    (await ask("Backup passphrase (it is visible while you type): "));

  const keys = openKeys(fs.readFileSync(file, "utf8"), passphrase);
  console.log(
    "\nPut these two lines into the new server/.env, then clear this screen:\n",
  );
  console.log(`MFA_ENCRYPTION_KEY=${keys.MFA_ENCRYPTION_KEY}`);
  console.log(`CODE_HMAC_SECRET=${keys.CODE_HMAC_SECRET}\n`);
}

main().catch((err: Error) => {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
});
