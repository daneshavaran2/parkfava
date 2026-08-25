import type { ExhibitionCompany, ExhibitionProduct } from "@/lib/exhibition-api";
import type { Park } from "@/lib/parks-api";

function norm(s: unknown) {
  return (s ?? "")
    .toString()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/‌/g, " ")
    .toLowerCase();
}

// Generic connector/filler words that add no distinguishing signal against
// exhibition_companies' search_text — "شرکت‌های هوش مصنوعی مشهد" (the exact
// wording of the site's own example query) tokenizes to five words, two of
// which ("شرکت", "های") are just Persian for "companies of" and match
// virtually every row, drowning out the two words that actually mean
// something (هوش, مصنوعی).
const STOPWORDS = new Set([
  "شرکت", "شرکتهای", "های", "در", "و", "با", "از", "به", "این", "آن", "که",
  "برای", "یک", "تا", "است", "می", "را",
  "the", "a", "an", "of", "in", "for", "and", "or",
]);

function terms(q: string) {
  return norm(q)
    .split(/[\s،,]+/)
    .filter((t) => {
      if (STOPWORDS.has(t)) return false;
      // A short Latin acronym (AI, IT, IoT) is unlikely to appear as an
      // accidental substring inside unrelated text, but a short Persian
      // fragment very much is — "تک" (from "فین‌تک" split on its ZWNJ) is a
      // substring of "تکنولوژی" and dozens of unrelated words, so a 2-char
      // Persian term does more harm than good as a broad substring match.
      return /^[a-z0-9]+$/i.test(t) ? t.length >= 2 : t.length >= 3;
    });
}

// Only ever answers from what's actually live in the exhibition database
// (approved + active companies/products, active parks) — never invents or
// guesses. If nothing in the system matches, the caller falls back to the
// AI's general knowledge instead of fabricating a plausible-sounding answer.
function searchCompanies(
  question: string,
  companies: ExhibitionCompany[],
  productsByCompany: Map<string, ExhibitionProduct[]>,
) {
  const t = terms(question);
  if (!t.length) return [];
  return companies
    .map((c) => {
      const myProducts = productsByCompany.get(c.company_id) || [];
      const hay = norm(
        [
          c.name,
          c.name_en,
          c.tagline,
          c.tagline_en,
          c.city,
          c.city_en,
          c.category,
          c.description,
          c.description_en,
        ].join(" "),
      );
      let score = 0;
      const matchedProducts: ExhibitionProduct[] = [];
      t.forEach((term) => {
        if (hay.includes(term)) score += 1;
        myProducts.forEach((p) => {
          const productHay = norm([p.name, p.name_en].join(" "));
          if (productHay.includes(term) && !matchedProducts.includes(p)) {
            matchedProducts.push(p);
            score += 1;
          }
        });
      });
      return { c, score, matchedProducts };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

function searchParks(question: string, parks: Park[]) {
  const t = terms(question);
  if (!t.length) return [];
  const matched = parks.filter((p) => {
    const hay = norm(
      [p.name, p.name_en, p.city, p.city_en, p.province, p.province_en].join(" "),
    );
    return t.some((term) => hay.includes(term));
  });
  if (matched.length) return matched.slice(0, 4);
  // "پارک‌های فعال" / "active parks" — no specific park named, but the
  // question is clearly about parks in general (checked in both languages
  // since the UI, and thus the question, can be in English).
  const n = norm(question);
  if (n.includes("پارک") || n.includes("park")) return parks.slice(0, 6);
  return [];
}

export { norm, terms, searchCompanies, searchParks };
