import { useEffect, useRef, useState } from "react";
import type { PerfStats } from "./Logo3D";

export interface LogoPerfPanelProps {
  label?: string;
  stats: PerfStats | null;
  smoothness?: number;
  cadence?: "continuous" | "throttled";
}

interface Rolling {
  min: number;
  max: number;
  avg: number;
  p1: number;
  longRatio: number;
  samples: number[]; // frame times ms
  fpsSamples: number[];
}

const WINDOW_MS = 10_000;

function useRolling(stats: PerfStats | null): Rolling {
  const buf = useRef<{ ts: number; fps: number; frameMs: number; longFrames: number }[]>([]);
  const [snap, setSnap] = useState<Rolling>({
    min: 0, max: 0, avg: 0, p1: 0, longRatio: 0, samples: [], fpsSamples: [],
  });

  useEffect(() => {
    if (!stats) return;
    const now = stats.timestamp || Date.now();
    buf.current.push({ ts: now, fps: stats.fps, frameMs: stats.frameMs, longFrames: stats.longFrames ?? 0 });
    const cutoff = now - WINDOW_MS;
    while (buf.current.length && buf.current[0].ts < cutoff) buf.current.shift();
    const fps = buf.current.map((b) => b.fps).filter((f) => f > 0);
    const frames = buf.current.map((b) => b.frameMs).filter((f) => f > 0);
    if (fps.length === 0) return;
    const sorted = [...fps].sort((a, b) => a - b);
    const p1Idx = Math.max(0, Math.floor(sorted.length * 0.01));
    const totalLong = buf.current.reduce((a, b) => a + b.longFrames, 0);
    const totalFrames = frames.reduce((a, b) => a + 1000 / Math.max(1, b), 0);
    setSnap({
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      avg: Math.round(fps.reduce((a, b) => a + b, 0) / fps.length),
      p1: sorted[p1Idx] ?? 0,
      longRatio: totalFrames > 0 ? totalLong / totalFrames : 0,
      samples: frames.slice(-120),
      fpsSamples: fps.slice(-120),
    });
  }, [stats]);

  return snap;
}

function getRenderer(): string {
  if (typeof document === "undefined") return "unknown";
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "no-webgl";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return "webgl (debug info blocked)";
    return String(gl.getParameter((ext as { UNMASKED_RENDERER_WEBGL: number }).UNMASKED_RENDERER_WEBGL));
  } catch {
    return "unknown";
  }
}

export function LogoPerfPanel({ label = "Instance", stats, smoothness, cadence }: LogoPerfPanelProps) {
  const rolling = useRolling(stats);
  const [renderer] = useState<string>(() => getRenderer());

  const w = 280;
  const h = 48;
  const max = Math.max(1, ...rolling.samples);
  const path = rolling.samples
    .map((s, i) => {
      const x = (i / Math.max(1, rolling.samples.length - 1)) * w;
      const y = h - (s / max) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const cell: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8 };
  const kv = (k: string, v: React.ReactNode) => (
    <div style={cell}>
      <span style={{ opacity: 0.65 }}>{k}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </div>
  );

  return (
    <div
      style={{
        background: "#0b0f14",
        color: "#d7e3ea",
        border: "1px solid #1f2a33",
        borderRadius: 8,
        padding: 10,
        font: "500 12px ui-monospace, monospace",
        width: w + 24,
        display: "grid",
        gap: 4,
      }}
    >
      <div style={{ fontWeight: 700, color: "#7df59a", marginBottom: 2 }}>{label}</div>
      {kv("fps avg", rolling.avg)}
      {kv("fps min / max", `${rolling.min} / ${rolling.max}`)}
      {kv("1% low", rolling.p1)}
      {kv("long-frame %", `${(rolling.longRatio * 100).toFixed(1)}%`)}
      {kv("tier · slices", `${stats?.tier ?? "-"} · ${stats?.slices ?? "-"}`)}
      {kv("dpr", stats?.dpr?.toFixed(2) ?? "-")}
      {smoothness !== undefined && kv("smoothness", smoothness)}
      {cadence && kv("cadence", cadence)}
      <div style={{ ...cell, gap: 4, alignItems: "start" }}>
        <span style={{ opacity: 0.65 }}>renderer</span>
        <span style={{ maxWidth: 170, textAlign: "right", overflowWrap: "anywhere", fontSize: 10 }}>
          {renderer}
        </span>
      </div>
      <div style={{ marginTop: 6, opacity: 0.7 }}>frame time (ms) · last {rolling.samples.length}</div>
      <svg width={w} height={h} style={{ background: "#050709", borderRadius: 4 }}>
        <line x1={0} x2={w} y1={h - (16.67 / max) * h} y2={h - (16.67 / max) * h} stroke="#274" strokeDasharray="2 3" />
        <line x1={0} x2={w} y1={h - (33.33 / max) * h} y2={h - (33.33 / max) * h} stroke="#742" strokeDasharray="2 3" />
        <path d={path} fill="none" stroke="#7df59a" strokeWidth={1.2} />
      </svg>
    </div>
  );
}

export default LogoPerfPanel;
