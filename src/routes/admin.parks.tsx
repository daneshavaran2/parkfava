import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, useAssetUrl } from "@/lib/use-auth";
import {
  fetchParkContent,
  upsertParkContent,
  uploadParkAsset,
  addParkImage,
  deleteParkImage,
  upsertParkNews,
  deleteParkNews,
  type ParkContent,
  type ParkNews,
} from "@/lib/park-content-api";
import { supabase } from "@/integrations/supabase/client";
import { AttachmentsManager } from "@/components/admin/AttachmentsManager";
import { ZipImporter } from "@/components/admin/ZipImporter";

export const Route = createFileRoute("/admin/parks")({
  head: () => ({ meta: [{ title: "مدیریت پارک‌ها" }] }),
  component: AdminParksPage,
});

function AdminParksPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [parks, setParks] = useState<{ id: string; name: string; city: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/auth", search: { next: "/admin/parks" } });
  }, [user, loading, navigate]);

  useEffect(() => {
    const tryLoad = () => {
      const F = (window as any).FAVA;
      if (F?.PARKS) {
        const ps = F.PARKS.map((p: any) => ({ id: p.id, name: p.name, city: p.city }));
        setParks(ps);
        setSelected((s) => s ?? ps[0]?.id ?? null);
      } else {
        setTimeout(tryLoad, 200);
      }
    };
    tryLoad();
  }, []);

  if (loading) return <div className="view"><div className="shell" style={{ padding: 40 }}>درحال بارگذاری…</div></div>;
  if (!user) return null;
  if (!isAdmin) {
    return (
      <div className="view"><div className="shell" style={{ padding: 40 }}>
        <h2 className="h2">دسترسی ندارید</h2>
        <p className="lead">حساب شما نقش ادمین ندارد.</p>
        <button className="btn btn-ghost" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth", search: { next: "" } }); }}>خروج</button>
      </div></div>
    );
  }

  return (
    <div className="view">
      <div className="shell" style={{ padding: "20px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <span className="eyebrow">Admin</span>
            <h2 className="h2" style={{ fontSize: 24 }}>مدیریت محتوای پارک‌ها</h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link to="/parks" className="btn btn-ghost">مشاهده نقشه</Link>
            <Link to="/admin/kahkeshan" className="btn btn-ghost">کهکشان (پارک‌ها)</Link>
            <Link to="/admin/attachments" className="btn btn-ghost">داشبورد ضمیمه‌ها</Link>
            <Link to="/admin/exhibition" className="btn btn-ghost">نمایشگاه</Link>
            <button className="btn btn-ghost" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth", search: { next: "" } }); }}>خروج</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 16 }}>
          <aside className="panel" style={{ padding: 10, maxHeight: "calc(100vh - 180px)", overflowY: "auto" }}>
            {parks.map((p) => (
              <button key={p.id} onClick={() => setSelected(p.id)}
                className="park-row"
                style={{
                  background: selected === p.id ? "var(--panel-2)" : "transparent",
                  border: 0, width: "100%", textAlign: "right", padding: "10px 12px",
                  borderRadius: 8, cursor: "pointer", color: "inherit", marginBottom: 4,
                }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{p.city}</div>
              </button>
            ))}
          </aside>
          <main>{selected && <ParkEditor key={selected} parkId={selected} parks={parks} />}</main>
        </div>
      </div>
    </div>
  );
}

function ParkEditor({ parkId, parks }: { parkId: string; parks: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const meta = parks.find((p) => p.id === parkId);
  const { data, isLoading } = useQuery({
    queryKey: ["park-admin", parkId],
    queryFn: () => fetchParkContent(parkId),
  });

  const [form, setForm] = useState<ParkContent>({ park_id: parkId, display_name: "", description: "", logo_url: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (data?.content) setForm(data.content);
    else setForm({ park_id: parkId, display_name: meta?.name ?? "", description: "", logo_url: "" });
  }, [data, parkId, meta]);

  const logoUrl = useAssetUrl(form.logo_url);

  async function save() {
    setBusy(true);
    setMsg(null);
    const { error } = await upsertParkContent(form);
    if (error) setMsg("خطا: " + error.message);
    else {
      setMsg("ذخیره شد ✓");
      qc.invalidateQueries({ queryKey: ["park-admin", parkId] });
      qc.invalidateQueries({ queryKey: ["park-public", parkId] });
    }
    setBusy(false);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const path = await uploadParkAsset(parkId, file);
      setForm((f) => ({ ...f, logo_url: path }));
      await upsertParkContent({ ...form, logo_url: path });
      qc.invalidateQueries({ queryKey: ["park-public", parkId] });
      setMsg("لوگو بارگذاری شد ✓");
    } catch (e: any) {
      setMsg("خطا در آپلود: " + (e.message ?? e));
    }
    setBusy(false);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const path = await uploadParkAsset(parkId, file);
      await addParkImage(parkId, path, null);
      qc.invalidateQueries({ queryKey: ["park-admin", parkId] });
      qc.invalidateQueries({ queryKey: ["park-public", parkId] });
    } catch (e: any) {
      setMsg("خطا در آپلود: " + (e.message ?? e));
    }
    setBusy(false);
    e.target.value = "";
  }

  if (isLoading) return <div className="panel" style={{ padding: 24 }}>درحال بارگذاری…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="panel" style={{ padding: 20 }}>
        <h3 style={{ marginBottom: 12 }}>اطلاعات اصلی — {meta?.name}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 16, alignItems: "start" }}>
          <div>
            <div style={{ width: 120, height: 120, borderRadius: 14, background: "var(--panel-2)", border: "1px solid var(--stroke)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {logoUrl ? <img src={logoUrl} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>بدون لوگو</span>}
            </div>
            <label className="btn btn-ghost" style={{ marginTop: 8, width: 120, fontSize: 12, cursor: "pointer", display: "flex", justifyContent: "center" }}>
              آپلود لوگو
              <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />
            </label>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input value={form.display_name ?? ""} onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              placeholder="نام نمایشی" style={field} />
            <textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="توضیحات کامل پارک…" rows={6} style={{ ...field, resize: "vertical", fontFamily: "inherit" }} />
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button className="btn btn-primary" onClick={save} disabled={busy}>ذخیره</button>
              {msg && <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>{msg}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3>گالری تصاویر</h3>
          <label className="btn btn-ghost" style={{ fontSize: 12, cursor: "pointer" }}>
            + افزودن عکس
            <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
          {data?.images.map((img) => (
            <GalleryItem key={img.id} img={img} onDelete={async () => {
              await deleteParkImage(img.id);
              qc.invalidateQueries({ queryKey: ["park-admin", parkId] });
              qc.invalidateQueries({ queryKey: ["park-public", parkId] });
            }} />
          ))}
          {!data?.images.length && <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>هنوز عکسی اضافه نشده.</div>}
        </div>
      </div>

      <NewsEditor parkId={parkId} news={data?.news ?? []} />

      <ZipImporter ownerType="park" ownerId={parkId} />
      <AttachmentsManager ownerType="park" ownerId={parkId} />
    </div>
  );
}

function GalleryItem({ img, onDelete }: { img: { id: string; image_url: string }; onDelete: () => void }) {
  const url = useAssetUrl(img.image_url);
  return (
    <div style={{ position: "relative", aspectRatio: "1/1", borderRadius: 10, overflow: "hidden", background: "var(--panel-2)" }}>
      {url && <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      <button onClick={onDelete}
        style={{ position: "absolute", top: 6, left: 6, background: "rgba(0,0,0,0.7)", color: "#fff", border: 0, borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}>
        حذف
      </button>
    </div>
  );
}

function NewsEditor({ parkId, news }: { parkId: string; news: ParkNews[] }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  async function add() {
    if (!title.trim()) return;
    await upsertParkNews({ park_id: parkId, title, body });
    setTitle(""); setBody("");
    qc.invalidateQueries({ queryKey: ["park-admin", parkId] });
    qc.invalidateQueries({ queryKey: ["park-public", parkId] });
  }
  async function del(id: string) {
    await deleteParkNews(id);
    qc.invalidateQueries({ queryKey: ["park-admin", parkId] });
    qc.invalidateQueries({ queryKey: ["park-public", parkId] });
  }
  return (
    <div className="panel" style={{ padding: 20 }}>
      <h3 style={{ marginBottom: 12 }}>اخبار و رویدادها</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان خبر" style={field} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="متن کوتاه (اختیاری)" rows={3} style={{ ...field, resize: "vertical", fontFamily: "inherit" }} />
        <button className="btn btn-primary" onClick={add} style={{ alignSelf: "flex-start" }}>افزودن</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {news.map((n) => (
          <div key={n.id} style={{ padding: 12, background: "var(--panel-2)", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "start", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{n.title}</div>
              {n.body && <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>{n.body}</div>}
            </div>
            <button onClick={() => del(n.id)} className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }}>حذف</button>
          </div>
        ))}
        {!news.length && <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>هنوز خبری ثبت نشده.</div>}
      </div>
    </div>
  );
}

const field: React.CSSProperties = {
  background: "var(--panel-2)",
  border: "1px solid var(--stroke)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "inherit",
  fontFamily: "inherit",
  fontSize: 14,
  width: "100%",
};
