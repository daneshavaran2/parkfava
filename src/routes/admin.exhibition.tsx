import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, useAssetUrl } from "@/lib/use-auth";
import {
  fetchExhibitionCompany,
  upsertExhibitionCompany,
  deleteExhibitionCompany,
  uploadExhibitionAsset,
  addExhibitionImage,
  deleteExhibitionImage,
  updateExhibitionImage,
  reorderExhibitionCompanies,
  reorderExhibitionImages,
  upsertExhibitionProduct,
  deleteExhibitionProduct,
  reorderExhibitionProducts,
  approveCompany,
  rejectCompany,
  type ExhibitionCompany,
  type ExhibitionProduct,
} from "@/lib/exhibition-api";
import { listAdminCompanies, saveAdminCompany } from "@/lib/exhibition-api.functions";
import { supabase } from "@/integrations/supabase/client";
import { AttachmentsManager } from "@/components/admin/AttachmentsManager";
import { ZipImporter } from "@/components/admin/ZipImporter";
import { fetchAttachments, uploadAttachment, deleteAttachment, type CompanyAttachment } from "@/lib/attachments-api";
import { fetchParks } from "@/lib/parks-api";
import { parseLatLng } from "@/lib/geo";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/admin/exhibition")({
  head: () => ({ meta: [{ title: "مدیریت نمایشگاه" }] }),
  component: AdminExhibitionPage,
});

const emptyCompany = (id: string): ExhibitionCompany => ({
  company_id: id,
  name: "",
  tagline: "",
  category: "",
  park_id: "",
  city: "",
  description: "",
  logo_url: "",
  website: "",
  phone: "",
  email: "",
  address: "",
  sort_order: 0,
  is_active: true,
  catalog_url: "",
  video_url: "",
});

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    approved: { bg: "#164e2b", fg: "#a7f3c8", label: "تاییدشده" },
    pending: { bg: "#5b4408", fg: "#ffe08a", label: "در انتظار" },
    draft: { bg: "#2b2f38", fg: "#c9cfda", label: "پیش‌نویس" },
    rejected: { bg: "#5b1414", fg: "#ffb4b4", label: "رد شده" },
  };
  const s = map[status] ?? map.draft;
  return (
    <span style={{
      display: "inline-block", fontSize: 10, fontWeight: 700,
      background: s.bg, color: s.fg, padding: "2px 8px", borderRadius: 999,
    }}>{s.label}</span>
  );
}

function AdminExhibitionPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listAdminCompaniesFn = useServerFn(listAdminCompanies);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  const { data: companies = [], isLoading: companiesLoading, isError: companiesError, error: companiesErr } = useQuery<ExhibitionCompany[]>({
    queryKey: ["admin-exh-companies"],
    queryFn: async () => (await listAdminCompaniesFn()) as ExhibitionCompany[],
    enabled: !!user && isAdmin,
  });
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "draft" | "rejected">("all");
  const filtered = companies.filter((c) => statusFilter === "all" ? true : (c.status ?? "draft") === statusFilter);
  const pendingCount = companies.filter((c) => c.status === "pending").length;

  useEffect(() => {
    if (!selected && filtered.length > 0) setSelected(filtered[0].company_id);
    if (selected && companies.length > 0 && !companies.some((c) => c.company_id === selected)) {
      setSelected(filtered[0]?.company_id ?? companies[0]?.company_id ?? null);
    }
  }, [companies, filtered, selected]);

  if (loading) return <div className="view"><div className="shell" style={{ padding: 40 }}>درحال بارگذاری…</div></div>;
  if (!user) return null;
  if (!isAdmin) {
    return (
      <div className="view"><div className="shell" style={{ padding: 40 }}>
        <h2 className="h2">دسترسی ندارید</h2>
        <p className="lead">حساب شما نقش ادمین ندارد.</p>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 8, fontFamily: "monospace" }}>User ID: {user.id}</p>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>Email: {user.email}</p>
        <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 16 }}>
          برای تبدیل این حساب به ادمین، در دیتابیس اجرا کنید:<br/>
          <code style={{ background: "var(--panel-2)", padding: "4px 6px", borderRadius: 4, display: "inline-block", marginTop: 4 }}>
            INSERT INTO public.user_roles (user_id, role) VALUES ('{user.id}', 'admin');
          </code>
        </p>
        <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}>خروج و ورود مجدد</button>
      </div></div>
    );
  }

  async function createCompany() {
    const id = newId.trim();
    if (!id) return;
    await upsertExhibitionCompany({ company_id: id, name: id });
    qc.invalidateQueries({ queryKey: ["admin-exh-companies"] });
    setSelected(id);
    setNewId("");
    setCreating(false);
  }

  async function move(idx: number, dir: -1 | 1) {
    const next = [...companies];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    await reorderExhibitionCompanies(next.map((c) => c.company_id));
    qc.invalidateQueries({ queryKey: ["admin-exh-companies"] });
    qc.invalidateQueries({ queryKey: ["exh-public"] });
  }

  async function toggleActive(c: ExhibitionCompany) {
    await upsertExhibitionCompany({ ...c, is_active: !c.is_active });
    qc.invalidateQueries({ queryKey: ["admin-exh-companies"] });
    qc.invalidateQueries({ queryKey: ["exh-public"] });
  }

  return (
    <div className="view">
      <div className="shell" style={{ padding: "20px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <span className="eyebrow">Admin</span>
            <h2 className="h2" style={{ fontSize: 24 }}>مدیریت شرکت‌های نمایشگاه</h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link to="/exhibition" className="btn btn-ghost">مشاهده نمایشگاه</Link>
            <Link to="/admin/attachments" className="btn btn-ghost">داشبورد ضمیمه‌ها</Link>
            <Link to="/admin/parks" className="btn btn-ghost">پارک‌ها</Link>
            <Link to="/admin/about" className="btn btn-ghost">درباره</Link>
            <button className="btn btn-ghost" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}>خروج</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16 }}>
          <aside className="panel" style={{ padding: 10, maxHeight: "calc(100vh - 180px)", overflowY: "auto" }}>
            <button
              className="btn btn-primary"
              style={{ width: "100%", marginBottom: 8 }}
              onClick={() => setCreating((v) => !v)}
            >+ افزودن شرکت جدید</button>
            {creating && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                <input
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  placeholder="شناسه یکتا (مثلاً: my-company)"
                  style={field}
                />
                <button className="btn btn-ghost" onClick={createCompany}>ایجاد</button>
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "6px 0 10px" }}>
              {([
                ["all", "همه"],
                ["pending", `در انتظار${pendingCount ? ` (${pendingCount})` : ""}`],
                ["approved", "تاییدشده"],
                ["draft", "پیش‌نویس"],
                ["rejected", "رد شده"],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setStatusFilter(k as any)}
                  className="btn"
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    background: statusFilter === k ? "var(--accent)" : "var(--panel-2)",
                    color: statusFilter === k ? "#000" : "inherit",
                    border: "1px solid var(--stroke)",
                    borderRadius: 999,
                    cursor: "pointer",
                  }}
                >{label}</button>
              ))}
            </div>
            {filtered.map((c, i) => (
              <div key={c.company_id} style={{
                display: "flex", alignItems: "stretch", gap: 4,
                background: selected === c.company_id ? "var(--panel-2)" : "transparent",
                borderRadius: 8, marginBottom: 4, padding: 4,
                opacity: c.is_active ? 1 : 0.6,
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <button onClick={() => move(i, -1)} title="بالا"
                    style={{ background: "var(--panel-2)", border: 0, color: "inherit", borderRadius: 4, cursor: "pointer", padding: "2px 6px", fontSize: 11 }}>▲</button>
                  <button onClick={() => move(i, 1)} title="پایین"
                    style={{ background: "var(--panel-2)", border: 0, color: "inherit", borderRadius: 4, cursor: "pointer", padding: "2px 6px", fontSize: 11 }}>▼</button>
                </div>
                <button onClick={() => setSelected(c.company_id)}
                  style={{ background: "transparent", border: 0, flex: 1, textAlign: "right", padding: "6px 8px", borderRadius: 6, cursor: "pointer", color: "inherit" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}>
                    <span>{c.name || c.company_id}</span>
                    <StatusBadge status={c.status ?? "draft"} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{c.city || c.company_id}</div>
                </button>
                <label title="فعال/غیرفعال" style={{ display: "flex", alignItems: "center", padding: "0 6px", cursor: "pointer" }}>
                  <input type="checkbox" checked={c.is_active} onChange={() => toggleActive(c)} />
                </label>
              </div>
            ))}
            {companiesLoading && <div style={{ fontSize: 13, color: "var(--ink-soft)", padding: 10 }}>در حال بارگیری…</div>}
            {companiesError && <div style={{ fontSize: 13, color: "#ff8888", padding: 10, lineHeight: 1.8 }}>
              خطا در بارگیری شرکت‌ها: {String((companiesErr as any)?.message ?? companiesErr)}
            </div>}
            {!companiesLoading && !companiesError && !filtered.length && (
              <div style={{ fontSize: 13, color: "var(--ink-soft)", padding: 10 }}>
                {companies.length === 0
                  ? "هیچ شرکتی در دیتابیس یافت نشد. اگر شرکت‌ها در نمایشگاه عمومی دیده می‌شوند، دسترسی ادمین یا اتصال داده را بررسی کنید."
                  : "موردی در این وضعیت نیست."}
              </div>
            )}
          </aside>
          <main>{selected && <CompanyEditor key={selected} companyId={selected} onDeleted={() => setSelected(null)} />}</main>
        </div>
      </div>
    </div>
  );
}

function CompanyEditor({ companyId, onDeleted }: { companyId: string; onDeleted: () => void }) {
  const qc = useQueryClient();
  const saveAdminCompanyFn = useServerFn(saveAdminCompany);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-exh-company", companyId],
    queryFn: () => fetchExhibitionCompany(companyId),
  });

  const { t } = useTranslation();
  const [form, setForm] = useState<ExhibitionCompany>(emptyCompany(companyId));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [latRaw, setLatRaw] = useState<string>("");
  const [lngRaw, setLngRaw] = useState<string>("");
  const [latErr, setLatErr] = useState<string | null>(null);
  const [lngErr, setLngErr] = useState<string | null>(null);

  useEffect(() => {
    const c = data?.company ? { ...emptyCompany(companyId), ...data.company } : emptyCompany(companyId);
    setForm(c);
    setLatRaw(c.latitude == null ? "" : String(c.latitude));
    setLngRaw(c.longitude == null ? "" : String(c.longitude));
    setLatErr(null); setLngErr(null);
  }, [data, companyId]);

  function onLatChange(v: string) {
    setLatRaw(v);
    const r = parseLatLng(v, "lat");
    if (!r.ok) {
      setLatErr(r.error === "invalid" ? t("validation.lat_invalid") : t("validation.lat_range"));
    } else {
      setLatErr(null);
      setForm((f) => ({ ...f, latitude: r.value }));
    }
  }
  function onLngChange(v: string) {
    setLngRaw(v);
    const r = parseLatLng(v, "lng");
    if (!r.ok) {
      setLngErr(r.error === "invalid" ? t("validation.lng_invalid") : t("validation.lng_range"));
    } else {
      setLngErr(null);
      setForm((f) => ({ ...f, longitude: r.value }));
    }
  }

  const logoUrl = useAssetUrl(form.logo_url);
  const videoUrl = useAssetUrl(form.video_url ?? null);
  const catalogUrl = useAssetUrl(form.catalog_url ?? null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["admin-exh-companies"] });
    qc.invalidateQueries({ queryKey: ["admin-exh-company", companyId] });
    qc.invalidateQueries({ queryKey: ["exh-public"] });
    qc.invalidateQueries({ queryKey: ["exh-public-company", companyId] });
  }

  async function save() {
    if (latErr || lngErr) { setMsg(latErr || lngErr); return; }
    setBusy(true); setMsg(null);
    try {
      await saveAdminCompanyFn({ data: form as any });
      setMsg(t("common.saved")); invalidate();
    } catch (e: any) {
      setMsg(`${t("common.error")}: ${e?.message ?? e}`);
    }
    setBusy(false);
  }

  async function handleUploadField(field: "logo_url" | "video_url" | "catalog_url", file: File) {
    setBusy(true);
    try {
      const path = await uploadExhibitionAsset(companyId, file);
      const next = { ...form, [field]: path };
      setForm(next);
      await upsertExhibitionCompany(next);
      invalidate();
      setMsg("بارگذاری شد ✓");
    } catch (e: any) { setMsg("خطا: " + (e.message ?? e)); }
    setBusy(false);
  }

  async function clearField(field: "video_url" | "catalog_url") {
    const next = { ...form, [field]: "" };
    setForm(next);
    await upsertExhibitionCompany(next);
    invalidate();
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    try {
      const path = await uploadExhibitionAsset(companyId, file);
      await addExhibitionImage(companyId, path, null);
      invalidate();
    } catch (e: any) { setMsg("خطا در آپلود: " + (e.message ?? e)); }
    setBusy(false); e.target.value = "";
  }

  async function moveImage(idx: number, dir: -1 | 1) {
    const imgs = [...(data?.images ?? [])];
    const j = idx + dir; if (j < 0 || j >= imgs.length) return;
    [imgs[idx], imgs[j]] = [imgs[j], imgs[idx]];
    await reorderExhibitionImages(imgs.map((x) => x.id));
    invalidate();
  }

  async function removeCompany() {
    if (!confirm("حذف کامل این شرکت؟")) return;
    await deleteExhibitionCompany(companyId);
    invalidate();
    onDeleted();
  }

  async function doApprove() {
    setBusy(true); setMsg(null);
    const { error } = await approveCompany(companyId);
    if (error) setMsg("خطا: " + error.message);
    else { setMsg("تایید و منتشر شد ✓"); setForm((f) => ({ ...f, status: "approved", is_active: true })); invalidate(); }
    setBusy(false);
  }
  async function doReject() {
    const note = prompt("دلیل رد (به صاحب شرکت نمایش داده می‌شود):", form.rejection_note ?? "");
    if (note === null) return;
    setBusy(true); setMsg(null);
    const { error } = await rejectCompany(companyId, note);
    if (error) setMsg("خطا: " + error.message);
    else { setMsg("رد شد"); setForm((f) => ({ ...f, status: "rejected", rejection_note: note })); invalidate(); }
    setBusy(false);
  }

  if (isLoading) return <div className="panel" style={{ padding: 24 }}>درحال بارگذاری…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header: Logo + Identity */}
      <div className="panel" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div>
              <span className="eyebrow">شرکت</span>
              <h3 style={{ marginTop: 2 }}>{form.name || companyId}</h3>
            </div>
            <StatusBadge status={form.status ?? "draft"} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {form.status !== "approved" && (
              <button className="btn btn-primary" onClick={doApprove} disabled={busy}>تایید و انتشار</button>
            )}
            {form.status !== "rejected" && (
              <button className="btn btn-ghost" onClick={doReject} disabled={busy}>رد کردن…</button>
            )}
            <button className="btn btn-ghost" onClick={removeCompany} style={{ fontSize: 12, color: "#c33" }}>حذف شرکت</button>
          </div>
        </div>
        {form.status === "rejected" && form.rejection_note && (
          <div style={{ marginBottom: 12, padding: 10, background: "rgba(200,60,60,.12)", border: "1px solid rgba(200,60,60,.4)", borderRadius: 8, fontSize: 13 }}>
            <b>دلیل رد:</b> {form.rejection_note}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 20, alignItems: "start" }}>
          <div>
            <div style={{ width: 160, height: 160, borderRadius: 14, background: "var(--panel-2)", border: "1px solid var(--stroke)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {logoUrl ? <img src={logoUrl} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>بدون لوگو</span>}
            </div>
            <label className="btn btn-ghost" style={{ marginTop: 8, width: 160, fontSize: 12, cursor: "pointer", display: "flex", justifyContent: "center" }}>
              {form.logo_url ? "تعویض لوگو" : "آپلود لوگو"}
              <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadField("logo_url", f); e.target.value = ""; }} style={{ display: "none" }} />
            </label>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Identity */}
            <section>
              <SectionTitle>هویت شرکت</SectionTitle>
              <div style={grid2}>
                <Field label="نام شرکت"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={field} /></Field>
                <Field label="شعار / یک‌خطی"><input value={form.tagline ?? ""} onChange={(e) => setForm({ ...form, tagline: e.target.value })} style={field} /></Field>
                <Field label="دسته‌بندی (id)"><input value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })} style={field} /></Field>
                <Field label="پارک"><ParkSelect value={form.park_id ?? ""} onChange={(v) => setForm({ ...form, park_id: v })} /></Field>
                <Field label="شهر"><input value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} style={field} /></Field>
                <Field label="تاریخ تأسیس (شمسی)">
                  <PersianDateInput value={form.founded_at ?? null} onChange={(v) => setForm({ ...form, founded_at: v })} />
                </Field>
                <Field label="مجموع نیروی انسانی"><input type="number" value={form.headcount ?? ""} onChange={(e) => setForm({ ...form, headcount: e.target.value ? parseInt(e.target.value) : null })} style={field} /></Field>
                <Field label="تمام‌وقت"><input type="number" value={form.headcount_full_time ?? ""} onChange={(e) => setForm({ ...form, headcount_full_time: e.target.value ? parseInt(e.target.value) : null })} style={field} /></Field>
                <Field label="پاره‌وقت"><input type="number" value={form.headcount_part_time ?? ""} onChange={(e) => setForm({ ...form, headcount_part_time: e.target.value ? parseInt(e.target.value) : null })} style={field} /></Field>
                <Field label="ترتیب نمایش"><input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} style={field} /></Field>
                <label style={{ fontSize: 13, color: "var(--ink-soft)", display: "flex", gap: 8, alignItems: "center", gridColumn: "1 / -1", padding: "6px 0" }}>
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                  فعال (نمایش در نمایشگاه)
                </label>
              </div>
            </section>

            {/* Founders & Team */}
            <section>
              <SectionTitle>بنیانگذاران و حضور حرفه‌ای</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Field label="👤 بنیانگذاران" hint="نام بنیانگذاران را با ویرگول جدا کنید">
                  <input value={form.founders ?? ""} onChange={(e) => setForm({ ...form, founders: e.target.value })} placeholder="مثلاً: علی رضایی، سارا محمدی" style={field} />
                </Field>
                <Field label="🔗 لینکدین شرکت" hint="آدرس کامل صفحه لینکدین">
                  <input value={form.linkedin_url ?? ""} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} placeholder="https://linkedin.com/company/..." style={field} dir="ltr" />
                </Field>
              </div>
            </section>

            {/* Contact */}
            <section>
              <SectionTitle>راه‌های ارتباطی</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <Field label="وب‌سایت"><input value={form.website ?? ""} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="example.com" style={field} dir="ltr" /></Field>
                <Field label="ایمیل"><input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="info@example.com" style={field} dir="ltr" /></Field>
                <Field label="تلفن"><input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={field} /></Field>
                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="آدرس"><input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} style={field} /></Field>
                </div>
                <Field label="عرض جغرافیایی (Latitude)">
                  <input value={latRaw} onChange={(e) => onLatChange(e.target.value)}
                    style={{ ...field, borderColor: latErr ? "#ff7676" : undefined }}
                    dir="ltr" placeholder="35.6892" inputMode="decimal"
                    aria-invalid={!!latErr} data-testid="admin-lat-input" />
                  {latErr && <div role="alert" style={{ color: "#ff7676", fontSize: 12, marginTop: 4 }}>{latErr}</div>}
                </Field>
                <Field label="طول جغرافیایی (Longitude)">
                  <input value={lngRaw} onChange={(e) => onLngChange(e.target.value)}
                    style={{ ...field, borderColor: lngErr ? "#ff7676" : undefined }}
                    dir="ltr" placeholder="51.3890" inputMode="decimal"
                    aria-invalid={!!lngErr} data-testid="admin-lng-input" />
                  {lngErr && <div role="alert" style={{ color: "#ff7676", fontSize: 12, marginTop: 4 }}>{lngErr}</div>}
                </Field>
                <Field label="چسباندن از گوگل/نشان">
                  <input
                    style={field}
                    dir="ltr"
                    placeholder="https://maps.google.com/…  یا  https://neshan.org/…"
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text");
                      const m = text.match(/(-?\d{1,3}\.\d+)[ ,/@]+(-?\d{1,3}\.\d+)/);
                      if (m) {
                        e.preventDefault();
                        onLatChange(m[1]);
                        onLngChange(m[2]);
                        (e.target as HTMLInputElement).value = "";
                      }
                    }}
                  />
                </Field>
              </div>
            </section>


            {/* Descriptions */}
            <section>
              <SectionTitle>معرفی و توضیحات</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Field label="معرفی کوتاه">
                  <textarea value={form.intro ?? ""} onChange={(e) => setForm({ ...form, intro: e.target.value })} rows={3} style={{ ...field, resize: "vertical", fontFamily: "inherit" }} />
                </Field>
                <Field label="معرفی محصولات دانش‌بنیان">
                  <textarea value={form.knowledge_products_intro ?? ""} onChange={(e) => setForm({ ...form, knowledge_products_intro: e.target.value })} rows={3} style={{ ...field, resize: "vertical", fontFamily: "inherit" }} />
                </Field>
                <Field label="پتانسیل صادرات">
                  <textarea value={form.export_potential ?? ""} onChange={(e) => setForm({ ...form, export_potential: e.target.value })} rows={2} style={{ ...field, resize: "vertical", fontFamily: "inherit" }} />
                </Field>
                <Field label="توضیحات کامل">
                  <textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={5} style={{ ...field, resize: "vertical", fontFamily: "inherit" }} />
                </Field>
              </div>
            </section>

            {/* Sticky save bar */}
            <div style={{ position: "sticky", bottom: 0, display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--stroke)", background: "var(--panel)", marginTop: 4 }}>
              <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "در حال ذخیره…" : "ذخیره تغییرات"}</button>
              {msg && <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>{msg}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* ZIP Template Importer */}
      <ZipImporter ownerType="exhibition" ownerId={companyId} existingCompany={form} />

      {/* Video + Catalog */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="panel" style={{ padding: 20 }}>
          <h3 style={{ marginBottom: 10 }}>ویدئوی معرفی</h3>
          {videoUrl ? (
            <video src={videoUrl} controls style={{ width: "100%", borderRadius: 10, background: "#000" }} />
          ) : (
            <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>ویدئویی بارگذاری نشده.</div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <label className="btn btn-ghost" style={{ fontSize: 12, cursor: "pointer" }}>
              {form.video_url ? "جایگزینی" : "آپلود ویدئو"}
              <input type="file" accept="video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadField("video_url", f); e.target.value = ""; }} style={{ display: "none" }} />
            </label>
            {form.video_url && <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => clearField("video_url")}>حذف</button>}
          </div>
        </div>
        <div className="panel" style={{ padding: 20 }}>
          <h3 style={{ marginBottom: 10 }}>کاتالوگ (PDF)</h3>
          {catalogUrl ? (
            <a href={catalogUrl} target="_blank" rel="noopener" className="btn btn-ghost" style={{ fontSize: 13 }}>📄 مشاهده کاتالوگ</a>
          ) : (
            <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>کاتالوگی بارگذاری نشده.</div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <label className="btn btn-ghost" style={{ fontSize: 12, cursor: "pointer" }}>
              {form.catalog_url ? "جایگزینی" : "آپلود کاتالوگ"}
              <input type="file" accept="application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadField("catalog_url", f); e.target.value = ""; }} style={{ display: "none" }} />
            </label>
            {form.catalog_url && <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => clearField("catalog_url")}>حذف</button>}
          </div>
        </div>
      </div>

      {/* Products */}
      <ProductsEditor companyId={companyId} products={data?.products ?? []} onChange={invalidate} />

      {/* Gallery */}
      <div className="panel" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3>گالری تصاویر</h3>
          <label className="btn btn-ghost" style={{ fontSize: 12, cursor: "pointer" }}>
            + افزودن عکس
            <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 10 }}>
          {data?.images.map((img, i) => (
            <GalleryItem key={img.id} url={img.image_url} caption={img.caption}
              onCaption={async (v) => { await updateExhibitionImage(img.id, { caption: v }); invalidate(); }}
              onUp={() => moveImage(i, -1)}
              onDown={() => moveImage(i, 1)}
              onDelete={async () => { await deleteExhibitionImage(img.id); invalidate(); }}
            />
          ))}
          {!data?.images.length && <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>هنوز عکسی اضافه نشده.</div>}
        </div>
      </div>

      {/* Attachments (catalogs, forms, free documents) */}
      <AttachmentsManager ownerType="exhibition" ownerId={companyId} />
    </div>
  );
}

function ProductsEditor({ companyId, products, onChange }: { companyId: string; products: ExhibitionProduct[]; onChange: () => void }) {
  const [newName, setNewName] = useState("");

  async function add() {
    const name = newName.trim(); if (!name) return;
    await upsertExhibitionProduct({ company_id: companyId, name, sort_order: products.length });
    setNewName(""); onChange();
  }
  async function move(idx: number, dir: -1 | 1) {
    const arr = [...products]; const j = idx + dir; if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    await reorderExhibitionProducts(arr.map((p) => p.id)); onChange();
  }

  return (
    <div className="panel" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
        <h3>محصولات و خدمات</h3>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="نام محصول جدید…" style={{ ...field, padding: "6px 10px", fontSize: 13 }} />
          <button className="btn btn-primary" onClick={add} style={{ fontSize: 12 }}>+ افزودن</button>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {products.map((p, i) => (
          <ProductRow key={p.id} p={p} companyId={companyId} onChange={onChange} onUp={() => move(i, -1)} onDown={() => move(i, 1)} />
        ))}
        {!products.length && <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>محصولی ثبت نشده.</div>}
      </div>
    </div>
  );
}

function ProductRow({ p, companyId, onChange, onUp, onDown }: { p: ExhibitionProduct; companyId: string; onChange: () => void; onUp: () => void; onDown: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(p);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(p), [p]);
  const img = useAssetUrl(form.image_url);
  const vid = useAssetUrl(form.video_url);

  const { data: allAtts = [] } = useQuery({
    queryKey: ["admin-product-gallery", companyId],
    queryFn: () => fetchAttachments("exhibition", companyId),
  });
  const productImages = allAtts.filter(
    (a) => a.kind === "gallery_image" && (a.description || "").trim() === `product:${p.id}`,
  );

  async function refreshGallery() {
    qc.invalidateQueries({ queryKey: ["admin-product-gallery", companyId] });
    qc.invalidateQueries({ queryKey: ["exh-public-attachments", companyId] });
  }

  async function save() {
    setBusy(true);
    await upsertExhibitionProduct(form);
    onChange(); setBusy(false);
  }
  async function upload(field: "image_url" | "video_url" | "catalog_url", file: File) {
    setBusy(true);
    const path = await uploadExhibitionAsset(companyId, file);
    const next = { ...form, [field]: path };
    setForm(next);
    await upsertExhibitionProduct(next);
    onChange(); setBusy(false);
  }
  async function addGalleryImage(file: File) {
    setBusy(true);
    try {
      await uploadAttachment({
        ownerType: "exhibition",
        ownerId: companyId,
        kind: "gallery_image",
        file,
        title: `${p.name} — ${file.name}`,
        description: `product:${p.id}`,
      });
      await refreshGallery();
    } finally { setBusy(false); }
  }
  async function removeGalleryImage(att: CompanyAttachment) {
    if (!confirm("حذف این عکس؟")) return;
    await deleteAttachment(att);
    await refreshGallery();
  }
  async function remove() {
    if (!confirm("حذف این محصول؟")) return;
    await deleteExhibitionProduct(p.id); onChange();
  }
  const cat = useAssetUrl(form.catalog_url);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 140px 1fr", gap: 12, padding: 10, border: "1px solid var(--stroke)", borderRadius: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <button onClick={onUp} style={arrowBtn}>▲</button>
        <button onClick={onDown} style={arrowBtn}>▼</button>
      </div>
      <div>
        <div style={{ width: 140, height: 105, background: "#fff", borderRadius: 8, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6, border: "1px solid var(--stroke)" }}>
          {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>عکس اصلی</span>}
        </div>
        <label className="btn btn-ghost" style={{ width: 140, fontSize: 11, padding: "4px 6px", cursor: "pointer", display: "flex", justifyContent: "center", marginBottom: 4 }}>
          عکس اصلی
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload("image_url", f); e.target.value = ""; }} />
        </label>
        {vid && <video src={vid} controls style={{ width: 140, borderRadius: 6, marginBottom: 4 }} />}
        <label className="btn btn-ghost" style={{ width: 140, fontSize: 11, padding: "4px 6px", cursor: "pointer", display: "flex", justifyContent: "center", marginBottom: 4 }}>
          {form.video_url ? "تعویض ویدئو" : "ویدئو"}
          <input type="file" accept="video/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload("video_url", f); e.target.value = ""; }} />
        </label>
        {cat && (
          <a href={cat} target="_blank" rel="noopener" className="btn btn-ghost" style={{ width: 140, fontSize: 11, padding: "4px 6px", display: "flex", justifyContent: "center", marginBottom: 4 }}>
            مشاهدهٔ کاتالوگ
          </a>
        )}
        <label className="btn btn-ghost" style={{ width: 140, fontSize: 11, padding: "4px 6px", cursor: "pointer", display: "flex", justifyContent: "center" }}>
          {form.catalog_url ? "تعویض کاتالوگ" : "کاتالوگ/PDF"}
          <input type="file" accept=".pdf,application/pdf,.doc,.docx" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload("catalog_url", f); e.target.value = ""; }} />
        </label>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="نام" style={field} />
        <textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="توضیحات کامل (در صفحهٔ محصول نمایش داده می‌شود)" rows={3} style={{ ...field, resize: "vertical", fontFamily: "inherit" }} />
        <input value={form.link_url ?? ""} onChange={(e) => setForm({ ...form, link_url: e.target.value })} placeholder="لینک محصول/سایت (با https)" style={field} />

        {/* Per-product gallery */}
        <div style={{ marginTop: 4, padding: 8, border: "1px dashed var(--stroke)", borderRadius: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>گالری عکس‌های این محصول</div>
            <label className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 8px", cursor: "pointer" }}>
              + عکس
              <input type="file" accept="image/*" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) addGalleryImage(f); e.target.value = ""; }} />
            </label>
          </div>
          {productImages.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>هنوز عکسی برای این محصول اضافه نشده.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(70px,1fr))", gap: 6 }}>
              {productImages.map((a) => <ProductGalleryThumb key={a.id} att={a} onDelete={() => removeGalleryImage(a)} />)}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-primary" onClick={save} disabled={busy} style={{ fontSize: 12 }}>ذخیره</button>
          <button className="btn btn-ghost" onClick={remove} style={{ fontSize: 12 }}>حذف محصول</button>
        </div>
      </div>
    </div>
  );
}

function ProductGalleryThumb({ att, onDelete }: { att: CompanyAttachment; onDelete: () => void }) {
  const url = useAssetUrl(att.file_url);
  return (
    <div style={{ position: "relative", aspectRatio: "1/1", borderRadius: 6, overflow: "hidden", background: "#fff", border: "1px solid var(--stroke)" }}>
      {url && <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />}
      <button onClick={onDelete} title="حذف"
        style={{ position: "absolute", top: 2, left: 2, background: "rgba(180,30,30,0.85)", color: "#fff", border: 0, borderRadius: 4, padding: "1px 5px", fontSize: 11, cursor: "pointer" }}>×</button>
    </div>
  );
}


function GalleryItem({ url, caption, onCaption, onUp, onDown, onDelete }: { url: string; caption: string | null; onCaption: (v: string) => void; onUp: () => void; onDown: () => void; onDelete: () => void }) {
  const src = useAssetUrl(url);
  const [cap, setCap] = useState(caption ?? "");
  useEffect(() => setCap(caption ?? ""), [caption]);
  return (
    <div style={{ background: "var(--panel-2)", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative", aspectRatio: "1/1" }}>
        {src && <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
        <div style={{ position: "absolute", top: 4, left: 4, display: "flex", gap: 2 }}>
          <button onClick={onUp} style={overlayBtn}>▲</button>
          <button onClick={onDown} style={overlayBtn}>▼</button>
          <button onClick={onDelete} style={{ ...overlayBtn, background: "rgba(180,30,30,0.85)" }}>×</button>
        </div>
      </div>
      <input value={cap} onChange={(e) => setCap(e.target.value)} onBlur={() => cap !== (caption ?? "") && onCaption(cap)} placeholder="کپشن" style={{ ...field, borderRadius: 0, border: 0, fontSize: 12, padding: "6px 8px" }} />
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

const arrowBtn: React.CSSProperties = {
  background: "var(--panel-2)", border: 0, color: "inherit",
  borderRadius: 4, cursor: "pointer", padding: "4px 8px", fontSize: 11,
};

const overlayBtn: React.CSSProperties = {
  background: "rgba(0,0,0,0.7)", color: "#fff", border: 0,
  borderRadius: 4, padding: "2px 6px", fontSize: 11, cursor: "pointer",
};

const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--stroke)", letterSpacing: 0.2 }}>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <label style={{ fontSize: 12, color: "var(--ink-soft)", fontWeight: 500 }}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 11, color: "var(--ink-soft)", opacity: 0.7 }}>{hint}</span>}
    </div>
  );
}

function PersianDateInput({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  // value stored as ISO yyyy-mm-dd (gregorian) for DB compatibility
  return (
    <input
      type="date"
      value={value || ""}
      onChange={(event) => onChange(event.target.value || null)}
      style={{
        background: "var(--panel-2)",
        border: "1px solid var(--stroke)",
        borderRadius: 8,
        padding: "10px 12px",
        color: "inherit",
        fontFamily: "inherit",
        fontSize: 14,
        width: "100%",
        boxSizing: "border-box",
      }}
    />
  );
}

function ParkSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: parks } = useQuery({ queryKey: ["parks-select"], queryFn: fetchParks });
  const rows = parks ?? [];
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: "var(--panel-2)", border: "1px solid var(--stroke)",
        borderRadius: 8, padding: "10px 12px", color: "inherit",
        fontFamily: "inherit", fontSize: 14, width: "100%", boxSizing: "border-box",
      }}
    >
      <option value="">— بدون پارک —</option>
      {rows.map((p) => (
        <option key={p.park_id} value={p.park_id}>
          {p.name}{p.province ? ` — ${p.province}` : ""}{p.is_active ? "" : " (غیرفعال)"}
        </option>
      ))}
    </select>
  );
}
