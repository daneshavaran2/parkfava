import { useTranslation } from "react-i18next";
import { setAppLanguage } from "@/i18n/LanguageProvider";
import type { Lang } from "@/i18n";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current: Lang = i18n.language?.startsWith("en") ? "en" : "fa";
  const next: Lang = current === "fa" ? "en" : "fa";
  const label = next === "en" ? "EN" : "FA";
  const title = next === "en" ? t("common.switch_to_english") : t("common.switch_to_persian");
  return (
    <button
      type="button"
      className="lang-btn"
      onClick={() => setAppLanguage(next)}
      title={title}
      aria-label={`${t("common.language")}: ${title}`}
    >
      <span aria-hidden="true" style={{ fontSize: 12, opacity: 0.7, marginInlineEnd: 4 }}>🌐</span>
      <span style={{ fontWeight: 700, letterSpacing: 0.5 }}>{label}</span>
    </button>
  );
}
