import { useEffect, useState } from "react";
import * as LottieModule from "lottie-react";
import robotHelloAnim from "@/assets/robot-hello.json";

// Vite's dependency pre-bundling wraps lottie-react's UMD build in an extra
// ESM default-export layer, so the real component can end up nested two
// levels deep (`{ default: { default: Lottie, useLottie, ... } }`) instead
// of being the top-level default export. Unwrap defensively, peeling up to
// two levels, so this works regardless of which shape actually lands.
type LottieComponent = typeof LottieModule.default;
function unwrap(mod: unknown): LottieComponent {
  const level1 = (mod as { default?: unknown })?.default ?? mod;
  const level2 = (level1 as { default?: unknown })?.default ?? level1;
  return level2 as LottieComponent;
}
const Lottie = unwrap(LottieModule);

function usePrefersReducedMotion() {
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

export function RobotFabLottie({ size = 44 }: { size?: number }) {
  const reduced = usePrefersReducedMotion();
  return (
    <span className="robot-fab-lottie" style={{ width: size, height: size }} aria-hidden="true">
      <Lottie
        animationData={robotHelloAnim}
        loop={!reduced}
        autoplay={!reduced}
        className="robot-fab-lottie-player"
      />
    </span>
  );
}
