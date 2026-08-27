import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fetchAboutSections, type AboutSection } from "@/lib/exhibition-api";
import { useAssetUrl } from "@/lib/use-auth";
import { renderRichText } from "@/components/fava/primitives";
import { tHead } from "@/i18n/head";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: tHead("meta.about_title") },
      { name: "description", content: tHead("meta.about_desc") },
      { property: "og:title", content: tHead("meta.about_og_title") },
      { property: "og:description", content: tHead("meta.about_og_desc") },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  const { t } = useTranslation();
  const { data: sections = [] } = useQuery({
    queryKey: ["about-public"],
    queryFn: fetchAboutSections,
    staleTime: 30_000,
  });

  const active = sections.filter((s) => s.is_active);

  return (
    <>
      <div className="view">
        <div className="shell" style={{ paddingTop: 32, paddingBottom: 64 }}>
          <section style={{ marginBottom: 32 }}>
            <span className="eyebrow">{t("about.eyebrow")}</span>
            <h1 className="h1">{t("about.title")}</h1>
            <p className="lead" style={{ maxWidth: 720 }}>
              {t("about.lead")}
            </p>
          </section>

          {active.length === 0 ? (
            <DefaultAbout />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {active.map((s) => <SectionView key={s.id} s={s} />)}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SectionView({ s }: { s: AboutSection }) {
  const { i18n } = useTranslation();
  const img = useAssetUrl(s.image_url);
  const vid = useAssetUrl(s.video_url);
  const vid2 = useAssetUrl(s.video_url_2);
  const hasMedia = !!(img || vid || vid2);
  // English falls back to the Persian value when no translation has been
  // entered yet, same convention as pickLocalized() in components/fava —
  // so a section still shows something instead of going blank in English.
  const isEn = i18n.language === "en";
  const title = (isEn && s.title_en) || s.title;
  const body = (isEn && s.body_en) || s.body;
  return (
    <div
      className="panel about-section"
      style={{
        padding: 24,
        borderRadius: 16,
        display: "grid",
        gridTemplateColumns: hasMedia ? "minmax(0,1fr) minmax(0,1fr)" : "1fr",
        gap: 24,
        alignItems: "start",
      }}
    >
      <div>
        {title && <h2 className="h2" style={{ marginTop: 0 }}>{title}</h2>}
        {body && (
          <div
            className="lead"
            style={{ marginTop: 12, whiteSpace: "pre-wrap", lineHeight: 1.9, textAlign: "justify" }}
          >
            {renderRichText(body)}
          </div>
        )}
      </div>
      {hasMedia && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {vid && (
            <video src={vid} controls style={{ width: "100%", borderRadius: 12, background: "#000" }} />
          )}
          {vid2 && (
            <video src={vid2} controls style={{ width: "100%", borderRadius: 12, background: "#000" }} />
          )}
          {img && (
            // Fixed aspect ratio + object-fit: cover so every section's
            // image occupies the same-size frame regardless of the
            // uploaded file's own dimensions — otherwise a portrait photo
            // next to a wide one made each section a different height.
            <div style={{ aspectRatio: "16 / 9", borderRadius: 12, overflow: "hidden", background: "var(--panel-2)" }}>
              <img src={img} alt={title ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
          )}
        </div>
      )}
      <style>{`
        @media (max-width: 820px) {
          .about-section { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function DefaultAbout() {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
        gap: 28,
        alignItems: "stretch",
      }}
      className="about-grid"
    >
      <div className="panel" style={{ padding: 24, borderRadius: 16 }}>
        <h2 className="h2" style={{ marginTop: 0 }}>{t("about.overview_title")}</h2>
        <p className="lead" style={{ marginTop: 12 }}>
          {t("about.no_content")}
        </p>
      </div>
      <div
        className="panel"
        style={{
          padding: 0, borderRadius: 16, overflow: "hidden",
          aspectRatio: "9 / 16", minHeight: 420, background: "#000",
          display: "grid", placeItems: "center", color: "#fff", textAlign: "center",
        }}
      >
        <div style={{ padding: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{t("about.avatar_title")}</div>
          <div style={{ opacity: 0.8, fontSize: 14 }}>{t("about.coming_soon")}</div>
        </div>
      </div>
      <style>{`@media (max-width: 820px) { .about-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
