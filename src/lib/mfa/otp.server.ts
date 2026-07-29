// Server-only (uses node:crypto). Dynamically import this from inside a
// server function handler — never at module scope in a *.functions.ts file,
// which also ships to the client bundle.
import { createHash, randomBytes, randomInt } from "node:crypto";

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const MFA_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(OTP_LENGTH, "0");
}

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function generateMfaToken(): string {
  return randomBytes(32).toString("hex");
}
