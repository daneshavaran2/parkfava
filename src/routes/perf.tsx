import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { Logo3D, type PerfStats } from "@/components/hero/Logo3D";

export const Route = createFileRoute("/perf")({
  component: PerfPage,
  head: () => ({ meta: [{ title: "Logo perf test • ICT PARK" }] }),
});

const SIZES = [96, 180, 280, 360, 480, 640];
const VIEWPORTS = [
  { label: "iPhone 360×800", w: 360, h: 800 },
  { label: "iPhone 414×896", w: 414, h: 896 },
  { label: "Tablet 768×1024", w: 768, h: 1024 },
  { label: "Laptop 1280×720", w: 1280, h: 720 },
  { label: "Desktop 1920×1080", w: 1920, h: 1080 },
];
const FPS_OPTIONS = [0, 30, 60, 90, 120];
const TIERS = ["auto", "high", "medium", "low"] as const;
type TierOpt = (typeof TIERS)[number];

type LogRow = PerfStats & { size: number };

const SIZES_BENCH = [180, 360, 640];
const FPS_BENCH = [30, 60, 120, 0];
const TIERS_BENCH: Exclude<TierOpt, "auto">[] = ["low", "medium", "high"];

type BenchStep = { size: number; fps: number; tier: Exclude<TierOpt, "auto"> };
type BenchResult = BenchStep & { avgFps: number; avgFrameMs: number; samples: number };

function buildSteps(): BenchStep[] {
  const out: BenchStep[] = [];
  for (const t of TIERS_BENCH)
    for (const s of SIZES_BENCH)
      for (const f of FPS_BENCH) out.push({ size: s, fps: f, tier: t });
  return out;
}

function download(name: string, mime: string, data: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toCSV(rows: LogRow[]): string {
  const head = "ts,size,fps,frameMs,calls,triangles,tier,dpr";
  const body = rows.map(r =>
    [r.timestamp, r.size, r.fps, r.frameMs, r.calls, r.triangles, r.tier, r.dpr].join(",")
  ).join("\n");
  return head + "\n" + body;
}

function PerfPage() {
  // controls
  const [targetFps, setTargetFps] = useState(0);
  const [tier, setTier] = useState<TierOpt>("auto");
  const [vp, setVp] = useState(VIEWPORTS[3]);
  const [paused, setPaused] = useState(false);
  const [dprCap, setDprCap] = useState(2);
  const [shadowsOn, setShadowsOn] = useState(true);
  const [bloom, setBloom] = useState(0.55);

  // live stats per size
  const [stats, setStats] = useState<Record<number, PerfStats>>({});

  // log
  const logRef = useRef<LogRow[]>([]);
  const [logCount, setLogCount] = useState(0);

  // chart buffer (avg across canvases, sampled ~5Hz)
  const fpsBuf = useRef<number[]>([]);
  const msBuf = useRef<number[]>([]);
  const BUF = 300;
  const fpsCanvasRef = useRef<HTMLCanvasElement>(null);
  const msCanvasRef = useRef<HTMLCanvasElement>(null);

  // bench
  const [benchRunning, setBenchRunning] = useState(false);
  const [benchIdx, setBenchIdx] = useState(0);
  const [benchSteps] = useState<BenchStep[]>(() => buildSteps());
  const benchResultsRef = useRef<BenchResult[]>([]);
  const benchSamplesRef = useRef<{ fps: number; ms: number }[]>([]);
  const benchActive = useRef(false);
  const cancelBenchRef = useRef(false);

  const onStats = useCallback((size: number, s: PerfStats) => {
    setStats((prev) => ({ ...prev, [size]: s }));
    // log (FIFO 5000)
    logRef.current.push({ ...s, size });
    if (logRef.current.length > 5000) logRef.current.splice(0, logRef.current.length - 5000);

    if (benchActive.current) benchSamplesRef.current.push({ fps: s.fps, ms: s.frameMs });
  }, []);

  // avg sampler for chart + log table refresh
  useEffect(() => {
    const id = setInterval(() => {
      const vals = Object.values(stats);
      if (vals.length) {
        const avgFps = vals.reduce((a, b) => a + b.fps, 0) / vals.length;
        const avgMs = vals.reduce((a, b) => a + b.frameMs, 0) / vals.length;
        fpsBuf.current.push(avgFps);
        msBuf.current.push(avgMs);
        if (fpsBuf.current.length > BUF) fpsBuf.current.shift();
        if (msBuf.current.length > BUF) msBuf.current.shift();
      }
      setLogCount(logRef.current.length);
    }, 200);
    return () => clearInterval(id);
  }, [stats]);

  // chart rAF
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      drawSeries(fpsCanvasRef.current, fpsBuf.current, { max: 140, thresholds: [60, 30], stroke: "#7df59a", label: "FPS" });
      drawSeries(msCanvasRef.current, msBuf.current, { max: 50, thresholds: [16.7, 33.3], stroke: "#f5c97d", label: "ms" });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  // auto benchmark runner
  useEffect(() => {
    if (!benchRunning) return;
    cancelBenchRef.current = false;
    benchResultsRef.current = [];
    let i = 0;
    const run = async () => {
      for (i = 0; i < benchSteps.length; i++) {
        if (cancelBenchRef.current) break;
        const step = benchSteps[i];
        setBenchIdx(i);
        setTier(step.tier);
        setTargetFps(step.fps);
        // settle
        await new Promise(r => setTimeout(r, 600));
        benchSamplesRef.current = [];
        benchActive.current = true;
        await new Promise(r => setTimeout(r, 3400));
        benchActive.current = false;
        const samples = benchSamplesRef.current;
        const avgFps = samples.reduce((a, b) => a + b.fps, 0) / Math.max(1, samples.length);
        const avgFrameMs = samples.reduce((a, b) => a + b.ms, 0) / Math.max(1, samples.length);
        benchResultsRef.current.push({ ...step, avgFps: +avgFps.toFixed(2), avgFrameMs: +avgFrameMs.toFixed(2), samples: samples.length });
      }
      if (!cancelBenchRef.current) {
        download(`perf-bench-${Date.now()}.json`, "application/json",
          JSON.stringify(benchResultsRef.current, null, 2));
      }
      setBenchRunning(false);
      setBenchIdx(0);
    };
    run();
  }, [benchRunning, benchSteps]);

  const recentRows = logRef.current.slice(-20).reverse();

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "#e5e5e5", padding: 16, font: "13px ui-sans-serif,system-ui" }}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14, position: "sticky", top: 0, background: "#0a0a0a", padding: "8px 0", zIndex: 10, borderBottom: "1px solid #222" }}>
        <h1 style={{ margin: 0, font: "600 16px/1.2 ui-sans-serif,system-ui" }}>Logo 3D — Perf Harness</h1>

        <button onClick={() => setPaused(p => !p)} style={btn}>{paused ? "Resume" : "Pause"}</button>

        <label style={lbl}>DPR ≤ {dprCap.toFixed(2)}
          <input type="range" min={1} max={3} step={0.25} value={dprCap} onChange={e => setDprCap(+e.target.value)} />
        </label>

        <label style={lbl}>
          <input type="checkbox" checked={shadowsOn} onChange={e => setShadowsOn(e.target.checked)} /> Shadows
        </label>

        <label style={lbl}>Bloom {bloom.toFixed(2)}
          <input type="range" min={0} max={1.5} step={0.05} value={bloom} onChange={e => setBloom(+e.target.value)} />
        </label>

        <label style={lbl}>Target FPS
          <select value={targetFps} onChange={(e) => setTargetFps(+e.target.value)} style={sel} disabled={benchRunning}>
            {FPS_OPTIONS.map((f) => <option key={f} value={f}>{f === 0 ? "uncapped" : f}</option>)}
          </select>
        </label>

        <label style={lbl}>Tier
          <select value={tier} onChange={(e) => setTier(e.target.value as TierOpt)} style={sel} disabled={benchRunning}>
            {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <label style={lbl}>Viewport
          <select value={vp.label} onChange={(e) => setVp(VIEWPORTS.find(v => v.label === e.target.value)!)} style={sel}>
            {VIEWPORTS.map(v => <option key={v.label} value={v.label}>{v.label}</option>)}
          </select>
        </label>

        <div style={{ flex: 1 }} />

        {!benchRunning ? (
          <button onClick={() => setBenchRunning(true)} style={{ ...btn, background: "#1c5b2c" }}>
            Start Auto-Benchmark ({benchSteps.length} steps)
          </button>
        ) : (
          <>
            <span style={{ fontSize: 12, opacity: 0.85 }}>
              Step {benchIdx + 1}/{benchSteps.length} — tier {benchSteps[benchIdx]?.tier}, size {benchSteps[benchIdx]?.size}, fps {benchSteps[benchIdx]?.fps || "∞"}
            </span>
            <button onClick={() => { cancelBenchRef.current = true; }} style={{ ...btn, background: "#5b1c1c" }}>Cancel</button>
          </>
        )}

        <button onClick={() => download(`perf-log-${Date.now()}.json`, "application/json", JSON.stringify(logRef.current, null, 2))} style={btn}>Export JSON</button>
        <button onClick={() => download(`perf-log-${Date.now()}.csv`, "text/csv", toCSV(logRef.current))} style={btn}>Export CSV</button>
        <button onClick={() => { logRef.current = []; setLogCount(0); fpsBuf.current = []; msBuf.current = []; }} style={btn}>Clear Log</button>
      </header>

      {/* charts */}
      <section style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <ChartBox title="FPS (avg)" canvasRef={fpsCanvasRef} />
        <ChartBox title="Frame time ms (avg)" canvasRef={msCanvasRef} />
        <div style={{ flex: 1, minWidth: 220, fontSize: 12, opacity: 0.8 }}>
          <div>Log rows: <b>{logCount}</b></div>
          <div>Active canvases: <b>{Object.keys(stats).length}</b></div>
          <div>Paused: <b>{paused ? "yes" : "no"}</b></div>
          <div>DPR cap: <b>{dprCap}</b> · Shadows: <b>{shadowsOn ? "on" : "off"}</b> · Bloom: <b>{bloom}</b></div>
        </div>
      </section>

      {/* logos grid */}
      <section
        style={{
          width: vp.w, height: vp.h, maxWidth: "100%", margin: "0 auto 14px",
          background: "radial-gradient(circle at 50% 50%, #1a2540 0%, #0a0a0a 70%)",
          border: "1px solid #222", borderRadius: 12, overflow: "auto", padding: 16,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
          {(benchRunning ? [benchSteps[benchIdx].size] : SIZES).map((s) => (
            <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <Logo3D
                size={s}
                showHUD
                forceTier={tier === "auto" ? undefined : tier}
                targetFps={targetFps}
                paused={paused}
                dprOverride={dprCap}
                shadowsOverride={shadowsOn}
                bloomIntensity={bloom}
                onStats={(st) => onStats(s, st)}
              />
              <span style={{ fontSize: 11, opacity: 0.7 }}>{s}px</span>
            </div>
          ))}
        </div>
      </section>

      {/* log table */}
      <section style={{ background: "#111", border: "1px solid #222", borderRadius: 8, padding: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Latest 20 log rows (total {logCount})</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "ui-monospace,monospace" }}>
          <thead>
            <tr style={{ opacity: 0.6, textAlign: "left" }}>
              {["time", "size", "fps", "ms", "calls", "tri", "tier", "dpr"].map(h => (
                <th key={h} style={{ padding: "3px 6px", borderBottom: "1px solid #222" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentRows.map((r, i) => (
              <tr key={i}>
                <td style={td}>{new Date(r.timestamp).toLocaleTimeString()}</td>
                <td style={td}>{r.size}</td>
                <td style={td}>{r.fps}</td>
                <td style={td}>{r.frameMs}</td>
                <td style={td}>{r.calls}</td>
                <td style={td}>{r.triangles}</td>
                <td style={td}>{r.tier}</td>
                <td style={td}>{r.dpr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function ChartBox({ title, canvasRef }: { title: string; canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  return (
    <div style={{ background: "#111", border: "1px solid #222", borderRadius: 8, padding: 8 }}>
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>{title}</div>
      <canvas ref={canvasRef} width={480} height={120} style={{ display: "block", background: "#070707", borderRadius: 4 }} />
    </div>
  );
}

function drawSeries(
  canvas: HTMLCanvasElement | null,
  data: number[],
  opts: { max: number; thresholds: number[]; stroke: string; label: string },
) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  // grid
  ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (H / 4) * i;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  // thresholds
  opts.thresholds.forEach((t, idx) => {
    const y = H - (t / opts.max) * H;
    ctx.strokeStyle = idx === 0 ? "#3f6b3f" : "#6b3f3f";
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#666"; ctx.font = "10px ui-monospace,monospace";
    ctx.fillText(String(t), 4, y - 2);
  });
  // series
  if (data.length > 1) {
    ctx.strokeStyle = opts.stroke; ctx.lineWidth = 1.5;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - Math.min(opts.max, Math.max(0, v)) / opts.max * H;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  // current value
  const cur = data[data.length - 1];
  if (cur !== undefined) {
    ctx.fillStyle = opts.stroke; ctx.font = "bold 12px ui-monospace,monospace";
    ctx.fillText(`${opts.label}: ${cur.toFixed(1)}`, W - 110, 14);
  }
}

const lbl: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.9 };
const sel: React.CSSProperties = { background: "#111", color: "#eee", border: "1px solid #333", borderRadius: 4, padding: "3px 6px", fontSize: 12 };
const btn: React.CSSProperties = { background: "#1a1a1a", color: "#eee", border: "1px solid #333", borderRadius: 4, padding: "5px 10px", fontSize: 12, cursor: "pointer" };
const td: React.CSSProperties = { padding: "2px 6px", borderBottom: "1px solid #1a1a1a" };
