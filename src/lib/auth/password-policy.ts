/**
 * Refuses the passwords that guessing tools try first (docs/Security
 * Report.md, SEC-043). Follows NIST SP 800-63B: a minimum length (checked by
 * the validators) plus a blocklist of common and patterned passwords — no
 * forced mix of character classes, which mostly produces "Password1".
 *
 * Applied wherever a user chooses a password: sign-up and password change
 * (including the forced first-login change).
 */
import { toAsciiDigits } from "./login-id";

// Common passwords of 8+ characters (shorter ones never pass the length rule).
const COMMON = new Set(
  [
    "12345678",
    "123456789",
    "1234567890",
    "12345678910",
    "11111111",
    "00000000",
    "88888888",
    "87654321",
    "11223344",
    "12341234",
    "12121212",
    "11112222",
    "123123123",
    "112233445566",
    "147258369",
    "123456123",
    "password",
    "password1",
    "password12",
    "password123",
    "passw0rd",
    "p@ssw0rd",
    "p@ssword",
    "pa$$word",
    "qwertyui",
    "qwertyuiop",
    "qwerty123",
    "qwerty12",
    "qwer1234",
    "1q2w3e4r",
    "1q2w3e4r5t",
    "1qaz2wsx",
    "zaq12wsx",
    "zaq1zaq1",
    "asdfghjk",
    "asdfghjkl",
    "zxcvbnm1",
    "zxcvbnmm",
    "asdf1234",
    "abcd1234",
    "abc12345",
    "a1b2c3d4",
    "aa123456",
    "iloveyou",
    "iloveyou1",
    "sunshine",
    "princess",
    "football",
    "baseball",
    "superman",
    "starwars",
    "trustno1",
    "whatever",
    "computer",
    "internet",
    "welcome1",
    "welcome123",
    "letmein1",
    "changeme",
    "admin123",
    "administrator",
    "test1234",
    "testtest",
    "master12",
    "michelle",
    "jennifer",
    "1234qwer",
    "q1w2e3r4",
    "q1w2e3r4t5",
    "access14",
    "freedom1",
    "dragon12",
    "monkey12",
    "shadow12",
    "mustang1",
    "iran1234",
    "tehran123",
    "irani123",
    "parkfava",
    "favapark",
  ].map((p) => p.toLowerCase()),
);

function isSequence(s: string): boolean {
  const codes = [...s].map((c) => c.charCodeAt(0));
  const step = codes[1] - codes[0];
  return Math.abs(step) === 1 && codes.every((c, i) => i === 0 || c - codes[i - 1] === step);
}

function isRepeatedPattern(s: string): boolean {
  // "abababab", "123123123", "xyzxyzxyz": a short unit repeated.
  for (let unit = 1; unit <= 4; unit++) {
    if (s.length % unit === 0 && s === s.slice(0, unit).repeat(s.length / unit)) return true;
  }
  return false;
}

/** Why a password is refused, or null when it is acceptable. */
export function weakPasswordReason(
  password: string,
  identifiers: (string | null | undefined)[] = [],
): string | null {
  const p = toAsciiDigits(password).trim().toLowerCase();
  if (COMMON.has(p)) return "common";
  if (new Set(p).size <= 2 || isRepeatedPattern(p)) return "repetitive";
  if (isSequence(p)) return "sequence";
  for (const raw of identifiers) {
    const id = (raw ?? "").toLowerCase().split("@")[0].trim();
    if (id.length >= 4 && p.includes(id)) return "contains-username";
  }
  return null;
}

export function assertStrongPassword(
  password: string,
  identifiers: (string | null | undefined)[] = [],
): void {
  if (weakPasswordReason(password, identifiers)) throw new Error("WEAK_PASSWORD");
}
