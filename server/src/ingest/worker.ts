// The email worker: a SEPARATE program from the API. Start it with:  npm run worker
// It checks the mailbox every INGEST_INTERVAL_SECONDS (never faster than 10).
// The next check is only scheduled AFTER the previous one has finished, so runs never overlap.
// New in step G: after a failed check it waits longer and longer (up to 5 minutes), so a wrong password
// or a mail server that is down is not hammered every few seconds (which could lock the mailbox).
import { config } from "../config/env";
import { pool } from "../db/pool";
import { runIngestOnce } from "./ingest";

if (!config.pop3.host || !config.pop3.user || !config.pop3.pass) {
  console.error(
    "\nThe email worker needs POP3_HOST, POP3_USER and POP3_PASS in server/.env.\n",
  );
  process.exit(1);
}
if (!config.smtp.host) {
  console.warn(
    "[worker] SMTP_HOST is not set, so acknowledgment and rejection emails cannot be sent.",
  );
}

let stopping = false;
let running = false;
let timer: NodeJS.Timeout | undefined;
let failures = 0; // how many checks in a row have failed

/** Normal checks use the interval. After failures: interval x 2, x 4, x 8 ... but never more than 5 minutes. */
function nextDelaySeconds(): number {
  if (failures === 0) return config.ingestIntervalSeconds;
  return Math.min(
    300,
    config.ingestIntervalSeconds * 2 ** Math.min(failures, 6),
  );
}

async function shutdown(): Promise<void> {
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(0);
}

async function loop(): Promise<void> {
  if (stopping) return;
  running = true;
  try {
    await runIngestOnce();
    if (failures > 0) console.log("[worker] the mailbox is reachable again");
    failures = 0;
  } catch (err) {
    // Wrong password, server down, ... the next try simply comes later
    failures++;
    console.error("[worker] check failed:", (err as Error).message);
  } finally {
    running = false;
  }
  if (stopping) {
    await shutdown();
    return;
  }
  const delay = nextDelaySeconds();
  if (failures > 0) console.error(`[worker] next try in ${delay} seconds`);
  timer = setTimeout(() => void loop(), delay * 1000);
}

/** Ctrl+C: finish the current pass (if any), then exit. */
function stop(): void {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  console.log("[worker] stopping...");
  if (!running) void shutdown();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("unhandledRejection", (err) =>
  console.error("[worker] unexpected error:", err),
);

console.log(
  `[worker] started. Checking ${config.pop3.host} every ${config.ingestIntervalSeconds} seconds. Press Ctrl+C to stop.`,
);
void loop();
