import type { ComponentType } from "react";
import type { Lang } from "@/i18n";

/**
 * Small bundled circular flags — deliberately not the react-circle-flags
 * package, which fetches every flag from an external CDN at render time
 * (react-circle-flags.pages.dev) even in its "inline" mode. That's a runtime
 * dependency this nav chrome shouldn't have: if that CDN is slow, blocked,
 * or down, the language selector silently loses its flags. Two flags is few
 * enough to just bundle as SVG.
 */

function IrFlag({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <clipPath id="ir-circle">
        <circle cx="16" cy="16" r="16" />
      </clipPath>
      <g clipPath="url(#ir-circle)">
        <rect width="32" height="32" fill="#fff" />
        <rect width="32" height="10.67" fill="#239f40" />
        <rect y="21.33" width="32" height="10.67" fill="#da0000" />
      </g>
    </svg>
  );
}

function UsFlag({ size }: { size: number }) {
  const stripeH = 32 / 13;
  const stripes = Array.from({ length: 13 }, (_, i) => (
    <rect key={i} y={i * stripeH} width="32" height={stripeH} fill={i % 2 === 0 ? "#b22234" : "#fff"} />
  ));
  const stars = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      stars.push(
        <circle key={`${row}-${col}`} cx={2 + col * 2.9} cy={2 + row * 2.9} r="0.7" fill="#fff" />,
      );
    }
  }
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <clipPath id="us-circle">
        <circle cx="16" cy="16" r="16" />
      </clipPath>
      <g clipPath="url(#us-circle)">
        {stripes}
        <rect width="14.5" height="17.23" fill="#3c3b6e" />
        {stars}
      </g>
    </svg>
  );
}

const FLAGS: Record<Lang, ComponentType<{ size: number }>> = {
  fa: IrFlag,
  en: UsFlag,
};

export function LanguageFlag({ lang, size = 44 }: { lang: Lang; size?: number }) {
  const Flag = FLAGS[lang];
  return <Flag size={size} />;
}
