/**
 * Matching a company record from one source (the atlas PDF, a booklet form,
 * a spreadsheet) to the same company in another — the recurring problem in
 * every import script here, because the only shared key is a Persian company
 * name that is spelled inconsistently across sources.
 *
 * Extracted from scripts/apply-atlas-data.ts so the booklet importer matches
 * companies exactly the same way rather than growing a second, subtly
 * different implementation.
 */

export type MatchableCompany = {
  name: string;
  name_en?: string | null;
  website?: string | null;
  email?: string | null;
};

/** Bare hostname: no scheme, no www., no path. `null` when there's nothing to compare. */
export function normDomain(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = s
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();
  return d || null;
}

/**
 * Persian names differ across sources by spacing, ZWNJ, Arabic vs Persian
 * yeh/kaf, alef-madda vs plain alef, and punctuation — none of which are
 * meaningful differences. Strip all of it, so a name written with a ZWNJ and
 * the same name written with a plain space compare equal.
 *
 * The alef pass matters more than it looks: two equally-accepted spellings
 * of the same word can differ *only* by alef-madda (U+0622) vs a plain alef
 * (U+0627) — e.g. one source's "-tech" suffix written with the ligature form,
 * another's written as a separate alef after a ZWNJ. Without folding
 * U+0622 -> U+0627 those two spellings survive every other normalization
 * step still unequal, and the company gets imported twice under two names —
 * the ZWNJ/spacing rule alone does not catch it.
 */
export function normName(s: string | null | undefined): string {
  return (s || "")
    .replace(/[‌\s]/g, "")
    // Arabic yeh/kaf -> Persian yeh/kaf, alef-madda -> plain alef, then drop
    // quotes, brackets and both comma forms. Escapes rather than literals so
    // this stays inside the "no Persian outside the UI layer" rule
    // (scripts/lint-i18n.ts).
    .replace(/\u064A/g, "\u06CC")
    .replace(/\u0643/g, "\u06A9")
    .replace(/\u0622/g, "\u0627")
    .replace(/[()\u00AB\u00BB"'.,\u060C]/g, "")
    .toLowerCase()
    .trim();
}

// Free/public email providers are shared by thousands of unrelated small
// companies — a matching domain here is not evidence of being the same
// company, unlike a company's own custom domain. Without this guard, two
// completely different companies both using a @gmail.com address were
// treated as the same company (found via scripts/provision-company-owners.ts:
// ~10 distinct companies all "matched" to whichever one happened to be
// first in the haystack), silently misassigning one company's data — and,
// for that script, its login/ownership account — to an unrelated one.
const GENERIC_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com",
  "ymail.com", "icloud.com", "aol.com", "mail.com", "chmail.ir", "mail.ir",
  "yahoo.co.uk",
]);

/**
 * Strongest signal first: a shared web or email domain is proof, an exact
 * normalised name is near-proof, and substring overlap is the last resort
 * (it is the one that can misfire, so callers get the method back and can
 * log it).
 *
 * `minSubstringLength` guards that last resort: a two-character name is a
 * substring of half the table and would match arbitrarily.
 */
export function findMatch<T extends MatchableCompany>(
  needle: MatchableCompany,
  haystack: T[],
  { minSubstringLength = 6 }: { minSubstringLength?: number } = {},
): { company: T; method: string } | null {
  const domain = normDomain(needle.website);
  if (domain && !GENERIC_DOMAINS.has(domain)) {
    const byWebsite = haystack.find((d) => normDomain(d.website) === domain);
    if (byWebsite) return { company: byWebsite, method: "website" };
  }

  const emailDomain = needle.email ? needle.email.split("@")[1]?.toLowerCase() : null;
  if (emailDomain && !GENERIC_DOMAINS.has(emailDomain)) {
    const byEmail = haystack.find(
      (d) => d.email && d.email.split("@")[1]?.toLowerCase() === emailDomain,
    );
    if (byEmail) return { company: byEmail, method: "email" };
  }

  const wanted = normName(needle.name);
  if (wanted) {
    const byName = haystack.find((d) => normName(d.name) === wanted);
    if (byName) return { company: byName, method: "name" };
  }

  if (wanted.length >= minSubstringLength) {
    const bySubstring = haystack.find((d) => {
      const other = normName(d.name);
      if (other.length < minSubstringLength) return false;
      return other.includes(wanted) || wanted.includes(other);
    });
    if (bySubstring) return { company: bySubstring, method: "name-substring" };
  }

  if (needle.name_en) {
    const enWanted = normName(needle.name_en);
    if (enWanted) {
      const byNameEn = haystack.find((d) => d.name_en && normName(d.name_en) === enWanted);
      if (byNameEn) return { company: byNameEn, method: "name_en" };
    }
  }

  return null;
}
