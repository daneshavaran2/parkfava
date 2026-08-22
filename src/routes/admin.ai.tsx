import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/use-auth";
import { getAdminAiSettings, saveAdminAiSettings } from "@/lib/admin-ai.functions";

export const Route = createFileRoute("/admin/ai")({
  head: () => ({ meta: [{ title: "AI Assistant Settings" }] }),
  component: AdminAiPage,
});

const inputStyle = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 9,
  border: "1px solid var(--stroke)",
  background: "var(--panel-2)",
  color: "var(--ink)",
  fontFamily: "inherit",
} as const;

function AdminAiPage() {
  const { t } = useTranslation();
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getSettings = useServerFn(getAdminAiSettings);
  const saveSettings = useServerFn(saveAdminAiSettings);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-ai-settings"],
    queryFn: () => getSettings(),
    enabled: !!user && isAdmin,
  });
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("openai/gpt-4o-mini");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { next: "/admin/ai" } });
  }, [loading, user, navigate]);
  useEffect(() => {
    if (!data) return;
    setModel(data.model);
    setEnabled(data.enabled);
  }, [data]);

  async function save(clearKey = false) {
    setBusy(true);
    setMessage("");
    try {
      await saveSettings({ data: { apiKey, model, enabled, clearKey } });
      setApiKey("");
      await queryClient.invalidateQueries({ queryKey: ["admin-ai-settings"] });
      setMessage(t("adminAi.saved"));
    } catch {
      setMessage(t("adminAi.save_failed"));
    } finally {
      setBusy(false);
    }
  }

  if (loading || isLoading) return <div className="view"><div className="shell" style={{ padding: 40 }}>{t("common.loading")}</div></div>;
  if (!user) return null;
  if (!isAdmin) return <div className="view"><div className="shell" style={{ padding: 40 }}><h2>{t("adminExhibition.no_admin_access_title")}</h2></div></div>;

  return (
    <div className="view">
      <div className="shell" style={{ padding: "24px 16px", maxWidth: 860 }}>
        <div className="section-head">
          <div>
            <span className="eyebrow">OpenRouter</span>
            <h2 className="h2">{t("adminAi.title")}</h2>
            <p className="lead" style={{ marginTop: 6 }}>{t("adminAi.lead")}</p>
          </div>
          <Link to="/admin/exhibition" className="btn btn-ghost">{t("adminAi.back")}</Link>
        </div>

        <div className="panel" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ padding: 12, borderRadius: 9, background: "var(--panel-2)", fontSize: 13 }}>
            <b>{data?.configured ? t("adminAi.configured") : t("adminAi.not_configured")}</b>
            {data?.keyLastFour && <span style={{ marginInlineStart: 8, fontFamily: "monospace" }}>••••{data.keyLastFour}</span>}
            {data?.environmentConfigured && <div style={{ marginTop: 5, color: "var(--ink-soft)" }}>{t("adminAi.env_fallback")}</div>}
          </div>

          <label style={{ display: "flex", gap: 9, alignItems: "center", fontWeight: 700 }}>
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            {t("adminAi.enabled")}
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{t("adminAi.api_key")}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={data?.databaseConfigured ? t("adminAi.keep_key_placeholder") : "sk-or-v1-…"}
              style={{ ...inputStyle, direction: "ltr", textAlign: "left" }}
            />
            <small style={{ color: "var(--ink-soft)" }}>{t("adminAi.key_security")}</small>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{t("adminAi.model")}</span>
            <input value={model} onChange={(event) => setModel(event.target.value)} style={{ ...inputStyle, direction: "ltr", textAlign: "left" }} />
            <small style={{ color: "var(--ink-soft)" }}>{t("adminAi.model_hint")}</small>
          </label>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn btn-primary" disabled={busy || !model.trim()} onClick={() => save(false)}>
              {busy ? t("adminAi.saving") : t("adminAi.save")}
            </button>
            {data?.databaseConfigured && (
              <button className="btn btn-ghost" disabled={busy} onClick={() => save(true)} style={{ color: "#d45" }}>
                {t("adminAi.clear_key")}
              </button>
            )}
            {message && <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>{message}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
