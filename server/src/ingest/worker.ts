// The email worker: a SEPARATE program from the API. Start it with:  npm run worker
// It checks the mailbox every INGEST_INTERVAL_SECONDS (never faster than 30).
// The next check is only scheduled AFTER the previous one has finished, so runs never overlap.
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
  } catch (err) {
    // Wrong password, server down, ... The next pass simply tries again.
    console.error("[worker] pass failed:", (err as Error).message);
  } finally {
    running = false;
  }
  if (stopping) {
    await shutdown();
    return;
  }
  timer = setTimeout(() => void loop(), config.ingestIntervalSeconds * 1000);
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
