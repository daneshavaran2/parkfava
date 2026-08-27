import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";

const IDLE_MS = 2 * 60 * 1000;
const KIOSK_FLAG = "favaKioskMode";
const ACTIVITY_EVENTS = ["click", "touchstart", "mousemove", "keydown", "scroll", "wheel"] as const;

/**
 * Once a device has visited /kiosk (see src/routes/kiosk.tsx, which sets the
 * sessionStorage flag below), this stays armed for the rest of the tab
 * session regardless of which page it wanders to — so a kiosk visitor who
 * taps into a company profile still gets reset to the kiosk start screen
 * after being idle, not only while literally on /kiosk. Regular site
 * visitors never set the flag, so this never attaches a single listener for
 * them. On timeout, a hard `location.href` navigation (not client-side
 * routing) is used deliberately — it fully resets in-page state (typed
 * search text, scroll position, any open UI) rather than relying on every
 * kiosk-reachable component to reset itself, which matters for a device
 * meant to run unattended for hours.
 */
export function KioskIdleGuard() {
  const router = useRouter();
  const path = router.state.location.pathname;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (path.startsWith("/kiosk")) {
      try {
        sessionStorage.setItem(KIOSK_FLAG, "1");
      } catch {}
    }

    let armed = false;
    try {
      armed = sessionStorage.getItem(KIOSK_FLAG) === "1";
    } catch {}
    if (!armed) return;

    function reset() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        window.location.href = "/kiosk";
      }, IDLE_MS);
    }

    reset();
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    return () => {
      if (timer.current) clearTimeout(timer.current);
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [path]);

  return null;
}
