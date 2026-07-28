import { useEffect, type ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { initI18n, DEFAULT_LANG, LANG_COOKIE, i18n as sharedI18n, type Lang, SUPPORTED_LANGS } from "./index";

function readCookieLang(): Lang {
  if (typeof document === "undefined") return DEFAULT_LANG;
  const m = document.cookie.match(/(?:^|;\s*)lang=(fa|en)(?:;|$)/);
  return (m?.[1] as Lang | undefined) ?? DEFAULT_LANG;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const initial = typeof document !== "undefined" ? readCookieLang() : DEFAULT_LANG;
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
  try { sharedI18n.changeLanguage(lang); } catch {}
}
