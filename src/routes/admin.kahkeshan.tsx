import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/use-auth";
import { fetchParks, upsertPark, deletePark, type Park } from "@/lib/parks-api";
import { signOutFn } from "@/lib/auth.functions";

export const Route = createFileRoute("/admin/kahkeshan")({
  head: () => ({ meta: [{ title: "مدیریت کهکشان فاوا" }] }),
  component: AdminKahkeshanPage,
});

const COLORS = ["red", "gold", "blue", "green"];

function AdminKahkeshanPage() {
  const { t } = useTranslation();
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: parks } = useQuery({ queryKey: ["parks-admin"], queryFn: fetchParks });
  const [drafts, setDrafts] = useState<Record<string, Park>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/auth", search: { next: "/admin/kahkeshan" } });
  }, [user, loading, navigate]);

  if (loading) return <div className="view"><div className="shell" style={{ padding: 40 }}>{t("common.loading")}</div></div>;
  if (!user) return null;
  if (!isAdmin) {
    return (
      <div className="view"><div className="shell" style={{ padding: 40 }}>
        <h2 className="h2">{t("adminExhibition.no_admin_access_title")}</h2>
      </div></div>
    );
  }

  function edit(p: Park, patch: Partial<Park>) {
    setDrafts((d) => ({ ...d, [p.park_id]: { ...(d[p.park_id] ?? p), ...patch } }));
  }

  async function save(p: Park) {
    const merged = { ...p, ...(drafts[p.park_id] ?? {}) };
    const { error } = await upsertPark(merged);
    if (error) { setMsg(`${t("common.error")}: ${error.message}`); return; }
    setMsg(t("common.saved"));
    setDrafts((d) => { const { [p.park_id]: _, ...rest } = d; return rest; });
    qc.invalidateQueries({ queryKey: ["parks-admin"] });
  }

  async function remove(p: Park) {
    if (!confirm(t("adminKahkeshan.confirm_delete_park", { name: p.name }))) return;
    const { error } = await deletePark(p.park_id);
    if (error) { setMsg(`${t("common.error")}: ${error.message}`); return; }
    qc.invalidateQueries({ queryKey: ["parks-admin"] });
  }

  async function addNew() {
    const id = prompt(t("adminKahkeshan.prompt_park_id"));
    if (!id) return;
    const name = prompt(t("adminKahkeshan.prompt_park_name")) ?? t("adminKahkeshan.default_new_park_name");
    const { error } = await upsertPark({
      park_id: id.trim(), name, province: "", city: "",
      mx: 50, my: 50, color: "blue", is_active: true,
      sort_order: (parks?.length ?? 0) + 1,
    } as any);
    if (error) { setMsg(`${t("common.error")}: ${error.message}`); return; }
    qc.invalidateQueries({ queryKey: ["parks-admin"] });
  }

  const rows = parks ?? [];
  const byProvince: Record<string, Park[]> = {};
  rows.forEach((p) => {
    const key = p.province || "—";
    (byProvince[key] ||= []).push(p);
  });

  return (
    <div className="view">
      <div className="shell" style={{ padding: "20px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <span className="eyebrow">Admin</span>
            <h2 className="h2" style={{ fontSize: 24 }}>{t("adminKahkeshan.manage_title")}</h2>
            <p className="lead" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
              {t("adminKahkeshan.lead")}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link to="/parks" className="btn btn-ghost">{t("adminKahkeshan.map_link")}</Link>
            <Link to="/admin/parks" className="btn btn-ghost">{t("adminKahkeshan.park_content_link")}</Link>
            <Link to="/admin/exhibition" className="btn btn-ghost">{t("adminKahkeshan.exhibition_link")}</Link>
            <button className="btn btn-primary" onClick={addNew}>{t("adminKahkeshan.add_park")}</button>
            <button className="btn btn-ghost" onClick={async () => { await signOutFn(); navigate({ to: "/auth", search: { next: "" } }); }}>{t("common.logout")}</button>
          </div>
        </div>

        {/* Preview map */}
        <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
          <h3 style={{ marginBottom: 10, fontSize: 14 }}>{t("adminKahkeshan.map_preview_title")}</h3>
          <div style={{ position: "relative", width: "100%", aspectRatio: "3/2", background: "var(--panel-2)", border: "1px solid var(--stroke)", borderRadius: 10 }}>
            {rows.filter((p) => p.is_active).map((p) => (
              <div key={p.park_id} title={`${p.name} — ${p.province ?? ""}`}
                style={{
                  position: "absolute",
                  left: `${p.mx}%`, top: `${p.my}%`, transform: "translate(-50%,-50%)",
                  width: 14, height: 14, borderRadius: "50%",
                  background: colorHex(p.color),
                  boxShadow: `0 0 0 3px ${colorHex(p.color)}33`,
                }} />
            ))}
          </div>
          {msg && <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 8 }}>{msg}</div>}
        </div>

        {Object.entries(byProvince).map(([province, list]) => (
          <div key={province} className="panel" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <h3 style={{ fontSize: 15 }}>{province}</h3>
              <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{t("adminKahkeshan.park_count", { count: list.length })}</span>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {list.map((p) => {
                const d = drafts[p.park_id] ?? p;
                const dirty = !!drafts[p.park_id];
                return (
                  <div key={p.park_id} className="parks-admin-row" style={{ background: "var(--panel-2)", borderRadius: 10, padding: 12, display: "grid", gap: 8, alignItems: "center" }}>
                    <input value={d.name ?? ""} onChange={(e) => edit(p, { name: e.target.value })} placeholder={t("adminKahkeshan.field_name")} style={field} />
                    <input value={d.name_en ?? ""} onChange={(e) => edit(p, { name_en: e.target.value })} placeholder={t("adminKahkeshan.field_name_en")} style={{ ...field, direction: "ltr", textAlign: "left" }} />
                    <input value={d.province ?? ""} onChange={(e) => edit(p, { province: e.target.value })} placeholder={t("adminKahkeshan.field_province")} style={field} />
                    <input value={d.city ?? ""} onChange={(e) => edit(p, { city: e.target.value })} placeholder={t("adminKahkeshan.field_city")} style={field} />
                    <input value={p.park_id} disabled style={{ ...field, opacity: 0.6 }} />
                    <input type="number" step="0.1" value={d.mx} onChange={(e) => edit(p, { mx: Number(e.target.value) })} title="mx" style={field} />
                    <input type="number" step="0.1" value={d.my} onChange={(e) => edit(p, { my: Number(e.target.value) })} title="my" style={field} />
                    <select value={d.color} onChange={(e) => edit(p, { color: e.target.value })} style={field}>
                      {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                      <input type="checkbox" checked={d.is_active} onChange={(e) => edit(p, { is_active: e.target.checked })} />
                      {t("adminKahkeshan.field_active")}
                    </label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-primary" onClick={() => save(p)} disabled={!dirty} style={{ fontSize: 12, padding: "6px 10px" }}>{t("adminKahkeshan.save")}</button>
                      <button className="btn btn-ghost" onClick={() => remove(p)} style={{ fontSize: 12, padding: "6px 10px" }}>{t("adminKahkeshan.delete")}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function colorHex(c: string) {
  switch (c) {
    case "red": return "#eb212f";
    case "gold": return "#f7ca17";
    case "green": return "#00a858";
    default: return "#1f7fd6";
  }
}

const field: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--stroke)",
  borderRadius: 6,
  padding: "6px 8px",
  color: "inherit",
  fontFamily: "inherit",
  fontSize: 13,
  width: "100%",
};
