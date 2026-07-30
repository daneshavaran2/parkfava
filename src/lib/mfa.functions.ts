import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizePhone } from "@/lib/mfa/phone";

function isMfaEnforced() {
  return process.env.MFA_ENFORCED === "true";
}

export const getMfaStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const meta = ((context.claims as any)?.user_metadata ?? {}) as Record<string, any>;
    const tokenValid = !!meta.mfa_token
      && !!meta.mfa_token_expires_at
      && new Date(meta.mfa_token_expires_at).getTime() > Date.now();
    return {
      enforced: isMfaEnforced(),
      phone: (meta.phone as string | undefined) ?? null,
      phoneVerified: !!meta.phone_verified,
      satisfied: tokenValid,
    };
  });

export const setPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ phone: z.string().min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    const phone = normalizePhone(data.phone);
    if (!phone) throw new Error("شماره موبایل نامعتبر است (فرمت صحیح: 09xxxxxxxxx)");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userRes, error: getErr } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (getErr || !userRes?.user) throw new Error("کاربر یافت نشد");
    const meta = (userRes.user.user_metadata ?? {}) as Record<string, any>;
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      user_metadata: { ...meta, phone, phone_verified: false },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const requestOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userRes, error: getErr } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (getErr || !userRes?.user) throw new Error("کاربر یافت نشد");
    const meta = (userRes.user.user_metadata ?? {}) as Record<string, any>;
    const phone = meta.phone as string | undefined;
    if (!phone) throw new Error("ابتدا شماره موبایل را ثبت کنید");

    const {
      OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS, OTP_MAX_SENDS_PER_WINDOW, OTP_SEND_WINDOW_MS,
      generateOtpCode, hashOtpCode,
    } = await import("@/lib/mfa/otp.server");
    const lastSent = meta.otp_last_sent_at ? new Date(meta.otp_last_sent_at).getTime() : 0;
    if (Date.now() - lastSent < OTP_RESEND_COOLDOWN_MS) {
      throw new Error("لطفاً کمی صبر کنید و دوباره تلاش کنید");
    }

    // Per-account cap on real SMS sends, independent of which phone number is
    // targeted — a phone number's ownership is only proven once the OTP is
    // verified, so without this an account could be used to repeatedly text
    // an arbitrary third-party number (or hop between numbers) purely to
    // harass someone or burn the SMS panel's budget.
    const windowStart = meta.otp_send_window_start ? new Date(meta.otp_send_window_start).getTime() : 0;
    const windowActive = Date.now() - windowStart < OTP_SEND_WINDOW_MS;
    const sendsInWindow = windowActive ? (meta.otp_send_count ?? 0) : 0;
    if (sendsInWindow >= OTP_MAX_SENDS_PER_WINDOW) {
      throw new Error("تعداد درخواست کد پیامکی امروز شما به سقف مجاز رسیده است، فردا دوباره تلاش کنید");
    }

    const code = generateOtpCode();
    const { sendOtpSms } = await import("@/lib/sms/send-sms.server");
    await sendOtpSms(phone, code);

    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      user_metadata: {
        ...meta,
        otp_code_hash: hashOtpCode(code),
        otp_expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
        otp_attempts: 0,
        otp_last_sent_at: new Date().toISOString(),
        otp_send_window_start: windowActive ? meta.otp_send_window_start : new Date().toISOString(),
        otp_send_count: sendsInWindow + 1,
      },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const verifyOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ code: z.string().min(4).max(8) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userRes, error: getErr } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (getErr || !userRes?.user) throw new Error("کاربر یافت نشد");
    const meta = (userRes.user.user_metadata ?? {}) as Record<string, any>;

    if (!meta.otp_code_hash || !meta.otp_expires_at) throw new Error("ابتدا درخواست کد کنید");
    if (new Date(meta.otp_expires_at).getTime() < Date.now()) throw new Error("کد منقضی شده است، دوباره درخواست دهید");

    const { OTP_MAX_ATTEMPTS, MFA_TOKEN_TTL_MS, hashOtpCode, generateMfaToken } = await import("@/lib/mfa/otp.server");
    if ((meta.otp_attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
      throw new Error("تعداد تلاش‌های اشتباه بیش از حد مجاز است، دوباره درخواست کد دهید");
    }

    if (hashOtpCode(data.code) !== meta.otp_code_hash) {
      await supabaseAdmin.auth.admin.updateUserById(context.userId, {
        user_metadata: { ...meta, otp_attempts: (meta.otp_attempts ?? 0) + 1 },
      });
      throw new Error("کد وارد شده اشتباه است");
    }

    const mfaToken = generateMfaToken();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      user_metadata: {
        ...meta,
        phone_verified: true,
        otp_code_hash: null,
        otp_expires_at: null,
        otp_attempts: 0,
        mfa_token: mfaToken,
        mfa_token_expires_at: new Date(Date.now() + MFA_TOKEN_TTL_MS).toISOString(),
      },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
