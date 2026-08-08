import { useCallback, useEffect, useLayoutEffect, useState } from "react";

// SSR-safe: useLayoutEffect does nothing (and warns) on the server, so fall
// back to useEffect there. On the client this settles the persisted pivot
// (see the effect below) before Logo3D's own animation-creation effect ever
// runs, so the WAAPI animation is always created with the correct startAt —
// no race, no restart-jump.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface LogoPivot {
  offsetX: number;
  offsetY: number;
  tiltDeg: number;
  scale: number;
  /** Initial rotation angle in degrees. Persisted so the logo resumes at the same phase across reloads. */
  startAt: number;
  /** Smoothness 0..100 — maps to spin duration + cadence in Logo3D. */
  smoothness: number;
  /** Frame cadence for the rotation timing function. */
  cadence: "continuous" | "throttled";
}

export const DEFAULT_PIVOT: LogoPivot = {
  offsetX: 0,
  offsetY: 0,
  tiltDeg: -20,
  scale: 1,
  startAt: 0,
  smoothness: 70,
  cadence: "continuous",
};

const STORAGE_KEY = "logo3d:pivot:v2";
const LEGACY_KEY = "logo3d:pivot:v1";

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function normalize(raw: Partial<LogoPivot> | null | undefined): LogoPivot {
  if (!raw) return DEFAULT_PIVOT;
  const cadence: LogoPivot["cadence"] = raw.cadence === "throttled" ? "throttled" : "continuous";
  return {
    offsetX: clamp(raw.offsetX, -400, 400, DEFAULT_PIVOT.offsetX),
    offsetY: clamp(raw.offsetY, -400, 400, DEFAULT_PIVOT.offsetY),
    tiltDeg: clamp(raw.tiltDeg, -90, 90, DEFAULT_PIVOT.tiltDeg),
    scale: clamp(raw.scale, 0.1, 3, DEFAULT_PIVOT.scale),
    startAt: clamp(raw.startAt, 0, 360, DEFAULT_PIVOT.startAt),
    smoothness: clamp(raw.smoothness, 0, 100, DEFAULT_PIVOT.smoothness),
    cadence,
  };
}

function readStored(): LogoPivot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw) as Partial<LogoPivot>);
    // One-time migration from v1.
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = normalize(JSON.parse(legacy) as Partial<LogoPivot>);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      } catch {
        /* ignore */
      }
      return migrated;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Auto-loads pivot from localStorage on mount and auto-saves on every change.
 * SSR-safe: initial render uses DEFAULT_PIVOT, then upgrades post-mount.
 */
export function useLogoPivot(): [LogoPivot, (next: LogoPivot) => void, () => void] {
  const [pivot, setPivot] = useState<LogoPivot>(DEFAULT_PIVOT);

  useIsomorphicLayoutEffect(() => {
    const stored = readStored();
    if (stored) setPivot(stored);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const s = readStored();
        if (s) setPivot(s);
      }
    };
    const onCustom = () => {
      const s = readStored();
      if (s) setPivot(s);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("logo3d:pivot", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("logo3d:pivot", onCustom);
    };
  }, []);

  const save = useCallback((next: LogoPivot) => {
    const clean = normalize(next);
    setPivot(clean);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
        window.dispatchEvent(new Event("logo3d:pivot"));
      } catch {
        /* ignore */
      }
    }
  }, []);

  const reset = useCallback(() => {
    setPivot(DEFAULT_PIVOT);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
        window.localStorage.removeItem(LEGACY_KEY);
        window.dispatchEvent(new Event("logo3d:pivot"));
      } catch {
        /* ignore */
      }
    }
  }, []);

  return [pivot, save, reset];
}
