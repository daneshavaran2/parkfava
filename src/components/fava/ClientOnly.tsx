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

/** Waits for window.FAVA (loaded from src/lib/fava/data.js, then merged with
 *  live DB rows by loadFavaVendor()) to be available AND fully merged.
 *  Returns true once it's ready; forces re-render of consumers.
 *  Always starts `false` (matching SSR, which never has `window.FAVA`) even
 *  though the client may already have it by mount time — reading it
 *  synchronously in the initializer would make the client's first render
 *  diverge from the server's and trigger a hydration mismatch. The switch to
 *  `true` happens in the effect below instead, which only runs after the
 *  hydration commit, so it's always a safe, ordinary post-mount re-render.
 *
 *  This used to poll raw `window.FAVA` truthiness instead of awaiting
 *  loadFavaVendor()'s promise — but `window.FAVA` is set the moment the
 *  *static* bundle (data.js) finishes importing, well before the live-DB
 *  merge (a real network round trip) has a chance to run. On a fast
 *  connection the merge usually wins that race by luck; on a slower one (or
 *  simply a slower server response) a consumer reads window.FAVA.PARKS
 *  before it's been touched by live data at all and never re-renders again
 *  once the merge does finish — e.g. a park just deactivated in the DB kept
 *  showing with its old bundled numbers indefinitely, confirmed against
 *  production. Awaiting the promise itself is the actual completion signal,
 *  not a proxy for it. */
export function useFavaReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import("@/lib/fava/load")
      .then((m) => m.loadFavaVendor())
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        // Vendor bundle itself failed to load (not just the DB merge, which
        // loadFavaVendor already swallows internally) — nothing to show,
        // but don't leave consumers hanging on `ready` forever either.
        if (!cancelled) setReady(true);
      });
    return () => { cancelled = true; };
  }, []);
  return ready;
}
