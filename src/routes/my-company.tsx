import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentUser, signOutFn, changeMyPassword } from "@/lib/auth.functions";
import { useAssetUrl } from "@/lib/use-auth";
import {
  fetchMyCompany,
  fetchExhibitionCompany,
  uploadExhibitionAsset,
  type ExhibitionCompany,
  type ExhibitionProduct,
} from "@/lib/exhibition-api";
import {
  saveOwnedCompany,
  submitCompanyForReview,
  addExhibitionImage,
  deleteExhibitionImage,
  upsertExhibitionProduct,
  deleteExhibitionProduct,
} from "@/lib/exhibition-api.functions";
import { parseLatLng } from "@/lib/geo";
import { useTranslation } from "react-i18next";
import { tHead } from "@/i18n/head";

export const Route = createFileRoute("/my-company")({
  head: () => ({ meta: [{ title: tHead("meta.my_company_title") }] }),
  component: MyCompanyPage,
});

function MyCompanyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [checking, setChecking] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [notAssigned, setNotAssigned] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  async function loadCompany() {
    const mine = await fetchMyCompany();
    if (!mine) { setNotAssigned(true); setChecking(false); return; }
    setCompanyId(mine.company_id);
    setChecking(false);
  }

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (!user) { navigate({ to: "/auth", search: { next: "/my-company" } as any }); return; }
      if (user.mustChangePassword) { setMustChangePassword(true); setChecking(false); return; }
      await loadCompany();
    })();
  }, [navigate]);

  if (checking) {
    return <div className="view"><div className="shell" style={{ padding: 40 }}>{t("common.loading")}</div></div>;
  }
  if (mustChangePassword) {
    return (
      <ForcePasswordChange
        onDone={() => { setMustChangePassword(false); setChecking(true); loadCompany(); }}
        onSignOut={async () => { await signOutFn(); navigate({ to: "/" }); }}
      />
    );
  }
  if (notAssigned) {
    return (
      <div className="view"><div className="shell" style={{ padding: 40, maxWidth: 560 }}>
        <h2 className="h2">{t("myCompany.not_assigned_title")}</h2>
        <p className="lead" style={{ marginTop: 8 }}>
          {t("myCompany.not_assigned_lead")}
        </p>
        <code style={{ display: "inline-block", marginTop: 12, background: "var(--panel-2)", padding: "8px 10px", borderRadius: 6, fontSize: 13 }}>
          {/* user id shown for admin lookup */}
        </code>
        <div style={{ marginTop: 20, display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={async () => { await signOutFn(); navigate({ to: "/" }); }}>{t("common.logout")}</button>
        </div>
      </div></div>
    );
  }
  if (!companyId) return null;

  return <OwnerEditor companyId={companyId} onSignOut={async () => { await signOutFn(); navigate({ to: "/" }); }} qc={qc} />;
}

// Shown instead of the company editor when the session's must_change_password
// flag is set (see src/routes/my-company.tsx's MyCompanyPage effect) —
// bulk-provisioned accounts (scripts/provision-company-owners.ts) start with
// their contact mobile number as the password, which is only ever meant to
// be a one-time bootstrap credential.
function ForcePasswordChange({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const { t } = useTranslation();
  const changeMyPasswordFn = useServerFn(changeMyPassword);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setMsg(null);
    if (password.length < 8) { setMsg(t("myCompany.password_too_short")); return; }
    if (password !== confirm) { setMsg(t("myCompany.password_mismatch")); return; }
    setBusy(true);
    try {
      await changeMyPasswordFn({ data: { newPassword: password } });
      onDone();
    } catch (e: any) {
      setMsg(`${t("common.error")}: ${e?.message ?? e}`);
    }
    setBusy(false);
  }

  return (
    <div className="view">
      <div className="shell" style={{ padding: 40, maxWidth: 480 }}>
        <h2 className="h2">{t("myCompany.force_password_title")}</h2>
        <p className="lead" style={{ marginTop: 8 }}>{t("myCompany.force_password_lead")}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
          <F label={t("myCompany.field_new_password")}>
            <input type="password" style={inp} value={password} onChange={(e) => setPassword(e.target.value)} />
          </F>
          <F label={t("myCompany.field_confirm_password")}>
            <input type="password" style={inp} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </F>
          {msg && <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{msg}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button className="btn btn-primary" onClick={submit} disabled={busy}>{t("myCompany.submit_new_password")}</button>
            <button className="btn btn-ghost" onClick={onSignOut}>{t("common.logout")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OwnerEditor({ companyId, onSignOut, qc }: { companyId: string; onSignOut: () => void; qc: ReturnType<typeof useQueryClient> }) {
  const saveOwnedCompanyFn = useServerFn(saveOwnedCompany);
  const submitCompanyForReviewFn = useServerFn(submitCompanyForReview);
  const addExhibitionImageFn = useServerFn(addExhibitionImage);
  const deleteExhibitionImageFn = useServerFn(deleteExhibitionImage);
  const { data, isLoading } = useQuery({
    queryKey: ["my-company", companyId],
    queryFn: () => fetchExhibitionCompany(companyId),
  });
  const [form, setForm] = useState<Partial<ExhibitionCompany>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const { t } = useTranslation();
  const [latRaw, setLatRaw] = useState<string>("");
  const [lngRaw, setLngRaw] = useState<string>("");
  const [latErr, setLatErr] = useState<string | null>(null);
  const [lngErr, setLngErr] = useState<string | null>(null);

  useEffect(() => {
    if (data?.company) {
      setForm(data.company);
      setLatRaw(data.company.latitude == null ? "" : String(data.company.latitude));
      setLngRaw(data.company.longitude == null ? "" : String(data.company.longitude));
      setLatErr(null); setLngErr(null);
    }
  }, [data?.company]);

  function onLatChange(v: string) {
    setLatRaw(v);
    const r = parseLatLng(v, "lat");
    if (!r.ok) setLatErr(r.error === "invalid" ? t("validation.lat_invalid") : t("validation.lat_range"));
    else { setLatErr(null); setForm((f) => ({ ...f, latitude: r.value })); }
  }
  function onLngChange(v: string) {
    setLngRaw(v);
    const r = parseLatLng(v, "lng");
    if (!r.ok) setLngErr(r.error === "invalid" ? t("validation.lng_invalid") : t("validation.lng_range"));
    else { setLngErr(null); setForm((f) => ({ ...f, longitude: r.value })); }
  }

  const status = data?.company?.status ?? "draft";
  const canEdit = status === "draft" || status === "rejected" || status === "pending";
  const logoUrl = useAssetUrl(form.logo_url ?? null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["my-company", companyId] });
    qc.invalidateQueries({ queryKey: ["exh-public"] });
  }

  async function save() {
    if (latErr || lngErr) { setMsg(latErr || lngErr); return; }
    setBusy(true); setMsg(null);
    try {
      await saveOwnedCompanyFn({ data: { company_id: companyId, patch: form as any } });
      setMsg(t("common.saved")); invalidate();
    } catch (e: any) {
      setMsg(`${t("common.error")}: ${e?.message ?? e}`);
    }
    setBusy(false);
  }

  async function submitReview() {
    setBusy(true); setMsg(null);
    try {
      await saveOwnedCompanyFn({ data: { company_id: companyId, patch: form as any } });
      await submitCompanyForReviewFn({ data: { company_id: companyId } });
      setMsg(t("myCompany.submit_success")); invalidate();
    } catch (e: any) {
      setMsg(`${t("common.error")}: ${e?.message ?? e}`);
    }
    setBusy(false);
  }

  async function uploadLogo(file: File) {
    setBusy(true);
    try {
      const path = await uploadExhibitionAsset(companyId, file);
      const next = { ...form, logo_url: path };
      setForm(next);
      await saveOwnedCompanyFn({ data: { company_id: companyId, patch: { logo_url: path } } });
      invalidate(); setMsg(t("myCompany.logo_uploaded"));
    } catch (e: any) { setMsg(`${t("common.error")}: ${e.message ?? e}`); }
    setBusy(false);
  }

  async function onAddImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    try {
      const path = await uploadExhibitionAsset(companyId, file);
      await addExhibitionImageFn({ data: { company_id: companyId, image_url: path } });
      invalidate();
    } catch (e: any) { setMsg(`${t("common.error")}: ${e.message ?? e}`); }
    setBusy(false); e.target.value = "";
  }

  async function removeImage(id: string) {
    if (!confirm(t("myCompany.confirm_delete_image"))) return;
    await deleteExhibitionImageFn({ data: { id } }); invalidate();
  }

  if (isLoading) return <div className="view"><div className="shell" style={{ padding: 40 }}>{t("common.loading")}</div></div>;

  return (
    <div className="view">
      <div className="shell" style={{ padding: "20px 16px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <span className="eyebrow">{t("myCompany.dashboard_eyebrow")}</span>
            <h2 className="h2" style={{ fontSize: 24 }}>{form.name || companyId}</h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link to="/exhibition" className="btn btn-ghost">{t("myCompany.exhibition_link")}</Link>
            <button className="btn btn-ghost" onClick={onSignOut}>{t("common.logout")}</button>
          </div>
        </div>

        <StatusPanel status={status} note={data?.company?.rejection_note ?? null} />

        <div className="panel" style={{ padding: 20, marginTop: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 20, alignItems: "start" }}>
            <div>
              <div style={{
                width: 140, height: 140, borderRadius: 12, background: "var(--panel-2)",
                border: "1px dashed var(--stroke)", display: "flex", alignItems: "center",
                justifyContent: "center", overflow: "hidden",
              }}>
                {logoUrl ? <img src={logoUrl} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{t("myCompany.logo_placeholder")}</span>}
              </div>
              {canEdit && (
                <label className="btn btn-ghost" style={{ marginTop: 8, fontSize: 12, cursor: "pointer", display: "block", textAlign: "center" }}>
                  {t("myCompany.upload_logo")}
                  <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                </label>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <F label={t("myCompany.field_name")} full><input disabled={!canEdit} style={inp} value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></F>
              <F label={t("myCompany.field_category")}><input disabled={!canEdit} style={inp} value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })} /></F>
              <F label={t("myCompany.field_city")}><input disabled={!canEdit} style={inp} value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} /></F>
              <F label={t("myCompany.field_tagline")} full><input disabled={!canEdit} style={inp} value={form.tagline ?? ""} onChange={(e) => setForm({ ...form, tagline: e.target.value })} /></F>
              <F label={t("myCompany.field_description")} full><textarea disabled={!canEdit} rows={4} style={{ ...inp, resize: "vertical" }} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></F>
              <F label={t("myCompany.field_website")}><input disabled={!canEdit} style={inp} value={form.website ?? ""} onChange={(e) => setForm({ ...form, website: e.target.value })} /></F>
              <F label={t("myCompany.field_email")}><input disabled={!canEdit} style={inp} value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></F>
              <F label={t("myCompany.field_phone")}><input disabled={!canEdit} style={inp} value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></F>
              <F label={t("myCompany.field_address")}><input disabled={!canEdit} style={inp} value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></F>
              <F label={t("myCompany.field_lat")}>
                <input disabled={!canEdit} dir="ltr" inputMode="decimal" placeholder="35.6892"
                  style={{ ...inp, borderColor: latErr ? "#ff7676" : undefined }}
                  value={latRaw} onChange={(e) => onLatChange(e.target.value)}
                  aria-invalid={!!latErr} data-testid="mycompany-lat-input" />
                {latErr && <div role="alert" style={{ color: "#ff7676", fontSize: 12, marginTop: 4 }}>{latErr}</div>}
              </F>
              <F label={t("myCompany.field_lng")}>
                <input disabled={!canEdit} dir="ltr" inputMode="decimal" placeholder="51.3890"
                  style={{ ...inp, borderColor: lngErr ? "#ff7676" : undefined }}
                  value={lngRaw} onChange={(e) => onLngChange(e.target.value)}
                  aria-invalid={!!lngErr} data-testid="mycompany-lng-input" />
                {lngErr && <div role="alert" style={{ color: "#ff7676", fontSize: 12, marginTop: 4 }}>{lngErr}</div>}
              </F>
              <F label={t("myCompany.field_paste_link")} full>
                <input disabled={!canEdit} dir="ltr" style={inp} placeholder={t("myCompany.paste_link_placeholder")}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData("text");
                    const m = text.match(/(-?\d{1,3}\.\d+)[ ,/@]+(-?\d{1,3}\.\d+)/);
                    if (m) {
                      e.preventDefault();
                      onLatChange(m[1]);
                      onLngChange(m[2]);
                      (e.target as HTMLInputElement).value = "";
                    }
                  }} />
              </F>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={save} disabled={!canEdit || busy}>{t("myCompany.save_changes")}</button>
            {(status === "draft" || status === "rejected") && (
              <button className="btn btn-primary" onClick={submitReview} disabled={busy} style={{ background: "var(--accent-glow)" }}>{t("myCompany.submit_for_review")}</button>
            )}
            {msg && <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>{msg}</span>}
          </div>
        </div>

        <ImagesPanel images={data?.images ?? []} canEdit={canEdit} onAdd={onAddImage} onRemove={removeImage} />
        <ProductsPanel companyId={companyId} products={data?.products ?? []} canEdit={canEdit} onChanged={invalidate} />
      </div>
    </div>
  );
}

function StatusPanel({ status, note }: { status: string; note: string | null }) {
  const { t } = useTranslation();
  const cfg = {
    draft: { bg: "rgba(120,130,140,.12)", stroke: "rgba(120,130,140,.3)", label: t("myCompany.status_draft_label"), text: t("myCompany.status_draft_text") },
    pending: { bg: "rgba(255,196,0,.10)", stroke: "rgba(255,196,0,.35)", label: t("myCompany.status_pending_label"), text: t("myCompany.status_pending_text") },
    approved: { bg: "rgba(70,200,120,.10)", stroke: "rgba(70,200,120,.35)", label: t("myCompany.status_approved_label"), text: t("myCompany.status_approved_text") },
    rejected: { bg: "rgba(220,80,80,.10)", stroke: "rgba(220,80,80,.35)", label: t("myCompany.status_rejected_label"), text: t("myCompany.status_rejected_text") },
  } as const;
  const c = (cfg as any)[status] ?? cfg.draft;
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.stroke}`, borderRadius: 12, padding: "12px 16px" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{t("myCompany.status_prefix")}: {c.label}</div>
      <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{c.text}</div>
      {status === "rejected" && note && (
        <div style={{ marginTop: 8, fontSize: 13 }}><b>{t("myCompany.admin_note")}:</b> {note}</div>
      )}
    </div>
  );
}

function ImagesPanel({ images, canEdit, onAdd, onRemove }: {
  images: Array<{ id: string; image_url: string }>;
  canEdit: boolean;
  onAdd: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="panel" style={{ padding: 20, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{t("myCompany.gallery_images")}</h3>
        {canEdit && (
          <label className="btn btn-ghost" style={{ fontSize: 12, cursor: "pointer" }}>
            {t("myCompany.add_image")}
            <input type="file" accept="image/*" hidden onChange={onAdd} />
          </label>
        )}
      </div>
      {images.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{t("myCompany.no_images_yet")}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 10 }}>
          {images.map((im) => <ImageThumb key={im.id} imageUrl={im.image_url} canEdit={canEdit} onRemove={() => onRemove(im.id)} />)}
        </div>
      )}
    </div>
  );
}

function ImageThumb({ imageUrl, canEdit, onRemove }: { imageUrl: string; canEdit: boolean; onRemove: () => void }) {
  const { t } = useTranslation();
  const url = useAssetUrl(imageUrl);
  return (
    <div style={{ position: "relative", aspectRatio: "4/3", borderRadius: 10, overflow: "hidden", background: "var(--panel-2)", border: "1px solid var(--stroke)" }}>
      {url && <img src={url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      {canEdit && (
        <button onClick={onRemove} style={{ position: "absolute", top: 6, insetInlineEnd: 6, background: "rgba(0,0,0,.6)", color: "#fff", border: 0, borderRadius: 6, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}>{t("myCompany.delete")}</button>
      )}
    </div>
  );
}

function ProductsPanel({ companyId, products, canEdit, onChanged }: {
  companyId: string;
  products: ExhibitionProduct[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const upsertExhibitionProductFn = useServerFn(upsertExhibitionProduct);
  const deleteExhibitionProductFn = useServerFn(deleteExhibitionProduct);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    await upsertExhibitionProductFn({ data: { company_id: companyId, name: name.trim(), description: desc || null, sort_order: products.length } });
    setBusy(false); setName(""); setDesc(""); setCreating(false); onChanged();
  }

  async function remove(id: string) {
    if (!confirm(t("myCompany.confirm_delete_product"))) return;
    await deleteExhibitionProductFn({ data: { id } }); onChanged();
  }

  return (
    <div className="panel" style={{ padding: 20, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{t("company.products")}</h3>
        {canEdit && !creating && <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setCreating(true)}>{t("myCompany.add_product")}</button>}
      </div>
      {creating && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto auto", gap: 8, marginBottom: 12 }}>
          <input placeholder={t("myCompany.product_name_placeholder")} value={name} onChange={(e) => setName(e.target.value)} style={inp} />
          <input placeholder={t("myCompany.product_desc_placeholder")} value={desc} onChange={(e) => setDesc(e.target.value)} style={inp} />
          <button className="btn btn-primary" onClick={create} disabled={busy}>{t("myCompany.submit")}</button>
          <button className="btn btn-ghost" onClick={() => setCreating(false)}>{t("myCompany.cancel")}</button>
        </div>
      )}
      {products.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{t("myCompany.no_products_yet")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {products.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 10, background: "var(--panel-2)", borderRadius: 8 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                {p.description && <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{p.description}</div>}
              </div>
              {canEdit && <button className="btn btn-ghost" onClick={() => remove(p.id)} style={{ fontSize: 12, color: "#c33" }}>{t("myCompany.delete")}</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function F({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: full ? "1 / -1" : undefined, fontSize: 13 }}>
      <span style={{ color: "var(--ink-soft)" }}>{label}</span>
      {children}
    </label>
  );
}

const inp: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--stroke)",
  borderRadius: 10,
  padding: "10px 12px",
  color: "inherit",
  fontFamily: "inherit",
  fontSize: 14,
  width: "100%",
};
