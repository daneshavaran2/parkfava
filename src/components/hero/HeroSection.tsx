import { useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { ArrowUpRight, X } from "lucide-react";
import { Logo3D } from "./Logo3D";

const EASE = [0.22, 1, 0.36, 1] as const;
const ACCENT = "#5E0ED7";
const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260517_222138_3e3205be-3364-417b-a64a-bfe087acbec4.mp4";

const NAV_LINKS = ["Story", "Expertise", "Studios", "Feedback"] as const;

const fadeDown: Variants = {
  hidden: { opacity: 0, y: -20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: EASE },
  }),
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 32 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.6, ease: EASE },
  }),
};

const STATS = [
  { n: 300, label: "CRAFTED\nBRANDS" },
  { n: 200, label: "DIGITAL\nPRODUCTS" },
  { n: 100, label: "VENTURES\nFUNDED" },
];

export function HeroSection() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      dir="ltr"
      className="relative min-h-screen flex flex-col overflow-hidden text-black uppercase"
      style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, letterSpacing: "0.08em" }}
    >
      {/* Background video */}
      <video
        className="absolute inset-0 w-full h-full object-cover"
        src={VIDEO_URL}
        autoPlay
        loop
        muted
        playsInline
      />
      {/* subtle wash for legibility — keep text black per spec */}
      <div className="absolute inset-0 bg-white/10 pointer-events-none" />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-5 sm:px-8 md:px-12 pt-5 md:pt-6">
        <motion.div variants={fadeDown} initial="hidden" animate="show" custom={0}>
          <Logo3D size={56} />
        </motion.div>

        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((l, i) => (
            <motion.a
              key={l}
              href="#"
              className="text-sm font-semibold tracking-widest uppercase text-black hover:opacity-70 transition-opacity"
              variants={fadeDown}
              initial="hidden"
              animate="show"
              custom={i + 1}
            >
              {l}
            </motion.a>
          ))}
        </div>

        <motion.button
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
          className="w-9 h-9 rounded-full bg-black flex flex-col items-center justify-center gap-1"
          variants={fadeDown}
          initial="hidden"
          animate="show"
          custom={5}
        >
          <span className="w-4 h-0.5 bg-white" />
          <span className="w-4 h-0.5 bg-white" />
          <span className="w-4 h-0.5 bg-white" />
        </motion.button>
      </nav>

      {/* Stats row */}
      <div className="relative z-10 flex-1 flex items-center justify-end px-5 sm:px-8 md:px-12 py-8 md:py-0">
        <div className="flex items-end gap-5 sm:gap-8 md:gap-10">
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              className="flex flex-col items-end"
              variants={fadeUp}
              initial="hidden"
              animate="show"
              custom={i + 2}
            >
              <div
                className="leading-none font-semibold text-black flex items-baseline"
                style={{ fontSize: "clamp(1.5rem, 5vw, 3.5rem)" }}
              >
                <span style={{ color: ACCENT, fontSize: "0.5em", marginRight: "0.05em" }}>+</span>
                {s.n}
              </div>
              <div className="text-[10px] sm:text-xs md:text-sm font-semibold tracking-widest uppercase text-black whitespace-pre-line leading-tight text-right mt-2">
                {s.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Bottom */}
      <div className="relative z-10 px-5 sm:px-8 md:px-12 pb-8 md:pb-12 flex flex-col gap-6 md:gap-12">
        {/* Row A */}
        <div className="flex items-center justify-between gap-4">
          <motion.p
            className="text-[10px] sm:text-xs md:text-sm font-semibold tracking-widest uppercase max-w-[130px] sm:max-w-[160px] md:max-w-xs"
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={5}
          >
            Shaping Bold<br />Visions Into Power<br />For Your Tribe
          </motion.p>
          <motion.a
            href="#"
            className="inline-flex items-center gap-1 sm:gap-2 text-base sm:text-xl md:text-2xl font-semibold uppercase whitespace-nowrap"
            style={{ color: ACCENT }}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={6}
          >
            Work With Us
            <ArrowUpRight className="sm:w-[22px] sm:h-[22px]" size={18} />
          </motion.a>
        </div>

        {/* Row B */}
        <div className="flex items-end justify-between gap-3 sm:gap-4">
          <motion.p
            className="w-[120px] sm:w-[180px] md:w-[280px] shrink-0 text-[9px] sm:text-xs md:text-sm font-semibold tracking-widest uppercase text-left md:text-right"
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={7}
          >
            Creative Studios Built Around Elevating Your Vision Into Striking Reality
          </motion.p>
          <h1
            className="font-semibold uppercase text-right text-black"
            style={{ fontSize: "clamp(2rem, 9vw, 9rem)", lineHeight: 0.88 }}
          >
            {["Fearless", "Vision", "Delivered"].map((w, i) => (
              <span key={w} className="block overflow-hidden">
                <motion.span
                  className="block"
                  initial={{ y: "110%" }}
                  animate={{ y: 0 }}
                  transition={{ delay: 0.4 + i * 0.14, duration: 0.7, ease: EASE }}
                >
                  {w}
                </motion.span>
              </span>
            ))}
          </h1>
        </div>
      </div>

      {/* Mobile menu overlay */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-white flex flex-col px-5 sm:px-8 pt-5 pb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="flex items-center justify-between">
              <Logo3D size={56} />
              <button
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className="w-9 h-9 rounded-full bg-black flex items-center justify-center"
              >
                <X size={18} color="white" />
              </button>
            </div>
            <div className="flex flex-col gap-8 mt-16">
              {NAV_LINKS.map((l) => (
                <a
                  key={l}
                  href="#"
                  onClick={() => setMenuOpen(false)}
                  className="text-3xl font-semibold tracking-widest uppercase text-black"
                >
                  {l}
                </a>
              ))}
            </div>
            <a
              href="#"
              className="mt-auto inline-flex items-center gap-2 text-xl font-semibold tracking-widest uppercase"
              style={{ color: ACCENT }}
            >
              Work With Us
              <ArrowUpRight size={22} />
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default HeroSection;
