import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";

type Phase = "typing" | "holding" | "deleting" | "gap";

const CHAR_MS = 40;
const HOLD_MS = 1500;
const GAP_MS = 300;

// Intl.Segmenter splits by grapheme cluster so combining marks / ZWNJ
// (half-spaces) in Persian text stay attached to their base character
// instead of being typed as separate, meaningless fragments.
function segmentGraphemes(text: string): string[] {
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locale: string,
        opts: { granularity: string },
      ) => { segment: (s: string) => Iterable<{ segment: string }> };
    }
  ).Segmenter;
  if (Segmenter) {
    const segmenter = new Segmenter("fa", { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

function useTypewriterLoop(chars: string[], reduced: boolean, startDelay: number) {
  const [visibleCount, setVisibleCount] = useState(reduced ? chars.length : 0);
  const [phase, setPhase] = useState<Phase>("typing");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reduced) {
      setVisibleCount(chars.length);
      return;
    }
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (fn: () => void, ms: number) => {
      timer = setTimeout(() => {
        if (alive) fn();
      }, ms);
    };

    function typeStep(count: number) {
      if (count >= chars.length) {
        setPhase("holding");
        schedule(() => deleteStep(chars.length), HOLD_MS);
        return;
      }
      setPhase("typing");
      setVisibleCount(count + 1);
      setTick((t) => t + 1);
      schedule(() => typeStep(count + 1), CHAR_MS);
    }

    function deleteStep(count: number) {
      if (count <= 0) {
        setPhase("gap");
        setVisibleCount(0);
        schedule(() => typeStep(0), GAP_MS);
        return;
      }
      setPhase("deleting");
      setVisibleCount(count - 1);
      schedule(() => deleteStep(count - 1), CHAR_MS);
    }

    schedule(() => typeStep(0), startDelay);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [chars, reduced, startDelay]);

  return { visibleCount, phase, tick };
}

function useParticles(tick: number, phase: Phase, newestIndex: number) {
  const [particles, setParticles] = useState<{ id: number; charIndex: number }[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    if (tick === 0 || phase !== "typing") return;
    const id = idRef.current++;
    const charIndex = newestIndex;
    setParticles((p) => [...p, { id, charIndex }]);
    const timer = setTimeout(() => {
      setParticles((p) => p.filter((x) => x.id !== id));
    }, 320);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return particles;
}

const charVariants: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.78, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { type: "spring", duration: 0.4, bounce: 0.22 },
  },
  exit: {
    opacity: 0,
    y: 8,
    scale: 0.78,
    filter: "blur(6px)",
    transition: { duration: 0.18 },
  },
};

export function AnimatedCharacter({ ch }: { ch: string }) {
  return (
    <motion.span
      className="chip-char"
      variants={charVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      aria-hidden="true"
    >
      {ch}
    </motion.span>
  );
}

const dotVariants: Variants = {
  hidden: { opacity: 0, scale: 0 },
  visible: {
    opacity: 1,
    scale: [0, 1.25, 1],
    transition: { duration: 0.35, times: [0, 0.6, 1] },
  },
  exit: { opacity: 0, scale: 0, transition: { duration: 0.15 } },
};

export function AnimatedDot({ color }: { color: string }) {
  return (
    <motion.span
      className="chip-dot"
      style={{ background: color, boxShadow: `0 0 6px 0 ${color}` }}
      variants={dotVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      aria-hidden="true"
    />
  );
}

export function Particle({ color }: { color: string }) {
  return (
    <motion.span
      className="chip-particle"
      style={{ background: color }}
      initial={{ opacity: 0.6, y: 0 }}
      animate={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      aria-hidden="true"
    />
  );
}

export function Cursor({ color, hidden }: { color: string; hidden: boolean }) {
  if (hidden) return null;
  return <span className="chip-cursor" style={{ background: color }} aria-hidden="true" />;
}

export function Shimmer({ shimmerKey }: { shimmerKey: number }) {
  return (
    <AnimatePresence>
      {shimmerKey > 0 && (
        <motion.span
          key={shimmerKey}
          className="chip-shimmer"
          initial={{ x: "120%", opacity: 0 }}
          animate={{ x: "-120%", opacity: [0, 0.5, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
          aria-hidden="true"
        />
      )}
    </AnimatePresence>
  );
}

export function AnimatedChip({
  text,
  color,
  index,
  onClick,
}: {
  text: string;
  color: string;
  index: number;
  onClick: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const reduced = !!reducedMotion;
  const chars = useMemo(() => segmentGraphemes(text), [text]);
  const startDelay = index * 260;
  const { visibleCount, phase, tick } = useTypewriterLoop(chars, reduced, startDelay);
  const particles = useParticles(tick, phase, visibleCount - 1);
  const [shimmerKey, setShimmerKey] = useState(0);
  const prevPhase = useRef<Phase>(phase);

  useEffect(() => {
    if (prevPhase.current !== "holding" && phase === "holding") {
      setShimmerKey((k) => k + 1);
    }
    prevPhase.current = phase;
  }, [phase]);

  const visibleChars = reduced ? chars : chars.slice(0, visibleCount);

  return (
    <motion.button
      type="button"
      className="ai-chip chip-animated"
      onClick={onClick}
      dir="rtl"
      lang="fa"
      aria-label={text}
      animate={reduced ? undefined : { y: [0, -2, 0], scale: [1, 1.02, 1] }}
      transition={
        reduced
          ? undefined
          : { duration: 4, ease: "easeInOut", repeat: Infinity, delay: index * 0.3 }
      }
      whileHover={{ scale: reduced ? 1 : 1.04 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Reserves the chip's box at the full phrase's size so typing and
          deleting never shift layout or move neighbouring chips (CLS=0). */}
      <span className="chip-sizer" aria-hidden="true">
        {text}
      </span>
      <span className="chip-text-layer">
        <AnimatePresence initial={false}>
          {visibleChars.map((ch, i) => (
            <span className="chip-char-wrap" key={i}>
              <AnimatePresence initial={false}>
                {!reduced && <AnimatedDot key={`dot-${i}`} color={color} />}
              </AnimatePresence>
              <AnimatedCharacter key={`ch-${i}`} ch={ch} />
              <AnimatePresence>
                {particles
                  .filter((p) => p.charIndex === i)
                  .map((p) => (
                    <Particle key={p.id} color={color} />
                  ))}
              </AnimatePresence>
            </span>
          ))}
        </AnimatePresence>
        {!reduced && <Cursor color={color} hidden={phase === "deleting" || phase === "gap"} />}
      </span>
      {!reduced && <Shimmer shimmerKey={shimmerKey} />}
    </motion.button>
  );
}
