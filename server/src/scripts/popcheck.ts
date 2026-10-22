// Checks your POP3 settings without touching any mail. Run:  npx tsx src/scripts/popcheck.ts
import { config } from "../config/env";
import { Pop3Client, pop3FromConfig } from "../ingest/pop3";

async function main() {
  console.log(
    `Connecting to ${config.pop3.host}:${config.pop3.port} (${config.pop3.tls ? "TLS" : "plain"})...`,
  );
  const client = await Pop3Client.connect(pop3FromConfig());
  try {
    await client.login(config.pop3.user, config.pop3.pass);
    const messages = await client.list();
    console.log(
      `Login worked. The mailbox holds ${messages.length} message(s).`,
    );
    await client.quit();
  } finally {
    client.destroy();
  }
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
});
