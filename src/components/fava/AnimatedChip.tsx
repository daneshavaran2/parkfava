import { useEffect, useState } from "react";
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

// Picks a pool entry that isn't already showing in any visible slot (and
// isn't the one being replaced) — otherwise the same phrase could appear
// twice at once, or a slot could "rotate" back into its own old text.
function pickFresh(pool: ChipDef[], exclude: ChipDef[]): ChipDef {
  const candidates = pool.filter((p) => !exclude.includes(p));
  const from = candidates.length ? candidates : pool;
  return from[Math.floor(Math.random() * from.length)];
}

function initialSlots(pool: ChipDef[], visibleCount: number): ChipDef[] {
  const picked: ChipDef[] = [];
  for (let i = 0; i < visibleCount && i < pool.length; i++) picked.push(pickFresh(pool, picked));
  return picked;
}

// Coordinates a fixed number of visible chip slots as one carousel, drawing
// each slot's content from a larger candidate pool (see AICommandBar's
// suggPool). Only the active slot types/clears; the rest sit at their full,
// static text. When the active slot finishes clearing, it hands off to the
// next slot AND swaps its own content for a freshly-picked pool entry — so
// by the time it reappears (as a non-active, fully-shown chip again), it's
// showing a different phrase than before, instead of the same fixed word
// forever.
function useChipCarousel(pool: ChipDef[], visibleCount: number, reduced: boolean) {
  const [slots, setSlots] = useState<ChipDef[]>(() => initialSlots(pool, visibleCount));
  const [activeIndex, setActiveIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("holding");
  const [visibleChars, setVisibleChars] = useState(
    () => segmentGraphemes(slots[0]?.text ?? "").length,
  );

  useEffect(() => {
    if (reduced || slots.length === 0) return;
    const total = segmentGraphemes(slots[activeIndex]?.text ?? "").length;
    let timer: ReturnType<typeof setTimeout>;

    if (phase === "holding") {
      timer = setTimeout(() => setPhase("clearing"), HOLD_MS);
    } else if (phase === "clearing") {
      if (visibleChars > 0) {
        timer = setTimeout(() => setVisibleChars((c) => Math.max(0, c - 1)), CLEAR_MS);
      } else {
        timer = setTimeout(() => {
          setSlots((prev) => {
            const next = [...prev];
            next[activeIndex] = pickFresh(pool, prev);
            return next;
          });
          setActiveIndex((i) => (i + 1) % slots.length);
          setPhase("typing");
        }, HANDOFF_MS);
      }
    } else {
      if (visibleChars < total) {
        timer = setTimeout(() => setVisibleChars((c) => c + 1), CHAR_MS);
      } else {
        timer = setTimeout(() => setPhase("holding"), 0);
      }
    }

    return () => clearTimeout(timer);
  }, [phase, visibleChars, activeIndex, reduced, slots, pool]);

  return { slots, activeIndex, phase, visibleChars };
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

export function AnimatedChipRow({ pool, visibleCount }: { pool: ChipDef[]; visibleCount: number }) {
  const reducedMotion = useReducedMotion();
  const reduced = !!reducedMotion;
  const { slots, activeIndex, phase, visibleChars } = useChipCarousel(pool, visibleCount, reduced);
  const [shimmerKey, setShimmerKey] = useState(0);

  useEffect(() => {
    if (phase === "holding") setShimmerKey((k) => k + 1);
  }, [phase, activeIndex]);

  return (
    <>
      {slots.map((chip, i) => {
        const active = i === activeIndex && !reduced;
        const shown = active
          ? segmentGraphemes(chip.text).slice(0, visibleChars).join("")
          : chip.text;
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
