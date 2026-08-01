// @ts-nocheck
/* FAVA primitives ported from the original components.jsx (Babel-in-browser). */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Logo3D } from "@/components/hero/Logo3D";

/* ---------- utilities ---------- */
const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
export function toFa(n) { return String(n).replace(/[0-9]/g, (d) => FA_DIGITS[+d]); }
export function faNum(n) { return toFa(Number(n).toLocaleString("en-US")); }
// CATEGORIES entries (src/lib/fava/data.js) carry an optional *_en variant
// for their Persian title/desc — falls back to the Persian value if a
// category hasn't been given an English translation yet.
export function catTitle(c, lang) { return (lang === "en" && c?.title_en) ? c.title_en : c?.title; }
export function catDesc(c, lang) { return (lang === "en" && c?.desc_en) ? c.desc_en : c?.desc; }
// Company/park objects (both static and Supabase-backed) carry an optional
// name_en — falls back to the Persian name if none has been entered yet.
export function pickName(o, lang) { return (lang === "en" && o?.name_en) ? o.name_en : o?.name; }
export function faMoney(toman) {
  if (toman >= 1e12) return toFa((toman / 1e12).toFixed(1).replace(/\.0$/, "")) + " هزار میلیارد";
  if (toman >= 1e9) return toFa(Math.round(toman / 1e9)) + " میلیارد";
  if (toman >= 1e6) return toFa(Math.round(toman / 1e6)) + " میلیون";
  return faNum(toman);
}
const FALLBACK_COLORS = {
  red: { base: "#eb212f", glow: "#ff4554" },
  gold: { base: "#f7ca17", glow: "#ffd84d" },
  blue: { base: "#1f7fd6", glow: "#3da0ff" },
  green: { base: "#00a858", glow: "#19d27e" },
};
const C = () => (typeof window !== "undefined" && window.FAVA ? window.FAVA.COLORS : FALLBACK_COLORS);
export function colorVar(key) { return C()[key] ? C()[key].base : "var(--accent)"; }
export function glowVar(key) { return C()[key] ? C()[key].glow : "var(--accent-glow)"; }

/* ---------- ICONS ---------- */
export function Icon({ name, size = 20, stroke = 1.7 }) {
  const p =
    {
      search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
      arrowL: "M15 19l-7-7 7-7",
      arrowR: "M9 5l7 7-7 7",
      arrowUp: "M12 19V5M5 12l7-7 7 7",
      phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
      mail: "M3 6h18v12H3zM3 7l9 6 9-6",
      globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18",
      pin: "M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11zM12 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
      users: "M16 19v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-2a4 4 0 0 0-3-3.8M16 3.2a4 4 0 0 1 0 7.6",
      chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
      store: "M4 9l1-5h14l1 5M4 9v10h16V9M4 9h16M9 19v-5h6v5",
      grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
      box: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8",
      trend: "M3 17l6-6 4 4 7-7M14 8h7v7",
      menu: "M4 7h16M4 12h16M4 17h16",
      close: "M6 6l12 12M18 6L6 18",
      chip: "M7 7h10v10H7zM4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4M10 7V4M14 7V4M10 20v-3M14 20v-3",
      dna: "M5 3c0 5 14 5 14 14M5 21c0-5 14-5 14-14M7 5h10M7 19h10M9 8h6M9 16h6",
      atom: "M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M12 3c5 4 6 13 0 18M12 3c-5 4-6 13 0 18M3 12c4-5 13-6 18 0M3 12c4 5 13 6 18 0",
      robot: "M12 3v3M8 9h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM9.5 13h.01M14.5 13h.01M10 17h4M4 12v3M20 12v3",
      bolt: "M13 2L4 14h6l-1 8 9-12h-6z",
      leaf: "M5 21c0-9 5-16 16-16 0 11-7 16-16 16zM5 21c2-5 6-8 11-9",
      rocket: "M12 2c4 2 6 6 6 11l-3 3H9l-3-3c0-5 2-9 6-11zM12 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3M7 17l-2 4M17 17l2 4",
      wallet: "M3 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 7l2-3h11l2 3M17 13h.01",
      spark: "M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3",
      map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
      layers: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
      building: "M4 21V5l8-2v18M12 21V9l8 2v10M4 21h16M8 8h.01M8 12h.01M8 16h.01M16 14h.01M16 18h.01",
      sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
      moon: "M21 12.8A8.5 8.5 0 0 1 11.2 3a7 7 0 1 0 9.8 9.8z",
      send: "M21 3L10 14M21 3l-7 18-4-8-8-4 19-6z",
      maximize: "M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M16 21h3a2 2 0 0 0 2-2v-3M8 21H5a2 2 0 0 1-2-2v-3",
      minimize: "M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M16 21v-3a2 2 0 0 1 2-2h3M8 21v-3a2 2 0 0 0-2-2H3",
      qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z",
    }[name] || "";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {p.split("M").filter(Boolean).map((d, i) => <path key={i} d={"M" + d} />)}
    </svg>
  );
}

export const CAT_ICON = { soft: "chip", telecom: "globe", hw: "bolt", auto: "robot", sec: "spark", fintech: "wallet", cloud: "layers", health: "dna" };

/* ---------- hooks ---------- */
export function useCountUp(target, dur = 1400) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setVal(target); return; }
    let started = false, t0 = 0, timer = null;
    const tick = () => {
      const now = performance.now();
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(target * e);
      if (p >= 1 && timer) { clearInterval(timer); timer = null; setVal(target); }
    };
    const start = () => { if (started) return; started = true; t0 = performance.now(); timer = setInterval(tick, 1000 / 30); };
    let io;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver((es) => { es.forEach((en) => { if (en.isIntersecting) start(); }); }, { threshold: 0.25 });
      if (ref.current) io.observe(ref.current);
    }
    const fallback = setTimeout(start, 500);
    return () => { if (timer) clearInterval(timer); if (io) io.disconnect(); clearTimeout(fallback); };
  }, [target, dur]);
  return [val, ref];
}

export function useTilt(max = 8) {
  const ref = useRef(null);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const onMouseMove = (e) => {
    if (reduce || window.__fava3d === false || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    ref.current.style.transition = "transform .08s linear";
    ref.current.style.transform = `rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateY(-6px)`;
  };
  const onMouseLeave = () => {
    if (!ref.current) return;
    ref.current.style.transition = "transform .45s cubic-bezier(.22,.9,.3,1)";
    ref.current.style.transform = "";
  };
  return { ref, onMouseMove, onMouseLeave };
}

/* ---------- News ticker ---------- */
export function NewsTicker({ items, onOpen }) {
  const seq = items.concat(items);
  return (
    <div className="ticker" role="region" aria-label="اطلاع‌رسانی">
      <span className="ticker-tag"><span className="ticker-live" /> اطلاع‌رسانی</span>
      <div className="ticker-vp">
        <div className="ticker-track">
          {seq.map((n, i) => (
            <button key={i} className="ticker-item" style={{ "--cc": colorVar(n.color) }} onClick={() => onOpen && onOpen("news")}>
              <span className="ticker-dot" /> {n.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- RobotFace ---------- */
export function RobotFace({ size = 40, talking = false, eye = "#46e6ff" }) {
  return (
    <span className={"robot" + (talking ? " talking" : "")} style={{ fontSize: size + "px", "--eye": eye }} aria-hidden="true">
      <span className="robot-ant" />
      <span className="robot-head">
        <span className="robot-ear l" />
        <span className="robot-ear r" />
        <span className="robot-screen">
          <span className="robot-eye eye-l"><i className="robot-pupil" /></span>
          <span className="robot-eye eye-r"><i className="robot-pupil" /></span>
          <span className="robot-mouth" />
        </span>
      </span>
    </span>
  );
}

/* ---------- AI command bar ---------- */
export function AICommandBar({ onAsk }) {
  const { t } = useTranslation();
  const [v, setV] = useState("");
  const sugg = [
    { q: "هوش مصنوعی", l: t("home.ai_sugg_ai") },
    { q: "مشهد", l: t("home.ai_sugg_mashhad") },
    { q: "IoT", l: t("home.ai_sugg_iot") },
    { q: "فین‌تک", l: t("home.ai_sugg_fintech") },
  ];
  const fire = (q) => { if (q && q.trim()) onAsk(q.trim()); };
  return (
    <div className="ai-block">
      <div className="ai-bar">
        <form className="ai-bar-inner" onSubmit={(e) => { e.preventDefault(); fire(v); }}>
          <span className="ai-spark"><RobotFace size={34} /></span>
          <input value={v} onChange={(e) => setV(e.target.value)} placeholder={t("home.ai_placeholder")} />
          <button type="submit" className="ai-go"><Icon name="send" size={16} /> {t("home.ai_ask")}</button>
        </form>
      </div>
      <div className="ai-sugg">
        <span className="ai-sugg-lbl mono">AI</span>
        {sugg.map((s, i) => <button key={i} className="ai-chip" onClick={() => fire(s.q)}>{s.l}</button>)}
      </div>
    </div>
  );
}

/* ---------- LOGO ---------- */
const PETAL = "M16 4 L47 4 L59 16 L59 56 L56 59 L16 59 L4 47 L4 16 Z";
const TRACE = "M54 54 L20 20 M47 47 L47 14 M47 47 L14 47 M38 38 L38 23 M38 38 L23 38 M30 30 L16 30 M30 30 L30 16 M54 40 L43 40 L43 26 M40 54 L40 43 L26 43 M25 25 L12 12";
const PADS = [[20, 20], [47, 12], [12, 47], [38, 21], [21, 38], [30, 14], [14, 30], [43, 24], [24, 43], [12, 12]];
const JUNC = [[54, 54], [47, 47], [38, 38], [30, 30], [40, 40]];
const PETALS = [
  { k: "red", c: "var(--c-red)" },
  { k: "gold", c: "var(--c-gold)" },
  { k: "green", c: "var(--c-green)" },
  { k: "blue", c: "var(--c-blue)" },
];
export function Logo({ size = 38, cut = "#ffffff", glossy = false, animated = false, id = "lg" }) {
  const uid = id + "-" + size;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-label="فاوا" style={{ display: "block", overflow: "visible" }}>
      <defs>
        {PETALS.map((p, i) => (
          <radialGradient key={i} id={`${uid}-${p.k}`} cx="0.3" cy="0.26" r="1">
            <stop offset="0%" stopColor={`var(--c-${p.k}-glow)`} />
            <stop offset="52%" stopColor={p.c} />
            <stop offset="100%" stopColor="rgba(0,0,0,0.34)" />
          </radialGradient>
        ))}
        <filter id={`${uid}-sh`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2.4" stdDeviation="3" floodColor="#000" floodOpacity="0.45" />
        </filter>
        <linearGradient id={`${uid}-bevel`} x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="42%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id={`${uid}-glow`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g filter={glossy ? `url(#${uid}-sh)` : undefined}>
        {PETALS.map((p, i) => (
          <g key={i} transform={`rotate(${90 * i} 60 60)`}>
            <path d={PETAL} fill={glossy ? `url(#${uid}-${p.k})` : p.c} stroke="rgba(0,0,0,0.34)" strokeWidth="1" strokeLinejoin="round" />
            {glossy && <path d={PETAL} fill={`url(#${uid}-bevel)`} stroke="none" />}
            <path d={TRACE} fill="none" stroke={cut} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" opacity="0.96" />
            {animated && (
              <path className="lg-flow" d={TRACE} fill="none" stroke={`var(--c-${p.k}-glow)`} strokeWidth="2.6"
                strokeLinecap="round" strokeLinejoin="round" filter={`url(#${uid}-glow)`}
                strokeDasharray="5 46" strokeDashoffset="0" style={{ animationDelay: (i * 0.22) + "s" }} />
            )}
            {PADS.map((n, k) => <circle key={k} cx={n[0]} cy={n[1]} r="2.4" fill={cut} />)}
            {JUNC.map((n, k) => <circle key={"j" + k} cx={n[0]} cy={n[1]} r="1.5" fill={cut} opacity="0.9" />)}
          </g>
        ))}
        <circle cx="60" cy="60" r="3" fill={cut} />
        {animated && <circle cx="60" cy="60" r="3" fill="none" stroke={cut} strokeWidth="1.4" className="lg-core-ping" />}
      </g>
    </svg>
  );
}

/* ---------- CircuitCanvas (client only) ---------- */
export function CircuitCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    const cols = ["#eb212f", "#f7ca17", "#1f7fd6", "#00a858"];
    let raf, w, h, nodes = [];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function resize() {
      w = cv.width = window.innerWidth * devicePixelRatio;
      h = cv.height = window.innerHeight * devicePixelRatio;
      const count = Math.min(46, Math.floor(window.innerWidth / 36));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.12 * devicePixelRatio,
        vy: (Math.random() - 0.5) * 0.12 * devicePixelRatio,
        c: cols[Math.floor(Math.random() * cols.length)],
        r: (Math.random() * 1.4 + 0.8) * devicePixelRatio,
      }));
    }
    function step() {
      ctx.clearRect(0, 0, w, h);
      const maxD = 150 * devicePixelRatio;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        if (!reduce) { a.x += a.vx; a.y += a.vy; }
        if (a.x < 0 || a.x > w) a.vx *= -1;
        if (a.y < 0 || a.y > h) a.vy *= -1;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j], dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
          if (d < maxD) {
            ctx.globalAlpha = (1 - d / maxD) * 0.16;
            ctx.strokeStyle = a.c; ctx.lineWidth = 0.6 * devicePixelRatio;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      for (const n of nodes) {
        ctx.globalAlpha = 0.7; ctx.fillStyle = n.c;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduce) raf = requestAnimationFrame(step);
    }
    resize(); step();
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas id="bg-canvas" ref={ref} style={{ opacity: 0.55 }} />;
}

/* ---------- HeroOrb ---------- */
export function HeroOrb() {
  const wrapRef = useRef(null);
  // Logo3D's `size` is a fixed pixel box, not CSS — it doesn't shrink with
  // its container on its own. `.hl-wrap` is the actual sized box (CSS
  // controls its width per breakpoint), so measure it and keep Logo3D in
  // sync via ResizeObserver. This also re-measures on orientation change
  // (a resize as far as the browser is concerned), so rotating the phone
  // moves/resizes the logo along with everything else instead of leaving
  // it at a stale fixed size that can overflow into surrounding content.
  const [orbSize, setOrbSize] = useState(360);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setOrbSize(Math.round(width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  function onMove(e) {
    const el = wrapRef.current; if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", (py * 16).toFixed(2) + "deg");
    el.style.setProperty("--ry", (-px * 18).toFixed(2) + "deg");
    el.style.setProperty("--px", px.toFixed(3));
    el.style.setProperty("--py", py.toFixed(3));
  }
  function onLeave() {
    const el = wrapRef.current; if (!el) return;
    el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--px", "0"); el.style.setProperty("--py", "0");
  }
  const DEPTH = 10;
  return (
    <div className="hero-orb">
      <div className="hl-wrap" ref={wrapRef} onMouseMove={onMove} onMouseLeave={onLeave}>
        <div className="hl-grid" />
        <div className="hl-halo" />
        <div className="hl-stack" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Logo3D size={orbSize} />
        </div>

        <div className="hl-podium" />
        <div className="hl-particles">
          {Array.from({ length: 16 }).map((_, i) => (
            <span key={i} style={{
              left: (6 + (i * 41) % 88) + "%", top: (8 + (i * 57) % 84) + "%",
              animationDelay: (i * 0.45) + "s", animationDuration: (5 + (i % 5)) + "s",
              background: ["var(--c-red)", "var(--c-gold)", "var(--c-blue)", "var(--c-green)"][i % 4],
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- QR code (uses window.qrMatrix from vendor/qr.js) ---------- */
export function QRCode({ text, size = 132, label }: { text: string; size?: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv || !window.qrMatrix) return;
    let m; try { m = window.qrMatrix(text); } catch (e) { return; }
    const S = m.size, pad = 3, total = S + pad * 2;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size * dpr; cv.height = size * dpr;
    cv.style.width = size + "px"; cv.style.height = size + "px";
    const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
    const cell = size / total;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#0a1426";
    for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) {
      if (m.modules[r][c]) ctx.fillRect((c + pad) * cell, (r + pad) * cell, cell + 0.5, cell + 0.5);
    }
  }, [text, size]);
  return (
    <div className="k-qr">
      <canvas ref={ref} className="k-qr-canvas" />
      {label && <span className="k-qr-label">{label}</span>}
    </div>
  );
}

/* ---------- global pointer tracker (eyes follow cursor) ---------- */
export function installRobotPointer() {
  if (typeof window === "undefined" || window.__robotPointer) return;
  window.__robotPointer = true;
  let rafP = 0, tx = 0, ty = 0, cx = 0, cy = 0;
  window.addEventListener("pointermove", (e) => {
    tx = (e.clientX / window.innerWidth - 0.5) * 2;
    ty = (e.clientY / window.innerHeight - 0.5) * 2;
    if (!rafP) rafP = requestAnimationFrame(function tick() {
      cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18;
      const r = document.documentElement;
      r.style.setProperty("--mx", cx.toFixed(3));
      r.style.setProperty("--my", cy.toFixed(3));
      if (Math.abs(tx - cx) > 0.002 || Math.abs(ty - cy) > 0.002) rafP = requestAnimationFrame(tick);
      else rafP = 0;
    });
  }, { passive: true });
}
