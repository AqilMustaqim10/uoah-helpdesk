// Checks the backup building blocks without a database. Run:  npm run test:backup
// (It makes a temporary folder, uses it, and deletes it again.)
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  backupDate,
  backupName,
  listBackups,
  mirrorFolder,
  pruneBackups,
  removePartials,
} from "../lib/backupTools";
import { openKeys, sealKeys } from "../lib/keyVault";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "helpdesk-backuptest-"));

try {
  // ---------- 1) the encrypted keys ----------
  const keys = {
    MFA_ENCRYPTION_KEY: "a".repeat(64),
    CODE_HMAC_SECRET: "b".repeat(96),
  };
  const pass = "a long passphrase for testing";

  const sealed = sealKeys(keys, pass);
  assert.ok(
    !sealed.includes("aaaaaaaa"),
    "the file must not contain the keys in readable form",
  );
  assert.deepEqual(openKeys(sealed, pass), keys); // round trip
  assert.notEqual(sealKeys(keys, pass), sealed); // every file is different (random salt)
  assert.throws(
    () => openKeys(sealed, "another long passphrase!!"),
    /Wrong passphrase/,
  ); // wrong passphrase
  assert.throws(() => sealKeys(keys, "too short"), /at least/); // short passphrase refused
  assert.throws(() => openKeys("not json", pass), /not a helpdesk keys file/);

  const tampered = JSON.parse(sealed);
  const data = Buffer.from(tampered.data, "base64");
  data[0] ^= 1;
  tampered.data = data.toString("base64");
  assert.throws(
    () => openKeys(JSON.stringify(tampered), pass),
    /Wrong passphrase|damaged/,
  ); // a changed file is detected

  const hostile = JSON.parse(sealed);
  hostile.N = 2 ** 30; // would need gigabytes of memory
  assert.throws(
    () => openKeys(JSON.stringify(hostile), pass),
    /invalid settings/,
  );

  // ---------- 2) backup folder names ----------
  assert.equal(
    backupName(new Date(2026, 9, 21, 2, 5)),
    "helpdesk-2026-10-21_0205",
  );
  assert.equal(
    backupDate("helpdesk-2026-10-21_0205")?.getTime(),
    new Date(2026, 9, 21, 2, 5).getTime(),
  );
  assert.equal(backupDate("helpdesk-2026-10-21_0205.partial"), null);
  assert.equal(backupDate("something-else"), null);

  // ---------- 3) keeping the newest backups ----------
  const bdir = path.join(root, "backups");
  fs.mkdirSync(bdir);
  for (const n of [
    "helpdesk-2026-01-01_0200",
    "helpdesk-2026-02-01_0200",
    "helpdesk-2026-10-01_0200",
    "helpdesk-2026-10-19_0200",
    "helpdesk-2026-10-20_0200",
    "other-folder", // not a backup: must never be touched
    "helpdesk-2026-10-21_0200.partial", // unfinished: not a backup either
  ]) {
    fs.mkdirSync(path.join(bdir, n));
  }
  assert.equal(listBackups(bdir)[0], "helpdesk-2026-10-20_0200");
  assert.equal(listBackups(bdir).length, 5);

  const removed = pruneBackups(bdir, 14, 2, new Date(2026, 9, 21, 12, 0)); // keep 14 days, but always the newest 2
  assert.deepEqual(removed.sort(), [
    "helpdesk-2026-01-01_0200",
    "helpdesk-2026-02-01_0200",
    "helpdesk-2026-10-01_0200",
  ]);
  assert.deepEqual(listBackups(bdir), [
    "helpdesk-2026-10-20_0200",
    "helpdesk-2026-10-19_0200",
  ]);
  assert.ok(fs.existsSync(path.join(bdir, "other-folder")));

  removePartials(bdir);
  assert.ok(
    !fs.existsSync(path.join(bdir, "helpdesk-2026-10-21_0200.partial")),
  );
  assert.ok(fs.existsSync(path.join(bdir, "other-folder")));

  // "keep the newest 3" protects you when the computer was switched off for weeks
  assert.deepEqual(pruneBackups(bdir, 14, 3, new Date(2027, 5, 1)), []);

  // ---------- 4) copying uploads ----------
  const src = path.join(root, "uploads");
  fs.mkdirSync(path.join(src, "sub"), { recursive: true });
  fs.writeFileSync(path.join(src, "a.bin"), "aaa");
  fs.writeFileSync(path.join(src, "c.bin"), "cccc");
  fs.writeFileSync(path.join(src, "sub", "b.bin"), "bb");

  const prev = path.join(root, "previous");
  fs.mkdirSync(prev);
  fs.writeFileSync(path.join(prev, "a.bin"), "aaa"); // same name and size: shared
  fs.writeFileSync(path.join(prev, "c.bin"), "xx"); // same name, other size: must be copied

  const dest = path.join(root, "dest");
  const result = mirrorFolder(src, dest, prev);
  assert.equal(result.files, 3);
  assert.equal(result.bytes, 9);
  assert.equal(result.linked + result.copied, 3);
  assert.ok(result.copied >= 2); // c.bin and sub/b.bin are always copies
  assert.equal(fs.readFileSync(path.join(dest, "a.bin"), "utf8"), "aaa");
  assert.equal(fs.readFileSync(path.join(dest, "c.bin"), "utf8"), "cccc"); // the new content, not the old
  assert.equal(fs.readFileSync(path.join(dest, "sub", "b.bin"), "utf8"), "bb");

  assert.equal(
    mirrorFolder(
      path.join(root, "does-not-exist"),
      path.join(root, "dest2"),
      null,
    ).files,
    0,
  );

  console.log("backuptest.ts: all checks passed");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
