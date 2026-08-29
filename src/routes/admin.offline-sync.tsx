import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/use-auth";
import { refreshFromLiveSite } from "@/lib/offline-sync.functions";
import { signOutFn } from "@/lib/auth.functions";
import { tHead } from "@/i18n/head";

export const Route = createFileRoute("/admin/offline-sync")({
  head: () => ({ meta: [{ title: tHead("meta.admin_offline_sync_title") }] }),
  component: AdminOfflineSyncPage,
});

function AdminOfflineSyncPage() {
  const { t } = useTranslation();
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<"idle" | "busy" | "ok" | "error">("idle");
  const [exportedAt, setExportedAt] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { next: "/admin/offline-sync" } });
  }, [user, loading, navigate]);

  if (loading)
    return (
      <div className="view">
        <div className="shell" style={{ padding: 40 }}>
          {t("common.loading")}
        </div>
      </div>
    );
  if (!user) return null;
  if (!isAdmin) {
    return (
      <div className="view">
        <div className="shell" style={{ padding: 40 }}>
          <h2 className="h2">{t("adminExhibition.no_admin_access_title")}</h2>
        </div>
      </div>
    );
  }

  async function refresh() {
    setState("busy");
    setErrorMsg(null);
    try {
      const result = await refreshFromLiveSite();
      setExportedAt(result.exportedAt);
      setState("ok");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }

  return (
    <div className="view">
      <div className="shell" style={{ padding: "20px 16px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div>
            <span className="eyebrow">Admin</span>
            <h2 className="h2" style={{ fontSize: 24 }}>
              {t("adminOfflineSync.title")}
            </h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link to="/admin/about" className="btn btn-ghost">
              {t("adminAbout.manage_title")}
            </Link>
            <button
              className="btn btn-ghost"
              onClick={async () => {
                await signOutFn();
                navigate({ to: "/auth", search: { next: "" } });
              }}
            >
              {t("common.logout")}
            </button>
          </div>
        </div>

        <div
          className="panel"
          style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14, maxWidth: 640 }}
        >
          <p style={{ margin: 0, color: "var(--ink-soft)", lineHeight: 1.8 }}>
            {t("adminOfflineSync.description")}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.8 }}>
            {t("adminOfflineSync.one_way_notice")}
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="btn btn-primary" onClick={refresh} disabled={state === "busy"}>
              {state === "busy"
                ? t("adminOfflineSync.refreshing")
                : t("adminOfflineSync.refresh_button")}
            </button>
            {state === "ok" && (
              <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                {t("adminOfflineSync.success")}
                {exportedAt &&
                  ` — ${t("adminOfflineSync.last_export_at")} ${new Date(exportedAt).toLocaleString()}`}
              </span>
            )}
            {state === "error" && (
              <span style={{ fontSize: 13, color: "var(--danger, #d33)" }}>
                {t("adminOfflineSync.failure")}
                {errorMsg ? ` (${errorMsg})` : ""}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
