import type { Lang } from "@/i18n";

export type LanguageOption = {
  code: Lang;
  /** Always shown in the language's own script — a language name is not translated. */
  nativeLabel: string;
  direction: "rtl" | "ltr";
};

/**
 * Only the languages src/i18n actually has translations for (SUPPORTED_LANGS
 * in src/i18n/index.ts). Extending this to a third language means adding a
 * locale file there first, then a matching entry here — not the other way
 * around, or the selector would offer a language the site can't render.
 */
export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "fa", nativeLabel: "فارسی", direction: "rtl" },
  { code: "en", nativeLabel: "English", direction: "ltr" },
];
