// The nightly backup. Run it with:  npm run backup   (on the production server: node dist/scripts/backup.js)
// Each run makes ONE new folder inside BACKUP_DIR, named like helpdesk-2026-10-21_0200, containing:
//   database.dump   every table (PostgreSQL custom format; checked to be readable)
//   uploads\        a copy of server/uploads (unchanged files are hard-linked, so they take no extra space)
//   keys.enc        the two keys, encrypted with BACKUP_PASSPHRASE
//   manifest.json   what was saved, with sizes and a fingerprint of the dump
// The folder is written under a ".partial" name and renamed only when everything succeeded,
// so a half-finished backup can never be mistaken for a good one.
// Old backups are removed after BACKUP_KEEP_DAYS days (the newest 3 are always kept).
// Order matters: the database is saved FIRST, then the uploads, so every file the dump refers to is in the backup.
import "dotenv/config";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  backupName,
  humanSize,
  listBackups,
  mirrorFolder,
  pruneBackups,
  removePartials,
  sha256File,
} from "../lib/backupTools";
import { sealKeys } from "../lib/keyVault";

function need(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing setting ${name} in server/.env`);
  return v;
}

/** Full path of a PostgreSQL tool. PG_BIN_DIR is the PostgreSQL "bin" folder (needed when the tools are not on the PATH). */
function pgTool(name: string): string {
  const dir = (process.env.PG_BIN_DIR ?? "").trim();
  return dir
    ? path.join(dir, process.platform === "win32" ? `${name}.exe` : name)
    : name;
}

/** Runs a program and returns what it printed. A failure becomes a plain error message. */
function run(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env, windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => {
      if (out.length < 500_000) out += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      if (err.length < 20_000) err += d.toString();
    });
    child.on("error", (e: Error) => {
      const code = (e as NodeJS.ErrnoException).code;
      reject(
        code === "ENOENT"
          ? new Error(
              `${path.basename(cmd)} was not found. Set PG_BIN_DIR in server/.env to the PostgreSQL "bin" folder.`,
            )
          : e,
      );
    });
    child.on("close", (code) =>
      code === 0
        ? resolve(out)
        : reject(
            new Error(
              `${path.basename(cmd)} failed (code ${code}): ${err.trim().slice(0, 500)}`,
            ),
          ),
    );
  });
}

/** Is `child` the same folder as `parent`, or inside it? */
function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

async function backup(): Promise<string> {
  const backupDir = path.resolve(need("BACKUP_DIR"));
  const keepDays = Math.max(
    1,
    parseInt(process.env.BACKUP_KEEP_DAYS ?? "14", 10) || 14,
  );
  const dbUrl = new URL(need("BACKUP_DATABASE_URL"));
  const passphrase = need("BACKUP_PASSPHRASE");
  const keys = {
    MFA_ENCRYPTION_KEY: need("MFA_ENCRYPTION_KEY"),
    CODE_HMAC_SECRET: need("CODE_HMAC_SECRET"),
  };
  const uploadDir = path.resolve(
    process.cwd(),
    (process.env.UPLOAD_DIR ?? "").trim() || "./uploads",
  );
  const projectRoot = path.resolve(process.cwd(), "..");

  // Safety: a backup inside the project could be committed to GitHub; one inside the uploads folder would copy itself
  if (isInside(backupDir, projectRoot)) {
    throw new Error(
      "BACKUP_DIR is inside the project folder. Choose a folder outside it (and ideally on another disk).",
    );
  }
  if (isInside(backupDir, uploadDir))
    throw new Error("BACKUP_DIR must not be inside the uploads folder.");

  fs.mkdirSync(backupDir, { recursive: true });
  removePartials(backupDir);

  const name = backupName(new Date());
  const finalDir = path.join(backupDir, name);
  if (fs.existsSync(finalDir))
    throw new Error(
      `A backup named ${name} already exists. Wait a minute and try again.`,
    );
  const workDir = `${finalDir}.partial`;
  fs.mkdirSync(workDir);

  // 1) The database
  const dumpFile = path.join(workDir, "database.dump");
  const dbName = decodeURIComponent(dbUrl.pathname.replace(/^\//, ""));
  await run(
    pgTool("pg_dump"),
    [
      "--format=custom",
      "--compress=6",
      "--no-password",
      `--host=${dbUrl.hostname}`,
      `--port=${dbUrl.port || "5432"}`,
      `--username=${decodeURIComponent(dbUrl.username)}`,
      `--dbname=${dbName}`,
      `--file=${dumpFile}`,
    ],
    { ...process.env, PGPASSWORD: decodeURIComponent(dbUrl.password) }, // the password never appears on the command line
  );

  // 2) Is the dump readable? (a cheap check that catches an empty or cut-off file)
  const listing = await run(
    pgTool("pg_restore"),
    ["--list", dumpFile],
    process.env,
  );
  if (
    !/ TABLE public users /.test(listing) ||
    !/ TABLE public audit_log /.test(listing)
  ) {
    throw new Error(
      "The database backup does not look complete (the tables were not found inside it).",
    );
  }
  const version = (
    await run(pgTool("pg_dump"), ["--version"], process.env)
  ).trim();

  // 3) The uploads (unchanged files are linked to the previous backup instead of copied)
  const previous = listBackups(backupDir)[0];
  const previousUploads = previous
    ? path.join(backupDir, previous, "uploads")
    : null;
  const uploads = mirrorFolder(
    uploadDir,
    path.join(workDir, "uploads"),
    previousUploads && fs.existsSync(previousUploads) ? previousUploads : null,
  );

  // 4) The two keys, encrypted
  fs.writeFileSync(path.join(workDir, "keys.enc"), sealKeys(keys, passphrase), {
    mode: 0o600,
  });

  // 5) The manifest
  const dumpBytes = fs.statSync(dumpFile).size;
  fs.writeFileSync(
    path.join(workDir, "manifest.json"),
    JSON.stringify(
      {
        name,
        createdAt: new Date().toISOString(),
        computer: os.hostname(),
        node: process.version,
        pgDump: version,
        database: {
          file: "database.dump",
          bytes: dumpBytes,
          sha256: await sha256File(dumpFile),
        },
        uploads,
        keys: {
          file: "keys.enc",
          contains: ["MFA_ENCRYPTION_KEY", "CODE_HMAC_SECRET"],
          encrypted: true,
        },
      },
      null,
      2,
    ),
  );

  // 6) Finished: only now does the folder get its real name, and old backups are removed
  fs.renameSync(workDir, finalDir);
  const removed = pruneBackups(backupDir, keepDays, 3, new Date());

  fs.writeFileSync(
    path.join(backupDir, "last-backup.json"),
    JSON.stringify({ ok: true, at: new Date().toISOString(), name }, null, 2),
  );

  return (
    `Backup ${name} finished. Database ${humanSize(dumpBytes)}; ` +
    `${uploads.files} upload file(s), ${humanSize(uploads.bytes)} ` +
    `(${uploads.linked} shared with the previous backup, ${uploads.copied} copied). ` +
    `Removed ${removed.length} old backup(s).`
  );
}

/** A failure is written down for "npm run preflight" and emailed when BACKUP_ALERT_EMAIL is set. */
async function reportFailure(message: string): Promise<void> {
  try {
    const dir = (process.env.BACKUP_DIR ?? "").trim();
    if (dir && fs.existsSync(dir)) {
      fs.writeFileSync(
        path.join(dir, "last-backup.json"),
        JSON.stringify(
          { ok: false, at: new Date().toISOString(), error: message },
          null,
          2,
        ),
      );
    }
  } catch {
    /* nothing more we can do */
  }

  const to = (process.env.BACKUP_ALERT_EMAIL ?? "").trim();
  if (!to) return;
  try {
    const { sendMail } = await import("../services/mailer");
    await sendMail({
      to,
      subject: "UOA IT Helpdesk: the nightly backup FAILED",
      text: `The nightly backup did not finish on ${os.hostname()}.\n\nReason: ${message}\n\nPlease fix this soon, because without it there is no recent backup.`,
    });
  } catch {
    /* the mail itself failed: the failure is still printed below */
  }
}

backup()
  .then((summary) =>
    console.log(`[backup] ${new Date().toISOString()} ${summary}`),
  )
  .catch(async (err: Error) => {
    console.error(
      `[backup] ${new Date().toISOString()} FAILED: ${err.message}`,
    );
    await reportFailure(err.message);
    process.exitCode = 1; // the Task Scheduler shows this as a failed run
  });
