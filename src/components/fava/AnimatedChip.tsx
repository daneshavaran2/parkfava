import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const CHAR_MS = 90;
const CLEAR_MS = 55;
const HOLD_MS = 2200;
const HANDOFF_MS = 350;

// Intl.Segmenter splits by grapheme cluster (so combining marks / ZWNJ half-
// spaces stay attached to their base letter when slicing the string down to
// a prefix) — but the sliced prefix is always re-joined into a single plain
// string before it's rendered, never split across separate DOM elements.
// Persian letters only take their correct joined (initial/medial/final)
// shape when the text shaping engine sees them as one continuous run; one
// <span> per letter — the previous approach — breaks every letter into its
// isolated form and the word falls apart visually.
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

type ChipDef = { text: string; color: string; onClick: () => void };
type Phase = "holding" | "clearing" | "typing";

// Coordinates all chips as one carousel: only the active chip types/clears,
// the rest sit at their full, normally-shaped text. This replaces four
// independent per-chip loops (which used to run all at once) with a single
// shared turn-taking state machine.
function useChipCarousel(charsList: string[][], reduced: boolean) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("holding");
  const [visibleCount, setVisibleCount] = useState(charsList[0]?.length ?? 0);

  useEffect(() => {
    if (reduced || charsList.length === 0) return;
    const total = charsList[activeIndex]?.length ?? 0;
    let timer: ReturnType<typeof setTimeout>;

    if (phase === "holding") {
      timer = setTimeout(() => setPhase("clearing"), HOLD_MS);
    } else if (phase === "clearing") {
      if (visibleCount > 0) {
        timer = setTimeout(() => setVisibleCount((c) => Math.max(0, c - 1)), CLEAR_MS);
      } else {
        timer = setTimeout(() => {
          setActiveIndex((i) => (i + 1) % charsList.length);
          setPhase("typing");
        }, HANDOFF_MS);
      }
    } else {
      if (visibleCount < total) {
        timer = setTimeout(() => setVisibleCount((c) => c + 1), CHAR_MS);
      } else {
        timer = setTimeout(() => setPhase("holding"), 0);
      }
    }

    return () => clearTimeout(timer);
  }, [phase, visibleCount, activeIndex, reduced, charsList]);

  return { activeIndex, phase, visibleCount };
}

function ChipButton({
  fullText,
  shownText,
  color,
  index,
  reduced,
  active,
  showCursor,
  shimmerKey,
  onClick,
}: {
  fullText: string;
  shownText: string;
  color: string;
  index: number;
  reduced: boolean;
  active: boolean;
  showCursor: boolean;
  shimmerKey: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      className="ai-chip chip-animated"
      onClick={onClick}
      dir="rtl"
      lang="fa"
      aria-label={fullText}
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
          clearing never shift layout or move neighbouring chips (CLS=0). */}
      <span className="chip-sizer" aria-hidden="true">
        {fullText}
      </span>
      <span className="chip-text-layer">
        <span aria-hidden="true">
          {reduced ? fullText : shownText}
          {!reduced && active && showCursor && (
            <span className="chip-cursor" style={{ background: color }} />
          )}
        </span>
      </span>
      {!reduced && (
        <AnimatePresence>
          {active && shimmerKey > 0 && (
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
      )}
    </motion.button>
  );
}

export function AnimatedChipRow({ chips }: { chips: ChipDef[] }) {
  const reducedMotion = useReducedMotion();
  const reduced = !!reducedMotion;
  const charsList = useMemo(() => chips.map((c) => segmentGraphemes(c.text)), [chips]);
  const { activeIndex, phase, visibleCount } = useChipCarousel(charsList, reduced);
  const [shimmerKey, setShimmerKey] = useState(0);

  useEffect(() => {
    if (phase === "holding") setShimmerKey((k) => k + 1);
  }, [phase, activeIndex]);

  return (
    <>
      {chips.map((chip, i) => {
        const active = i === activeIndex && !reduced;
        const shown = active ? charsList[i].slice(0, visibleCount).join("") : chip.text;
        return (
          <ChipButton
            key={i}
            fullText={chip.text}
            shownText={shown}
            color={chip.color}
            index={i}
            reduced={reduced}
            active={active}
            showCursor={phase === "typing" || phase === "clearing"}
            shimmerKey={active ? shimmerKey : 0}
            onClick={chip.onClick}
          />
        );
      })}
    </>
  );
}
