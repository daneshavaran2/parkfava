import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchAboutSections, type AboutSection } from "@/lib/exhibition-api";
import { useAssetUrl } from "@/lib/use-auth";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "درباره اطلس — شبکه فناوری فاوا" },
      { name: "description", content: "معرفی اطلس، سکوی هوشمند شبکه ملی پارک‌های فناوری ایران، با میزبانی آواتار تعاملی مصطفی مافی." },
      { property: "og:title", content: "درباره اطلس" },
      { property: "og:description", content: "معرفی اطلس و آواتار تعاملی مصطفی مافی." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
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
            <span className="eyebrow">معرفی</span>
            <h1 className="h1">درباره اطلس</h1>
            <p className="lead" style={{ maxWidth: 720 }}>
              اطلس، سکوی هوشمند شبکه ملی پارک‌های فناوری ایران است.
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
  const img = useAssetUrl(s.image_url);
  const vid = useAssetUrl(s.video_url);
  const vid2 = useAssetUrl(s.video_url_2);
  const hasMedia = !!(img || vid || vid2);
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
        {s.title && <h2 className="h2" style={{ marginTop: 0 }}>{s.title}</h2>}
        {s.body && (
          <div className="lead" style={{ marginTop: 12, whiteSpace: "pre-wrap", lineHeight: 1.9 }}>
            {s.body}
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
            <img src={img} alt={s.title ?? ""} style={{ width: "100%", borderRadius: 12, display: "block" }} />
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
        <h2 className="h2" style={{ marginTop: 0 }}>اطلس در یک نگاه</h2>
        <p className="lead" style={{ marginTop: 12 }}>
          محتوای این صفحه هنوز توسط ادمین بارگذاری نشده است.
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
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>آواتار تعاملی مصطفی مافی</div>
          <div style={{ opacity: 0.8, fontSize: 14 }}>به‌زودی.</div>
        </div>
      </div>
      <style>{`@media (max-width: 820px) { .about-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
