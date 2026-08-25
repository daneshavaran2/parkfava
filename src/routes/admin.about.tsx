import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, useAssetUrl } from "@/lib/use-auth";
import {
  fetchAboutSections,
  upsertAboutSection,
  deleteAboutSection,
  uploadAboutAsset,
  type AboutSection,
} from "@/lib/exhibition-api";
import { signOutFn } from "@/lib/auth.functions";
import { tHead } from "@/i18n/head";

export const Route = createFileRoute("/admin/about")({
  head: () => ({ meta: [{ title: tHead("meta.admin_about_title") }] }),
  component: AdminAboutPage,
});

function AdminAboutPage() {
  const { t } = useTranslation();
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { next: "/admin/about" } });
  }, [user, loading, navigate]);

  const { data: sections = [] } = useQuery({
    queryKey: ["admin-about"],
    queryFn: fetchAboutSections,
    enabled: !!user && isAdmin,
  });

  if (loading) return <div className="view"><div className="shell" style={{ padding: 40 }}>{t("common.loading")}</div></div>;
  if (!user) return null;
  if (!isAdmin) {
    return (
      <div className="view"><div className="shell" style={{ padding: 40 }}>
        <h2 className="h2">{t("adminExhibition.no_admin_access_title")}</h2>
      </div></div>
    );
  }

  async function addSection() {
    const key = prompt(t("adminAbout.prompt_section_key"));
    if (!key) return;
    await upsertAboutSection({ section_key: key, title: "", body: "", sort_order: sections.length });
    qc.invalidateQueries({ queryKey: ["admin-about"] });
    qc.invalidateQueries({ queryKey: ["about-public"] });
  }

  return (
    <div className="view">
      <div className="shell" style={{ padding: "20px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <span className="eyebrow">Admin</span>
            <h2 className="h2" style={{ fontSize: 24 }}>{t("adminAbout.manage_title")}</h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link to="/about" className="btn btn-ghost">{t("adminAbout.view_page")}</Link>
            <Link to="/admin/parks" className="btn btn-ghost">{t("adminAbout.parks_link")}</Link>
            <Link to="/admin/exhibition" className="btn btn-ghost">{t("adminAbout.exhibition_link")}</Link>
            <button className="btn btn-primary" onClick={addSection}>{t("adminAbout.add_section")}</button>
            <button className="btn btn-ghost" onClick={async () => { await signOutFn(); navigate({ to: "/auth", search: { next: "" } }); }}>{t("common.logout")}</button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {sections.map((s) => <SectionEditor key={s.id} section={s} />)}
          {!sections.length && (
            <div className="panel" style={{ padding: 24, color: "var(--ink-soft)" }}>
              {t("adminAbout.no_sections_yet")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionEditor({ section }: { section: AboutSection }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<AboutSection>(section);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { setForm(section); }, [section]);
  const imgUrl = useAssetUrl(form.image_url);
  const videoSrc = useAssetUrl(form.video_url);
  const videoSrc2 = useAssetUrl(form.video_url_2);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await upsertAboutSection(form);
      setMsg(t("common.saved"));
      qc.invalidateQueries({ queryKey: ["admin-about"] });
      qc.invalidateQueries({ queryKey: ["about-public"] });
    } catch (e: any) {
      setMsg(`${t("common.error")}: ${e?.message ?? e}`);
    }
    setBusy(false);
  }

  async function upload(kind: "image" | "video" | "video2", e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    try {
      const path = await uploadAboutAsset(file);
      const key = kind === "image" ? "image_url" : kind === "video" ? "video_url" : "video_url_2";
      const next = { ...form, [key]: path };
      setForm(next);
      await upsertAboutSection(next);
      qc.invalidateQueries({ queryKey: ["admin-about"] });
      qc.invalidateQueries({ queryKey: ["about-public"] });
      setMsg(t("adminAbout.uploaded"));
    } catch (e: any) { setMsg(`${t("common.error")}: ${e.message ?? e}`); }
    setBusy(false); e.target.value = "";
  }

  async function remove() {
    if (!confirm(t("adminAbout.confirm_delete_section"))) return;
    await deleteAboutSection(section.id);
    qc.invalidateQueries({ queryKey: ["admin-about"] });
    qc.invalidateQueries({ queryKey: ["about-public"] });
  }

  return (
    <div className="panel" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <span className="eyebrow">{form.section_key}</span>
          <h3 style={{ marginTop: 4 }}>{form.title || t("adminAbout.untitled")}</h3>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="number"
            value={form.sort_order}
            onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })}
            style={{ ...field, width: 80 }}
            title={t("adminAbout.sort_order_title")}
          />
          <label style={{ fontSize: 13, color: "var(--ink-soft)", display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            {t("adminAbout.active")}
          </label>
          <button className="btn btn-ghost" onClick={remove} style={{ fontSize: 12 }}>{t("adminAbout.delete_section")}</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            value={form.section_key}
            onChange={(e) => setForm({ ...form, section_key: e.target.value })}
            placeholder={t("adminAbout.section_key_placeholder")}
            style={field}
          />
          <input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("adminAbout.section_title_placeholder")} style={field} />
          <textarea value={form.body ?? ""} onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder={t("adminAbout.body_placeholder")} rows={8}
            style={{ ...field, resize: "vertical", fontFamily: "inherit" }} />
          <input value={form.title_en ?? ""} onChange={(e) => setForm({ ...form, title_en: e.target.value })}
            placeholder={t("adminAbout.section_title_en_placeholder")} style={{ ...field, direction: "ltr", textAlign: "left" }} />
          <textarea value={form.body_en ?? ""} onChange={(e) => setForm({ ...form, body_en: e.target.value })}
            placeholder={t("adminAbout.body_en_placeholder")} rows={8}
            style={{ ...field, resize: "vertical", fontFamily: "inherit", direction: "ltr", textAlign: "left" }} />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn btn-primary" onClick={save} disabled={busy}>{t("adminAbout.save")}</button>
            {msg && <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>{msg}</span>}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>{t("adminAbout.section_image")}</div>
            <div style={{ aspectRatio: "16/9", borderRadius: 10, background: "var(--panel-2)", border: "1px solid var(--stroke)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {imgUrl ? <img src={imgUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{t("adminAbout.no_image")}</span>}
            </div>
            <label className="btn btn-ghost" style={{ marginTop: 6, fontSize: 12, cursor: "pointer", display: "block", textAlign: "center" }}>
              {t("adminAbout.upload_image")}
              <input type="file" accept="image/*" onChange={(e) => upload("image", e)} style={{ display: "none" }} />
            </label>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>{t("adminAbout.video_1")}</div>
            <div style={{ aspectRatio: "16/9", borderRadius: 10, background: "var(--panel-2)", border: "1px solid var(--stroke)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {videoSrc ? <video src={videoSrc} controls style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{t("adminAbout.no_video")}</span>}
            </div>
            <label className="btn btn-ghost" style={{ marginTop: 6, fontSize: 12, cursor: "pointer", display: "block", textAlign: "center" }}>
              {form.video_url ? t("adminAbout.replace_video_1") : t("adminAbout.upload_video_1")}
              <input type="file" accept="video/*" onChange={(e) => upload("video", e)} style={{ display: "none" }} />
            </label>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>{t("adminAbout.video_2")}</div>
            <div style={{ aspectRatio: "16/9", borderRadius: 10, background: "var(--panel-2)", border: "1px solid var(--stroke)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {videoSrc2 ? <video src={videoSrc2} controls style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{t("adminAbout.no_video")}</span>}
            </div>
            <label className="btn btn-ghost" style={{ marginTop: 6, fontSize: 12, cursor: "pointer", display: "block", textAlign: "center" }}>
              {form.video_url_2 ? t("adminAbout.replace_video_2") : t("adminAbout.upload_video_2")}
              <input type="file" accept="video/*" onChange={(e) => upload("video2", e)} style={{ display: "none" }} />
            </label>
          </div>
        </div>
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
