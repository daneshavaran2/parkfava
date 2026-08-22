import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, useAssetUrl } from "@/lib/use-auth";
import {
  fetchExhibitionCompany,
  uploadExhibitionAsset,
  type ExhibitionCompany,
  type ExhibitionProduct,
} from "@/lib/exhibition-api";
import {
  listAdminCompanies,
  saveAdminCompany,
  deleteExhibitionCompanyAdmin,
  reorderExhibitionCompaniesAdmin,
  approveCompanyAdmin,
  rejectCompanyAdmin,
  addExhibitionImage,
  deleteExhibitionImage,
  updateExhibitionImage,
  reorderExhibitionImages,
  upsertExhibitionProduct,
  deleteExhibitionProduct,
  reorderExhibitionProducts,
} from "@/lib/exhibition-api.functions";
import { signOutFn } from "@/lib/auth.functions";
import { AttachmentsManager } from "@/components/admin/AttachmentsManager";
import { ZipImporter } from "@/components/admin/ZipImporter";
import { fetchAttachmentsAdmin, uploadAttachment, deleteAttachment, type CompanyAttachment } from "@/lib/attachments-api";
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
  const { t } = useTranslation();
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    approved: { bg: "#164e2b", fg: "#a7f3c8", label: t("adminExhibition.status_approved") },
    pending: { bg: "#5b4408", fg: "#ffe08a", label: t("adminExhibition.status_pending") },
    draft: { bg: "#2b2f38", fg: "#c9cfda", label: t("adminExhibition.status_draft") },
    rejected: { bg: "#5b1414", fg: "#ffb4b4", label: t("adminExhibition.status_rejected") },
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
  const { t } = useTranslation();
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listAdminCompaniesFn = useServerFn(listAdminCompanies);
  const saveAdminCompanyFn = useServerFn(saveAdminCompany);
  const reorderExhibitionCompaniesAdminFn = useServerFn(reorderExhibitionCompaniesAdmin);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { next: "/admin/exhibition" } });
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

  if (loading) return <div className="view"><div className="shell" style={{ padding: 40 }}>{t("common.loading")}</div></div>;
  if (!user) return null;
  if (!isAdmin) {
    return (
      <div className="view"><div className="shell" style={{ padding: 40 }}>
        <h2 className="h2">{t("adminExhibition.no_admin_access_title")}</h2>
        <p className="lead">{t("adminExhibition.no_admin_access_lead")}</p>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 8, fontFamily: "monospace" }}>User ID: {user.id}</p>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>Email: {user.email}</p>
        <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 16 }}>
          {t("adminExhibition.make_admin_instructions")}<br/>
          <code style={{ background: "var(--panel-2)", padding: "4px 6px", borderRadius: 4, display: "inline-block", marginTop: 4 }}>
            INSERT INTO public.user_roles (user_id, role) VALUES ('{user.id}', 'admin');
          </code>
        </p>
        <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={async () => { await signOutFn(); navigate({ to: "/auth", search: { next: "" } }); }}>{t("adminExhibition.signout_and_relogin")}</button>
      </div></div>
    );
  }

  async function createCompany() {
    const id = newId.trim();
    if (!id) return;
    await saveAdminCompanyFn({ data: { company_id: id, name: id } as any });
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
    await reorderExhibitionCompaniesAdminFn({ data: { ids: next.map((c) => c.company_id) } });
    qc.invalidateQueries({ queryKey: ["admin-exh-companies"] });
    qc.invalidateQueries({ queryKey: ["exh-public"] });
  }

  async function toggleActive(c: ExhibitionCompany) {
    await saveAdminCompanyFn({ data: { ...c, is_active: !c.is_active } as any });
    qc.invalidateQueries({ queryKey: ["admin-exh-companies"] });
    qc.invalidateQueries({ queryKey: ["exh-public"] });
  }

  return (
    <div className="view">
      <div className="shell" style={{ padding: "20px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <span className="eyebrow">Admin</span>
            <h2 className="h2" style={{ fontSize: 24 }}>{t("adminExhibition.manage_companies_title")}</h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link to="/exhibition" className="btn btn-ghost">{t("adminExhibition.view_exhibition")}</Link>
            <Link to="/admin/attachments" className="btn btn-ghost">{t("adminExhibition.attachments_dashboard")}</Link>
            <Link to="/admin/ai" className="btn btn-ghost">{t("nav.admin_ai")}</Link>
            <Link to="/admin/parks" className="btn btn-ghost">{t("adminExhibition.parks_link")}</Link>
            <Link to="/admin/about" className="btn btn-ghost">{t("adminExhibition.about_link")}</Link>
            <button className="btn btn-ghost" onClick={async () => { await signOutFn(); navigate({ to: "/auth", search: { next: "" } }); }}>{t("common.logout")}</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16 }}>
          <aside className="panel" style={{ padding: 10, maxHeight: "calc(100vh - 180px)", overflowY: "auto" }}>
            <button
              className="btn btn-primary"
              style={{ width: "100%", marginBottom: 8 }}
              onClick={() => setCreating((v) => !v)}
            >{t("adminExhibition.add_new_company")}</button>
            {creating && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                <input
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  placeholder={t("adminExhibition.new_id_placeholder")}
                  style={field}
                />
                <button className="btn btn-ghost" onClick={createCompany}>{t("adminExhibition.create")}</button>
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "6px 0 10px" }}>
              {([
                ["all", t("adminExhibition.status_all")],
                ["pending", `${t("adminExhibition.status_pending")}${pendingCount ? ` (${pendingCount})` : ""}`],
                ["approved", t("adminExhibition.status_approved")],
                ["draft", t("adminExhibition.status_draft")],
                ["rejected", t("adminExhibition.status_rejected")],
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
                  <button onClick={() => move(i, -1)} title={t("adminExhibition.move_up")}
                    style={{ background: "var(--panel-2)", border: 0, color: "inherit", borderRadius: 4, cursor: "pointer", padding: "2px 6px", fontSize: 11 }}>▲</button>
                  <button onClick={() => move(i, 1)} title={t("adminExhibition.move_down")}
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
                <label title={t("adminExhibition.toggle_active")} style={{ display: "flex", alignItems: "center", padding: "0 6px", cursor: "pointer" }}>
                  <input type="checkbox" checked={c.is_active} onChange={() => toggleActive(c)} />
                </label>
              </div>
            ))}
            {companiesLoading && <div style={{ fontSize: 13, color: "var(--ink-soft)", padding: 10 }}>{t("common.loading")}</div>}
            {companiesError && <div style={{ fontSize: 13, color: "#ff8888", padding: 10, lineHeight: 1.8 }}>
              {t("adminExhibition.load_companies_error")}: {String((companiesErr as any)?.message ?? companiesErr)}
            </div>}
            {!companiesLoading && !companiesError && !filtered.length && (
              <div style={{ fontSize: 13, color: "var(--ink-soft)", padding: 10 }}>
                {companies.length === 0
                  ? t("adminExhibition.no_companies_found")
                  : t("adminExhibition.no_companies_in_status")}
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
  const deleteExhibitionCompanyAdminFn = useServerFn(deleteExhibitionCompanyAdmin);
  const approveCompanyAdminFn = useServerFn(approveCompanyAdmin);
  const rejectCompanyAdminFn = useServerFn(rejectCompanyAdmin);
  const addExhibitionImageFn = useServerFn(addExhibitionImage);
  const reorderExhibitionImagesFn = useServerFn(reorderExhibitionImages);
  const deleteExhibitionImageFn = useServerFn(deleteExhibitionImage);
  const updateExhibitionImageFn = useServerFn(updateExhibitionImage);
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
      await saveAdminCompanyFn({ data: next as any });
      invalidate();
      setMsg(t("adminExhibition.uploaded"));
    } catch (e: any) { setMsg(`${t("common.error")}: ${e.message ?? e}`); }
    setBusy(false);
  }

  async function clearField(field: "video_url" | "catalog_url") {
    const next = { ...form, [field]: "" };
    setForm(next);
    await saveAdminCompanyFn({ data: next as any });
    invalidate();
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    try {
      const path = await uploadExhibitionAsset(companyId, file);
      await addExhibitionImageFn({ data: { company_id: companyId, image_url: path } });
      invalidate();
    } catch (e: any) { setMsg(`${t("adminExhibition.upload_error")}: ${e.message ?? e}`); }
    setBusy(false); e.target.value = "";
  }

  async function moveImage(idx: number, dir: -1 | 1) {
    const imgs = [...(data?.images ?? [])];
    const j = idx + dir; if (j < 0 || j >= imgs.length) return;
    [imgs[idx], imgs[j]] = [imgs[j], imgs[idx]];
    await reorderExhibitionImagesFn({ data: { ids: imgs.map((x) => x.id) } });
    invalidate();
  }

  async function removeCompany() {
    if (!confirm(t("adminExhibition.confirm_delete_company"))) return;
    await deleteExhibitionCompanyAdminFn({ data: { company_id: companyId } });
    invalidate();
    onDeleted();
  }

  async function doApprove() {
    setBusy(true); setMsg(null);
    try {
      await approveCompanyAdminFn({ data: { company_id: companyId } });
      setMsg(t("adminExhibition.approved_and_published")); setForm((f) => ({ ...f, status: "approved", is_active: true })); invalidate();
    } catch (e: any) { setMsg(`${t("common.error")}: ${e?.message ?? e}`); }
    setBusy(false);
  }
  async function doReject() {
    const note = prompt(t("adminExhibition.reject_prompt"), form.rejection_note ?? "");
    if (note === null) return;
    setBusy(true); setMsg(null);
    try {
      await rejectCompanyAdminFn({ data: { company_id: companyId, note } });
      setMsg(t("adminExhibition.rejected")); setForm((f) => ({ ...f, status: "rejected", rejection_note: note })); invalidate();
    } catch (e: any) { setMsg(`${t("common.error")}: ${e?.message ?? e}`); }
    setBusy(false);
  }

  if (isLoading) return <div className="panel" style={{ padding: 24 }}>{t("common.loading")}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header: Logo + Identity */}
      <div className="panel" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div>
              <span className="eyebrow">{t("adminExhibition.company_eyebrow")}</span>
              <h3 style={{ marginTop: 2 }}>{form.name || companyId}</h3>
            </div>
            <StatusBadge status={form.status ?? "draft"} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {form.status !== "approved" && (
              <button className="btn btn-primary" onClick={doApprove} disabled={busy}>{t("adminExhibition.approve_and_publish")}</button>
            )}
            {form.status !== "rejected" && (
              <button className="btn btn-ghost" onClick={doReject} disabled={busy}>{t("adminExhibition.reject")}</button>
            )}
            <button className="btn btn-ghost" onClick={removeCompany} style={{ fontSize: 12, color: "#c33" }}>{t("adminExhibition.delete_company")}</button>
          </div>
        </div>
        {form.status === "rejected" && form.rejection_note && (
          <div style={{ marginBottom: 12, padding: 10, background: "rgba(200,60,60,.12)", border: "1px solid rgba(200,60,60,.4)", borderRadius: 8, fontSize: 13 }}>
            <b>{t("adminExhibition.rejection_reason")}:</b> {form.rejection_note}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 20, alignItems: "start" }}>
          <div>
            <div style={{ width: 160, height: 160, borderRadius: 14, background: "var(--panel-2)", border: "1px solid var(--stroke)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {logoUrl ? <img src={logoUrl} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{t("adminExhibition.no_logo")}</span>}
            </div>
            <label className="btn btn-ghost" style={{ marginTop: 8, width: 160, fontSize: 12, cursor: "pointer", display: "flex", justifyContent: "center" }}>
              {form.logo_url ? t("adminExhibition.replace_logo") : t("adminExhibition.upload_logo")}
              <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadField("logo_url", f); e.target.value = ""; }} style={{ display: "none" }} />
            </label>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Identity */}
            <section>
              <SectionTitle>{t("adminExhibition.identity_section")}</SectionTitle>
              <div style={grid2}>
                <Field label={t("adminExhibition.field_company_name")}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={field} /></Field>
                <Field label={t("adminExhibition.field_company_name_en")}><input value={form.name_en ?? ""} onChange={(e) => setForm({ ...form, name_en: e.target.value })} style={{ ...field, direction: "ltr", textAlign: "left" }} placeholder={t("adminExhibition.field_company_name_en_placeholder")} /></Field>
                <Field label={t("adminExhibition.field_tagline")}><input value={form.tagline ?? ""} onChange={(e) => setForm({ ...form, tagline: e.target.value })} style={field} /></Field>
                <Field label={t("adminExhibition.field_tagline_en")}><input value={form.tagline_en ?? ""} onChange={(e) => setForm({ ...form, tagline_en: e.target.value })} style={{ ...field, direction: "ltr", textAlign: "left" }} /></Field>
                <Field label={t("adminExhibition.field_category_id")}><input value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })} style={field} /></Field>
                <Field label={t("adminExhibition.field_park")}><ParkSelect value={form.park_id ?? ""} onChange={(v) => setForm({ ...form, park_id: v })} /></Field>
                <Field label={t("adminExhibition.field_city")}><input value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} style={field} /></Field>
                <Field label={t("adminExhibition.field_city_en")}><input value={form.city_en ?? ""} onChange={(e) => setForm({ ...form, city_en: e.target.value })} style={{ ...field, direction: "ltr", textAlign: "left" }} /></Field>
                <Field label={t("adminExhibition.field_founded_shamsi")}>
                  <PersianDateInput value={form.founded_at ?? null} onChange={(v) => setForm({ ...form, founded_at: v })} />
                </Field>
                <Field label={t("adminExhibition.field_headcount_total")}><input type="number" value={form.headcount ?? ""} onChange={(e) => setForm({ ...form, headcount: e.target.value ? parseInt(e.target.value) : null })} style={field} /></Field>
                <Field label={t("adminExhibition.field_headcount_full_time")}><input type="number" value={form.headcount_full_time ?? ""} onChange={(e) => setForm({ ...form, headcount_full_time: e.target.value ? parseInt(e.target.value) : null })} style={field} /></Field>
                <Field label={t("adminExhibition.field_headcount_part_time")}><input type="number" value={form.headcount_part_time ?? ""} onChange={(e) => setForm({ ...form, headcount_part_time: e.target.value ? parseInt(e.target.value) : null })} style={field} /></Field>
                <Field label={t("adminExhibition.field_sort_order")}><input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} style={field} /></Field>
                <label style={{ fontSize: 13, color: "var(--ink-soft)", display: "flex", gap: 8, alignItems: "center", gridColumn: "1 / -1", padding: "6px 0" }}>
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                  {t("adminExhibition.field_active_in_exhibition")}
                </label>
              </div>
            </section>

            {/* Founders & Team */}
            <section>
              <SectionTitle>{t("adminExhibition.founders_section")}</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Field label={t("adminExhibition.field_founders")} hint={t("adminExhibition.founders_hint")}>
                  <input value={form.founders ?? ""} onChange={(e) => setForm({ ...form, founders: e.target.value })} placeholder={t("adminExhibition.founders_placeholder")} style={field} />
                </Field>
                <Field label={t("adminExhibition.field_founders_en")}>
                  <input value={form.founders_en ?? ""} onChange={(e) => setForm({ ...form, founders_en: e.target.value })} style={{ ...field, direction: "ltr", textAlign: "left" }} />
                </Field>
                <Field label={t("adminExhibition.field_linkedin")} hint={t("adminExhibition.linkedin_hint")}>
                  <input value={form.linkedin_url ?? ""} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} placeholder="https://linkedin.com/company/..." style={field} dir="ltr" />
                </Field>
              </div>
            </section>

            {/* Contact */}
            <section>
              <SectionTitle>{t("company.contact_methods")}</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <Field label={t("company.website")}><input value={form.website ?? ""} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="example.com" style={field} dir="ltr" /></Field>
                <Field label={t("company.email")}><input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="info@example.com" style={field} dir="ltr" /></Field>
                <Field label={t("company.phone")}><input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={field} /></Field>
                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label={t("company.address")}><input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} style={field} /></Field>
                  <Field label={t("adminExhibition.field_address_en")}><input value={form.address_en ?? ""} onChange={(e) => setForm({ ...form, address_en: e.target.value })} style={{ ...field, direction: "ltr", textAlign: "left" }} /></Field>
                </div>
                <Field label={t("myCompany.field_lat")}>
                  <input value={latRaw} onChange={(e) => onLatChange(e.target.value)}
                    style={{ ...field, borderColor: latErr ? "#ff7676" : undefined }}
                    dir="ltr" placeholder="35.6892" inputMode="decimal"
                    aria-invalid={!!latErr} data-testid="admin-lat-input" />
                  {latErr && <div role="alert" style={{ color: "#ff7676", fontSize: 12, marginTop: 4 }}>{latErr}</div>}
                </Field>
                <Field label={t("myCompany.field_lng")}>
                  <input value={lngRaw} onChange={(e) => onLngChange(e.target.value)}
                    style={{ ...field, borderColor: lngErr ? "#ff7676" : undefined }}
                    dir="ltr" placeholder="51.3890" inputMode="decimal"
                    aria-invalid={!!lngErr} data-testid="admin-lng-input" />
                  {lngErr && <div role="alert" style={{ color: "#ff7676", fontSize: 12, marginTop: 4 }}>{lngErr}</div>}
                </Field>
                <Field label={t("adminExhibition.field_paste_link")}>
                  <input
                    style={field}
                    dir="ltr"
                    placeholder={t("myCompany.paste_link_placeholder")}
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
              <SectionTitle>{t("adminExhibition.descriptions_section")}</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Field label={t("adminExhibition.field_short_intro")}>
                  <textarea value={form.intro ?? ""} onChange={(e) => setForm({ ...form, intro: e.target.value })} rows={3} style={{ ...field, resize: "vertical", fontFamily: "inherit" }} />
                </Field>
                <Field label={t("adminExhibition.field_short_intro_en")}>
                  <textarea value={form.intro_en ?? ""} onChange={(e) => setForm({ ...form, intro_en: e.target.value })} rows={3} style={{ ...field, resize: "vertical", fontFamily: "inherit", direction: "ltr", textAlign: "left" }} />
                </Field>
                <Field label={t("adminExhibition.field_knowledge_products_intro")}>
                  <textarea value={form.knowledge_products_intro ?? ""} onChange={(e) => setForm({ ...form, knowledge_products_intro: e.target.value })} rows={3} style={{ ...field, resize: "vertical", fontFamily: "inherit" }} />
                </Field>
                <Field label={t("adminExhibition.field_knowledge_products_intro_en")}>
                  <textarea value={form.knowledge_products_intro_en ?? ""} onChange={(e) => setForm({ ...form, knowledge_products_intro_en: e.target.value })} rows={3} style={{ ...field, resize: "vertical", fontFamily: "inherit", direction: "ltr", textAlign: "left" }} />
                </Field>
                <Field label={t("company.export_potential")}>
                  <textarea value={form.export_potential ?? ""} onChange={(e) => setForm({ ...form, export_potential: e.target.value })} rows={2} style={{ ...field, resize: "vertical", fontFamily: "inherit" }} />
                </Field>
                <Field label={t("adminExhibition.field_export_potential_en")}>
                  <textarea value={form.export_potential_en ?? ""} onChange={(e) => setForm({ ...form, export_potential_en: e.target.value })} rows={2} style={{ ...field, resize: "vertical", fontFamily: "inherit", direction: "ltr", textAlign: "left" }} />
                </Field>
                <Field label={t("adminExhibition.field_full_description")}>
                  <textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={5} style={{ ...field, resize: "vertical", fontFamily: "inherit" }} />
                </Field>
                <Field label={t("adminExhibition.field_full_description_en")}>
                  <textarea value={form.description_en ?? ""} onChange={(e) => setForm({ ...form, description_en: e.target.value })} rows={5} style={{ ...field, resize: "vertical", fontFamily: "inherit", direction: "ltr", textAlign: "left" }} />
                </Field>
              </div>
            </section>

            {/* Sticky save bar */}
            <div style={{ position: "sticky", bottom: 0, display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--stroke)", background: "var(--panel)", marginTop: 4 }}>
              <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? t("adminExhibition.saving") : t("myCompany.save_changes")}</button>
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
          <h3 style={{ marginBottom: 10 }}>{t("company.intro_video")}</h3>
          {videoUrl ? (
            <video src={videoUrl} controls style={{ width: "100%", borderRadius: 10, background: "#000" }} />
          ) : (
            <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{t("adminExhibition.intro_video_not_uploaded")}</div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <label className="btn btn-ghost" style={{ fontSize: 12, cursor: "pointer" }}>
              {form.video_url ? t("adminExhibition.replace") : t("adminExhibition.upload_video")}
              <input type="file" accept="video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadField("video_url", f); e.target.value = ""; }} style={{ display: "none" }} />
            </label>
            {form.video_url && <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => clearField("video_url")}>{t("myCompany.delete")}</button>}
          </div>
        </div>
        <div className="panel" style={{ padding: 20 }}>
          <h3 style={{ marginBottom: 10 }}>{t("adminExhibition.catalog_pdf")}</h3>
          {catalogUrl ? (
            <a href={catalogUrl} target="_blank" rel="noopener" className="btn btn-ghost" style={{ fontSize: 13 }}>{t("adminExhibition.view_catalog")}</a>
          ) : (
            <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{t("adminExhibition.catalog_not_uploaded")}</div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <label className="btn btn-ghost" style={{ fontSize: 12, cursor: "pointer" }}>
              {form.catalog_url ? t("adminExhibition.replace") : t("adminExhibition.upload_catalog")}
              <input type="file" accept="application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadField("catalog_url", f); e.target.value = ""; }} style={{ display: "none" }} />
            </label>
            {form.catalog_url && <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => clearField("catalog_url")}>{t("myCompany.delete")}</button>}
          </div>
        </div>
      </div>

      {/* Products */}
      <ProductsEditor companyId={companyId} products={data?.products ?? []} onChange={invalidate} />

      {/* Gallery */}
      <div className="panel" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3>{t("company.image_gallery")}</h3>
          <label className="btn btn-ghost" style={{ fontSize: 12, cursor: "pointer" }}>
            {t("adminExhibition.add_photo")}
            <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 10 }}>
          {data?.images.map((img, i) => (
            <GalleryItem key={img.id} url={img.image_url} caption={img.caption}
              onCaption={async (v) => { await updateExhibitionImageFn({ data: { id: img.id, caption: v } }); invalidate(); }}
              onUp={() => moveImage(i, -1)}
              onDown={() => moveImage(i, 1)}
              onDelete={async () => { await deleteExhibitionImageFn({ data: { id: img.id } }); invalidate(); }}
            />
          ))}
          {!data?.images.length && <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{t("adminExhibition.no_photos_yet")}</div>}
        </div>
      </div>

      {/* Attachments (catalogs, forms, free documents) */}
      <AttachmentsManager ownerType="exhibition" ownerId={companyId} />
    </div>
  );
}

function ProductsEditor({ companyId, products, onChange }: { companyId: string; products: ExhibitionProduct[]; onChange: () => void }) {
  const { t } = useTranslation();
  const upsertExhibitionProductFn = useServerFn(upsertExhibitionProduct);
  const reorderExhibitionProductsFn = useServerFn(reorderExhibitionProducts);
  const [newName, setNewName] = useState("");

  async function add() {
    const name = newName.trim(); if (!name) return;
    await upsertExhibitionProductFn({ data: { company_id: companyId, name, sort_order: products.length } });
    setNewName(""); onChange();
  }
  async function move(idx: number, dir: -1 | 1) {
    const arr = [...products]; const j = idx + dir; if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    await reorderExhibitionProductsFn({ data: { ids: arr.map((p) => p.id) } }); onChange();
  }

  return (
    <div className="panel" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
        <h3>{t("adminExhibition.products_services")}</h3>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("adminExhibition.new_product_placeholder")} style={{ ...field, padding: "6px 10px", fontSize: 13 }} />
          <button className="btn btn-primary" onClick={add} style={{ fontSize: 12 }}>{t("adminExhibition.add")}</button>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {products.map((p, i) => (
          <ProductRow key={p.id} p={p} companyId={companyId} onChange={onChange} onUp={() => move(i, -1)} onDown={() => move(i, 1)} />
        ))}
        {!products.length && <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{t("adminExhibition.no_products_registered")}</div>}
      </div>
    </div>
  );
}

function ProductRow({ p, companyId, onChange, onUp, onDown }: { p: ExhibitionProduct; companyId: string; onChange: () => void; onUp: () => void; onDown: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const upsertExhibitionProductFn = useServerFn(upsertExhibitionProduct);
  const deleteExhibitionProductFn = useServerFn(deleteExhibitionProduct);
  const [form, setForm] = useState(p);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(p), [p]);
  const img = useAssetUrl(form.image_url);
  const vid = useAssetUrl(form.video_url);

  const { data: allAtts = [] } = useQuery({
    queryKey: ["admin-product-gallery", companyId],
    queryFn: () => fetchAttachmentsAdmin("exhibition", companyId),
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
    await upsertExhibitionProductFn({ data: form as any });
    onChange(); setBusy(false);
  }
  async function upload(field: "image_url" | "video_url" | "catalog_url", file: File) {
    setBusy(true);
    const path = await uploadExhibitionAsset(companyId, file);
    const next = { ...form, [field]: path };
    setForm(next);
    await upsertExhibitionProductFn({ data: next as any });
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
    if (!confirm(t("adminExhibition.confirm_delete_photo"))) return;
    await deleteAttachment(att);
    await refreshGallery();
  }
  async function remove() {
    if (!confirm(t("adminExhibition.confirm_delete_product"))) return;
    await deleteExhibitionProductFn({ data: { id: p.id } }); onChange();
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
          {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{t("adminExhibition.main_image")}</span>}
        </div>
        <label className="btn btn-ghost" style={{ width: 140, fontSize: 11, padding: "4px 6px", cursor: "pointer", display: "flex", justifyContent: "center", marginBottom: 4 }}>
          {t("adminExhibition.main_image")}
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload("image_url", f); e.target.value = ""; }} />
        </label>
        {vid && <video src={vid} controls style={{ width: 140, borderRadius: 6, marginBottom: 4 }} />}
        <label className="btn btn-ghost" style={{ width: 140, fontSize: 11, padding: "4px 6px", cursor: "pointer", display: "flex", justifyContent: "center", marginBottom: 4 }}>
          {form.video_url ? t("adminExhibition.replace_video") : t("adminExhibition.video")}
          <input type="file" accept="video/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload("video_url", f); e.target.value = ""; }} />
        </label>
        {cat && (
          <a href={cat} target="_blank" rel="noopener" className="btn btn-ghost" style={{ width: 140, fontSize: 11, padding: "4px 6px", display: "flex", justifyContent: "center", marginBottom: 4 }}>
            {t("adminExhibition.view_catalog_short")}
          </a>
        )}
        <label className="btn btn-ghost" style={{ width: 140, fontSize: 11, padding: "4px 6px", cursor: "pointer", display: "flex", justifyContent: "center" }}>
          {form.catalog_url ? t("adminExhibition.replace_catalog") : t("adminExhibition.catalog_pdf_short")}
          <input type="file" accept=".pdf,application/pdf,.doc,.docx" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload("catalog_url", f); e.target.value = ""; }} />
        </label>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("myCompany.field_name")} style={field} />
        <input value={form.name_en ?? ""} onChange={(e) => setForm({ ...form, name_en: e.target.value })} placeholder={t("adminExhibition.product_name_en_placeholder")} style={{ ...field, direction: "ltr", textAlign: "left" }} />
        <textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("adminExhibition.product_desc_placeholder")} rows={3} style={{ ...field, resize: "vertical", fontFamily: "inherit" }} />
        <textarea value={form.description_en ?? ""} onChange={(e) => setForm({ ...form, description_en: e.target.value })} placeholder={t("adminExhibition.product_desc_en_placeholder")} rows={3} style={{ ...field, resize: "vertical", fontFamily: "inherit", direction: "ltr", textAlign: "left" }} />
        <input value={form.link_url ?? ""} onChange={(e) => setForm({ ...form, link_url: e.target.value })} placeholder={t("adminExhibition.product_link_placeholder")} style={field} />

        {/* Per-product gallery */}
        <div style={{ marginTop: 4, padding: 8, border: "1px dashed var(--stroke)", borderRadius: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{t("adminExhibition.product_gallery_title")}</div>
            <label className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 8px", cursor: "pointer" }}>
              {t("adminExhibition.add_photo_short")}
              <input type="file" accept="image/*" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) addGalleryImage(f); e.target.value = ""; }} />
            </label>
          </div>
          {productImages.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>{t("adminExhibition.no_product_photos")}</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(70px,1fr))", gap: 6 }}>
              {productImages.map((a) => <ProductGalleryThumb key={a.id} att={a} onDelete={() => removeGalleryImage(a)} />)}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-primary" onClick={save} disabled={busy} style={{ fontSize: 12 }}>{t("adminExhibition.save")}</button>
          <button className="btn btn-ghost" onClick={remove} style={{ fontSize: 12 }}>{t("adminExhibition.delete_product")}</button>
        </div>
      </div>
    </div>
  );
}

function ProductGalleryThumb({ att, onDelete }: { att: CompanyAttachment; onDelete: () => void }) {
  const { t } = useTranslation();
  const url = useAssetUrl(att.file_url);
  return (
    <div style={{ position: "relative", aspectRatio: "1/1", borderRadius: 6, overflow: "hidden", background: "#fff", border: "1px solid var(--stroke)" }}>
      {url && <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />}
      <button onClick={onDelete} title={t("myCompany.delete")}
        style={{ position: "absolute", top: 2, left: 2, background: "rgba(180,30,30,0.85)", color: "#fff", border: 0, borderRadius: 4, padding: "1px 5px", fontSize: 11, cursor: "pointer" }}>×</button>
    </div>
  );
}


function GalleryItem({ url, caption, onCaption, onUp, onDown, onDelete }: { url: string; caption: string | null; onCaption: (v: string) => void; onUp: () => void; onDown: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
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
      <input value={cap} onChange={(e) => setCap(e.target.value)} onBlur={() => cap !== (caption ?? "") && onCaption(cap)} placeholder={t("adminExhibition.caption_placeholder")} style={{ ...field, borderRadius: 0, border: 0, fontSize: 12, padding: "6px 8px" }} />
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
  const { t } = useTranslation();
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
      <option value="">{t("adminExhibition.no_park")}</option>
      {rows.map((p) => (
        <option key={p.park_id} value={p.park_id}>
          {p.name}{p.province ? ` — ${p.province}` : ""}{p.is_active ? "" : t("adminExhibition.inactive_suffix")}
        </option>
      ))}
    </select>
  );
}
