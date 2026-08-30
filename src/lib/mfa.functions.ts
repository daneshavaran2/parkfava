import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "../../db/connection";
import { requireAuth } from "./auth/middleware";
import { normalizePhone } from "@/lib/mfa/phone";

function isMfaEnforced() {
  return process.env.MFA_ENFORCED === "true";
}

type MfaRow = {
  phone: string | null;
  phone_verified: boolean;
  mfa_token_expires_at: Date | null;
  mfa_otp_hash: string | null;
  mfa_otp_expires_at: Date | null;
  mfa_otp_attempts: number;
  mfa_otp_last_sent_at: Date | null;
  mfa_otp_send_window_start: Date | null;
  mfa_otp_send_count: number;
};

async function loadMfaRow(sql: ReturnType<typeof getDb>, userId: string): Promise<MfaRow | undefined> {
  const [row] = await sql<MfaRow[]>`
    SELECT phone, phone_verified, mfa_token_expires_at, mfa_otp_hash, mfa_otp_expires_at,
           mfa_otp_attempts, mfa_otp_last_sent_at, mfa_otp_send_window_start, mfa_otp_send_count
    FROM users WHERE id = ${userId}
  `;
  return row;
}

export const getMfaStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const sql = getDb();
    const [row] = await sql<{ phone: string | null; phone_verified: boolean; mfa_token_expires_at: Date | null }[]>`
      SELECT phone, phone_verified, mfa_token_expires_at FROM users WHERE id = ${context.user.id}
    `;
    const satisfied = !!row?.mfa_token_expires_at && row.mfa_token_expires_at.getTime() > Date.now();
    return {
      enforced: isMfaEnforced(),
      phone: row?.phone ?? null,
      phoneVerified: !!row?.phone_verified,
      satisfied,
    };
  });

export const setPhone = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i) => z.object({ phone: z.string().min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    const phone = normalizePhone(data.phone);
    if (!phone) throw new Error("INVALID_PHONE");
    const sql = getDb();
    await sql`UPDATE users SET phone = ${phone}, phone_verified = false WHERE id = ${context.user.id}`;
    return { ok: true };
  });

export const requestOtp = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const sql = getDb();
    const row = await loadMfaRow(sql, context.user.id);
    if (!row?.phone) throw new Error("PHONE_NOT_SET");

    const {
      OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS, OTP_MAX_SENDS_PER_WINDOW, OTP_SEND_WINDOW_MS,
      generateOtpCode, hashOtpCode,
    } = await import("@/lib/mfa/otp.server");

    const lastSent = row.mfa_otp_last_sent_at ? row.mfa_otp_last_sent_at.getTime() : 0;
    if (Date.now() - lastSent < OTP_RESEND_COOLDOWN_MS) {
      throw new Error("OTP_COOLDOWN");
    }

    // Per-account cap on real SMS sends, independent of which phone number is
    // targeted — a phone number's ownership is only proven once the OTP is
    // verified, so without this an account could be used to repeatedly text
    // an arbitrary third-party number (or hop between numbers) purely to
    // harass someone or burn the SMS panel's budget.
    const windowStart = row.mfa_otp_send_window_start ? row.mfa_otp_send_window_start.getTime() : 0;
    const windowActive = Date.now() - windowStart < OTP_SEND_WINDOW_MS;
    const sendsInWindow = windowActive ? row.mfa_otp_send_count : 0;
    if (sendsInWindow >= OTP_MAX_SENDS_PER_WINDOW) {
      throw new Error("OTP_DAILY_LIMIT");
    }

    const code = generateOtpCode();
    const { sendOtpSms } = await import("@/lib/sms/send-sms.server");
    await sendOtpSms(row.phone, code);

    const nextWindowStart = windowActive ? row.mfa_otp_send_window_start : new Date();
    await sql`
      UPDATE users SET
        mfa_otp_hash = ${hashOtpCode(code)},
        mfa_otp_expires_at = ${new Date(Date.now() + OTP_TTL_MS)},
        mfa_otp_attempts = 0,
        mfa_otp_last_sent_at = now(),
        mfa_otp_send_window_start = ${nextWindowStart},
        mfa_otp_send_count = ${sendsInWindow + 1}
      WHERE id = ${context.user.id}
    `;
    return { ok: true };
  });

export const verifyOtp = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i) => z.object({ code: z.string().min(4).max(8) }).parse(i))
  .handler(async ({ data, context }) => {
    const sql = getDb();
    const row = await loadMfaRow(sql, context.user.id);
    if (!row?.mfa_otp_hash || !row.mfa_otp_expires_at) throw new Error("OTP_NOT_REQUESTED");
    if (row.mfa_otp_expires_at.getTime() < Date.now()) throw new Error("OTP_EXPIRED");

    const { OTP_MAX_ATTEMPTS, MFA_TOKEN_TTL_MS, hashOtpCode, generateMfaToken } = await import("@/lib/mfa/otp.server");

    // Atomic check-and-increment: reading mfa_otp_attempts once and only
    // conditionally writing it back (the old shape here) lets concurrent
    // requests all read the same stale count and all pass the < N gate
    // before any single one's increment commits — the cap was enforced by
    // application code racing itself, not by the database. Guarding the
    // UPDATE's own WHERE clause with the same condition means Postgres's
    // row-level locking serializes the attempts for real: only a request
    // that finds the row still under the limit at write time ever gets a
    // row back, no matter how many arrive at once.
    const [claimed] = await sql<{ mfa_otp_attempts: number }[]>`
      UPDATE users SET mfa_otp_attempts = mfa_otp_attempts + 1
      WHERE id = ${context.user.id} AND mfa_otp_attempts < ${OTP_MAX_ATTEMPTS}
      RETURNING mfa_otp_attempts
    `;
    if (!claimed) throw new Error("OTP_MAX_ATTEMPTS");

    if (hashOtpCode(data.code) !== row.mfa_otp_hash) {
      throw new Error("OTP_INCORRECT");
    }

    const mfaToken = generateMfaToken();
    await sql`
      UPDATE users SET
        phone_verified = true,
        mfa_otp_hash = null,
        mfa_otp_expires_at = null,
        mfa_otp_attempts = 0,
        mfa_token = ${mfaToken},
        mfa_token_expires_at = ${new Date(Date.now() + MFA_TOKEN_TTL_MS)}
      WHERE id = ${context.user.id}
    `;
    return { ok: true };
  });
