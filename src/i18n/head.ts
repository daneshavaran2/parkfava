/**
 * Translations for route `head()` functions.
 *
 * `head()` is a route option, not a component — it runs before (and outside)
 * React, so useTranslation() is unavailable there. Every route therefore had
 * its <title> and description written as a Persian string literal, which is
 * what an English visitor got in the browser tab, in search results, and in
 * every link preview no matter which language they had chosen.
 *
 * This resolves a key against the same locale files react-i18next uses, for
 * whichever language the request's cookie names. It reads the JSON directly
 * instead of spinning up an i18next instance: head() runs per route per
 * request, and a plain lookup is all a title needs.
 */
import { currentLang } from "./LanguageProvider";
import { DEFAULT_LANG } from "./index";
import fa from "./locales/fa.json";
import en from "./locales/en.json";

const DICTIONARIES: Record<string, unknown> = { fa, en };

/**
 * `tHead("meta.home_title")`, with optional `{{placeholder}}` values.
 * Returns the key itself if it is missing, matching i18next's behaviour —
 * a visible key in a title is easier to spot and fix than a blank one.
 */
export function tHead(key: string, vars?: Record<string, string | number>): string {
  const lang = currentLang();
  const table = DICTIONARIES[lang] ?? DICTIONARIES[DEFAULT_LANG];
  const value = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], table);
  if (typeof value !== "string") return key;
  if (!vars) return value;
  return value.replace(/\{\{(\w+)\}\}/g, (whole, name) =>
    name in vars ? String(vars[name]) : whole,
  );
}
