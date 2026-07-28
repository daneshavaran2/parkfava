import { useEffect, useRef, useState } from "react";

/**
 * Defers mounting of heavy children until:
 *   1) the target element is in the viewport (IntersectionObserver), and
 *   2) at least one RAF has fired after hydration.
 *
 * Optionally waits `delayMs` more before flipping to true to let the first
 * rotation frame stabilize before layering shadows/masks/back faces on top.
 *
 * SSR-safe: initial value is `!enabled` so when the caller disables deferral
 * (e.g. desktop) heavy layers render immediately.
 */
export function useDeferredMount<T extends Element = HTMLDivElement>(
  enabled: boolean,
  delayMs = 220,
): { ref: React.RefObject<T | null>; ready: boolean } {
  const ref = useRef<T | null>(null);
  const [ready, setReady] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setReady(true);
      return;
    }
    if (typeof window === "undefined") return;
    const node = ref.current;
    if (!node) return;

    let raf = 0;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let done = false;

    const arm = () => {
      if (done) return;
      raf = requestAnimationFrame(() => {
        timeout = setTimeout(() => {
          done = true;
          setReady(true);
        }, delayMs);
      });
    };

    if (typeof IntersectionObserver === "undefined") {
      arm();
      return () => {
        if (raf) cancelAnimationFrame(raf);
        if (timeout) clearTimeout(timeout);
      };
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            io.disconnect();
            arm();
            break;
          }
        }
      },
      { rootMargin: "64px" },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
      if (timeout) clearTimeout(timeout);
    };
  }, [enabled, delayMs]);

  return { ref, ready };
}
