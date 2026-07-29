import { useCallback, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Logo3D, type PerfStats } from "@/components/hero/Logo3D";
import { LogoPerfPanel } from "@/components/hero/LogoPerfPanel";
import { useLogoPivot, DEFAULT_PIVOT } from "@/hooks/use-logo-pivot";
import logoSpin from "@/assets/logo-spin.webp";

export const Route = createFileRoute("/dev/logo")({
  component: DevLogoPage,
  head: () => ({
    meta: [
      { title: "Dev · Logo A/B & Perf" },
      { name: "description", content: "A/B compare, smoothness slider, deferred-layer mobile fallback and FPS/GPU panel for the rotating 3D logo." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

type Tier = "low" | "medium" | "high" | "auto";
type Cadence = "continuous" | "throttled";

interface Side {
  label: string;
  tier: Tier;
  smoothness: number;
  cadence: Cadence;
  adaptive: boolean;
  defer: boolean;
}

const PRESETS: { name: string; a: Partial<Side>; b: Partial<Side> }[] = [
  { name: "16 vs 32", a: { tier: "low", label: "A · low (16)" }, b: { tier: "medium", label: "B · medium (32)" } },
  { name: "32 vs 48", a: { tier: "medium", label: "A · medium (32)" }, b: { tier: "high", label: "B · high (48)" } },
  { name: "smooth 30 vs 90", a: { smoothness: 30, label: "A · smooth 30" }, b: { smoothness: 90, label: "B · smooth 90" } },
  { name: "continuous vs throttled", a: { cadence: "continuous", label: "A · continuous" }, b: { cadence: "throttled", label: "B · throttled" } },
  { name: "defer off vs on", a: { defer: false, label: "A · defer off" }, b: { defer: true, label: "B · defer on" } },
];

function DevLogoPage() {
  const [guides, setGuides] = useState(false);
  const [ref, setRef] = useState(false);
  const [paused, setPaused] = useState(false);
  const [badge, setBadge] = useState(true);
  const [syncSpin, setSyncSpin] = useState(true);
  const [pivot, savePivot, resetPivot] = useLogoPivot();

  const [a, setA] = useState<Side>({ label: "A", tier: "high", smoothness: 70, cadence: "continuous", adaptive: false, defer: false });
  const [b, setB] = useState<Side>({ label: "B", tier: "medium", smoothness: 70, cadence: "continuous", adaptive: false, defer: true });

  const [statsA, setStatsA] = useState<PerfStats | null>(null);
  const [statsB, setStatsB] = useState<PerfStats | null>(null);

  const applyPreset = (i: number) => {
    const p = PRESETS[i];
    setA((prev) => ({ ...prev, ...p.a }));
    setB((prev) => ({ ...prev, ...p.b }));
  };
  const swap = () => {
    setA(b);
    setB(a);
  };

  const onStatsA = useCallback((s: PerfStats) => setStatsA(s), []);
  const onStatsB = useCallback((s: PerfStats) => setStatsB(s), []);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", color: "#0f172a" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 12, fontSize: 14, flexWrap: "wrap", alignItems: "center" }}>
        <strong>A/B compare</strong>
        {PRESETS.map((p, i) => (
          <button key={p.name} onClick={() => applyPreset(i)}>{p.name}</button>
        ))}
        <button onClick={swap}>⇄ swap A/B</button>
        <span style={{ opacity: 0.5 }}>|</span>
        <label><input type="checkbox" checked={syncSpin} onChange={(e) => setSyncSpin(e.target.checked)} /> sync spin</label>
        <label><input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} /> guides</label>
        <label><input type="checkbox" checked={ref} onChange={(e) => setRef(e.target.checked)} /> reference</label>
        <label><input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} /> paused</label>
        <label><input type="checkbox" checked={badge} onChange={(e) => setBadge(e.target.checked)} /> fps badge</label>
      </div>

      <PivotControls pivot={pivot} savePivot={savePivot} resetPivot={resetPivot} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <Stage
          side={a}
          setSide={setA}
          reference={ref}
          paused={paused}
          guides={guides}
          badge={badge}
          onStats={onStatsA}
          startAt={syncSpin ? 0 : pivot.startAt}
        />
        <Stage
          side={b}
          setSide={setB}
          reference={ref}
          paused={paused}
          guides={guides}
          badge={badge}
          onStats={onStatsB}
          startAt={syncSpin ? 0 : pivot.startAt}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <LogoPerfPanel label={a.label} stats={statsA} smoothness={a.smoothness} cadence={a.cadence} />
        <LogoPerfPanel label={b.label} stats={statsB} smoothness={b.smoothness} cadence={b.cadence} />
      </div>
    </div>
  );
}

function Stage({
  side,
  setSide,
  reference,
  paused,
  guides,
  badge,
  onStats,
  startAt,
}: {
  side: Side;
  setSide: (s: Side) => void;
  reference: boolean;
  paused: boolean;
  guides: boolean;
  badge: boolean;
  onStats: (s: PerfStats) => void;
  startAt: number;
}) {
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, background: "#fff" }}>
      <div style={{ display: "flex", gap: 8, fontSize: 13, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <strong>{side.label}</strong>
        <label>
          tier{" "}
          <select value={side.tier} onChange={(e) => setSide({ ...side, tier: e.target.value as Tier })}>
            <option value="auto">auto</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option>
          </select>
        </label>
        <label>
          cadence{" "}
          <select value={side.cadence} onChange={(e) => setSide({ ...side, cadence: e.target.value as Cadence })}>
            <option value="continuous">continuous</option><option value="throttled">throttled</option>
          </select>
        </label>
        <label><input type="checkbox" checked={side.adaptive} onChange={(e) => setSide({ ...side, adaptive: e.target.checked })} /> adaptive</label>
        <label><input type="checkbox" checked={side.defer} onChange={(e) => setSide({ ...side, defer: e.target.checked })} /> defer heavy</label>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, marginBottom: 8 }}>
        <span>smoothness</span>
        <input type="range" min={0} max={100} step={1} value={side.smoothness} onChange={(e) => setSide({ ...side, smoothness: +e.target.value })} style={{ flex: 1 }} />
        <span style={{ width: 28, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{side.smoothness}</span>
      </div>
      <div style={{ width: "100%", aspectRatio: "1 / 1", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", border: "1px dashed #e2e8f0", borderRadius: 6 }}>
        {reference && (
          <img src={logoSpin} alt="" style={{ position: "absolute", width: "88%", height: "88%", opacity: 0.3, pointerEvents: "none" }} />
        )}
        <Logo3D
          size={480}
          paused={paused}
          forceTier={side.tier === "auto" ? undefined : side.tier}
          adaptive={side.adaptive}
          smoothness={side.smoothness}
          renderCadence={side.cadence}
          deferHeavyLayers={side.defer}
          startAt={startAt}
          showGuides={guides}
          showFpsBadge={badge}
          onStats={onStats}
        />
      </div>
    </div>
  );
}

function PivotControls({
  pivot,
  savePivot,
  resetPivot,
}: {
  pivot: ReturnType<typeof useLogoPivot>[0];
  savePivot: ReturnType<typeof useLogoPivot>[1];
  resetPivot: ReturnType<typeof useLogoPivot>[2];
}) {
  return (
    <fieldset style={{ padding: 8, fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 8 }}>
      <legend>Pivot / axis (auto-saves to localStorage · logo3d:pivot:v2)</legend>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, maxWidth: 640, alignItems: "center" }}>
        <label>X offset</label>
        <input type="range" min={-100} max={100} step={1} value={pivot.offsetX} onChange={(e) => savePivot({ ...pivot, offsetX: +e.target.value })} />
        <span>{pivot.offsetX}px</span>

        <label>Y offset</label>
        <input type="range" min={-100} max={100} step={1} value={pivot.offsetY} onChange={(e) => savePivot({ ...pivot, offsetY: +e.target.value })} />
        <span>{pivot.offsetY}px</span>

        <label>Tilt</label>
        <input type="range" min={-45} max={45} step={0.5} value={pivot.tiltDeg} onChange={(e) => savePivot({ ...pivot, tiltDeg: +e.target.value })} />
        <span>{pivot.tiltDeg}°</span>

        <label>Scale</label>
        <input type="range" min={0.5} max={1.5} step={0.01} value={pivot.scale} onChange={(e) => savePivot({ ...pivot, scale: +e.target.value })} />
        <span>{pivot.scale.toFixed(2)}</span>

        <label>Start angle</label>
        <input type="range" min={0} max={360} step={1} value={pivot.startAt} onChange={(e) => savePivot({ ...pivot, startAt: +e.target.value })} />
        <span>{pivot.startAt}°</span>
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
        <button onClick={resetPivot}>Reset</button>
        <span style={{ opacity: 0.6 }}>Defaults: X {DEFAULT_PIVOT.offsetX}, Y {DEFAULT_PIVOT.offsetY}, tilt {DEFAULT_PIVOT.tiltDeg}°, scale {DEFAULT_PIVOT.scale}, start {DEFAULT_PIVOT.startAt}°</span>
      </div>
    </fieldset>
  );
}
