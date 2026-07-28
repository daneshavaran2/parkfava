import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { getMyRoles } from "@/lib/admin-users.functions";

async function resolveDestination(fallback: string): Promise<string> {
  if (fallback && fallback !== "/") return fallback;
  try {
    const info = await getMyRoles();
    if (info.roles.includes("admin")) return "/admin/exhibition";
    if (info.owned_company_id) return "/my-company";
  } catch { /* ignore */ }
  return "/";
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : "",
  }),
  head: () => ({ meta: [{ title: "ورود — شبکه فاوا" }] }),
  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
  const { t } = useTranslation();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fallback = next || "";

  useEffect(() => {
    let done = false;
    const go = async () => {
      if (done) return;
      done = true;
      const dest = await resolveDestination(fallback);
      window.location.assign(dest);
    };
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void go();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void go();
    });
    return () => sub.subscription.unsubscribe();
  }, [fallback]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + (fallback || "/") },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      const dest = await resolveDestination(fallback);
      window.location.assign(dest);
    } catch (e: any) {
      console.error("[auth] sign-in failed", e);
      setErr(e?.message ?? t("auth.login_failed"));
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setErr(null);
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + (fallback || "/") });
    if (res.error) setErr((res.error as any).message ?? t("auth.google_failed"));
  }

  return (
    <div className="view">
      <div className="shell" style={{ maxWidth: 460, margin: "60px auto" }}>
        <div className="panel" style={{ padding: 28 }}>
          <h2 className="h2" style={{ fontSize: 24 }}>
            {mode === "signin" ? t("auth.signin_title") : t("auth.signup_title")}
          </h2>
          <p className="lead" style={{ marginTop: 6, fontSize: 14 }}>
            {t("auth.lead")}
          </p>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.email")}
              aria-label={t("auth.email")}
              autoComplete="email"
              className="input"
              style={inputStyle}
            />
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.password")}
                aria-label={t("auth.password")}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                className="input"
                style={{ ...inputStyle, paddingInlineEnd: 44, width: "100%" }}
                data-testid="password-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t("auth.hide_password") : t("auth.show_password")}
                aria-pressed={showPassword}
                title={showPassword ? t("auth.hide_password") : t("auth.show_password")}
                data-testid="toggle-password"
                style={{
                  position: "absolute",
                  insetInlineEnd: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: 0,
                  color: "var(--ink-soft)",
                  cursor: "pointer",
                  padding: 6,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {err && <div role="alert" style={{ color: "#ff7676", fontSize: 13 }}>{err}</div>}
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "…" : mode === "signin" ? t("auth.signin") : t("auth.signup")}
            </button>
          </form>
          <button onClick={handleGoogle} className="btn btn-ghost" style={{ width: "100%", marginTop: 10 }}>
            {t("auth.google")}
          </button>
          <div style={{ marginTop: 14, fontSize: 13, textAlign: "center" }}>
            <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              style={{ background: "transparent", color: "var(--accent-glow)", border: 0, cursor: "pointer" }}>
              {mode === "signin" ? t("auth.no_account") : t("auth.have_account")}
            </button>
          </div>
          <div style={{ marginTop: 18, textAlign: "center" }}>
            <Link to="/" style={{ fontSize: 12, color: "var(--ink-soft)" }}>{t("auth.back_to_site")}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--stroke)",
  borderRadius: 10,
  padding: "12px 14px",
  color: "inherit",
  fontFamily: "inherit",
  fontSize: 14,
};
