import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Home, Lock, Mail, Moon, Sun } from "lucide-react";
import { signUp, signIn, signOutFn, getCurrentUser } from "@/lib/auth.functions";
import { getMyRoles } from "@/lib/admin-users.functions";
import { getMfaStatus, setPhone as setPhoneFn, requestOtp, verifyOtp } from "@/lib/mfa.functions";
import { normalizePhone, maskPhone } from "@/lib/mfa/phone";
import { getTheme, setTheme, subscribeTheme, type Theme } from "@/lib/theme";
import logoSpin from "@/assets/logo-spin.webp";

async function resolveDestination(fallback: string): Promise<string> {
  // Re-checked here rather than trusted from the route: validateSearch runs on
  // the server too, where there is no origin to resolve against, and this is
  // the last step before window.location.assign actually navigates.
  const requested = safeNext(fallback);
  if (requested && requested !== "/") return requested;
  try {
    const info = await getMyRoles();
    if (info.roles.includes("admin")) return "/admin/exhibition";
    if (info.owned_company_id) return "/my-company";
  } catch { /* ignore */ }
  return "/";
}

/**
 * A post-login destination, or "" if it would leave this origin.
 *
 * Pattern-matching the string is not enough: the URL parser treats a backslash
 * as a slash in the authority position, so "/\evil.com" — which starts with a
 * single slash and passes a `startsWith("//")` check — resolves to
 * "http://evil.com/". Same for a tab or newline inside the prefix, which the
 * parser strips before parsing. Resolving the candidate and comparing the
 * origin it actually produces is the only check that cannot be tricked this
 * way, since it asks the same parser that will perform the navigation.
 */
function safeNext(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/")) return "";
  // No base on the server, so fall back to the string rules there; the value
  // is re-checked in the browser before it is ever navigated to.
  const base = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  try {
    const url = new URL(raw, base);
    if (url.origin !== base) return "";
    return url.pathname + url.search + url.hash;
  } catch {
    return "";
  }
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({ next: safeNext(s.next) }),
  head: () => ({ meta: [{ title: "ورود — شبکه فاوا" }] }),
  component: AuthPage,
});

function authErrorMessage(e: any, t: (key: string) => string): string {
  const code = e?.message;
  if (code === "EMAIL_ALREADY_REGISTERED") return t("auth.email_already_registered");
  if (code === "INVALID_CREDENTIALS") return t("auth.invalid_credentials");
  // Throttled. Worth its own message: "login failed" would read as a wrong
  // password and invite the user to keep trying, which is the one thing that
  // cannot work here.
  if (code === "RATE_LIMITED") return t("auth.too_many_attempts");
  return t("auth.login_failed");
}

const MFA_ERROR_KEYS: Record<string, string> = {
  INVALID_PHONE: "auth.phone_invalid",
  PHONE_NOT_SET: "auth.phone_not_set",
  OTP_COOLDOWN: "auth.otp_cooldown",
  OTP_DAILY_LIMIT: "auth.otp_daily_limit",
  OTP_NOT_REQUESTED: "auth.otp_not_requested",
  OTP_EXPIRED: "auth.otp_expired",
  OTP_MAX_ATTEMPTS: "auth.otp_max_attempts",
  OTP_INCORRECT: "auth.otp_incorrect",
};

function mfaErrorMessage(e: any, t: (key: string) => string, fallbackKey: string): string {
  const key = MFA_ERROR_KEYS[e?.message];
  return t(key ?? fallbackKey);
}

/**
 * Full-screen ICT Park scene. The frosted panel behind the form belongs to the
 * background photograph — see the LOGIN SCENE block in styles.css for why the
 * card's geometry has to track `background-size: cover`.
 */
function AuthScene({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [theme, setLocalTheme] = useState<Theme>("light");

  useEffect(() => {
    setLocalTheme(getTheme());
    return subscribeTheme(setLocalTheme);
  }, []);

  return (
    <div className="auth-scene">
      <div className="auth-photo" aria-hidden="true" />
      <div className="auth-corner">
        <Link to="/" title={t("auth.back_to_site")} aria-label={t("auth.back_to_site")}>
          <Home size={15} aria-hidden="true" />
          <span>{t("auth.back_to_site")}</span>
        </Link>
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={t("common.toggle_theme")}
          title={theme === "dark" ? t("common.theme_day") : t("common.theme_night")}
        >
          {theme === "dark" ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
        </button>
      </div>
      <section className="auth-card">
        <img className="auth-logo" src={logoSpin} alt="" aria-hidden="true" />
        <div className="auth-brand">{t("auth.brand")}</div>
        <div className="auth-brand-sub">{t("auth.brand_sub")}</div>
        <div className="auth-brand-en">{t("auth.brand_en")}</div>
        {children}
      </section>
    </div>
  );
}

function AuthPage() {
  const { next } = Route.useSearch();
  const { t } = useTranslation();
  const signUpFn = useServerFn(signUp);
  const signInFn = useServerFn(signIn);
  const signOutFnRpc = useServerFn(signOutFn);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotNote, setShowForgotNote] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step-up SMS verification. Only ever engaged when the server reports
  // MFA_ENFORCED=true (see src/lib/auth/middleware.ts) — stays out of the
  // way entirely otherwise.
  const [mfaStep, setMfaStep] = useState<"phone" | "otp" | null>(null);
  const [mfaPhoneInput, setMfaPhoneInput] = useState("");
  const [mfaPhone, setMfaPhone] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [resendAt, setResendAt] = useState(0);

  const fallback = next || "";

  useEffect(() => {
    let active = true;
    getCurrentUser().then((user) => {
      if (active && user) void proceedAfterAuth();
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallback]);

  async function proceedAfterAuth() {
    try {
      const status = await getMfaStatus();
      if (status.enforced && !status.satisfied) {
        setMfaPhone(status.phone);
        if (status.phone) {
          setMfaStep("otp");
          await triggerRequestOtp();
        } else {
          setMfaStep("phone");
        }
        return;
      }
    } catch (e) {
      // A bug in the (brand new, not yet exercised end-to-end) MFA check
      // itself must never be able to lock everyone out of the site —
      // fail open to the pre-existing behavior instead.
      console.error("[auth] mfa status check failed", e);
    }
    const dest = await resolveDestination(fallback);
    window.location.assign(dest);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUpFn({ data: { email, password, remember } });
      } else {
        await signInFn({ data: { email, password, remember } });
      }
      await proceedAfterAuth();
    } catch (e: any) {
      console.error("[auth] sign-in failed", e);
      setErr(authErrorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }

  async function triggerRequestOtp() {
    setErr(null);
    try {
      await requestOtp();
      setResendAt(Date.now() + 60_000);
    } catch (e: any) {
      setErr(mfaErrorMessage(e, t, "auth.otp_send_failed"));
    }
  }

  async function submitPhone(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const normalized = normalizePhone(mfaPhoneInput);
    if (!normalized) {
      setErr(t("auth.phone_invalid"));
      return;
    }
    setBusy(true);
    try {
      await setPhoneFn({ data: { phone: normalized } });
      setMfaPhone(normalized);
      setMfaStep("otp");
      await triggerRequestOtp();
    } catch (e: any) {
      setErr(mfaErrorMessage(e, t, "common.error"));
    }
    setBusy(false);
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await verifyOtp({ data: { code: otpCode.trim() } });
      const dest = await resolveDestination(fallback);
      window.location.assign(dest);
    } catch (e: any) {
      setErr(mfaErrorMessage(e, t, "auth.otp_invalid"));
      setBusy(false);
    }
  }

  async function backToCredentials() {
    await signOutFnRpc();
    setMfaStep(null);
    setMfaPhone(null);
    setMfaPhoneInput("");
    setOtpCode("");
    setErr(null);
  }

  if (mfaStep === "phone") {
    return (
      <AuthScene>
        <h1 className="auth-title">{t("auth.phone_title")}</h1>
        <p className="auth-lead">{t("auth.phone_lead")}</p>
        <form className="auth-form" onSubmit={submitPhone}>
          <label className="auth-field">
            <input
              type="tel"
              required
              dir="ltr"
              value={mfaPhoneInput}
              onChange={(e) => setMfaPhoneInput(e.target.value)}
              placeholder={t("auth.phone_placeholder")}
              aria-label={t("auth.phone_label")}
            />
          </label>
          {err && <div role="alert" className="auth-error">{err}</div>}
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? "…" : t("auth.send_otp")}
          </button>
        </form>
        <div className="auth-alt">
          <button type="button" className="auth-linkbtn" onClick={backToCredentials}>
            {t("auth.back_to_signin")}
          </button>
        </div>
      </AuthScene>
    );
  }

  if (mfaStep === "otp") {
    return (
      <AuthScene>
        <h1 className="auth-title">{t("auth.otp_title")}</h1>
        <p className="auth-lead">
          {t("auth.otp_lead", { phone: mfaPhone ? maskPhone(mfaPhone) : t("auth.otp_lead_your_number") })}
        </p>
        <form className="auth-form" onSubmit={submitOtp}>
          <label className="auth-field">
            <input
              type="text"
              inputMode="numeric"
              required
              dir="ltr"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
              placeholder={t("auth.otp_placeholder")}
              aria-label={t("auth.otp_label")}
              style={{ letterSpacing: 6, textAlign: "center" }}
            />
          </label>
          {err && <div role="alert" className="auth-error">{err}</div>}
          <button type="submit" className="auth-submit" disabled={busy || otpCode.length < 4}>
            {busy ? "…" : t("auth.confirm")}
          </button>
        </form>
        <div className="auth-alt auth-options" style={{ width: "100%" }}>
          <button type="button" className="auth-linkbtn" onClick={triggerRequestOtp} disabled={Date.now() < resendAt}>
            {t("auth.resend_otp")}
          </button>
          <button type="button" className="auth-linkbtn" onClick={backToCredentials}>
            {t("auth.back_to_signin")}
          </button>
        </div>
      </AuthScene>
    );
  }

  return (
    <AuthScene>
      <h1 className="auth-title">
        {mode === "signin" ? t("auth.signin_title") : t("auth.signup_title")}
      </h1>
      <p className="auth-lead">{t("auth.lead")}</p>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="auth-field">
          <Mail size={18} aria-hidden="true" />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.email")}
            aria-label={t("auth.email")}
            autoComplete="email"
          />
        </label>

        <label className="auth-field">
          <Lock size={18} aria-hidden="true" />
          <input
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.password")}
            aria-label={t("auth.password")}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            data-testid="password-input"
          />
          <button
            type="button"
            className="auth-eye"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t("auth.hide_password") : t("auth.show_password")}
            aria-pressed={showPassword}
            title={showPassword ? t("auth.hide_password") : t("auth.show_password")}
            data-testid="toggle-password"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </label>

        <div className="auth-options">
          <button type="button" className="auth-linkbtn" onClick={() => setShowForgotNote((v) => !v)}>
            {t("auth.forgot_password")}
          </button>
          <label className="auth-remember">
            <span>{t("auth.remember_me")}</span>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          </label>
        </div>
        {/* No self-service reset exists yet, so the link explains the actual
            recovery path instead of leading nowhere. */}
        {showForgotNote && <div className="auth-note">{t("auth.forgot_note")}</div>}

        {err && <div role="alert" className="auth-error">{err}</div>}

        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? "…" : mode === "signin" ? t("auth.signin") : t("auth.signup")}
        </button>
      </form>

      <div className="auth-alt">
        {mode === "signin" ? t("auth.no_account_q") : t("auth.have_account_q")}{" "}
        <button type="button" className="auth-linkbtn" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? t("auth.signup_action") : t("auth.signin_action")}
        </button>
      </div>
    </AuthScene>
  );
}
