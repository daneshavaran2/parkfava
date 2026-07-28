import { useEffect, useState, type ReactNode } from "react";

/** Renders children only after hydration — for components that touch window/document. */
export function ClientOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const [m, setM] = useState(false);
  useEffect(() => { setM(true); }, []);
  return <>{m ? children : fallback}</>;
}

/** True after first client render. */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => { setM(true); }, []);
  return m;
}

/** Waits for window.FAVA (loaded from src/lib/fava/data.js) to be available.
 *  Returns true once it's ready; forces re-render of consumers. */
export function useFavaReady() {
  const [ready, setReady] = useState(typeof window !== "undefined" && !!(window as any).FAVA);
  useEffect(() => {
    if ((window as any).FAVA) { setReady(true); return; }
    let cancelled = false;
    // Kick off the bundled vendor loader if a parent hasn't already.
    import("@/lib/fava/load").then((m) => m.loadFavaVendor()).catch(() => {});
    const t = setInterval(() => {
      if (cancelled) return;
      if ((window as any).FAVA) { setReady(true); clearInterval(t); }
    }, 50);
    return () => { cancelled = true; clearInterval(t); };
  }, []);
  return ready;
}
