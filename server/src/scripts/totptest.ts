// Checks the two-factor building blocks. Run:  npx tsx src/scripts/totptest.ts
// It needs your server/.env (for the keys), but it does not touch the database.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { decryptSecret, encryptSecret } from "../lib/mfaCrypto";
import {
  hashRecoveryCode,
  newRecoveryCodes,
  normalizeRecoveryCode,
} from "../lib/recoveryCodes";
import {
  base32Decode,
  base32Encode,
  generateSecret,
  otpauthUri,
  totpAt,
  verifyTotp,
} from "../lib/totp";

// 1) The official test values from RFC 6238 (secret "12345678901234567890"; 6-digit versions)
const rfc = Buffer.from("12345678901234567890", "ascii");
assert.equal(totpAt(rfc, 59 * 1000), "287082");
assert.equal(totpAt(rfc, 1111111109 * 1000), "081804");
assert.equal(totpAt(rfc, 1111111111 * 1000), "050471");
assert.equal(totpAt(rfc, 1234567890 * 1000), "005924");
assert.equal(totpAt(rfc, 2000000000 * 1000), "279037");
assert.equal(totpAt(rfc, 20000000000 * 1000), "353130");

// 2) Base32 (the key format of authenticator apps)
assert.equal(base32Encode(rfc), "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
assert.deepEqual(base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"), rfc);
assert.deepEqual(base32Decode("gezd gnbv-gy3t qojq gezd gnbv gy3t qojq"), rfc); // spaces, dashes and case do not matter
for (let len = 1; len <= 24; len++) {
  const bytes = crypto.randomBytes(len);
  assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
}
assert.throws(() => base32Decode("not*base32"));
assert.equal(generateSecret().length, 20);

// 3) Checking a typed code: the 30-second window and reuse protection
const now = 59 * 1000; // step 1
assert.equal(verifyTotp(rfc, "287082", null, now), 1); // right code, right step
assert.equal(verifyTotp(rfc, totpAt(rfc, 30 * 1000), null, now), 0); // the step just before is accepted
assert.equal(verifyTotp(rfc, totpAt(rfc, 60 * 1000), null, now), 2); // and the step just after
assert.equal(verifyTotp(rfc, totpAt(rfc, 120 * 1000), null, now), null); // two steps away: refused
assert.equal(verifyTotp(rfc, "287082", 1, now), null); // that step was already used: refused
assert.equal(verifyTotp(rfc, "287082", 0, now), 1); // an older used step does not block it
assert.equal(verifyTotp(rfc, "000000", null, now), null); // wrong code
assert.equal(verifyTotp(rfc, "12345", null, now), null); // not 6 digits
assert.equal(verifyTotp(rfc, "abcdef", null, now), null);

// 4) The address inside the QR code
const uri = otpauthUri(
  "GEZDGNBVGY3TQOJQ",
  "ali@example.com",
  "UOA IT Helpdesk",
);
assert.equal(
  uri,
  "otpauth://totp/UOA%20IT%20Helpdesk:ali%40example.com?secret=GEZDGNBVGY3TQOJQ&issuer=UOA%20IT%20Helpdesk&algorithm=SHA1&digits=6&period=30",
);

// 5) Encrypting the secret for the database
const secret = generateSecret();
const stored = encryptSecret(secret, 7);
assert.notEqual(stored, base32Encode(secret)); // not readable as the secret
assert.deepEqual(decryptSecret(stored, 7), secret); // round trip
assert.throws(() => decryptSecret(stored, 8)); // another user's row cannot decrypt it
const tampered = Buffer.from(stored, "base64");
tampered[tampered.length - 1] ^= 1;
assert.throws(() => decryptSecret(tampered.toString("base64"), 7)); // a changed value is detected

// 6) Recovery codes
const codes = newRecoveryCodes();
assert.equal(codes.length, 10);
assert.equal(new Set(codes).size, 10);
for (const c of codes)
  assert.match(c, /^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
const first = codes[0];
assert.equal(
  normalizeRecoveryCode(first.toLowerCase().replace("-", "  ")),
  first.replace("-", ""),
); // case, spaces, dash ignored
assert.equal(normalizeRecoveryCode("123456"), null);
assert.equal(normalizeRecoveryCode("AAAAA-AAAA"), null); // too short
assert.equal(normalizeRecoveryCode("AAAAA-AAAA0"), null); // 0 is not in the alphabet
const n = normalizeRecoveryCode(first)!;
assert.notEqual(hashRecoveryCode(1, n), hashRecoveryCode(2, n)); // the hash is tied to the user
assert.equal(hashRecoveryCode(1, n), hashRecoveryCode(1, n));
assert.match(hashRecoveryCode(1, n), /^[0-9a-f]{64}$/);

console.log("totptest.ts: all checks passed");
