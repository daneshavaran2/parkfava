import { useEffect, type ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { initI18n, getClientI18n, DEFAULT_LANG, LANG_COOKIE, type Lang, SUPPORTED_LANGS } from "./index";

// Reads the *actual* request's `lang` cookie so SSR renders in the same
// language the client will hydrate with. Without this the server always
// rendered DEFAULT_LANG regardless of the visitor's saved preference, so
// anyone who'd previously chosen English got a Persian-then-English flash
// (and a hydration warning) on every fresh page load.
//
// createIsomorphicFn keeps the server implementation (which needs
// @tanstack/react-start/server's request-scoped getCookie) out of the
// client bundle entirely — importing that module directly from a
// client-rendered file is a build-time error in this framework.
const readCookieLang = createIsomorphicFn()
  .server((): Lang => {
    const v = getCookie(LANG_COOKIE);
    return v === "en" || v === "fa" ? v : DEFAULT_LANG;
  })
  .client((): Lang => {
    const m = document.cookie.match(/(?:^|;\s*)lang=(fa|en)(?:;|$)/);
    return (m?.[1] as Lang | undefined) ?? DEFAULT_LANG;
  });

export function LanguageProvider({ children }: { children: ReactNode }) {
  let initial: Lang = DEFAULT_LANG;
  try {
    initial = readCookieLang();
  } catch {
    /* keep DEFAULT_LANG if cookie reading fails for any reason */
  }
  const i18n = initI18n(initial);
  return <I18nextProvider i18n={i18n}>{children}<LangDomSync /></I18nextProvider>;
}

function LangDomSync() {
  const { i18n } = useTranslation();
  useEffect(() => {
    const lang = (SUPPORTED_LANGS as readonly string[]).includes(i18n.language)
      ? (i18n.language as Lang)
      : DEFAULT_LANG;
    const dir = lang === "en" ? "ltr" : "rtl";
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
      document.documentElement.dir = dir;
    }
  }, [i18n.language]);
  return null;
}

export function setAppLanguage(lang: Lang) {
  if (typeof document !== "undefined") {
    document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    try { localStorage.setItem("i18nextLng", lang); } catch {}
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "en" ? "ltr" : "rtl";
  }
  // Switch language in-place — no reload; avoids race with theme button.
  try { getClientI18n()?.changeLanguage(lang); } catch {}
}
