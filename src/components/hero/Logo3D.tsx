import { useEffect, useId, useRef, useState } from "react";
import logoSpin from "@/assets/logo-spin.webp";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLogoPivot, DEFAULT_PIVOT, type LogoPivot } from "@/hooks/use-logo-pivot";
import { useDeferredMount } from "@/hooks/use-deferred-mount";

const BASE = 460;
const DEPTH = 76;

type Tier = "low" | "medium" | "high";
const SLICES_FOR: Record<Tier, number> = { low: 16, medium: 32, high: 48 };

const TIER_ORDER: Tier[] = ["low", "medium", "high"];

function detectTier(): Tier {
  if (typeof window === "undefined") return "medium";
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return "low";
    const hc = navigator.hardwareConcurrency ?? 4;
    const dpr = window.devicePixelRatio ?? 1;

    let weakGpu = false;
    try {
      const gl =
        document.createElement("canvas").getContext("webgl") ||
        document.createElement("canvas").getContext("experimental-webgl");
      const ext = (gl as WebGLRenderingContext | null)?.getExtension("WEBGL_debug_renderer_info");
      const r =
        ext && gl
          ? String(
              (gl as WebGLRenderingContext).getParameter(
                (ext as { UNMASKED_RENDERER_WEBGL: number }).UNMASKED_RENDERER_WEBGL,
              ),
            )
          : "";
      if (/swiftshader|software|adreno 3|mali-4|llvmpipe/i.test(r)) weakGpu = true;
    } catch {
      /* ignore */
    }

    if (weakGpu || hc <= 2) return "low";
    if (hc <= 4 && dpr >= 2) return "medium";
    if (hc >= 8) return "high";
    return "medium";
  } catch {
    return "medium";
  }
}

type ReducedMode = "auto" | "off" | "gentle" | "pause";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mql.matches);
    on();
    mql.addEventListener?.("change", on);
    return () => mql.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

export interface PerfStats {
  fps: number;
  frameMs: number;
  tier: Tier;
  dpr: number;
  shadows: boolean;
  timestamp: number;
  calls: number;
  triangles: number;
  p1Fps?: number;
  longFrames?: number;
  slices?: number;
  renderRate?: number;
  minFps?: number;
  maxFps?: number;
  avgFps?: number;
  sampleMs?: number[];
}

export interface Logo3DProps {
  size?: number;
  paused?: boolean;
  className?: string;
  /** Override adaptive tier: "low" | "medium" | "high". Disables live adaptive. */
  forceTier?: Tier;
  bloomIntensity?: number;
  showHUD?: boolean;
  targetFps?: number;
  dprOverride?: number;
  shadowsOverride?: boolean;
  onStats?: (stats: PerfStats) => void;
  /** Dev overlay: crosshair + pivot dot + bounding box. */
  showGuides?: boolean;
  /** Reduced-motion handling. Default "auto". */
  reducedMotion?: ReducedMode;
  /** Live-tune tier based on FPS. Default true; auto-off when forceTier is set. */
  adaptive?: boolean;
  /** Show live FPS/tier badge (auto-on when showHUD). */
  showFpsBadge?: boolean;
  /** 0..100. Higher = longer duration & smaller per-frame delta. Default 70. */
  smoothness?: number;
  /** "continuous" for linear infinite spin; "throttled" for stepped keyframes to reduce compositor load. */
  renderCadence?: "continuous" | "throttled";
  /** Defer expensive layers (back face, extrusion, shadow, sheen) until first RAF post-mount. Default: mobile. */
  deferHeavyLayers?: boolean;
  /** Initial rotation angle in degrees (persisted for reproducible alignment). */
  startAt?: number;
  /** Identifier passed through onStats consumers to key A/B panels. */
  instanceId?: string;
}

export function Logo3D({
  size = 460,
  paused = false,
  className,
  forceTier,
  showGuides = false,
  reducedMotion: rmProp = "auto",
  adaptive = true,
  showHUD = false,
  showFpsBadge,
  onStats,
  smoothness = 70,
  renderCadence = "continuous",
  deferHeavyLayers,
  startAt,
}: Logo3DProps) {
  const uid = useId().replace(/[:]/g, "");
  const scale = size / BASE;
  const depth = DEPTH * scale;
  const isMobile = useIsMobile();
  const osReduced = usePrefersReducedMotion();
  const [pivot] = useLogoPivot();

  const effectiveReduced: ReducedMode = rmProp === "auto" ? (osReduced ? "gentle" : "off") : rmProp;

  const shouldDefer = deferHeavyLayers ?? isMobile;
  const { ref: rootRef, ready: heavyReady } = useDeferredMount<HTMLDivElement>(shouldDefer, 240);

  // Ceiling tier from initial probe (SSR-safe: start medium)
  const [ceiling, setCeiling] = useState<Tier>(forceTier ?? "medium");
  useEffect(() => {
    if (forceTier) {
      setCeiling(forceTier);
      return;
    }
    let t = detectTier();
    if (isMobile && t === "high") t = "medium";
    if (effectiveReduced === "gentle" || effectiveReduced === "pause") t = "low";
    setCeiling(t);
  }, [forceTier, isMobile, effectiveReduced]);

  // Active tier: starts at ceiling, can be tuned down by adaptive loop
  const [activeTier, setActiveTier] = useState<Tier>(forceTier ?? "medium");
  useEffect(() => setActiveTier(ceiling), [ceiling]);

  const SLICES = SLICES_FOR[activeTier];
  // Duration is deliberately independent of tier so adaptive quality changes
  // never alter the spin speed (which would restart/jump the animation).
  const BASE_DURATION = 16;
  // Smoothness stretches duration: 0 -> 0.6x, 100 -> 1.6x. Extrusion quality (slices) is untouched.
  const smoothFactor = 0.6 + (Math.max(0, Math.min(100, smoothness)) / 100) * 1.0;
  const duration = (effectiveReduced === "gentle" ? 40 : BASE_DURATION) * smoothFactor;
  // Throttled cadence uses stepped keyframes; step count scales with smoothness (30..120).
  const stepCount = Math.round(30 + (smoothness / 100) * 90);
  const easing = renderCadence === "throttled" ? `steps(${stepCount})` : "linear";

  const animPaused = paused || effectiveReduced === "pause";

  const showBadge = showFpsBadge ?? showHUD;
  const needsMeter = !!onStats || showBadge;

  // Live values read by the RAF loop through refs so the loop mounts ONCE and
  // never restarts (a restart produces a long frame that reads as a jump).
  const liveRef = useRef({ activeTier, SLICES, ceiling, adaptive, forceTier, animPaused, onStats });
  liveRef.current = { activeTier, SLICES, ceiling, adaptive, forceTier, animPaused, onStats };

  // FPS meter + adaptive controller (only runs when something consumes it)
  const statsRef = useRef({ frames: 0, longFrames: 0, samples: [] as number[], lastTs: 0 });
  const tierChangeRef = useRef({
    lastChange: 0,
    changesThisMinute: 0,
    minuteStart: 0,
    sustainedGood: 0,
  });
  useEffect(() => {
    if (!needsMeter) return;
    let raf = 0;
    let prev = performance.now();
    let reportAt = prev + 500;
    const tick = (now: number) => {
      const dt = now - prev;
      prev = now;
      const s = statsRef.current;
      s.frames++;
      s.samples.push(dt);
      if (s.samples.length > 240) s.samples.shift();
      if (dt > 32) s.longFrames++;

      if (now >= reportAt) {
        const live = liveRef.current;
        const windowMs = now - (reportAt - 500);
        const fps = Math.round((s.frames * 1000) / windowMs);
        const frameMs = +(
          s.samples.reduce((a, b) => a + b, 0) / Math.max(1, s.samples.length)
        ).toFixed(2);
        const sorted = [...s.samples].sort((a, b) => b - a);
        const p1Idx = Math.max(0, Math.floor(sorted.length * 0.01));
        const p1FrameMs = sorted[p1Idx] ?? frameMs;
        const p1Fps = Math.round(1000 / Math.max(1, p1FrameMs));
        const longFrames = s.longFrames;
        const longRatio = longFrames / Math.max(1, s.frames);

        // Rolling min/avg/max for the caller.
        const sortedFps = [...s.samples].map((ms) => 1000 / Math.max(1, ms)).sort((a, b) => a - b);
        const minFps = Math.round(sortedFps[0] ?? fps);
        const maxFps = Math.round(sortedFps[sortedFps.length - 1] ?? fps);
        const avgFps = Math.round(
          sortedFps.reduce((a, b) => a + b, 0) / Math.max(1, sortedFps.length),
        );

        live.onStats?.({
          fps,
          frameMs,
          tier: live.activeTier,
          dpr: typeof window !== "undefined" ? window.devicePixelRatio : 1,
          shadows: true,
          timestamp: Date.now(),
          calls: 0,
          triangles: live.SLICES * 4,
          p1Fps,
          longFrames,
          slices: live.SLICES,
          renderRate: fps,
          minFps,
          maxFps,
          avgFps,
          sampleMs: s.samples.slice(-120),
        });

        // Adaptive controller — quality only, never speed. Wide hysteresis so
        // tier flips stay rare and invisible.
        if (live.adaptive && !live.forceTier && !live.animPaused) {
          const tc = tierChangeRef.current;
          if (now - tc.minuteStart > 60000) {
            tc.minuteStart = now;
            tc.changesThisMinute = 0;
          }
          const canChange = now - tc.lastChange > 8000 && tc.changesThisMinute < 2;
          const curIdx = TIER_ORDER.indexOf(live.activeTier);
          if (canChange) {
            if ((fps < 40 || longRatio > 0.2) && curIdx > 0) {
              setActiveTier(TIER_ORDER[curIdx - 1]);
              tc.lastChange = now;
              tc.changesThisMinute++;
              tc.sustainedGood = 0;
            } else if (fps > 58 && longRatio < 0.02) {
              tc.sustainedGood += windowMs;
              const ceilIdx = TIER_ORDER.indexOf(live.ceiling);
              if (tc.sustainedGood > 6000 && curIdx < ceilIdx) {
                setActiveTier(TIER_ORDER[curIdx + 1]);
                tc.lastChange = now;
                tc.changesThisMinute++;
                tc.sustainedGood = 0;
              }
            } else {
              tc.sustainedGood = 0;
            }
          }
        }

        s.frames = 0;
        s.longFrames = 0;
        reportAt = now + 500;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [needsMeter]);

  const maskUrl = `url(${logoSpin})`;
  const startDeg = (((startAt ?? pivot.startAt ?? 0) % 360) + 360) % 360;
  const sliceFadeKf = `logo3d-slice-${uid}`;
  const sliceCss = `@keyframes ${sliceFadeKf}{from{opacity:0}to{opacity:1}}`;

  // Web Animations API: one persistent animation, created exactly once.
  // Speed changes go through updatePlaybackRate() and startAt changes are
  // read once via a ref (below) — neither ever restarts it, so the current
  // angle is always preserved: no restart, no jump.
  const spinRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);
  const startDegRef = useRef(startDeg);
  startDegRef.current = startDeg;
  const BASE_MS = BASE_DURATION * 1000;

  useEffect(() => {
    const el = spinRef.current;
    if (!el || typeof el.animate !== "function") return;
    const anim = el.animate(
      [
        { transform: `translateZ(0) rotateY(${startDegRef.current}deg)` },
        { transform: `translateZ(0) rotateY(${startDegRef.current + 360}deg)` },
      ],
      { duration: BASE_MS, iterations: Infinity, easing },
    );
    animRef.current = anim;
    return () => {
      anim.cancel();
      animRef.current = null;
    };
    // startDeg is intentionally excluded: it's read once via startDegRef at
    // creation time so a later startAt change (e.g. a live cross-tab edit
    // from /dev/logo) never cancels and restarts the already-playing
    // animation. Only real geometry-of-motion changes rebuild it.
  }, [easing, BASE_MS]);

  useEffect(() => {
    const anim = animRef.current;
    if (!anim) return;
    const rate = BASE_DURATION / duration;
    if (typeof anim.updatePlaybackRate === "function") anim.updatePlaybackRate(rate);
    else anim.playbackRate = rate;
  }, [duration, BASE_DURATION]);

  useEffect(() => {
    const anim = animRef.current;
    if (!anim) return;
    if (animPaused) anim.pause();
    else anim.play();
  }, [animPaused]);

  const sliceEls = Array.from({ length: SLICES }, (_, idx) => {
    const i = SLICES - idx;
    const t = i / SLICES;
    const tz = -(i * depth) / SLICES;
    const hidden = i > SLICES * 0.75;
    const brightness = 0.22 + (1 - t) * 0.34;
    const saturate = 0.72 + (1 - t) * 0.2;
    // Key by depth fraction, not index: tiers 16/32/48 share fractions, so a
    // tier change only mounts the *added* slices instead of remounting all.
    return (
      <img
        key={t.toFixed(4)}
        src={logoSpin}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: size,
          height: size,
          display: "block",
          pointerEvents: "none",
          // Hidden, not visible: these strips represent one-sided extrusion
          // geometry (same idiom as the front/back face elements below). With
          // "visible" the un-mirrored backside of every slice stays painted
          // once the whole assembly rotates past ~90°, so it overlaps the
          // still-visible front-facing slices and reads as a fanned/gapped
          // mess mid-spin instead of a clean solid block.
          backfaceVisibility: "hidden",
          transformOrigin: "50% 50%",
          transform: `translateZ(${tz.toFixed(2)}px)`,
          animation: `${sliceFadeKf} 120ms ease-out both`,
          filter: hidden
            ? undefined
            : `brightness(${brightness.toFixed(3)}) saturate(${saturate.toFixed(3)}) contrast(1.26)`,
        }}
      />
    );
  });

  // Mirror of sliceEls, rotated 180° so each strip's *readable* side faces
  // backward instead of forward. `sliceEls` above only ever satisfies
  // backfaceVisibility during the front-facing half of the spin (roughly
  // -90°..90°) — for the other half the object showed only the flat back
  // face with no depth cue at all, so the logo visibly flattened to 2D for
  // half of every rotation. This set becomes visible exactly for that other
  // half, at the same depths, so the extrusion reads as solid throughout
  // the full 360°. Shading is inverted (t, not 1-t) because "closest to the
  // viewer" flips meaning when viewed from behind: the strip nearest the
  // back face (tz closest to -depth, t=1) is now the near one.
  const backSliceEls = Array.from({ length: SLICES }, (_, idx) => {
    const i = SLICES - idx;
    const t = i / SLICES;
    const tz = -(i * depth) / SLICES;
    const hidden = i < SLICES * 0.25;
    const brightness = 0.22 + t * 0.34;
    const saturate = 0.72 + t * 0.2;
    return (
      <img
        key={t.toFixed(4)}
        src={logoSpin}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: size,
          height: size,
          display: "block",
          pointerEvents: "none",
          backfaceVisibility: "hidden",
          transformOrigin: "50% 50%",
          transform: `translateZ(${tz.toFixed(2)}px) rotateY(180deg)`,
          animation: `${sliceFadeKf} 120ms ease-out both`,
          filter: hidden
            ? undefined
            : `brightness(${brightness.toFixed(3)}) saturate(${saturate.toFixed(3)}) contrast(1.26)`,
        }}
      />
    );
  });

  const tiltDeg = Math.round((pivot.tiltDeg ?? DEFAULT_PIVOT.tiltDeg) * 10) / 10;
  const pv: LogoPivot = pivot;
  const offX = Math.round(pv.offsetX);
  const offY = Math.round(pv.offsetY);
  const initialSpinTransform = `translateZ(0) rotateY(${startDeg}deg)`;

  const showHeavy = heavyReady;

  return (
    <div
      ref={rootRef}
      className={className}
      style={{
        width: size,
        height: size,
        position: "relative",
        display: "inline-block",
        isolation: "isolate",
        contain: "strict",
        overflow: "clip",
        zIndex: 0,
        perspective: `${1500 * scale}px`,
        touchAction: "none",
        // `content-visibility: auto` here (previously gated on `shouldDefer`,
        // i.e. on by default on mobile) is unreliable inside a `perspective`
        // + `transform-style: preserve-3d` containing block: mobile browsers
        // (notably Safari) can fail to ever mark the element "relevant to
        // the user" and skip rendering it entirely — the logo just never
        // appears. The `showHeavy`/useDeferredMount gating below already
        // covers the real perf cost (extrusion slices, shadow, sheen), so
        // always painting the front face is worth the small extra cost.
        contentVisibility: "visible",
        containIntrinsicSize: `${size}px ${size}px`,
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: sliceCss }} />

      {/* Pivot layer — persisted offset/scale, never rotates. */}

      <div
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
          transform: `translate3d(${offX}px, ${offY}px, 0) scale(${pv.scale}) rotateX(${tiltDeg}deg) rotateZ(-3deg)`,
          transformOrigin: "50% 50%",
        }}
      >
        {/* Single-axis spin driven by a persistent WAAPI animation (see effects
            above): speed changes never restart it, so the angle never jumps. */}
        <div
          ref={spinRef}
          style={{
            position: "absolute",
            inset: 0,
            transformStyle: "preserve-3d",
            transformOrigin: "50% 50%",
            transform: initialSpinTransform,
            willChange: "transform",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              transformStyle: "preserve-3d",
              pointerEvents: "none",
              opacity: showHeavy ? 1 : 0,
              transition: "opacity 220ms ease-out",
            }}
          >
            {showHeavy ? sliceEls : null}
            {showHeavy ? backSliceEls : null}
          </div>

          {/* Front face — always renders so first paint is stable, no pop. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backfaceVisibility: "hidden",
              transform: "translateZ(2px)",
              willChange: "transform",
            }}
          >
            <img
              src={logoSpin}
              alt=""
              draggable={false}
              fetchPriority="high"
              decoding="async"
              style={{
                width: "100%",
                height: "100%",
                display: "block",
                pointerEvents: "none",
                filter: showHeavy
                  ? `drop-shadow(0 ${6 * scale}px ${14 * scale}px rgba(15,15,20,0.18))`
                  : undefined,
                transition: "filter 220ms ease-out",
              }}
            />
          </div>

          {/* Back face — deferred on mobile to lighten first paint. */}
          {showHeavy && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                backfaceVisibility: "hidden",
                transform: `translateZ(${-depth}px) rotateY(180deg)`,
                transformOrigin: "50% 50%",
              }}
            >
              <img
                src={logoSpin}
                alt=""
                draggable={false}
                style={{
                  width: "100%",
                  height: "100%",
                  display: "block",
                  pointerEvents: "none",
                  filter: "brightness(0.55) saturate(0.85) contrast(1.08)",
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Ground shadow — deferred on mobile so first paint is cheap. */}
      {showHeavy && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: "4%",
            width: `${280 * scale}px`,
            height: `${32 * scale}px`,
            transform: "translate3d(-50%, 0, 0)",
            background:
              "radial-gradient(ellipse at center, rgba(25,25,25,0.4), rgba(25,25,25,0) 72%)",
            filter: isMobile ? undefined : `blur(${4 * scale}px)`,
            opacity: isMobile ? 0.28 : 0.42,
            WebkitMaskImage: "radial-gradient(ellipse at center, black 55%, transparent 100%)",
            maskImage: "radial-gradient(ellipse at center, black 55%, transparent 100%)",
            contain: "paint",
            zIndex: 0,
            pointerEvents: "none",
            transition: "opacity 220ms ease-out",
          }}
        />
      )}

      {/* Lighting overlay — deferred with the heavy layers. */}
      {showHeavy && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "linear-gradient(145deg, rgba(255,255,255,0.18), transparent 36%, rgba(0,0,0,0.08) 78%, rgba(255,255,255,0.06))",
            WebkitMaskImage: maskUrl,
            maskImage: maskUrl,
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",
            transform: "translateZ(0)",
            contain: "paint",
            zIndex: 1,
          }}
        />
      )}

      {/* Sheen — locked layer. Disabled on mobile to reduce composited layers. */}
      {showHeavy && !isMobile && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            mixBlendMode: "screen",
            background:
              "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.5) 48%, transparent 62%)",
            backgroundSize: "260% 260%",
            backgroundPosition: "50% 50%",
            opacity: 0.42,
            WebkitMaskImage: maskUrl,
            maskImage: maskUrl,
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",
            transform: "translateZ(0)",
            contain: "paint",
            zIndex: 2,
          }}
        />
      )}

      {/* FPS badge */}
      {showBadge && <FpsBadge tier={activeTier} slices={SLICES} />}

      {/* Alignment guides (dev-only) */}
      {showGuides && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            mixBlendMode: "difference",
            zIndex: 3,
          }}
        >
          <div
            style={{ position: "absolute", inset: 0, border: "1px dashed rgba(0,255,255,0.9)" }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              bottom: 0,
              width: 1,
              background: "rgba(0,255,255,0.9)",
              transform: "translateX(-0.5px)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              right: 0,
              height: 1,
              background: "rgba(0,255,255,0.9)",
              transform: "translateY(-0.5px)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 10,
              height: 10,
              transform: "translate(-50%,-50%)",
              borderRadius: "50%",
              border: "1px solid rgba(0,255,255,1)",
              background: "rgba(0,255,255,0.25)",
            }}
          />
        </div>
      )}
    </div>
  );
}

function FpsBadge({ tier, slices }: { tier: Tier; slices: number }) {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let start = performance.now();
    const tick = (now: number) => {
      frames++;
      if (now - start >= 500) {
        setFps(Math.round((frames * 1000) / (now - start)));
        frames = 0;
        start = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div
      style={{
        position: "absolute",
        top: 6,
        right: 6,
        zIndex: 4,
        background: "rgba(0,0,0,0.65)",
        color: "#7df59a",
        font: "600 10px ui-monospace,monospace",
        padding: "3px 6px",
        borderRadius: 4,
        pointerEvents: "none",
        letterSpacing: 0.3,
      }}
    >
      {fps} fps · {tier} · {slices}s
    </div>
  );
}

export default Logo3D;
