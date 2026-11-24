/**
 * Password hashing via Node's built-in scrypt (no external dependency —
 * same "prefer node:crypto over a new package" choice already made for
 * OTP hashing in src/lib/mfa/otp.server.ts). scrypt is a memory-hard KDF,
 * a solid default for password storage without pulling in bcrypt's native
 * binding (which complicates the Docker build across architectures).
 *
 * Cost: N=2^14, r=8, p=5, one of the settings the OWASP Password Storage
 * Cheat Sheet lists as equivalent to its scrypt minimum (N=2^17, r=8, p=1)
 * while needing 16 MiB per hash instead of 128 MiB. Stored as
 * `scrypt$N$r$p$salt$hash`. Hashes written before this change are plain
 * `salt:hash` with Node's defaults (N=2^14, r=8, p=1), a fifth of the cost
 * (docs/Security Report.md, SEC-056): they still verify, and signIn replaces
 * them with a current hash once the password has been confirmed.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;
const KEY_LENGTH = 64;
const COST = { N: 16384, r: 8, p: 5 };
const PREFIX = `scrypt$${COST.N}$${COST.r}$${COST.p}$`;
const LEGACY_COST = { N: 16384, r: 8, p: 1 };
// Checking a legacy hash costs p=1; this pads it to p=5, so the response time
// does not tell an account that has never signed in since the change from
// one that has, or from an unknown username (SEC-013).
const LEGACY_PADDING = { N: 16384, r: 8, p: 4 };

type Parsed = { salt: string; hash: string; cost: typeof COST; legacy: boolean };

function parse(stored: string): Parsed | null {
  if (stored.startsWith("scrypt$")) {
    const [, n, r, p, salt, hash] = stored.split("$");
    const cost = { N: Number(n), r: Number(r), p: Number(p) };
    // Only parameters this module writes; anything else is not ours.
    if (cost.N !== COST.N || cost.r !== COST.r || cost.p !== COST.p || !salt || !hash) return null;
    return { salt, hash, cost, legacy: false };
  }
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return null;
  return { salt, hash, cost: LEGACY_COST, legacy: true };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, KEY_LENGTH, COST);
  return `${PREFIX}${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;
  const derived = await scrypt(password, parsed.salt, KEY_LENGTH, parsed.cost);
  if (parsed.legacy) await scrypt(password, parsed.salt, KEY_LENGTH, LEGACY_PADDING);
  const expected = Buffer.from(parsed.hash, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/** True for a hash written with a lower cost than the current one. */
export function needsRehash(stored: string): boolean {
  return !stored.startsWith(PREFIX);
}
