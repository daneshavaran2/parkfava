import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "../../db/connection";
import { requireAuth } from "./auth/middleware";
import { markSessionMfaVerified } from "./auth/session.server";
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
    const [row] = await sql<{ phone: string | null; phone_verified: boolean }[]>`
      SELECT phone, phone_verified FROM users WHERE id = ${context.user.id}
    `;
    return {
      enforced: isMfaEnforced(),
      phone: row?.phone ?? null,
      phoneVerified: !!row?.phone_verified,
      // This session's own verification, not any other session's.
      satisfied: context.user.mfaVerified,
    };
  });

export const setPhone = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((i) => z.object({ phone: z.string().min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    const phone = normalizePhone(data.phone);
    if (!phone) throw new Error("INVALID_PHONE");
    const sql = getDb();
    // A verified phone is the second factor itself. Letting a session that
    // has only the password replace it would let whoever stole the password
    // point the OTP at their own number and pass MFA. Replacing it needs a
    // session that already passed MFA (or an admin resetting the account).
    const [current] = await sql<{ phone_verified: boolean }[]>`
      SELECT phone_verified FROM users WHERE id = ${context.user.id}
    `;
    if (current?.phone_verified && !context.user.mfaVerified) throw new Error("PHONE_CHANGE_REQUIRES_MFA");
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

    // Claim the send before talking to the SMS panel, in one conditional
    // UPDATE: the resend cooldown and the per-account cap on real SMS sends
    // (independent of which number is targeted, since a number's ownership is
    // only proven once the OTP is verified) are checked and recorded
    // together. Read first and recorded after the send, parallel requests
    // all passed both checks and each sent a text, so one account could fire
    // a burst of SMS at an arbitrary number (docs/Security Report.md,
    // SEC-051). Only one request can win the row.
    const cooldownSecs = OTP_RESEND_COOLDOWN_MS / 1000;
    const windowSecs = OTP_SEND_WINDOW_MS / 1000;
    const [claimed] = await sql<{ id: string }[]>`
      UPDATE users SET
        mfa_otp_last_sent_at = now(),
        mfa_otp_send_count = CASE
          WHEN mfa_otp_send_window_start > now() - make_interval(secs => ${windowSecs})
          THEN mfa_otp_send_count + 1 ELSE 1 END,
        mfa_otp_send_window_start = CASE
          WHEN mfa_otp_send_window_start > now() - make_interval(secs => ${windowSecs})
          THEN mfa_otp_send_window_start ELSE now() END
      WHERE id = ${context.user.id}
        AND (mfa_otp_last_sent_at IS NULL
          OR mfa_otp_last_sent_at <= now() - make_interval(secs => ${cooldownSecs}))
        AND (mfa_otp_send_window_start IS NULL
          OR mfa_otp_send_window_start <= now() - make_interval(secs => ${windowSecs})
          OR mfa_otp_send_count < ${OTP_MAX_SENDS_PER_WINDOW})
      RETURNING id
    `;
    if (!claimed) {
      const lastSent = row.mfa_otp_last_sent_at ? row.mfa_otp_last_sent_at.getTime() : 0;
      const windowStart = row.mfa_otp_send_window_start
        ? row.mfa_otp_send_window_start.getTime()
        : 0;
      const capped =
        Date.now() - windowStart < OTP_SEND_WINDOW_MS &&
        row.mfa_otp_send_count >= OTP_MAX_SENDS_PER_WINDOW;
      throw new Error(
        capped && Date.now() - lastSent >= OTP_RESEND_COOLDOWN_MS
          ? "OTP_DAILY_LIMIT"
          : "OTP_COOLDOWN",
      );
    }

    const code = generateOtpCode();
    const { sendOtpSms } = await import("@/lib/sms/send-sms.server");
    try {
      await sendOtpSms(row.phone, code);
    } catch (e) {
      // Nothing was sent: hand the slot back, so an SMS panel outage does not
      // use up the account's daily sends or make it wait out the cooldown.
      // Safe from races: while this request held the slot every other one was
      // refused by the cooldown.
      await sql`
        UPDATE users SET
          mfa_otp_last_sent_at = ${row.mfa_otp_last_sent_at},
          mfa_otp_send_count = greatest(mfa_otp_send_count - 1, 0)
        WHERE id = ${context.user.id}
      `;
      throw e;
    }

    await sql`
      UPDATE users SET
        mfa_otp_hash = ${hashOtpCode(code)},
        mfa_otp_expires_at = ${new Date(Date.now() + OTP_TTL_MS)},
        mfa_otp_attempts = 0
      WHERE id = ${context.user.id}
    `;
    return { ok: true };
  });

export const verifyOtp = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((i) => z.object({ code: z.string().min(4).max(8) }).parse(i))
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
    const until = new Date(Date.now() + MFA_TOKEN_TTL_MS);
    await sql`
      UPDATE users SET
        phone_verified = true,
        mfa_otp_hash = null,
        mfa_otp_expires_at = null,
        mfa_otp_attempts = 0,
        mfa_token = ${mfaToken},
        mfa_token_expires_at = ${until}
      WHERE id = ${context.user.id}
    `;
    // What requireMfaVerified actually checks: this session only.
    await markSessionMfaVerified(context.user.id, until);
    return { ok: true };
  });
