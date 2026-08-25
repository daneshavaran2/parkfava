import { useId, type ComponentType } from "react";
import type { Lang } from "@/i18n";

/**
 * Small bundled circular flags — deliberately not the react-circle-flags
 * package, which fetches every flag from an external CDN at render time
 * (react-circle-flags.pages.dev) even in its "inline" mode. That's a runtime
 * dependency this nav chrome shouldn't have: if that CDN is slow, blocked,
 * or down, the language selector silently loses its flags.
 *
 * Path data is adapted from the circle-flags project (HatScripts/circle-flags,
 * MIT licensed) rather than hand-drawn, so Iran's flag carries its actual
 * emblem and correct proportions and the UK flag is a proper Union Jack.
 * Each flag gets its own useId()-derived mask id — the source SVGs share
 * the literal id "a", which would collide if two flags (e.g. the trigger's
 * + a dropdown row's) render on the page at once and one silently loses
 * its circular clip.
 */

function IrFlag({ size }: { size: number }) {
  const maskId = useId();
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} aria-hidden="true">
      <mask id={maskId}>
        <circle cx="256" cy="256" r="256" fill="#fff" />
      </mask>
      <g mask={`url(#${maskId})`}>
        <path fill="#eee" d="M0 144.7 258.8 39.6 512 144.7v222.6L257 493 0 367.3z" />
        <path
          fill="#6da544"
          d="M0 0v144.7h105.6v-22.2h33.6v22.2h33.3v-22.2h33.6v22.2h33.3v-22.2H273v22.2h33v-22.2h33.6v22.2h33.2v-22.2h33.6v22.2H512V0z"
        />
        <path
          fill="#d80027"
          d="M0 367.3V512h512V367.3H406.4v22.4h-33.6v-22.4h-33.2v22.4H306v-22.4h-33v22.4h-33.6v-22.4h-33.3v22.4h-33.6v-22.4h-33.3v22.4h-33.6v-22.4zm339.1-178h-33.4c.2 3.7.4 7.4.4 11.1 0 24.8-6.2 48.8-17 66-3.3 5.2-9 12.6-16.4 17.6v-94.7h-33.4v94.8c-7.5-5-13-12.4-16.4-17.7-10.8-17-17-41-17-65.9 0-3.7.2-7.4.4-11H173a190 190 0 0 0-.4 11c0 68.7 36.7 122.5 83.5 122.5s83.5-53.8 83.5-122.5c0-3.7-.1-7.4-.4-11z"
        />
      </g>
    </svg>
  );
}

function GbFlag({ size }: { size: number }) {
  const maskId = useId();
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} aria-hidden="true">
      <mask id={maskId}>
        <circle cx="256" cy="256" r="256" fill="#fff" />
      </mask>
      <g mask={`url(#${maskId})`}>
        <path
          fill="#eee"
          d="m0 0 8 22-8 23v23l32 54-32 54v32l32 48-32 48v32l32 54-32 54v68l22-8 23 8h23l54-32 54 32h32l48-32 48 32h32l54-32 54 32h68l-8-22 8-23v-23l-32-54 32-54v-32l-32-48 32-48v-32l-32-54 32-54V0l-22 8-23-8h-23l-54 32-54-32h-32l-48 32-48-32h-32l-54 32L68 0H0z"
        />
        <path
          fill="#0052b4"
          d="M336 0v108L444 0Zm176 68L404 176h108zM0 176h108L0 68ZM68 0l108 108V0Zm108 512V404L68 512ZM0 444l108-108H0Zm512-108H404l108 108Zm-68 176L336 404v108z"
        />
        <path
          fill="#d80027"
          d="M0 0v45l131 131h45L0 0zm208 0v208H0v96h208v208h96V304h208v-96H304V0h-96zm259 0L336 131v45L512 0h-45zM176 336 0 512h45l131-131v-45zm160 0 176 176v-45L381 336h-45z"
        />
      </g>
    </svg>
  );
}

const FLAGS: Record<Lang, ComponentType<{ size: number }>> = {
  fa: IrFlag,
  en: GbFlag,
};

export function LanguageFlag({ lang, size = 44 }: { lang: Lang; size?: number }) {
  const Flag = FLAGS[lang];
  return <Flag size={size} />;
}
