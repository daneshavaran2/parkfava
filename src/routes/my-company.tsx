import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

export const Route = createFileRoute("/my-company")({
  head: () => ({ meta: [{ title: "شرکت من — نمایشگاه فاوا" }] }),
  component: MyCompanyPage,
});

function MyCompanyPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [checking, setChecking] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [notAssigned, setNotAssigned] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { navigate({ to: "/auth", search: { next: "/my-company" } as any }); return; }
      const mine = await fetchMyCompany();
      if (!mine) { setNotAssigned(true); setChecking(false); return; }
      setCompanyId(mine.company_id);
      setChecking(false);
    })();
  }, [navigate]);

  if (checking) {
    return <div className="view"><div className="shell" style={{ padding: 40 }}>در حال بارگذاری…</div></div>;
  }
  if (notAssigned) {
    return (
      <div className="view"><div className="shell" style={{ padding: 40, maxWidth: 560 }}>
        <h2 className="h2">حساب شما هنوز به شرکتی تخصیص نیافته است</h2>
        <p className="lead" style={{ marginTop: 8 }}>
          برای ویرایش پروفایل شرکت، لازم است ادمین شبکه، حساب شما را به‌عنوان نماینده‌ی یک شرکت تخصیص دهد.
          لطفاً با تیم مدیریت نمایشگاه تماس بگیرید و شناسه‌ی زیر را ارسال کنید:
        </p>
        <code style={{ display: "inline-block", marginTop: 12, background: "var(--panel-2)", padding: "8px 10px", borderRadius: 6, fontSize: 13 }}>
          {/* user id shown for admin lookup */}
        </code>
        <div style={{ marginTop: 20, display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>خروج</button>
        </div>
      </div></div>
    );
  }
  if (!companyId) return null;

  return <OwnerEditor companyId={companyId} onSignOut={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }} qc={qc} />;
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
      setMsg("برای بررسی ارسال شد. منتظر تایید ادمین بمانید."); invalidate();
    } catch (e: any) {
      setMsg("خطا: " + (e?.message ?? e));
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
      invalidate(); setMsg("لوگو بارگذاری شد ✓");
    } catch (e: any) { setMsg("خطا: " + (e.message ?? e)); }
    setBusy(false);
  }

  async function onAddImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    try {
      const path = await uploadExhibitionAsset(companyId, file);
      await addExhibitionImageFn({ data: { company_id: companyId, image_url: path } });
      invalidate();
    } catch (e: any) { setMsg("خطا: " + (e.message ?? e)); }
    setBusy(false); e.target.value = "";
  }

  async function removeImage(id: string) {
    if (!confirm("حذف این تصویر؟")) return;
    await deleteExhibitionImageFn({ data: { id } }); invalidate();
  }

  if (isLoading) return <div className="view"><div className="shell" style={{ padding: 40 }}>در حال بارگذاری…</div></div>;

  return (
    <div className="view">
      <div className="shell" style={{ padding: "20px 16px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <span className="eyebrow">داشبورد صاحب شرکت</span>
            <h2 className="h2" style={{ fontSize: 24 }}>{form.name || companyId}</h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link to="/exhibition" className="btn btn-ghost">نمایشگاه</Link>
            <button className="btn btn-ghost" onClick={onSignOut}>خروج</button>
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
                {logoUrl ? <img src={logoUrl} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>لوگو</span>}
              </div>
              {canEdit && (
                <label className="btn btn-ghost" style={{ marginTop: 8, fontSize: 12, cursor: "pointer", display: "block", textAlign: "center" }}>
                  بارگذاری لوگو
                  <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                </label>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <F label="نام" full><input disabled={!canEdit} style={inp} value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></F>
              <F label="دسته"><input disabled={!canEdit} style={inp} value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })} /></F>
              <F label="شهر"><input disabled={!canEdit} style={inp} value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} /></F>
              <F label="شعار" full><input disabled={!canEdit} style={inp} value={form.tagline ?? ""} onChange={(e) => setForm({ ...form, tagline: e.target.value })} /></F>
              <F label="توضیح" full><textarea disabled={!canEdit} rows={4} style={{ ...inp, resize: "vertical" }} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></F>
              <F label="وب‌سایت"><input disabled={!canEdit} style={inp} value={form.website ?? ""} onChange={(e) => setForm({ ...form, website: e.target.value })} /></F>
              <F label="ایمیل"><input disabled={!canEdit} style={inp} value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></F>
              <F label="تلفن"><input disabled={!canEdit} style={inp} value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></F>
              <F label="آدرس"><input disabled={!canEdit} style={inp} value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></F>
              <F label="عرض جغرافیایی (Latitude)">
                <input disabled={!canEdit} dir="ltr" inputMode="decimal" placeholder="35.6892"
                  style={{ ...inp, borderColor: latErr ? "#ff7676" : undefined }}
                  value={latRaw} onChange={(e) => onLatChange(e.target.value)}
                  aria-invalid={!!latErr} data-testid="mycompany-lat-input" />
                {latErr && <div role="alert" style={{ color: "#ff7676", fontSize: 12, marginTop: 4 }}>{latErr}</div>}
              </F>
              <F label="طول جغرافیایی (Longitude)">
                <input disabled={!canEdit} dir="ltr" inputMode="decimal" placeholder="51.3890"
                  style={{ ...inp, borderColor: lngErr ? "#ff7676" : undefined }}
                  value={lngRaw} onChange={(e) => onLngChange(e.target.value)}
                  aria-invalid={!!lngErr} data-testid="mycompany-lng-input" />
                {lngErr && <div role="alert" style={{ color: "#ff7676", fontSize: 12, marginTop: 4 }}>{lngErr}</div>}
              </F>
              <F label="چسباندن لینک گوگل/نشان" full>
                <input disabled={!canEdit} dir="ltr" style={inp} placeholder="https://maps.google.com/…  یا  https://neshan.org/…"
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
            <button className="btn btn-primary" onClick={save} disabled={!canEdit || busy}>ذخیره تغییرات</button>
            {(status === "draft" || status === "rejected") && (
              <button className="btn btn-primary" onClick={submitReview} disabled={busy} style={{ background: "var(--accent-glow)" }}>ارسال برای بررسی</button>
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
  const cfg = {
    draft: { bg: "rgba(120,130,140,.12)", stroke: "rgba(120,130,140,.3)", label: "پیش‌نویس", text: "اطلاعات را کامل کنید و برای بررسی ارسال کنید." },
    pending: { bg: "rgba(255,196,0,.10)", stroke: "rgba(255,196,0,.35)", label: "در انتظار تایید", text: "ارسال شد. تا زمان تایید ادمین در نمایشگاه دیده نمی‌شوید." },
    approved: { bg: "rgba(70,200,120,.10)", stroke: "rgba(70,200,120,.35)", label: "تاییدشده و منتشرشده", text: "شرکت شما در نمایشگاه دیده می‌شود. ویرایش نیازمند بازبینی مجدد نیست." },
    rejected: { bg: "rgba(220,80,80,.10)", stroke: "rgba(220,80,80,.35)", label: "رد شده", text: "درخواست شما رد شد. پس از اصلاح، دوباره ارسال کنید." },
  } as const;
  const c = (cfg as any)[status] ?? cfg.draft;
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.stroke}`, borderRadius: 12, padding: "12px 16px" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>وضعیت: {c.label}</div>
      <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{c.text}</div>
      {status === "rejected" && note && (
        <div style={{ marginTop: 8, fontSize: 13 }}><b>یادداشت ادمین:</b> {note}</div>
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
  return (
    <div className="panel" style={{ padding: 20, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>تصاویر گالری</h3>
        {canEdit && (
          <label className="btn btn-ghost" style={{ fontSize: 12, cursor: "pointer" }}>
            افزودن تصویر
            <input type="file" accept="image/*" hidden onChange={onAdd} />
          </label>
        )}
      </div>
      {images.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>هنوز تصویری اضافه نشده.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 10 }}>
          {images.map((im) => <ImageThumb key={im.id} imageUrl={im.image_url} canEdit={canEdit} onRemove={() => onRemove(im.id)} />)}
        </div>
      )}
    </div>
  );
}

function ImageThumb({ imageUrl, canEdit, onRemove }: { imageUrl: string; canEdit: boolean; onRemove: () => void }) {
  const url = useAssetUrl(imageUrl);
  return (
    <div style={{ position: "relative", aspectRatio: "4/3", borderRadius: 10, overflow: "hidden", background: "var(--panel-2)", border: "1px solid var(--stroke)" }}>
      {url && <img src={url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      {canEdit && (
        <button onClick={onRemove} style={{ position: "absolute", top: 6, insetInlineEnd: 6, background: "rgba(0,0,0,.6)", color: "#fff", border: 0, borderRadius: 6, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}>حذف</button>
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
    if (!confirm("حذف این محصول؟")) return;
    await deleteExhibitionProductFn({ data: { id } }); onChanged();
  }

  return (
    <div className="panel" style={{ padding: 20, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>محصولات</h3>
        {canEdit && !creating && <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setCreating(true)}>+ افزودن محصول</button>}
      </div>
      {creating && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto auto", gap: 8, marginBottom: 12 }}>
          <input placeholder="نام محصول" value={name} onChange={(e) => setName(e.target.value)} style={inp} />
          <input placeholder="توضیح کوتاه" value={desc} onChange={(e) => setDesc(e.target.value)} style={inp} />
          <button className="btn btn-primary" onClick={create} disabled={busy}>ثبت</button>
          <button className="btn btn-ghost" onClick={() => setCreating(false)}>انصراف</button>
        </div>
      )}
      {products.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>هنوز محصولی اضافه نشده.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {products.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 10, background: "var(--panel-2)", borderRadius: 8 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                {p.description && <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{p.description}</div>}
              </div>
              {canEdit && <button className="btn btn-ghost" onClick={() => remove(p.id)} style={{ fontSize: 12, color: "#c33" }}>حذف</button>}
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
