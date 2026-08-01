// @ts-nocheck
/* FAVA views — ported from views.jsx, adapted to TanStack navigation. */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import logoSpin from "@/assets/logo-spin.webp";

import {
  Icon, HeroOrb, AICommandBar, QRCode,
  useCountUp, useTilt,
  toFa, faNum, faMoney, colorVar, glowVar, CAT_ICON, catTitle, catDesc, pickName,
} from "./primitives";
import { ClientOnly, useFavaReady } from "./ClientOnly";
import { fetchParkContent } from "@/lib/park-content-api";
import { fetchExhibitionCompanies } from "@/lib/exhibition-api";
import { useAuth, useAssetUrl } from "@/lib/use-auth";
import { buildCompanyLocationUrl, buildGoogleMapsDirectionsUrl, buildNeshanUrl, coordinatesMatch, parseLatLng } from "@/lib/geo";

const F = () => (typeof window !== "undefined" ? window.FAVA : null);

const LazyCompanyMap = lazy(() => import("./CompanyMap").then((m) => ({ default: m.CompanyMap })));

function DirectionsPanel({ lat, lng, accent, name, address, zoom }: { lat: number; lng: number; accent: string; name?: string | null; address?: string | null; zoom?: number | null }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [highlighted, setHighlighted] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const neshan = buildNeshanUrl(lat, lng);
  const gmaps = buildGoogleMapsDirectionsUrl(lat, lng);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const qLat = parseLatLng(params.get("lat") ?? "", "lat");
    const qLng = parseLatLng(params.get("lng") ?? "", "lng");
    if (qLat.ok && qLat.value != null && qLng.ok && qLng.value != null && coordinatesMatch(lat, lng, qLat.value, qLng.value)) {
      setHighlighted(true);
      window.setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
      const timer = window.setTimeout(() => setHighlighted(false), 2800);
      return () => window.clearTimeout(timer);
    }
  }, [lat, lng]);
  async function copyLink() {
    try {
      const url = buildCompanyLocationUrl(`${window.location.origin}${window.location.pathname}`, lat, lng);
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  return (
    <div ref={panelRef} className={"panel directions-panel" + (highlighted ? " directions-panel-highlight" : "")} data-testid="directions-panel">
      <h3><Icon name="pin" size={18} className="pi" /> {t("company.directions")}</h3>
      {highlighted && <div role="status" className="location-highlight-note">{t("company.location_link_opened")}</div>}
      <ClientOnly fallback={<div className="company-map company-map-skeleton" />}>
        <Suspense fallback={<div className="company-map company-map-skeleton" />}>
          <LazyCompanyMap lat={lat} lng={lng} zoom={zoom} title={name} address={address} />
        </Suspense>
      </ClientOnly>
      <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10, fontFamily: "var(--mono)", direction: "ltr" }}>
        {lat.toFixed(5)}, {lng.toFixed(5)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <a className="btn btn-primary" style={{ ["--accent" as any]: accent }}
           href={neshan} target="_blank" rel="noopener"
           data-testid="btn-neshan" data-href={neshan}>
          <Icon name="pin" size={16} /> {t("company.open_neshan")}
        </a>
        <a className="btn btn-ghost" href={gmaps} target="_blank" rel="noopener"
           data-testid="btn-gmaps" data-href={gmaps}>
          <Icon name="globe" size={16} /> {t("company.open_gmaps")}
        </a>
        <button type="button" className="btn btn-ghost" onClick={copyLink}
                data-testid="btn-copy-loc">
          {copied ? t("company.copied") : t("company.copy_location_link")}
        </button>
      </div>
    </div>
  );
}


/* ===================== NAV ===================== */
export function Nav({ view, query, setQuery, theme, toggleTheme }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { isAdmin, session, user } = useAuth();
  const links = [
    { id: "home", to: "/", label: t("nav.home"), icon: "spark" },
    { id: "exhibition", to: "/exhibition", label: t("nav.exhibition"), icon: "store" },
    { id: "parks", to: "/parks", label: t("nav.parks"), icon: "map" },
    { id: "categories", to: "/categories", label: t("nav.categories"), icon: "layers" },
    { id: "about", to: "/about", label: t("nav.about"), icon: "spark" },
    ...(isAdmin ? [
      { id: "admin", to: "/admin/parks", label: t("nav.admin_parks"), icon: "chip" },
      { id: "admin-exh", to: "/admin/exhibition", label: t("nav.admin_exhibition"), icon: "store" },
      { id: "admin-users", to: "/admin/users", label: t("nav.admin_users"), icon: "spark" },
      { id: "admin-about", to: "/admin/about", label: t("nav.admin_about"), icon: "spark" },
    ] : (session ? [
      { id: "my-company", to: "/my-company", label: t("nav.my_company"), icon: "store" },
    ] : [])),
  ];
  const active = view === "company" ? "exhibition" : view;
  // Admins get 4 extra links (9 total) — that never fits in a single row at
  // any realistic screen width (measured ~2000px needed), so always collapse
  // to the hamburger menu instead of trying to cram it in. Regular/owner nav
  // (5-6 links) still uses the width-based breakpoints in styles.css.
  const manyLinks = links.length > 6;
  return (
    <nav className="nav">
      <div className={"nav-inner" + (manyLinks ? " nav-inner--many-links" : "")}>
        <Link to="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
          <img
            src={logoSpin}
            alt={t("nav.brand")}
            style={{ display: "block", width: "clamp(32px, 8vw, 40px)", height: "clamp(32px, 8vw, 40px)", aspectRatio: "1 / 1", objectFit: "contain" }}
          />
          <div className="word"><b>{t("nav.brand")}</b></div>
        </Link>
        <div className={"nav-links" + (open ? " open" : "")}>
          {links.map((l) => (
            <Link key={l.id} to={l.to} className={"nav-link" + (active === l.id ? " active" : "")}
              onClick={() => setOpen(false)} style={{ textDecoration: "none", color: "inherit" }}>
              {active === l.id ? <span className="dot" /> : <Icon name={l.icon} size={17} />}
              {l.label}
            </Link>
          ))}
        </div>
        <div className="nav-spacer" />
        <div className="nav-search">
          <Icon name="search" size={17} />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (view !== "exhibition") navigate({ to: "/exhibition", search: { q: e.target.value } as any });
            }}
            placeholder={t("common.search_placeholder")}
            aria-label={t("common.search")}
          />
        </div>
        <LanguageSwitcher />
        <button className="theme-btn" onClick={toggleTheme} title={theme === "dark" ? t("common.theme_day") : t("common.theme_night")} aria-label={t("common.toggle_theme")}>
          <Icon name={theme === "dark" ? "sun" : "moon"} size={19} />
        </button>
        {session ? (
          <button className="btn btn-ghost" style={{ padding: "6px 10px" }}
            onClick={async () => { const { supabase } = await import("@/integrations/supabase/client"); await supabase.auth.signOut(); navigate({ to: "/" }); }}
            title={user?.email ?? ""}>
            {t("common.logout")}
          </button>
        ) : (
          <Link to="/auth" className="btn btn-primary" style={{ padding: "6px 10px" }}>{t("common.login")}</Link>
        )}
        <button className="nav-toggle" onClick={() => setOpen((o) => !o)} aria-label={t("common.menu")}><Icon name={open ? "close" : "menu"} /></button>
      </div>
    </nav>
  );
}

/* ===================== HOME ===================== */
export function Home() {
  useFavaReady(); // kick off vendor load in background; does NOT gate render
  const navigate = useNavigate();
  const { t } = useTranslation();
  function askAI(q) { navigate({ to: "/exhibition", search: { q } as any }); }
  return (
    <div className="view home-view">
      <div className="shell">
        <section className="hero">
          <div className="hero-grid">
            <div>
              <span className="eyebrow">{t("home.eyebrow")}</span>
              <h1 className="h1">{t("home.title_a")} <span className="grad">{t("home.title_grad")}</span> {t("home.title_b")}</h1>
              <p className="lead">{t("home.lead")}</p>
              <AICommandBar onAsk={askAI} />
            </div>
            <HeroOrb />
          </div>
        </section>
      </div>
    </div>
  );
}


function HomeFallback() {
  const { t } = useTranslation();
  return <div className="view"><div className="shell"><p className="lead" style={{ padding: 40 }}>{t("common.loading")}</p></div></div>;
}

function StatNum({ s }) {
  const [val, ref] = useCountUp(s.n);
  const display = s.fmt === "money" ? faMoney(val) + " ت" : faNum(Math.round(val));
  return (
    <div ref={ref} className="sb-item" style={{ "--accent": colorVar(s.c), "--accent-glow": glowVar(s.c) }}>
      <span className="sb-dot" />
      <div className="sb-text">
        <div className="sb-v num">{display}</div>
        <div className="sb-l">{s.l}</div>
      </div>
    </div>
  );
}
function StatBar({ stats }) {
  return <div className="stat-bar">{stats.map((s, i) => <StatNum key={i} s={s} />)}</div>;
}

function Portal({ p }) {
  const tilt = useTilt(9);
  return (
    <Link to={p.to} className="portal tilt" style={{ "--pc": colorVar(p.c), textDecoration: "none", color: "inherit" }} {...tilt}>
      <span className="glow" />
      <div className="pico"><Icon name={p.icon} size={24} /></div>
      <h3>{p.t}</h3>
      <p>{p.d}</p>
      <div className="go">{p.go} <Icon name="arrowL" size={15} /></div>
    </Link>
  );
}

/* ===================== EXHIBITION ===================== */
export function Exhibition({ query, setQuery, sort, initialCat, park }) {
  const favaReady = useFavaReady();
  const fava = favaReady ? F() : null;
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [cat, setCat] = useState(initialCat || "all");
  useEffect(() => { setCat(initialCat || "all"); }, [initialCat]);
  const STATIC_COMPANIES = fava?.COMPANIES || [];
  const CATEGORIES = fava?.CATEGORIES || [];
  const PARKS = fava?.PARKS || [];
  const parkObj = park ? PARKS.find((p) => p.id === park) : null;

  const { data: cloudCompanies = [] } = useQuery({
    queryKey: ["exh-public"],
    queryFn: fetchExhibitionCompanies,
    staleTime: 30_000,
  });

  const COMPANIES = useMemo(() => {
    const map = new Map();
    for (const c of STATIC_COMPANIES) map.set(c.id, c);
    for (const cc of cloudCompanies) {
      if (cc.is_active === false) { map.delete(cc.company_id); continue; }
      const base = map.get(cc.company_id) || { id: cc.company_id, tags: [], products: [], contact: {}, color: "blue", initials: (cc.name || cc.company_id).slice(0, 2) };
      map.set(cc.company_id, {
        ...base,
        id: cc.company_id,
        name: cc.name || base.name,
        name_en: cc.name_en ?? base.name_en ?? null,
        tagline: cc.tagline ?? base.tagline ?? "",
        category: cc.category || base.category,
        parkId: cc.park_id || base.parkId,
        city: cc.city || base.city || "",
        description: cc.description ?? base.description ?? "",
        logo_url: cc.logo_url ?? base.logo_url ?? null,
        headcount_full_time: cc.headcount_full_time ?? null,
        headcount_part_time: cc.headcount_part_time ?? null,
        founded: cc.founded_at ? new Date(cc.founded_at).getFullYear() : base.founded,
        contact: {
          ...(base.contact || {}),
          website: cc.website || base.contact?.website,
          phone: cc.phone || base.contact?.phone,
          email: cc.email || base.contact?.email,
          address: cc.address || base.contact?.address,
        },
      });
    }
    return Array.from(map.values());
  }, [STATIC_COMPANIES, cloudCompanies]);

  const list = useMemo(() => {
    let arr = COMPANIES.filter((c) => {
      const okCat = cat === "all" || c.category === cat;
      const okPark = !park || c.parkId === park;
      const q = (query || "").trim();
      const okQ = !q || (c.name + " " + (c.name_en || "") + " " + (c.tagline || "") + " " + (c.products || []).join(" ") + " " + (c.tags || []).join(" ") + " " + (c.city || "")).includes(q);
      return okCat && okPark && okQ;
    });
    if (sort === "sales") arr = [...arr].sort((a, b) => (b.workers || 0) - (a.workers || 0));
    return arr;
  }, [cat, query, sort, park, COMPANIES]);
  if (!fava) return <HomeFallback />;
  return (
    <div className="view">
      <div className="shell">
        <div className="section-head">
          <div>
            <span className="eyebrow">{t("exhibition.eyebrow")}</span>
            <h2 className="h2">{t("exhibition.title")}</h2>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Link to="/register-company" className="btn btn-primary" style={{ fontSize: 13 }}>
              {t("exhibition.register_cta")}
            </Link>
            <div className="nav-search" style={{ minWidth: 260 }}>
              <Icon name="search" size={17} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("exhibition.search_placeholder")} aria-label={t("common.search")} />
            </div>
          </div>
        </div>
        {parkObj && (
          <div className="filter-banner" style={{ "--cc": colorVar(parkObj.color) }}>
            <span className="fb-dot" />
            <span>{t("exhibition.park_filter_prefix")} <b>{pickName(parkObj, i18n.language)}</b> ({parkObj.city})</span>
            <button className="fb-clear" onClick={() => navigate({ to: "/exhibition" })}><Icon name="close" size={14} /> {t("common.clear_filter")}</button>
          </div>
        )}
        {list.length === 0 ? (
          <div className="empty"><Icon name="search" size={28} /><p style={{ marginTop: 10 }}>{t("exhibition.empty")}</p></div>
        ) : (
          <div className="grid-cards">
            {list.map((c) => <CompanyCard key={c.id} c={c} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export function CompanyCard({ c }) {
  const fava = F();
  const { t, i18n } = useTranslation();
  const cat = fava?.CATEGORIES.find((x) => x.id === c.category);
  const tilt = useTilt(7);
  const logoSrc = useAssetUrl(c.logo_url);
  return (
    <Link to="/company/$id" params={{ id: c.id }} className="co-card tilt" style={{ "--cc": colorVar(c.color), textDecoration: "none", color: "inherit" }} {...tilt}>
      <div className="co-top">
        <div className="co-logo" onClick={(e) => e.stopPropagation()} style={{ overflow: "hidden", background: logoSrc ? "#fff" : undefined }}>
          {logoSrc ? (
            <img src={logoSrc} alt={pickName(c, i18n.language)} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 4, borderRadius: 13 }} />
          ) : (
            <>
              <span className="co-logo-initials">{c.initials}</span>
              <image-slot id={"logo-" + c.id} shape="rounded" radius="13" placeholder="" />
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {logoSrc && (
            <img src={logoSrc} alt="" aria-hidden style={{ width: 22, height: 22, borderRadius: 6, objectFit: "contain", background: "#fff", padding: 2, border: "1px solid var(--stroke)", flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0 }}>
            <div className="co-name" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pickName(c, i18n.language)}</div>
            <div className="co-cat">{cat ? catTitle(cat, i18n.language) : ""}</div>
          </div>
        </div>
      </div>
      <div className="co-tag">{c.tagline}</div>
      <div className="co-meta">
        <div className="m"><b className="num">{c.headcount_full_time != null ? toFa(c.headcount_full_time) : "—"}</b><span>{t("company.full_time")}</span></div>
        <div className="m"><b className="num">{c.headcount_part_time != null ? toFa(c.headcount_part_time) : "—"}</b><span>{t("company.part_time")}</span></div>
        <div className="m"><b className="num">{c.founded ? toFa(c.founded) : "—"}</b><span>{t("company.founded")}</span></div>
      </div>
    </Link>
  );
}



/* ===================== COMPANY PROFILE ===================== */
import { fetchExhibitionCompany } from "@/lib/exhibition-api";
import { fetchAttachments, KIND_LABELS, type CompanyAttachment } from "@/lib/attachments-api";
import { AttachmentPreviewButton, AttachmentPreviewDialog } from "@/components/admin/AttachmentPreview";
import { useState as useReactState } from "react";

function AssetImg({ path, alt, style, onClick }) {
  const src = useAssetUrl(path);
  if (!src) return null;
  return <img src={src} alt={alt || ""} style={style} onClick={onClick} />;
}
function AssetVideo({ path, style }) {
  const src = useAssetUrl(path);
  if (!src) return null;
  return <video src={src} controls style={style} />;
}
function AssetLink({ path, label }) {
  const src = useAssetUrl(path);
  if (!src) return null;
  return <a className="btn btn-ghost" href={src} target="_blank" rel="noopener" download><Icon name="box" size={16} /> {label}</a>;
}

const ARCHIVE_RE = /\.(zip|rar|7z|tar|gz|tgz)(\?|$)/i;
function isArchive(att: CompanyAttachment) {
  if (att.mime_type && /zip|rar|7z|x-tar|gzip/i.test(att.mime_type)) return true;
  return ARCHIVE_RE.test(att.file_url || "");
}

function AttachmentDocRow({ att }: { att: CompanyAttachment }) {
  const { t } = useTranslation();
  const src = useAssetUrl(att.file_url);
  if (!src) return null;
  return (
    <div className="contact-row" style={{ alignItems: "center" }}>
      <span className="ci"><Icon name="box" size={17} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="cl">{KIND_LABELS[att.kind]}</div>
        <div className="cv" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{att.title || t("common.file")}</div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <AttachmentPreviewButton att={att} label={t("common.preview")} />
        <a href={src} download className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }}>{t("common.download")}</a>
      </div>
    </div>
  );
}

function DocumentsPanel({ atts }: { atts: CompanyAttachment[] }) {
  const { t } = useTranslation();
  const visible = atts.filter((a) => !isArchive(a));
  if (!visible.length) return null;
  return (
    <div className="panel">
      <h3><Icon name="box" size={18} className="pi" /> {t("company.documents")}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visible.map((a) => <AttachmentDocRow key={a.id} att={a} />)}
      </div>
    </div>
  );
}


function GalleryFigure({ att }: { att: CompanyAttachment }) {
  const url = useAssetUrl(att.file_url);
  const [open, setOpen] = useReactState(false);
  return (
    <>
      <figure style={{ margin: 0, cursor: "pointer" }} onClick={() => url && setOpen(true)}>
        <div style={{ aspectRatio: "1/1", overflow: "hidden", borderRadius: 12, background: "var(--panel-2)" }}>
          {url && <img src={url} alt={att.title || ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
        </div>
        {att.title && <figcaption style={{ marginTop: 6, fontSize: 12, color: "var(--ink-soft)" }}>{att.title}</figcaption>}
      </figure>
      {open && url && <AttachmentPreviewDialog att={att} url={url} onClose={() => setOpen(false)} />}
    </>
  );
}

function AttachmentGallery({ atts }: { atts: CompanyAttachment[] }) {
  const { t } = useTranslation();
  if (!atts.length) return null;
  return (
    <div className="panel">
      <h3><Icon name="grid" size={18} className="pi" /> {t("company.gallery")}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10 }}>
        {atts.map((a) => <GalleryFigure key={a.id} att={a} />)}
      </div>
    </div>
  );
}



export function CompanyProfile({ id }) {
  const favaReady = useFavaReady();
  const fava = favaReady ? F() : null;
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const { data: cloud } = useQuery({
    queryKey: ["exh-public-company", id],
    queryFn: () => fetchExhibitionCompany(id),
    staleTime: 30_000,
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ["exh-public-attachments", id],
    queryFn: () => fetchAttachments("exhibition", id),
    staleTime: 30_000,
  });

  if (!fava) return <HomeFallback />;
  const { COMPANIES, CATEGORIES, PARKS } = fava;
  const staticC = COMPANIES.find((x) => x.id === id);
  const cc_data = cloud?.company;

  if (!staticC && !cc_data) return <HomeFallback />;

  // Merge: cloud overrides static
  const c = {
    id,
    name: cc_data?.name || staticC?.name || id,
    name_en: cc_data?.name_en ?? staticC?.name_en ?? null,
    tagline: cc_data?.tagline ?? staticC?.tagline ?? "",
    category: cc_data?.category || staticC?.category,
    parkId: cc_data?.park_id || staticC?.parkId,
    city: cc_data?.city || staticC?.city || "",
    address: cc_data?.address || staticC?.address || "",
    color: staticC?.color || "blue",
    initials: staticC?.initials || (cc_data?.name || id).slice(0, 2),
    tags: staticC?.tags || [],
    products: staticC?.products || [],
    workers: staticC?.workers,
    founded: staticC?.founded,
    description: cc_data?.description ?? staticC?.description ?? "",
    contact: {
      phone: cc_data?.phone || staticC?.contact?.phone,
      email: cc_data?.email || staticC?.contact?.email,
      website: cc_data?.website || staticC?.contact?.website,
      address: cc_data?.address || staticC?.contact?.address,
    },
    lat: cc_data?.latitude ?? null,
    lng: cc_data?.longitude ?? null,
  };

  const cat = CATEGORIES.find((x) => x.id === c.category);
  const park = PARKS.find((p) => p.id === c.parkId);
  const cc = colorVar(c.color);
  const related = COMPANIES.filter((x) => x.category === c.category && x.id !== c.id).slice(0, 3);

  const cloudProducts = cloud?.products ?? [];
  const cloudImages = cloud?.images ?? [];
  const websiteHref = c.contact.website
    ? (c.contact.website.startsWith("http") ? c.contact.website : "https://" + c.contact.website)
    : null;

  return (
    <div className="view" style={{ "--cc": cc }}>
      <div className="shell">
        <Link to="/exhibition" className="back-btn" style={{ textDecoration: "none", color: "inherit" }}>
          <Icon name="arrowR" size={18} /> {t("company.back_to_exhibition")}
        </Link>

        <div className="profile-hero">
          <div className="ph-logo" style={{ "--cc": cc, background: cc_data?.logo_url ? "#fff" : undefined }}>
            {cc_data?.logo_url
              ? <AssetImg path={cc_data.logo_url} alt={pickName(c, i18n.language)} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 8, borderRadius: 20 }} />
              : <image-slot id={"logo-" + c.id} shape="rounded" radius="20" placeholder={t("company.add_logo")} />}
          </div>

          <div style={{ flex: 1, minWidth: 240 }}>
            <span className="eyebrow" style={{ color: glowVar(c.color) }}>{cat ? catTitle(cat, i18n.language) : ""}</span>
            <h1>{pickName(c, i18n.language)}</h1>
            <p className="ph-tag">{c.tagline}</p>
            {c.description && <p style={{ marginTop: 8, color: "var(--ink-soft)", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{c.description}</p>}
            <div className="co-badges" style={{ marginTop: 12 }}>{c.tags.map((t, i) => <span key={i} className="badge">{t}</span>)}</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {websiteHref && (
              <a className="btn btn-primary" href={websiteHref} target="_blank" rel="noopener" style={{ "--accent": cc }}>
                  <Icon name="globe" size={17} /> {t("company.website")}
              </a>
            )}
            {c.contact.email && (
              <a className="btn btn-ghost" href={"mailto:" + c.contact.email}><Icon name="mail" size={17} /> {t("company.contact")}</a>
            )}
            {cc_data?.catalog_url && <AssetLink path={cc_data.catalog_url} label={t("company.download_catalog")} />}
          </div>
        </div>

        {cc_data?.video_url && (
          <div className="panel" style={{ marginTop: 16, padding: 16 }}>
            <h3 style={{ marginBottom: 10 }}><Icon name="spark" size={18} className="pi" /> {t("company.intro_video")}</h3>
            <AssetVideo path={cc_data.video_url} style={{ width: "100%", maxHeight: 480, borderRadius: 12, background: "#000" }} />
          </div>
        )}

        <div className="profile-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
            <div className="panel">
              <h3><Icon name="chart" size={18} className="pi" /> {t("company.stats")}</h3>
              <div className="kpi-row">
                <div className="kpi">
                  {(() => {
                    const ft = cc_data?.headcount_full_time;
                    const pt = cc_data?.headcount_part_time;
                    const total = (ft != null || pt != null) ? (ft ?? 0) + (pt ?? 0) : (cc_data?.headcount ?? c.workers ?? null);
                    return <b className="num">{total != null ? toFa(total) : "—"}</b>;
                  })()}
                  <span>{t("company.workforce")}</span>
                  {(cc_data?.headcount_full_time != null || cc_data?.headcount_part_time != null) && (
                    <small style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2, display: "block" }}>
                      {cc_data?.headcount_full_time != null && <>{toFa(cc_data.headcount_full_time)} {t("company.full_time")}</>}
                      {cc_data?.headcount_full_time != null && cc_data?.headcount_part_time != null && " · "}
                      {cc_data?.headcount_part_time != null && <>{toFa(cc_data.headcount_part_time)} {t("company.part_time")}</>}
                    </small>
                  )}
                </div>
                <div className="kpi"><b className="num">{cc_data?.founded_at ? toFa(new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric" }).format(new Date(cc_data.founded_at))) : (c.founded ? toFa(c.founded) : "—")}</b><span>{t("company.founded_shamsi")}</span></div>
                <div className="kpi"><b style={{ fontSize: 15, lineHeight: 1.4 }}>{cat ? catTitle(cat, i18n.language) : "—"}</b><span>{t("company.activity_branch")}</span></div>
              </div>
            </div>

            {(cc_data?.intro || cc_data?.founders || cc_data?.export_potential || cc_data?.knowledge_products_intro) && (
              <div className="panel">
                <h3><Icon name="spark" size={18} className="pi" /> {t("company.about_company")}</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {cc_data?.intro && (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{t("company.intro")}</div>
                      <p style={{ color: "var(--ink-soft)", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{cc_data.intro}</p>
                    </div>
                  )}
                  {cc_data?.founders && (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{t("company.founders")}</div>
                      <p style={{ color: "var(--ink-soft)", lineHeight: 1.8 }}>{cc_data.founders}</p>
                    </div>
                  )}
                  {cc_data?.export_potential && (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{t("company.export_potential")}</div>
                      <p style={{ color: "var(--ink-soft)", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{cc_data.export_potential}</p>
                    </div>
                  )}
                  {cc_data?.knowledge_products_intro && (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{t("company.knowledge_products")}</div>
                      <p style={{ color: "var(--ink-soft)", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{cc_data.knowledge_products_intro}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {cloudProducts.length > 0 ? (
              <div className="panel">
                <h3><Icon name="box" size={18} className="pi" /> {t("company.products_services")}</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
                  {cloudProducts.map((p) => <ProductCard key={p.id} p={p} cc={cc} companyId={c.id} />)}
                </div>
              </div>
            ) : (c.products || []).length > 0 && (
              <div className="panel">
                <h3><Icon name="box" size={18} className="pi" /> {t("company.products_services")}</h3>
                <div className="prod-list">
                  {c.products.map((p, i) => (
                    <div key={i} className="prod"><span className="pn">{toFa(i + 1)}</span><span className="pt">{p}</span></div>
                  ))}
                </div>
              </div>
            )}

            {cloudImages.length > 0 && (
              <div className="panel">
                <h3><Icon name="grid" size={18} className="pi" /> {t("company.image_gallery")}</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10 }}>
                  {cloudImages.map((img) => (
                    <figure key={img.id} style={{ margin: 0 }}>
                      <div style={{ aspectRatio: "1/1", overflow: "hidden", borderRadius: 12, background: "var(--panel-2)" }}>
                        <AssetImg path={img.image_url} alt={img.caption || ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                      {img.caption && <figcaption style={{ marginTop: 6, fontSize: 12, color: "var(--ink-soft)" }}>{img.caption}</figcaption>}
                    </figure>
                  ))}
                </div>
              </div>
            )}

            <AttachmentGallery atts={attachments.filter((a) => a.kind === "gallery_image" && a.is_active)} />
            
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
            <div className="panel">
              <h3><Icon name="phone" size={18} className="pi" /> {t("company.contact_methods")}</h3>
              {c.contact.phone && <div className="contact-row"><span className="ci"><Icon name="phone" size={17} /></span><div><div className="cl">{t("company.phone")}</div><div className="cv">{c.contact.phone}</div></div></div>}
              {c.contact.email && <div className="contact-row"><span className="ci"><Icon name="mail" size={17} /></span><div><div className="cl">{t("company.email")}</div><div className="cv">{c.contact.email}</div></div></div>}
              {websiteHref && <div className="contact-row"><span className="ci"><Icon name="globe" size={17} /></span><div><div className="cl">{t("company.website")}</div><div className="cv"><a href={websiteHref} target="_blank" rel="noopener" style={{ color: "inherit" }}>{c.contact.website}</a></div></div></div>}
              {c.address && <div className="contact-row"><span className="ci"><Icon name="pin" size={17} /></span><div><div className="cl">{t("company.address")}</div><div className="cv" style={{ direction: "rtl", fontWeight: 600 }}>{c.address}</div></div></div>}

              <div className="qr-block">
                <QRCode size={120}
                  text={"BEGIN:VCARD\nVERSION:3.0\nN:" + pickName(c, i18n.language) + (c.contact.phone ? "\nTEL:" + c.contact.phone : "") + (c.contact.email ? "\nEMAIL:" + c.contact.email : "") + (websiteHref ? "\nURL:" + websiteHref : "") + "\nADR:;;;" + (c.city || "") + "\nEND:VCARD"} />
                <div className="qr-note">
                  <b>{t("company.qr_title")}</b>
                  <span>{t("company.qr_lead", { name: pickName(c, i18n.language) })}</span>
                </div>
              </div>
            </div>

            {c.lat != null && c.lng != null && (
              <DirectionsPanel lat={Number(c.lat)} lng={Number(c.lng)} accent={cc} name={pickName(c, i18n.language)} address={c.contact?.address} zoom={cc_data?.map_zoom ?? null} />
            )}

            {park && (
              <button className="panel" style={{ cursor: "pointer", textAlign: "right", width: "100%", border: 0, background: "var(--panel)", color: "inherit" }} onClick={() => navigate({ to: "/parks", search: { id: park.id } as any })}>
                <h3><Icon name="building" size={18} className="pi" /> {t("company.host_park")}</h3>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{pickName(park, i18n.language)}</div>
                <div className="co-cat" style={{ marginTop: 4 }}>{park.province} · {park.city}</div>
                <div className="go" style={{ marginTop: 12, color: cc, display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--mono)", fontSize: 12 }}>
                  {t("company.view_network_map")} <Icon name="arrowL" size={14} />
                </div>
              </button>
            )}
          </div>
        </div>

        {related.length > 0 && (
          <div style={{ marginTop: 40 }}>
            <div className="section-head"><div><span className="eyebrow">{t("company.same_category")}</span><h2 className="h2" style={{ fontSize: 24 }}>{t("company.related_companies")}</h2></div></div>
            <div className="grid-cards">{related.map((r) => <CompanyCard key={r.id} c={r} />)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductCard({ p, cc, companyId }) {
  const { t } = useTranslation();
  const img = useAssetUrl(p.image_url);
  const vid = useAssetUrl(p.video_url);
  const cat = useAssetUrl(p.catalog_url);
  return (
    <div data-testid="product-card" style={{ background: "var(--panel-2)", border: "1px solid var(--stroke)", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {vid ? (
        <video src={vid} controls style={{ width: "100%", aspectRatio: "16/10", background: "#000", objectFit: "cover" }} />
      ) : img ? (
        <img src={img} alt={p.name} style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover" }} />
      ) : (
        <div style={{ width: "100%", aspectRatio: "16/10", background: "var(--panel)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-soft)", fontSize: 12 }}>{t("product.no_image")}</div>
      )}
      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
        {p.description && (
          <div style={{
            fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.7,
            display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>{p.description}</div>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: "auto" }}>
          {companyId && (
            <Link to="/company/$id/product/$pid" params={{ id: companyId, pid: p.id }}
              data-testid="product-more-link"
              aria-label={t("product.details_for", { name: p.name })}
              onClick={(event) => event.stopPropagation()}
              className="btn btn-ghost" style={{ fontSize: 12, "--accent": cc }}>
              {t("product.more")} <Icon name="arrowL" size={14} />
            </Link>
          )}
          {p.link_url && (
            <a href={p.link_url.startsWith("http") ? p.link_url : "https://" + p.link_url} target="_blank" rel="noopener"
              className="btn btn-ghost" style={{ fontSize: 12, "--accent": cc }}>
              <Icon name="arrowL" size={14} /> {t("product.view")}
            </a>
          )}
          {cat && (
            <a href={cat} target="_blank" rel="noopener" download
              className="btn btn-ghost" style={{ fontSize: 12, "--accent": cc }}>
              📄 {t("product.catalog")}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===================== PRODUCT PAGE ===================== */
function ProductGalleryImage({ path, alt }: { path: string; alt: string }) {
  const url = useAssetUrl(path);
  if (!url) return <div style={{ width: "100%", aspectRatio: "16/9", background: "var(--panel-2)", borderRadius: 24 }} />;
  return <img src={url} alt={alt} style={{ width: "100%", aspectRatio: "16/9", objectFit: "contain", background: "#fff", display: "block" }} />;
}
function ProductGalleryThumb({ path, active, onClick, children }: { path?: string; active: boolean; onClick: () => void; children?: React.ReactNode }) {
  const url = useAssetUrl(path || "");
  return (
    <button onClick={onClick} style={{
      width: "100%", aspectRatio: "1/1", borderRadius: 16, overflow: "hidden", padding: 0,
      border: active ? "2px solid var(--accent)" : "1px solid var(--stroke)",
      background: "#fff", cursor: "pointer", position: "relative",
      opacity: active ? 1 : 0.85, transition: "opacity .15s, border-color .15s",
    }}>
      {url && <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />}
      {children}
    </button>
  );
}

export function ProductPage({ id, pid }) {
  useFavaReady();
  const { t, i18n } = useTranslation();
  const { data: cloud } = useQuery({
    queryKey: ["exh-public-company", id],
    queryFn: () => fetchExhibitionCompany(id),
    staleTime: 30_000,
  });
  const { data: attachments = [] } = useQuery({
    queryKey: ["exh-public-attachments", id],
    queryFn: () => fetchAttachments("exhibition", id),
    staleTime: 30_000,
  });
  const company = cloud?.company;
  const allProducts = cloud?.products ?? [];
  const product = allProducts.find((x) => x.id === pid);
  const vid = useAssetUrl(product?.video_url);
  const catUrl = useAssetUrl(product?.catalog_url);
  const companyLogo = useAssetUrl(company?.logo_url);
  const [activeIdx, setActiveIdx] = useState(0);
  const [showVideo, setShowVideo] = useState(false);

  const productImages = useMemo(() => {
    const imgs: string[] = [];
    if (product?.image_url) imgs.push(product.image_url);
    for (const a of attachments) {
      if (!a.is_active) continue;
      if (a.kind !== "gallery_image") continue;
      if ((a.description || "").trim() !== `product:${pid}`) continue;
      imgs.push(a.file_url);
    }
    return imgs;
  }, [product?.image_url, attachments, pid]);

  const productDocs = useMemo(() => {
    return attachments.filter((a) => {
      if (!a.is_active) return false;
      if ((a.description || "").trim() !== `product:${pid}`) return false;
      if (a.kind === "gallery_image") return false;
      const url = (a.file_url || "").toLowerCase();
      if (/\.(zip|rar|7z|tar|gz)(\?|$)/.test(url)) return false;
      return true;
    });
  }, [attachments, pid]);

  const otherProducts = useMemo(
    () => allProducts.filter((p) => p.id !== pid).slice(0, 6),
    [allProducts, pid],
  );

  if (!cloud) return <div className="view"><div className="shell" style={{ padding: 40 }}>{t("common.loading")}</div></div>;
  if (!product) return <div className="view"><div className="shell" style={{ padding: 40 }}><h2 className="h2">{t("product.not_found")}</h2><Link to="/company/$id" params={{ id }} className="btn btn-ghost">{t("product.back_to_company")}</Link></div></div>;

  const cc = colorVar(company?.category || "ict");
  const mainPath = productImages[activeIdx];
  const shareLink = typeof window !== "undefined" ? window.location.href : "";
  const desc = product.description || "";
  const shortDesc = desc.split(/\n\n|\.\s/)[0]?.slice(0, 220) || "";
  const hasLongDesc = desc.length > shortDesc.length;
  const thumbsToShow = productImages.slice(0, vid ? 3 : 4);

  return (
    <div className="view" data-testid="product-detail-page" style={{ ["--accent" as any]: cc }}>
      <div className="shell" style={{ padding: "20px 16px 48px", maxWidth: 1200 }}>
        {/* Breadcrumb + company card */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ fontSize: 13, color: "var(--ink-soft)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Link to="/exhibition" style={{ color: "inherit", textDecoration: "none" }}>{t("nav.exhibition")}</Link>
            <span style={{ opacity: 0.5 }}>/</span>
            <Link to="/company/$id" params={{ id }} style={{ color: "inherit", textDecoration: "none" }}>{pickName(company, i18n.language) || id}</Link>
            <span style={{ opacity: 0.5 }}>/</span>
            <span style={{ color: "var(--ink)", fontWeight: 700 }}>{product.name}</span>
          </div>
          <Link to="/company/$id" params={{ id }} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
            borderRadius: 18, border: "1px solid var(--stroke)", background: "var(--panel)",
            textDecoration: "none", color: "inherit",
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, background: "#fff", flexShrink: 0,
              border: "1px solid var(--stroke)", overflow: "hidden",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {companyLogo
                ? <img src={companyLogo} alt={pickName(company, i18n.language) || ""} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                : <Icon name="store" size={20} className="pi" />}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.2 }}>{pickName(company, i18n.language)}</div>
              <div style={{ fontSize: 11, color: "var(--ink-mute)" }}>
                {company?.category || ""}{company?.city ? ` · ${company.city}` : ""}
              </div>
            </div>
          </Link>
        </div>

        {/* HERO GRID */}
        <div className="pp-hero" data-testid="product-detail-hero">
          {/* Gallery */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ borderRadius: 24, overflow: "hidden", border: "1px solid var(--stroke)", background: "#fff" }}>
              {showVideo && vid ? (
                <video src={vid} controls autoPlay style={{ width: "100%", aspectRatio: "16/9", background: "#000", objectFit: "contain", display: "block" }} />
              ) : mainPath ? (
                <ProductGalleryImage path={mainPath} alt={product.name} />
              ) : (
                  <div style={{ width: "100%", aspectRatio: "16/9", background: "var(--panel-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-soft)" }}>{t("product.no_image")}</div>
              )}
            </div>
            {(thumbsToShow.length > 0 || vid) && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 10 }}>
                {thumbsToShow.map((p, i) => (
                  <ProductGalleryThumb key={i} path={p} active={!showVideo && i === activeIdx} onClick={() => { setShowVideo(false); setActiveIdx(i); }} />
                ))}
                {vid && (
                  <button onClick={() => setShowVideo((v) => !v)} style={{
                    width: "100%", aspectRatio: "1/1", borderRadius: 16, overflow: "hidden", padding: 0,
                    border: showVideo ? "2px solid var(--accent)" : "1px solid var(--stroke)",
                    background: "linear-gradient(135deg, var(--panel-2), #0a0f1e33)",
                    cursor: "pointer", position: "relative", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{
                      width: 42, height: 42, borderRadius: 999, background: "var(--accent)",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                    }}>▶</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Header + primary actions */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {company?.category && (
              <span style={{
                alignSelf: "flex-start", padding: "5px 12px", borderRadius: 999,
                background: "color-mix(in oklab, var(--accent) 12%, transparent)",
                color: "var(--accent)", fontSize: 11, fontWeight: 800, letterSpacing: ".04em",
                marginBottom: 14,
              }}>{company.category}</span>
            )}
            <h1 style={{ fontSize: 34, lineHeight: 1.25, fontWeight: 900, margin: 0 }}>{product.name}</h1>
            {shortDesc && (
              <p style={{ marginTop: 14, color: "var(--ink-soft)", lineHeight: 1.9, fontSize: 15 }}>
                {shortDesc}{hasLongDesc ? "…" : ""}
              </p>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: "auto", paddingTop: 20 }}>
              {product.link_url && (
                <a className="btn btn-primary" href={product.link_url.startsWith("http") ? product.link_url : "https://" + product.link_url} target="_blank" rel="noopener" style={{ flex: "1 1 180px", justifyContent: "center" }}>
                  <Icon name="globe" size={16} /> {t("product.view_on_site")}
                </a>
              )}
              {shareLink && (
                <button className="btn btn-ghost" onClick={() => { try { navigator.clipboard?.writeText(shareLink); } catch {} }} style={{ flex: "1 1 140px", justifyContent: "center" }}>
                  🔗 {t("product.share_link")}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* BODY GRID */}
        <div className="pp-body" data-testid="product-detail-layout">
          {/* Full description */}
          <div className="panel" style={{ padding: 28, borderRadius: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid var(--stroke)" }}>
              <span style={{ display: "inline-block", width: 4, height: 22, background: "var(--accent)", borderRadius: 2 }} />
              <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>{t("product.specs_description")}</h2>
            </div>
            {desc ? (
              <p style={{ color: "var(--ink-soft)", lineHeight: 2.1, fontSize: 15, whiteSpace: "pre-wrap", margin: 0 }}>{desc}</p>
            ) : (
              <p style={{ color: "var(--ink-mute)", fontSize: 13, margin: 0 }}>{t("product.no_description")}</p>
            )}
          </div>

          {/* Sidebar */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {(catUrl || productDocs.length > 0) && (
              <div style={{
                borderRadius: 24, padding: 22, color: "#fff",
                background: "linear-gradient(155deg, #0f1633, #1a2352)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📥</span>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{t("product.download_center")}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {catUrl && (
                    <a href={catUrl} target="_blank" rel="noopener" download style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                      padding: "12px 14px", borderRadius: 14,
                      background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)",
                      color: "#fff", textDecoration: "none", fontSize: 13,
                    }}>
                      <span style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: 700 }}>{t("product.product_catalog")}</span>
                        <span style={{ fontSize: 10, opacity: 0.6 }}>PDF</span>
                      </span>
                      <span style={{ fontSize: 16 }}>⬇</span>
                    </a>
                  )}
                  {productDocs.map((d) => <ProductDocRow key={d.id} att={d} />)}
                </div>
              </div>
            )}

            {otherProducts.length > 0 && (
              <div className="panel" style={{ padding: 20, borderRadius: 24 }}>
                <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>{t("product.other_products", { name: pickName(company, i18n.language) })}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {otherProducts.map((p) => (
                    <OtherProductRow key={p.id} p={p} companyId={id} />
                  ))}
                </div>
              </div>
            )}

            <Link to="/company/$id" params={{ id }} className="btn btn-ghost" style={{ justifyContent: "center" }}>
              <Icon name="arrowR" size={16} /> {t("product.back_to_profile")}
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}

function OtherProductRow({ p, companyId }: { p: any; companyId: string }) {
  const img = useAssetUrl(p.image_url);
  return (
    <Link to="/company/$id/product/$pid" params={{ id: companyId, pid: p.id }} style={{
      display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit",
      padding: 8, borderRadius: 14, border: "1px solid var(--stroke)", background: "var(--panel-2)",
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 12, overflow: "hidden", flexShrink: 0,
        background: "#fff", border: "1px solid var(--stroke)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {img
          ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          : <Icon name="box" size={20} className="pi" />}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
        {p.description && (
          <div style={{ fontSize: 11, color: "var(--ink-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</div>
        )}
      </div>
      <Icon name="arrowL" size={14} className="pi" />
    </Link>
  );
}

function ProductDocRow({ att }: { att: any }) {
  const { t } = useTranslation();
  const url = useAssetUrl(att.file_url);
  const label = att.title || (KIND_LABELS as any)[att.kind] || t("product.document");
  return (
    <a href={url || "#"} target="_blank" rel="noopener" download
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        padding: "12px 14px", borderRadius: 14,
        background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)",
        color: "#fff", textDecoration: "none", fontSize: 13,
      }}>
      <span style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>{t("product.document")}</span>
      </span>
      <span style={{ fontSize: 16 }}>⬇</span>
    </a>
  );
}


/* ===================== PARKS MAP ===================== */
const PARK_PROVINCE = {
  razavi: "IR-30", semnan: "IR-12", mazand: "IR-21", tehran: "IR-07", isfahan: "IR-04",
  fars: "IR-14", eaz: "IR-01", yazd: "IR-25", khz: "IR-10",
};
const LABEL_POS = { mazand: "top", tehran: "left", semnan: "right", razavi: "right", isfahan: "left", yazd: "right", fars: "bottom", eaz: "left", khz: "left" };
const LABEL_TF = { top: "translate(-50%,-275%)", bottom: "translate(-50%,190%)", left: "translate(-112%,-50%)", right: "translate(12%,-50%)" };

export function ParksMap({ selectedId }) {
  const favaReady = useFavaReady();
  const fava = favaReady ? F() : null;
  const navigate = useNavigate();
  const firstParkId = fava ? fava.PARKS[0].id : "tehran";
  const [sel, setSel] = useState(selectedId || firstParkId);
  useEffect(() => { if (selectedId) setSel(selectedId); }, [selectedId]);
  const PARKS = fava?.PARKS || [];
  const COMPANIES = fava?.COMPANIES || [];
  const park = PARKS.find((p) => p.id === sel);
  const parkCompanies = COMPANIES.filter((c) => c.parkId === sel);
  const provs = (typeof window !== "undefined" && window.IRAN_PROVINCES) || [];
  const VB = (typeof window !== "undefined" && window.IRAN_VIEWBOX) || [0, 0, 654, 626];
  const VW = VB[2], VH = VB[3];
  const provById = (id) => provs.find((p) => p.id === id);
  const parkXY = (p) => { const pr = provById(PARK_PROVINCE[p.id]); return pr ? [pr.cx, pr.cy] : [VW / 2, VH / 2]; };
  const pctX = (x) => (x / VW) * 100, pctY = (y) => (y / VH) * 100;
  const links = useMemo(() => {
    const out = [];
    PARKS.forEach((a, i) => {
      const [ax, ay] = parkXY(a);
      const others = PARKS.map((b, j) => { const [bx, by] = parkXY(b); return { j, d: Math.hypot(ax - bx, ay - by) }; })
        .filter((o) => o.j !== i).sort((x, y) => x.d - y.d).slice(0, 2);
      others.forEach((o) => { if (i < o.j) out.push([i, o.j]); });
    });
    return out;
  }, [provs.length]);
  const selProvId = PARK_PROVINCE[sel];
  if (!fava) return <HomeFallback />;
  return (
    <div className="view parks-view-full">
      <div className="parks-full-layout">
        <div className="parks-map-pane">
          <div className="map-stage map-iran parks-map-stage-full">
            <svg className="map-svg" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet">
              <defs>
                <filter id="iran-glow" x="-15%" y="-15%" width="130%" height="130%">
                  <feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <g className="iran-provinces">
                {provs.map((pr) => {
                  const isSelProv = pr.id === selProvId;
                  const hasPark = Object.values(PARK_PROVINCE).includes(pr.id);
                  const cc = isSelProv && park ? colorVar(park.color) : null;
                  return (
                    <path key={pr.id} d={pr.d}
                      className={"prov" + (isSelProv ? " sel" : "") + (hasPark ? " has-park" : "")}
                      fill={cc ? `color-mix(in oklab, ${cc} 40%, transparent)` : (hasPark ? "rgba(31,127,214,0.13)" : "rgba(46,66,108,0.10)")}
                      stroke={cc || "rgba(124,170,235,0.26)"} strokeWidth={isSelProv ? 1.8 : 0.7}
                      style={isSelProv ? { filter: "url(#iran-glow)" } : undefined}>
                      <title>{pr.title}</title>
                    </path>
                  );
                })}
              </g>
              {links.map(([i, j], k) => {
                const a = parkXY(PARKS[i]), b = parkXY(PARKS[j]);
                return (
                  <g key={k}>
                    <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="rgba(124,170,235,0.30)" strokeWidth="1.1" strokeDasharray="4 5" />
                    <circle r="2.4" fill="var(--accent-glow)" opacity="0.95">
                      <animateMotion dur={`${3 + (k % 3)}s`} repeatCount="indefinite" path={`M${a[0]} ${a[1]} L${b[0]} ${b[1]}`} />
                    </circle>
                  </g>
                );
              })}
              {PARKS.map((p) => {
                const [cx, cy] = parkXY(p), col = colorVar(p.color), isSel = p.id === sel;
                const rr = 6 + Math.min(8, p.companies / 55);
                return (
                  <g key={p.id} className={"map-node" + (isSel ? " sel" : "")} onClick={() => setSel(p.id)} style={{ cursor: "pointer" }}>
                    <circle cx={cx} cy={cy} r={rr + 8} fill={col} opacity={isSel ? 0.24 : 0.12}>
                      {isSel && <animate attributeName="r" values={`${rr + 8};${rr + 15};${rr + 8}`} dur="2.2s" repeatCount="indefinite" />}
                    </circle>
                    <circle className="pin-core" cx={cx} cy={cy} r={rr} fill={col} stroke="#fff" strokeWidth={isSel ? 2.4 : 1.4}
                      style={{ filter: `drop-shadow(0 0 ${isSel ? 9 : 4}px ${col})` }} />
                    <circle cx={cx} cy={cy} r={rr * 0.4} fill="#fff" opacity="0.92" />
                  </g>
                );
              })}
            </svg>
            {PARKS.map((p) => {
              const [cx, cy] = parkXY(p);
              const isSel = p.id === sel;
              const pos = LABEL_POS[p.id] || "top";
              return (
                <button key={p.id} className={"map-label lp-" + pos + (isSel ? " sel" : "")} onClick={() => setSel(p.id)}
                  style={{ left: `${pctX(cx)}%`, top: `${pctY(cy)}%`, transform: LABEL_TF[pos], borderColor: isSel ? colorVar(p.color) : "var(--stroke)", color: isSel ? "#fff" : "var(--ink-soft)", zIndex: isSel ? 8 : 3 }}>{p.city}</button>
              );
            })}
          </div>
        </div>

        <aside className="parks-dashboard">
          <ParkDashboard park={park} PARKS={PARKS} parkCompanies={parkCompanies} onSelect={setSel} sel={sel} navigate={navigate} />
        </aside>
      </div>
    </div>
  );
}

function ParkDashboard({ park, PARKS, parkCompanies, onSelect, sel, navigate }) {
  const { t, i18n } = useTranslation();
  const { data } = useQuery({
    queryKey: ["park-public", park?.id],
    queryFn: () => fetchParkContent(park.id),
    enabled: !!park,
  });
  const logoUrl = useAssetUrl(data?.content?.logo_url);
  if (!park) return null;
  const displayName = data?.content?.display_name || pickName(park, i18n.language);
  return (
    <div className="park-dashboard" style={{ "--cc": colorVar(park.color) }}>
      <div className="pd-header">
        <div className="pd-logo">
          {logoUrl ? <img src={logoUrl} alt={displayName} /> : <span><Icon name="building" size={28} /></span>}
        </div>
        <div className="pd-head-text">
          <span className="park-detail-prov">{park.province}</span>
          <h3 className="park-detail-name">{displayName}</h3>
          <div className="park-detail-city"><Icon name="pin" size={14} /> {park.city}</div>
        </div>
      </div>

      <div className="park-detail-stats">
        <div><b className="num">{toFa(park.companies)}</b><span>{t("park.companies_stat")}</span></div>
        <div><b className="num">{faNum(park.jobs)}</b><span>{t("park.jobs_stat")}</span></div>
        <div><b className="num">{toFa(park.area)}</b><span>{t("park.area_stat")}</span></div>
      </div>

      {data?.content?.description && (
        <div className="pd-section">
          <div className="pd-section-title">{t("park.about_park")}</div>
          <p className="pd-desc">{data.content.description}</p>
        </div>
      )}

      {data?.images && data.images.length > 0 && (
        <div className="pd-section">
          <div className="pd-section-title">{t("park.gallery")}</div>
          <div className="pd-gallery">
            {data.images.map((img) => <PdImage key={img.id} path={img.image_url} caption={img.caption} />)}
          </div>
        </div>
      )}

      {data?.news && data.news.length > 0 && (
        <div className="pd-section">
          <div className="pd-section-title">{t("park.news_events")}</div>
          <div className="pd-news">
            {data.news.slice(0, 5).map((n) => (
              <div key={n.id} className="pd-news-item">
                <div className="pd-news-title">{n.title}</div>
                {n.body && <div className="pd-news-body">{n.body}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {parkCompanies.length > 0 && (
        <div className="pd-section">
          <div className="pd-section-title">{t("park.resident_companies", { count: parkCompanies.length })}</div>
          <div className="pd-companies">
            {parkCompanies.slice(0, 6).map((c) => (
              <Link key={c.id} to="/company/$id" params={{ id: c.id }} className="pd-company"
                style={{ textDecoration: "none", color: "inherit" }}>
                <span className="pd-co-dot" style={{ background: colorVar(c.color) }}>{c.initials}</span>
                <div>
                  <div className="pd-co-name">{pickName(c, i18n.language)}</div>
                  <div className="pd-co-tag">{c.tagline}</div>
                </div>
              </Link>
            ))}
          </div>
          <button className="btn btn-primary" style={{ width: "100%", marginTop: 8 }}
            onClick={() => navigate({ to: "/exhibition", search: { park: park.id } as any })}>
            <Icon name="store" size={15} /> {t("park.all_park_companies")}
          </button>
        </div>
      )}

      <div className="pd-section">
        <div className="pd-section-title">{t("park.other_parks")}</div>
        <div className="pd-park-list">
          {PARKS.filter((p) => p.id !== sel).map((p) => (
            <button key={p.id} className="pd-park-row" style={{ "--cc": colorVar(p.color) }} onClick={() => onSelect(p.id)}>
              <span className="pdot" />
              <div className="pd-pr-main">
                <div className="pname">{p.province}</div>
                <div className="pcity">{p.city}</div>
              </div>
              <div className="pnum"><b className="num">{toFa(p.companies)}</b></div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PdImage({ path, caption }) {
  const url = useAssetUrl(path);
  return (
    <figure className="pd-img">
      {url && <img src={url} alt={caption || ""} loading="lazy" />}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}



/* ===================== CATEGORIES ===================== */
export function Categories() {
  const favaReady = useFavaReady();
  const { t } = useTranslation();
  const fava = favaReady ? F() : null;
  if (!fava) return <HomeFallback />;
  const { CATEGORIES, COMPANIES } = fava;
  return (
    <div className="view">
      <div className="shell">
        <div className="section-head">
          <div><span className="eyebrow">{t("categories.eyebrow")}</span><h2 className="h2">{t("categories.title")}</h2></div>
          <p className="lead" style={{ maxWidth: 360 }}>{t("categories.lead")}</p>
        </div>
        <div className="cat-grid">
          {CATEGORIES.map((c) => {
            const real = COMPANIES.filter((x) => x.category === c.id).length;
            return <CatCard key={c.id} c={c} real={real} />;
          })}
        </div>
      </div>
    </div>
  );
}

function CatCard({ c, real }) {
  const { t, i18n } = useTranslation();
  const tilt = useTilt(8);
  return (
    <Link to="/exhibition" search={{ cat: c.id } as any} className="cat-card tilt" style={{ "--cc": colorVar(c.color), textDecoration: "none", color: "inherit" }} {...tilt}>
      <span className="ring" />
      <div className="cat-ico"><Icon name={CAT_ICON[c.id]} size={26} /></div>
      <h3>{catTitle(c, i18n.language)}</h3>
      <p>{catDesc(c, i18n.language)}</p>
      <div className="count"><b className="num">{toFa(c.companies)}</b><span>{t("categories.active_companies")}{real ? ` · ${t("categories.in_exhibition", { count: real })}` : ""}</span></div>
    </Link>
  );
}

/* ===================== FOOTER ===================== */
export function Footer() {
  const { t } = useTranslation();
  return (
    <div className="shell"><div className="footer">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src={logoSpin} alt="" style={{ display: "block", width: 26, height: 26, aspectRatio: "1 / 1", objectFit: "contain" }} />
        {t("nav.brand")}
      </div>
    </div></div>
  );
}
