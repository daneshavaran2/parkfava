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
 * yeh/kaf, and punctuation — none of which are meaningful differences. Strip
 * all of it, so a name written with a ZWNJ and the same name written with
 * a plain space compare equal.
 */
export function normName(s: string | null | undefined): string {
  return (s || "")
    .replace(/[‌\s]/g, "")
    // Arabic yeh/kaf -> Persian yeh/kaf, then drop quotes, brackets and both
    // comma forms. Escapes rather than literals so this stays inside the
    // "no Persian outside the UI layer" rule (scripts/lint-i18n.ts).
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[()«»"'.,،]/g, "")
    .toLowerCase()
    .trim();
}

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
  if (domain) {
    const byWebsite = haystack.find((d) => normDomain(d.website) === domain);
    if (byWebsite) return { company: byWebsite, method: "website" };
  }

  const emailDomain = needle.email ? needle.email.split("@")[1]?.toLowerCase() : null;
  if (emailDomain) {
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
