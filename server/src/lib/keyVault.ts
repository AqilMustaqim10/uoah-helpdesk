// Protects the two keys the database cannot be read without. They live in server/.env, never in the database:
//   MFA_ENCRYPTION_KEY  unlocks the authenticator secrets
//   CODE_HMAC_SECRET    checks the recovery codes and the emailed codes
// The nightly backup stores them in a file encrypted with a passphrase (AES-256-GCM; the key comes from the
// passphrase through scrypt), so a stolen backup folder reveals nothing without the passphrase.
// This file needs no database and no .env, so it can be tested on its own (scripts/backuptest.ts).
import crypto from "node:crypto";

export interface KeyBundle {
  MFA_ENCRYPTION_KEY: string;
  CODE_HMAC_SECRET: string;
}

interface VaultFile {
  v: 1;
  kdf: "scrypt";
  N: number;
  r: number;
  p: number;
  salt: string;
  iv: string;
  tag: string;
  data: string;
  created: string;
}

export const MIN_PASSPHRASE_LENGTH = 16;
const AAD = Buffer.from("uoa-helpdesk-keys-v1"); // the file is only valid for this purpose
const COST = { N: 2 ** 15, r: 8, p: 1 }; // how slow it is to guess a passphrase

function deriveKey(
  passphrase: string,
  salt: Buffer,
  N: number,
  r: number,
  p: number,
): Buffer {
  return crypto.scryptSync(passphrase.normalize("NFKC"), salt, 32, {
    N,
    r,
    p,
    maxmem: 256 * 1024 * 1024,
  });
}

/** The keys as an encrypted text file (JSON). */
export function sealKeys(keys: KeyBundle, passphrase: string): string {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(
      `BACKUP_PASSPHRASE must have at least ${MIN_PASSPHRASE_LENGTH} characters.`,
    );
  }
  if (!keys.MFA_ENCRYPTION_KEY || !keys.CODE_HMAC_SECRET)
    throw new Error("Both keys are needed for the keys backup.");

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    deriveKey(passphrase, salt, COST.N, COST.r, COST.p),
    iv,
  );
  cipher.setAAD(AAD);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(keys), "utf8"),
    cipher.final(),
  ]);

  const file: VaultFile = {
    v: 1,
    kdf: "scrypt",
    ...COST,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
    created: new Date().toISOString(),
  };
  return JSON.stringify(file, null, 2);
}

/** The reverse. Throws a plain message if the passphrase is wrong or the file was changed. */
export function openKeys(text: string, passphrase: string): KeyBundle {
  let f: Partial<VaultFile>;
  try {
    f = JSON.parse(text) as Partial<VaultFile>;
  } catch {
    throw new Error("This is not a helpdesk keys file.");
  }
  if (f.v !== 1 || f.kdf !== "scrypt")
    throw new Error("This is not a helpdesk keys file (unknown format).");

  // The settings stored in the file are checked, so a doctored file cannot make us use huge amounts of memory
  const { N, r, p } = f;
  if (
    typeof N !== "number" ||
    typeof r !== "number" ||
    typeof p !== "number" ||
    !Number.isInteger(N) ||
    N < 2 ** 14 ||
    N > 2 ** 20 ||
    (N & (N - 1)) !== 0 ||
    !Number.isInteger(r) ||
    r < 1 ||
    r > 16 ||
    !Number.isInteger(p) ||
    p < 1 ||
    p > 4
  ) {
    throw new Error("The keys file has invalid settings.");
  }
  if (
    typeof f.salt !== "string" ||
    typeof f.iv !== "string" ||
    typeof f.tag !== "string" ||
    typeof f.data !== "string"
  ) {
    throw new Error("The keys file is damaged.");
  }

  let plain: string;
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      deriveKey(passphrase, Buffer.from(f.salt, "base64"), N, r, p),
      Buffer.from(f.iv, "base64"),
    );
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(f.tag, "base64"));
    plain = Buffer.concat([
      decipher.update(Buffer.from(f.data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Wrong passphrase, or the file is damaged.");
  }

  const keys = JSON.parse(plain) as Partial<KeyBundle>;
  if (
    typeof keys.MFA_ENCRYPTION_KEY !== "string" ||
    typeof keys.CODE_HMAC_SECRET !== "string"
  ) {
    throw new Error("The keys file is damaged.");
  }
  return {
    MFA_ENCRYPTION_KEY: keys.MFA_ENCRYPTION_KEY,
    CODE_HMAC_SECRET: keys.CODE_HMAC_SECRET,
  };
}
