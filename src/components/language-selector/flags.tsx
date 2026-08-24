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
 * emblem and the correct proportions instead of a plain tricolor, and the US
 * flag has real stars instead of placeholder dots. Each flag gets its own
 * useId()-derived mask id — the source SVGs share the literal id "a", which
 * would collide if two flags (e.g. the trigger's + a dropdown row's) render
 * on the page at once and one silently loses its circular clip.
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

function UsFlag({ size }: { size: number }) {
  const maskId = useId();
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} aria-hidden="true">
      <mask id={maskId}>
        <circle cx="256" cy="256" r="256" fill="#fff" />
      </mask>
      <g mask={`url(#${maskId})`}>
        <path
          fill="#eee"
          d="M256 0h256v64l-32 32 32 32v64l-32 32 32 32v64l-32 32 32 32v64l-256 32L0 448v-64l32-32-32-32v-64z"
        />
        <path fill="#d80027" d="M224 64h288v64H224Zm0 128h288v64H256ZM0 320h512v64H0Zm0 128h512v64H0Z" />
        <path fill="#0052b4" d="M0 0h256v256H0Z" />
        <path
          fill="#eee"
          d="m187 243 57-41h-70l57 41-22-67zm-81 0 57-41H93l57 41-22-67zm-81 0 57-41H12l57 41-22-67zm162-81 57-41h-70l57 41-22-67zm-81 0 57-41H93l57 41-22-67zm-81 0 57-41H12l57 41-22-67Zm162-82 57-41h-70l57 41-22-67Zm-81 0 57-41H93l57 41-22-67zm-81 0 57-41H12l57 41-22-67Z"
        />
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
