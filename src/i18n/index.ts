import i18next, { type i18n as I18nInstance } from "i18next";
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

const resources = { fa: { translation: fa }, en: { translation: en } };

function baseConfig(initialLang?: Lang) {
  return {
    resources,
    lng: initialLang ?? DEFAULT_LANG,
    fallbackLng: DEFAULT_LANG,
    supportedLngs: SUPPORTED_LANGS as unknown as string[],
    interpolation: { escapeValue: false },
    returnNull: false,
  };
}

let clientInstance: I18nInstance | null = null;

/**
 * On the server this returns a FRESH i18next instance every call. The SSR
 * server is one long-lived Node process handling many visitors' requests,
 * so a module-level singleton (the previous implementation) would leak one
 * user's language into every other concurrent/subsequent request once it
 * was first initialized. On the client, one shared singleton is correct
 * and expected — a browser tab only ever has a single user.
 */
export function initI18n(initialLang?: Lang): I18nInstance {
  if (typeof window === "undefined") {
    const instance = i18next.createInstance();
    instance.use(initReactI18next).init(baseConfig(initialLang));
    return instance;
  }
  if (clientInstance) return clientInstance;
  clientInstance = i18next.createInstance();
  clientInstance.use(initReactI18next).use(LanguageDetector).init({
    ...baseConfig(initialLang),
    detection: {
      order: ["cookie", "localStorage", "navigator"],
      caches: ["cookie", "localStorage"],
      lookupCookie: LANG_COOKIE,
      cookieMinutes: 60 * 24 * 365,
    },
  });
  return clientInstance;
}

/** The shared client i18next instance, for use outside React (e.g. setAppLanguage). Null on the server / before the client instance is created. */
export function getClientI18n(): I18nInstance | null {
  return clientInstance;
}
