import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/use-auth";
import { fetchParks, upsertPark, deletePark, type Park } from "@/lib/parks-api";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/kahkeshan")({
  head: () => ({ meta: [{ title: "مدیریت کهکشان فاوا" }] }),
  component: AdminKahkeshanPage,
});

const COLORS = ["red", "gold", "blue", "green"];

function AdminKahkeshanPage() {
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

  if (loading) return <div className="view"><div className="shell" style={{ padding: 40 }}>درحال بارگذاری…</div></div>;
  if (!user) return null;
  if (!isAdmin) {
    return (
      <div className="view"><div className="shell" style={{ padding: 40 }}>
        <h2 className="h2">دسترسی ندارید</h2>
      </div></div>
    );
  }

  function edit(p: Park, patch: Partial<Park>) {
    setDrafts((d) => ({ ...d, [p.park_id]: { ...(d[p.park_id] ?? p), ...patch } }));
  }

  async function save(p: Park) {
    const merged = { ...p, ...(drafts[p.park_id] ?? {}) };
    const { error } = await upsertPark(merged);
    if (error) { setMsg("خطا: " + error.message); return; }
    setMsg("ذخیره شد ✓");
    setDrafts((d) => { const { [p.park_id]: _, ...rest } = d; return rest; });
    qc.invalidateQueries({ queryKey: ["parks-admin"] });
  }

  async function remove(p: Park) {
    if (!confirm(`حذف «${p.name}»؟ شرکت‌های متصل، بدون پارک می‌شوند.`)) return;
    const { error } = await deletePark(p.park_id);
    if (error) { setMsg("خطا: " + error.message); return; }
    qc.invalidateQueries({ queryKey: ["parks-admin"] });
  }

  async function addNew() {
    const id = prompt("شناسه انگلیسی پارک (مثلاً tehran2):");
    if (!id) return;
    const name = prompt("نام پارک:") ?? "پارک جدید";
    const { error } = await upsertPark({
      park_id: id.trim(), name, province: "", city: "",
      mx: 50, my: 50, color: "blue", is_active: true,
      sort_order: (parks?.length ?? 0) + 1,
    } as any);
    if (error) { setMsg("خطا: " + error.message); return; }
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
            <h2 className="h2" style={{ fontSize: 24 }}>مدیریت کهکشان فاوا</h2>
            <p className="lead" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
              افزودن/حذف پارک‌های نقشه. برای یک استان می‌توانید چند پارک ثبت کنید.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link to="/parks" className="btn btn-ghost">نقشه</Link>
            <Link to="/admin/parks" className="btn btn-ghost">محتوای پارک‌ها</Link>
            <Link to="/admin/exhibition" className="btn btn-ghost">نمایشگاه</Link>
            <button className="btn btn-primary" onClick={addNew}>+ افزودن پارک</button>
            <button className="btn btn-ghost" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth", search: { next: "" } }); }}>خروج</button>
          </div>
        </div>

        {/* Preview map */}
        <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
          <h3 style={{ marginBottom: 10, fontSize: 14 }}>پیش‌نمایش موقعیت روی نقشه</h3>
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
              <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{list.length} پارک</span>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {list.map((p) => {
                const d = drafts[p.park_id] ?? p;
                const dirty = !!drafts[p.park_id];
                return (
                  <div key={p.park_id} className="parks-admin-row" style={{ background: "var(--panel-2)", borderRadius: 10, padding: 12, display: "grid", gap: 8, alignItems: "center" }}>
                    <input value={d.name ?? ""} onChange={(e) => edit(p, { name: e.target.value })} placeholder="نام" style={field} />
                    <input value={d.province ?? ""} onChange={(e) => edit(p, { province: e.target.value })} placeholder="استان" style={field} />
                    <input value={d.city ?? ""} onChange={(e) => edit(p, { city: e.target.value })} placeholder="شهر" style={field} />
                    <input value={p.park_id} disabled style={{ ...field, opacity: 0.6 }} />
                    <input type="number" step="0.1" value={d.mx} onChange={(e) => edit(p, { mx: Number(e.target.value) })} title="mx" style={field} />
                    <input type="number" step="0.1" value={d.my} onChange={(e) => edit(p, { my: Number(e.target.value) })} title="my" style={field} />
                    <select value={d.color} onChange={(e) => edit(p, { color: e.target.value })} style={field}>
                      {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                      <input type="checkbox" checked={d.is_active} onChange={(e) => edit(p, { is_active: e.target.checked })} />
                      فعال
                    </label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-primary" onClick={() => save(p)} disabled={!dirty} style={{ fontSize: 12, padding: "6px 10px" }}>ذخیره</button>
                      <button className="btn btn-ghost" onClick={() => remove(p)} style={{ fontSize: 12, padding: "6px 10px" }}>حذف</button>
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
