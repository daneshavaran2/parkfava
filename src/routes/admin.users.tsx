import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { signOutFn } from "@/lib/auth.functions";
import { useAuth } from "@/lib/use-auth";
import {
  listUsers,
  grantAdmin,
  revokeAdmin,
  assignCompanyOwner,
} from "@/lib/admin-users.functions";
import { listAdminCompanies } from "@/lib/exhibition-api.functions";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "مدیریت کاربران — ادمین فاوا" }] }),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, isAdmin, loading } = useAuth();
  const listUsersFn = useServerFn(listUsers);
  const grantAdminFn = useServerFn(grantAdmin);
  const revokeAdminFn = useServerFn(revokeAdmin);
  const assignFn = useServerFn(assignCompanyOwner);
  const listCompaniesFn = useServerFn(listAdminCompanies);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listUsersFn() as any,
    enabled: !!user && isAdmin,
  });
  const { data: companies = [] } = useQuery({
    queryKey: ["admin-exh-companies"],
    queryFn: () => listCompaniesFn() as any,
    enabled: !!user && isAdmin,
  });

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return users;
    return (users as any[]).filter((u) => (u.email ?? "").toLowerCase().includes(f) || u.id.includes(f));
  }, [users, filter]);

  async function run(key: string, fn: () => Promise<any>) {
    setBusy(key); setErr(null);
    try { await fn(); qc.invalidateQueries({ queryKey: ["admin-users"] }); qc.invalidateQueries({ queryKey: ["admin-exh-companies"] }); }
    catch (e: any) {
      setErr(e?.message === "CANNOT_REVOKE_SELF" ? t("adminUsers.cannot_revoke_self") : t("adminUsers.generic_error"));
    }
    finally { setBusy(null); }
  }

  if (loading) return <div className="view"><div className="shell" style={{ padding: 40 }}>{t("common.loading")}</div></div>;
  if (!user) { navigate({ to: "/auth", search: { next: "/admin/users" } as any }); return null; }
  if (!isAdmin) {
    return <div className="view"><div className="shell" style={{ padding: 40 }}>
      <h2 className="h2">{t("adminExhibition.no_admin_access_title")}</h2>
      <p className="lead">{t("adminUsers.no_admin_access_lead")}</p>
    </div></div>;
  }

  return (
    <div className="view"><div className="shell" style={{ padding: "20px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <span className="eyebrow">Admin</span>
          <h2 className="h2" style={{ fontSize: 24 }}>{t("adminUsers.manage_title")}</h2>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link to="/admin/exhibition" className="btn btn-ghost">{t("adminUsers.companies_link")}</Link>
          <Link to="/admin/parks" className="btn btn-ghost">{t("adminUsers.parks_link")}</Link>
          <button className="btn btn-ghost" onClick={async () => { await signOutFn(); navigate({ to: "/auth", search: { next: "" } }); }}>{t("common.logout")}</button>
        </div>
      </div>

      <div className="panel" style={{ padding: 12, marginBottom: 12 }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("adminUsers.search_placeholder")}
          className="input"
          style={{ width: "100%", background: "var(--panel-2)", border: "1px solid var(--stroke)", borderRadius: 8, padding: "10px 12px", color: "inherit" }}
        />
      </div>

      {err && <div role="alert" style={{ color: "#ff7676", padding: 10 }}>{err}</div>}
      {usersLoading ? <p className="lead">{t("adminUsers.loading_users")}</p> : (
        <div className="panel" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "start", background: "var(--panel-2)" }}>
                <th style={th}>{t("adminUsers.col_email")}</th>
                <th style={th}>{t("adminUsers.col_id")}</th>
                <th style={th}>{t("adminUsers.col_roles")}</th>
                <th style={th}>{t("adminUsers.col_company")}</th>
                <th style={th}>{t("adminUsers.col_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {(filtered as any[]).map((u) => {
                const currentCompany = u.owned_company_ids[0] ?? "";
                const isThisAdmin = u.roles.includes("admin");
                return (
                  <tr key={u.id} style={{ borderTop: "1px solid var(--stroke)" }}>
                    <td style={td}>{u.email ?? "—"}</td>
                    <td style={{ ...td, fontFamily: "monospace", fontSize: 12, color: "var(--ink-soft)" }}>{u.id.slice(0, 8)}…</td>
                    <td style={td}>
                      {u.roles.length ? u.roles.join(t("adminUsers.list_separator")) : <span style={{ color: "var(--ink-soft)" }}>{t("adminUsers.no_role")}</span>}
                    </td>
                    <td style={td}>
                      <select
                        value={currentCompany}
                        disabled={busy === "assign:" + u.id}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (next === currentCompany) return;
                          run("assign:" + u.id, async () => {
                            if (currentCompany && currentCompany !== next) {
                              await assignFn({ data: { company_id: currentCompany, user_id: null } } as any);
                            }
                            if (next) {
                              await assignFn({ data: { company_id: next, user_id: u.id } } as any);
                            }
                          });
                        }}
                        style={selectStyle}
                      >
                        <option value="">{t("adminUsers.no_assignment")}</option>
                        {(companies as any[]).map((c) => (
                          <option key={c.company_id} value={c.company_id}>{c.name} ({c.company_id})</option>
                        ))}
                      </select>
                    </td>
                    <td style={td}>
                      {isThisAdmin ? (
                        <button className="btn btn-ghost" disabled={busy !== null || u.id === user.id}
                          onClick={() => run("admin:" + u.id, () => revokeAdminFn({ data: { user_id: u.id } } as any))}>
                          {t("adminUsers.revoke_admin")}
                        </button>
                      ) : (
                        <button className="btn btn-primary" disabled={busy !== null}
                          onClick={() => run("admin:" + u.id, () => grantAdminFn({ data: { user_id: u.id } } as any))}>
                          {t("adminUsers.make_admin")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="lead" style={{ marginTop: 16, fontSize: 13, color: "var(--ink-soft)" }}>
        {t("adminUsers.footnote")}
      </p>
    </div></div>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 600, textAlign: "start" };
const td: React.CSSProperties = { padding: "10px 12px", verticalAlign: "middle" };
const selectStyle: React.CSSProperties = {
  background: "var(--panel-2)", border: "1px solid var(--stroke)", borderRadius: 6,
  padding: "6px 8px", color: "inherit", maxWidth: 240,
};
