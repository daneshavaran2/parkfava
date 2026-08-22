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

function terms(q: string) {
  return norm(q)
    .split(/[\s،,]+/)
    .filter((t) => t.length > 1);
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
