import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentUser, signOutFn, changeMyPassword } from "@/lib/auth.functions";
import { useAssetUrl } from "@/lib/use-auth";
import {
  fetchMyCompany,
  fetchExhibitionCompany,
  fetchCompanyChangeRequests,
  uploadExhibitionAsset,
  type ExhibitionCompany,
  type ExhibitionProduct,
  type ExhibitionChangeRequest,
} from "@/lib/exhibition-api";
import {
  saveOwnedCompany,
  submitCompanyForReview,
  addExhibitionImage,
  deleteExhibitionImage,
  upsertExhibitionProduct,
  deleteExhibitionProduct,
  cancelOwnPendingChange,
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
  const cancelOwnPendingChangeFn = useServerFn(cancelOwnPendingChange);
  const { data, isLoading } = useQuery({
    queryKey: ["my-company", companyId],
    queryFn: () => fetchExhibitionCompany(companyId),
  });
  const { data: pendingChanges = [] } = useQuery({
    queryKey: ["my-company-pending", companyId],
    queryFn: () => fetchCompanyChangeRequests(companyId),
  });
  // Sorted by submitted_at DESC server-side — [0] is the latest.
  const latestCompanyChange = pendingChanges.find((cr) => cr.entity_type === "company");
  function cancelChange(id: string) {
    return cancelOwnPendingChangeFn({ data: { id } }).then(invalidate);
  }
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
      // Overlay the owner's own latest proposal (pending OR rejected) onto
      // the live data, so they see what they last tried to change and can
      // tweak/resubmit instead of retyping from scratch after a rejection.
      const overlay = latestCompanyChange ? latestCompanyChange.payload : {};
      const merged = { ...data.company, ...overlay } as ExhibitionCompany;
      setForm(merged);
      setLatRaw(merged.latitude == null ? "" : String(merged.latitude));
      setLngRaw(merged.longitude == null ? "" : String(merged.longitude));
      setLatErr(null); setLngErr(null);
    }
  }, [data?.company, latestCompanyChange?.id]);

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
  // Owners can always edit now — the server decides direct-write vs.
  // propose-a-change-request per field based on the company's status (see
  // resolveEditMode in exhibition-api.functions.ts). Kept as a named
  // constant rather than deleting every disabled={!canEdit} check below, to
  // keep this diff small and leave one place to reintroduce gating later.
  const canEdit = true;
  const logoUrl = useAssetUrl(form.logo_url ?? null);
  const videoUrl = useAssetUrl(form.video_url ?? null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["my-company", companyId] });
    qc.invalidateQueries({ queryKey: ["my-company-pending", companyId] });
    qc.invalidateQueries({ queryKey: ["exh-public"] });
  }

  function fieldBadge(key: string): { text: string; kind: "pending" | "rejected" } | undefined {
    if (!latestCompanyChange || !(key in (latestCompanyChange.payload ?? {}))) return undefined;
    return latestCompanyChange.status === "pending"
      ? { text: t("myCompany.pending_change_badge"), kind: "pending" }
      : { text: t("myCompany.rejected_change_badge"), kind: "rejected" };
  }

  async function save() {
    if (latErr || lngErr) { setMsg(latErr || lngErr); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await saveOwnedCompanyFn({ data: { company_id: companyId, patch: form as any } });
      setMsg((res as any)?.pending ? t("myCompany.change_pending_msg") : t("common.saved"));
      invalidate();
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
      const res = await saveOwnedCompanyFn({ data: { company_id: companyId, patch: { logo_url: path } } });
      invalidate(); setMsg((res as any)?.pending ? t("myCompany.change_pending_msg") : t("myCompany.logo_uploaded"));
    } catch (e: any) { setMsg(`${t("common.error")}: ${e.message ?? e}`); }
    setBusy(false);
  }

  async function uploadVideo(file: File) {
    setBusy(true);
    try {
      const path = await uploadExhibitionAsset(companyId, file);
      const next = { ...form, video_url: path };
      setForm(next);
      const res = await saveOwnedCompanyFn({ data: { company_id: companyId, patch: { video_url: path } } });
      invalidate(); setMsg((res as any)?.pending ? t("myCompany.change_pending_msg") : t("myCompany.video_uploaded"));
    } catch (e: any) { setMsg(`${t("common.error")}: ${e.message ?? e}`); }
    setBusy(false);
  }

  async function removeVideo() {
    setBusy(true);
    try {
      const next = { ...form, video_url: "" };
      setForm(next);
      const res = await saveOwnedCompanyFn({ data: { company_id: companyId, patch: { video_url: "" } } });
      invalidate();
      if ((res as any)?.pending) setMsg(t("myCompany.change_pending_msg"));
    } catch (e: any) { setMsg(`${t("common.error")}: ${e.message ?? e}`); }
    setBusy(false);
  }

  async function onAddImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    try {
      const path = await uploadExhibitionAsset(companyId, file);
      const res = await addExhibitionImageFn({ data: { company_id: companyId, image_url: path } });
      invalidate();
      if ((res as any)?.pending) setMsg(t("myCompany.change_pending_msg"));
    } catch (e: any) { setMsg(`${t("common.error")}: ${e.message ?? e}`); }
    setBusy(false); e.target.value = "";
  }

  async function removeImage(id: string) {
    if (!confirm(t("myCompany.confirm_delete_image"))) return;
    const res = await deleteExhibitionImageFn({ data: { id } });
    invalidate();
    if ((res as any)?.pending) setMsg(t("myCompany.change_pending_msg"));
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

        <StatusPanel status={status} note={data?.company?.rejection_note ?? null}
          pendingChange={latestCompanyChange} onCancelChange={() => cancelChange(latestCompanyChange!.id)} />

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
              <F label={t("myCompany.field_name")} full badge={fieldBadge("name")}><input disabled={!canEdit} style={inp} value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></F>
              <F label={t("myCompany.field_category")} badge={fieldBadge("category")}><input disabled={!canEdit} style={inp} value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })} /></F>
              <F label={t("myCompany.field_city")} badge={fieldBadge("city")}><input disabled={!canEdit} style={inp} value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} /></F>
              <F label={t("myCompany.field_tagline")} full badge={fieldBadge("tagline")}><input disabled={!canEdit} style={inp} value={form.tagline ?? ""} onChange={(e) => setForm({ ...form, tagline: e.target.value })} /></F>
              <F label={t("myCompany.field_description")} full badge={fieldBadge("description")}><textarea disabled={!canEdit} rows={4} style={{ ...inp, resize: "vertical" }} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></F>
              <F label={t("myCompany.field_website")} badge={fieldBadge("website")}><input disabled={!canEdit} style={inp} value={form.website ?? ""} onChange={(e) => setForm({ ...form, website: e.target.value })} /></F>
              <F label={t("myCompany.field_email")} badge={fieldBadge("email")}><input disabled={!canEdit} style={inp} value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></F>
              <F label={t("myCompany.field_phone")} badge={fieldBadge("phone")}><input disabled={!canEdit} style={inp} value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></F>
              <F label={t("myCompany.field_address")} badge={fieldBadge("address")}><input disabled={!canEdit} style={inp} value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></F>
              <F label={t("myCompany.field_lat")} badge={fieldBadge("latitude")}>
                <input disabled={!canEdit} dir="ltr" inputMode="decimal" placeholder="35.6892"
                  style={{ ...inp, borderColor: latErr ? "#ff7676" : undefined }}
                  value={latRaw} onChange={(e) => onLatChange(e.target.value)}
                  aria-invalid={!!latErr} data-testid="mycompany-lat-input" />
                {latErr && <div role="alert" style={{ color: "#ff7676", fontSize: 12, marginTop: 4 }}>{latErr}</div>}
              </F>
              <F label={t("myCompany.field_lng")} badge={fieldBadge("longitude")}>
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

        <div className="panel" style={{ padding: 20, marginTop: 16 }}>
          <h3 style={{ margin: "0 0 10px" }}>{t("company.intro_video")}</h3>
          {videoUrl ? (
            <video src={videoUrl} controls style={{ width: "100%", maxWidth: 480, borderRadius: 10, background: "#000" }} />
          ) : (
            <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{t("myCompany.teaser_video_not_uploaded")}</div>
          )}
          {canEdit && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <label className="btn btn-ghost" style={{ fontSize: 12, cursor: "pointer" }}>
                {form.video_url ? t("myCompany.replace_video") : t("myCompany.upload_video")}
                <input type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadVideo(f); e.target.value = ""; }} />
              </label>
              {form.video_url && <button className="btn btn-ghost" onClick={removeVideo} disabled={busy} style={{ fontSize: 12 }}>{t("myCompany.delete")}</button>}
            </div>
          )}
        </div>

        <ImagesPanel images={data?.images ?? []} pendingChanges={pendingChanges} canEdit={canEdit} onAdd={onAddImage} onRemove={removeImage} onCancel={cancelChange} />
        <ProductsPanel companyId={companyId} products={data?.products ?? []} pendingChanges={pendingChanges} canEdit={canEdit} onChanged={invalidate} onCancelChange={cancelChange} />
      </div>
    </div>
  );
}

function StatusPanel({ status, note, pendingChange, onCancelChange }: {
  status: string;
  note: string | null;
  pendingChange?: ExhibitionChangeRequest;
  onCancelChange: () => void;
}) {
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
      {status === "approved" && pendingChange?.status === "pending" && (
        <div style={{ marginTop: 8, fontSize: 13, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span>{t("myCompany.pending_change_banner_text")}</span>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => { if (confirm(t("myCompany.confirm_cancel_pending_change"))) onCancelChange(); }}>{t("myCompany.cancel_pending_change")}</button>
        </div>
      )}
      {status === "approved" && pendingChange?.status === "rejected" && pendingChange.rejection_note && (
        <div style={{ marginTop: 8, fontSize: 13 }}><b>{t("myCompany.admin_note")}:</b> {pendingChange.rejection_note}</div>
      )}
    </div>
  );
}

function ImagesPanel({ images, pendingChanges, canEdit, onAdd, onRemove, onCancel }: {
  images: Array<{ id: string; image_url: string }>;
  pendingChanges: ExhibitionChangeRequest[];
  canEdit: boolean;
  onAdd: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const { t } = useTranslation();
  const imageChanges = pendingChanges.filter((cr) => cr.entity_type === "image");
  const pendingDeletes = new Map(
    imageChanges.filter((cr) => cr.status === "pending" && cr.action === "delete" && cr.entity_id).map((cr) => [cr.entity_id as string, cr]),
  );
  // Both pending AND rejected creates — a rejected upload stays visible
  // (with its rejection note) until the owner dismisses it, instead of
  // silently vanishing.
  const draftCreates = imageChanges.filter((cr) => cr.action === "create");
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
      {images.length === 0 && draftCreates.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{t("myCompany.no_images_yet")}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 10 }}>
          {images.map((im) => {
            const pendingDelete = pendingDeletes.get(im.id);
            return (
              <ImageThumb key={im.id} imageUrl={im.image_url} canEdit={canEdit}
                badge={pendingDelete ? t("myCompany.pending_delete_badge") : undefined}
                onAction={pendingDelete ? () => onCancel(pendingDelete.id) : () => onRemove(im.id)}
                actionLabel={pendingDelete ? t("myCompany.cancel_pending_change") : t("myCompany.delete")} />
            );
          })}
          {draftCreates.map((cr) => (
            <ImageThumb key={cr.id} imageUrl={cr.payload.image_url} canEdit={canEdit}
              badge={cr.status === "pending" ? t("myCompany.pending_change_badge") : t("myCompany.rejected_change_badge")}
              note={cr.status === "rejected" ? cr.rejection_note : null}
              onAction={() => onCancel(cr.id)} actionLabel={t("myCompany.cancel_pending_change")} />
          ))}
        </div>
      )}
    </div>
  );
}

function ImageThumb({ imageUrl, canEdit, badge, note, onAction, actionLabel }: {
  imageUrl: string; canEdit: boolean; badge?: string; note?: string | null; onAction: () => void; actionLabel: string;
}) {
  const { t } = useTranslation();
  const url = useAssetUrl(imageUrl);
  return (
    <div style={{ position: "relative", aspectRatio: "4/3", borderRadius: 10, overflow: "hidden", background: "var(--panel-2)", border: "1px solid var(--stroke)" }} title={note ? `${t("myCompany.admin_note")}: ${note}` : undefined}>
      {url && <img src={url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      {badge && (
        <span style={{ position: "absolute", top: 6, insetInlineStart: 6, background: "rgba(255,196,0,.85)", color: "#332800", border: 0, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{badge}</span>
      )}
      {canEdit && (
        <button onClick={onAction} style={{ position: "absolute", top: 6, insetInlineEnd: 6, background: "rgba(0,0,0,.6)", color: "#fff", border: 0, borderRadius: 6, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}>{actionLabel}</button>
      )}
    </div>
  );
}

function ProductsPanel({ companyId, products, pendingChanges, canEdit, onChanged, onCancelChange }: {
  companyId: string;
  products: ExhibitionProduct[];
  pendingChanges: ExhibitionChangeRequest[];
  canEdit: boolean;
  onChanged: () => void;
  onCancelChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  const upsertExhibitionProductFn = useServerFn(upsertExhibitionProduct);
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

  // Include rejected requests too (not just pending) so the owner can see
  // a rejection note and retry/dismiss it — not just changes still awaiting
  // review. pendingChanges arrives sorted newest-first (see
  // fetchCompanyChangeRequests), so the first match per product id is its
  // most recent change.
  const productChanges = pendingChanges.filter((cr) => cr.entity_type === "product");
  const byEntityId = new Map<string, ExhibitionChangeRequest>();
  for (const cr of productChanges) {
    if (cr.entity_id && !byEntityId.has(cr.entity_id)) byEntityId.set(cr.entity_id, cr);
  }
  const pendingCreates = productChanges.filter((cr) => cr.action === "create");

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
      {products.length === 0 && pendingCreates.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{t("myCompany.no_products_yet")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {products.map((p) => (
            <OwnedProductRow key={p.id} p={p} pendingChange={byEntityId.get(p.id)} companyId={companyId} canEdit={canEdit} onChange={onChanged} onCancelChange={onCancelChange} />
          ))}
          {pendingCreates.map((cr) => (
            <OwnedProductRow key={cr.id} pendingCreate={cr} companyId={companyId} canEdit={canEdit} onChange={onChanged} onCancelChange={onCancelChange} />
          ))}
        </div>
      )}
    </div>
  );
}

const EMPTY_PRODUCT: ExhibitionProduct = {
  id: "", company_id: "", name: "", name_en: null, description: null, description_en: null,
  image_url: null, video_url: null, catalog_url: null, link_url: null, sort_order: 0,
};

function OwnedProductRow({ p, pendingCreate, pendingChange, companyId, canEdit, onChange, onCancelChange }: {
  p?: ExhibitionProduct;
  pendingCreate?: ExhibitionChangeRequest;
  pendingChange?: ExhibitionChangeRequest;
  companyId: string;
  canEdit: boolean;
  onChange: () => void;
  onCancelChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  const upsertExhibitionProductFn = useServerFn(upsertExhibitionProduct);
  const deleteExhibitionProductFn = useServerFn(deleteExhibitionProduct);
  const base = p ?? { ...EMPTY_PRODUCT, company_id: companyId };
  // A draft (pendingCreate) has no live row at all — pending or rejected,
  // it's still just a draft. An existing product's pendingChange only
  // blocks editing/shows as "in flight" while it's actually pending;
  // rejected leaves the live row untouched and fully editable again (just
  // annotated with the rejection note below).
  const isDraft = !!pendingCreate;
  const isPendingUpdate = pendingChange?.status === "pending" && pendingChange.action === "update";
  const isPendingDelete = pendingChange?.status === "pending" && pendingChange.action === "delete";
  const isRejected = pendingChange?.status === "rejected" || pendingCreate?.status === "rejected";
  const overlay = pendingCreate ? pendingCreate.payload : (isPendingUpdate ? pendingChange!.payload : {});
  const merged = { ...base, ...overlay } as ExhibitionProduct;
  const [form, setForm] = useState(merged);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setForm(merged), [p?.id, pendingCreate?.id, pendingChange?.id]);
  const img = useAssetUrl(form.image_url);
  const vid = useAssetUrl(form.video_url);
  const cat = useAssetUrl(form.catalog_url);
  // A rejected draft can't be resumed (its change_request_id no longer
  // accepts edits — see upsertExhibitionProduct) — the owner must dismiss
  // it and start a fresh "+ Add product" instead, so its fields are
  // read-only until then.
  const readOnly = isPendingDelete || (isDraft && pendingCreate!.status === "rejected");

  // form.id is "" for a not-yet-created product (new draft / pending
  // create) — the server schema validates a *present* id as a uuid, so an
  // empty-string sentinel must never be sent through.
  function buildPayload(f: ExhibitionProduct) {
    const { id, ...rest } = f;
    return isDraft ? { ...rest, change_request_id: pendingCreate!.id } : (id ? { id, ...rest } : rest);
  }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const res = await upsertExhibitionProductFn({ data: buildPayload(form) as any });
      onChange();
      setMsg((res as any)?.pending ? t("myCompany.change_pending_msg") : t("common.saved"));
    } catch (e: any) {
      setMsg(`${t("common.error")}: ${e?.message ?? e}`);
    }
    setBusy(false);
  }

  async function upload(field: "image_url" | "video_url" | "catalog_url", file: File) {
    setBusy(true); setMsg(null);
    try {
      const path = await uploadExhibitionAsset(companyId, file);
      const next = { ...form, [field]: path };
      setForm(next);
      const res = await upsertExhibitionProductFn({ data: buildPayload(next) as any });
      onChange();
      if ((res as any)?.pending) setMsg(t("myCompany.change_pending_msg"));
    } catch (e: any) {
      setMsg(`${t("common.error")}: ${e?.message ?? e}`);
    }
    setBusy(false);
  }

  async function remove() {
    if (isDraft) { onCancelChange(pendingCreate!.id); return; }
    if (isPendingDelete) { onCancelChange(pendingChange!.id); return; }
    if (!confirm(t("myCompany.confirm_delete_product"))) return;
    try {
      const res = await deleteExhibitionProductFn({ data: { id: p!.id } });
      onChange();
      if ((res as any)?.pending) setMsg(t("myCompany.change_pending_msg"));
    } catch (e: any) {
      setMsg(`${t("common.error")}: ${e?.message ?? e}`);
    }
  }

  const badge = isDraft
    ? (pendingCreate!.status === "pending" ? t("myCompany.pending_new_product_badge") : t("myCompany.rejected_change_badge"))
    : isPendingDelete
      ? t("myCompany.pending_delete_badge")
      : isPendingUpdate
        ? t("myCompany.pending_change_badge")
        : pendingChange?.status === "rejected"
          ? t("myCompany.rejected_change_badge")
          : undefined;
  const rejectionNote = pendingChange?.status === "rejected" ? pendingChange.rejection_note
    : pendingCreate?.status === "rejected" ? pendingCreate.rejection_note
    : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 12, padding: 10, background: "var(--panel-2)", borderRadius: 8 }}>
      <div>
        <div style={{ width: 140, height: 105, background: "var(--panel)", borderRadius: 8, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6, border: "1px solid var(--stroke)" }}>
          {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{t("myCompany.product_main_image")}</span>}
        </div>
        {canEdit && !readOnly && (
          <label className="btn btn-ghost" style={{ width: 140, fontSize: 11, padding: "4px 6px", cursor: "pointer", display: "flex", justifyContent: "center", marginBottom: 4 }}>
            {t("myCompany.product_main_image")}
            <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload("image_url", f); e.target.value = ""; }} />
          </label>
        )}
        {vid && <video src={vid} controls style={{ width: 140, borderRadius: 6, marginBottom: 4 }} />}
        {canEdit && !readOnly && (
          <label className="btn btn-ghost" style={{ width: 140, fontSize: 11, padding: "4px 6px", cursor: "pointer", display: "flex", justifyContent: "center", marginBottom: 4 }}>
            {form.video_url ? t("myCompany.replace_video") : t("myCompany.product_video")}
            <input type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload("video_url", f); e.target.value = ""; }} />
          </label>
        )}
        {cat && (
          <a href={cat} target="_blank" rel="noopener" className="btn btn-ghost" style={{ width: 140, fontSize: 11, padding: "4px 6px", display: "flex", justifyContent: "center", marginBottom: 4 }}>
            {t("myCompany.view_catalog_short")}
          </a>
        )}
        {canEdit && !readOnly && (
          <label className="btn btn-ghost" style={{ width: 140, fontSize: 11, padding: "4px 6px", cursor: "pointer", display: "flex", justifyContent: "center" }}>
            {form.catalog_url ? t("myCompany.replace_catalog") : t("myCompany.product_catalog")}
            <input type="file" accept=".pdf,application/pdf,.doc,.docx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload("catalog_url", f); e.target.value = ""; }} />
          </label>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {badge && (
          <span style={{
            alignSelf: "flex-start", fontSize: 10, padding: "1px 8px", borderRadius: 999, fontWeight: 700,
            background: isRejected ? "rgba(220,80,80,.15)" : "rgba(255,196,0,.15)",
            color: isRejected ? "#e05a5a" : "#e0b400",
          }}>{badge}</span>
        )}
        <input disabled={!canEdit || readOnly} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("myCompany.product_name_placeholder")} style={inp} />
        <input disabled={!canEdit || readOnly} value={form.name_en ?? ""} onChange={(e) => setForm({ ...form, name_en: e.target.value })} placeholder={t("myCompany.product_name_en_placeholder")} style={{ ...inp, direction: "ltr", textAlign: "left" }} />
        <textarea disabled={!canEdit || readOnly} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("myCompany.product_desc_placeholder")} rows={3} style={{ ...inp, resize: "vertical" }} />
        <textarea disabled={!canEdit || readOnly} value={form.description_en ?? ""} onChange={(e) => setForm({ ...form, description_en: e.target.value })} placeholder={t("myCompany.product_desc_en_placeholder")} rows={3} style={{ ...inp, resize: "vertical", direction: "ltr", textAlign: "left" }} />
        <input disabled={!canEdit || readOnly} value={form.link_url ?? ""} onChange={(e) => setForm({ ...form, link_url: e.target.value })} placeholder={t("myCompany.product_link_placeholder")} style={inp} />
        {rejectionNote && (
          <div style={{ fontSize: 12, color: "var(--ink-soft)" }}><b>{t("myCompany.admin_note")}:</b> {rejectionNote}</div>
        )}
        {canEdit && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {!readOnly && <button className="btn btn-primary" onClick={save} disabled={busy} style={{ fontSize: 12 }}>{t("myCompany.save")}</button>}
            <button className="btn btn-ghost" onClick={remove} style={{ fontSize: 12, color: "#c33" }}>
              {isDraft || isPendingDelete ? t("myCompany.cancel_pending_change") : t("myCompany.delete")}
            </button>
            {msg && <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{msg}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function F({ label, children, full, badge }: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
  badge?: { text: string; kind: "pending" | "rejected" };
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: full ? "1 / -1" : undefined, fontSize: 13 }}>
      <span style={{ color: "var(--ink-soft)", display: "flex", gap: 6, alignItems: "center" }}>
        {label}
        {badge && (
          <span style={{
            fontSize: 10, padding: "1px 6px", borderRadius: 999, fontWeight: 700,
            background: badge.kind === "pending" ? "rgba(255,196,0,.15)" : "rgba(220,80,80,.15)",
            color: badge.kind === "pending" ? "#e0b400" : "#e05a5a",
          }}>{badge.text}</span>
        )}
      </span>
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
