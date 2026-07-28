import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import fa from "./locales/fa.json";
import en from "./locales/en.json";

export const SUPPORTED_LANGS = ["fa", "en"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];
export const DEFAULT_LANG: Lang = "fa";
export const LANG_COOKIE = "lang";

export function readLangCookieFromString(cookieHeader: string | null | undefined): Lang {
  if (!cookieHeader) return DEFAULT_LANG;
  const match = cookieHeader.match(/(?:^|;\s*)lang=(fa|en)(?:;|$)/);
  return (match?.[1] as Lang | undefined) ?? DEFAULT_LANG;
}

let initialized = false;
export function initI18n(initialLang?: Lang) {
  if (initialized) return i18n;
  initialized = true;
  const chain = i18n.use(initReactI18next);
  // Detector only makes sense in the browser.
  if (typeof window !== "undefined") chain.use(LanguageDetector);
  chain.init({
    resources: { fa: { translation: fa }, en: { translation: en } },
    lng: initialLang ?? DEFAULT_LANG,
    fallbackLng: DEFAULT_LANG,
    supportedLngs: SUPPORTED_LANGS as unknown as string[],
    interpolation: { escapeValue: false },
    detection: {
      order: ["cookie", "localStorage", "navigator"],
      caches: ["cookie", "localStorage"],
      lookupCookie: LANG_COOKIE,
      cookieMinutes: 60 * 24 * 365,
    },
    returnNull: false,
  });
  return i18n;
}

export { i18n };
