/**
 * What a person can type into the sign-in form's username box: either an
 * email address (admins, self-registered users) or a company's 11-digit
 * national ID (shenase-ye melli of a legal entity — the login id for park
 * member companies, see scripts/provision-national-id-logins.ts).
 *
 * Shared by the server (to decide which column to look up) and the client
 * (to label the field), so it must stay free of server-only imports.
 */

/**
 * Persian (U+06F0..U+06F9) and Arabic-Indic (U+0660..U+0669) digits -> ASCII.
 *
 * On a Persian keyboard layout the number row types the Persian digits, so a
 * user typing their national ID — or a numeric password such as the mobile
 * number companies get as an initial password — can send either form without
 * noticing. Escapes rather than literals, per scripts/lint-i18n.ts.
 */
export function toAsciiDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/**
 * Check digit of an Iranian legal-entity national ID (11 digits). The 10th
 * digit plus 2 is added to each of the first ten digits before weighting;
 * the weighted sum mod 11 (10 folds to 0) must equal the last digit.
 */
export function isValidNationalId(id: string): boolean {
  if (!/^\d{11}$/.test(id)) return false;
  const d = [...id].map(Number);
  const weights = [29, 27, 23, 19, 17, 29, 27, 23, 19, 17];
  const offset = d[9] + 2;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (d[i] + offset) * weights[i];
  const check = sum % 11 === 10 ? 0 : sum % 11;
  return check === d[10];
}

export type LoginId = { kind: "email"; value: string } | { kind: "national_id"; value: string };

/**
 * Classifies a typed username. Anything that is all digits once separators
 * are dropped is treated as a national ID (an email always has an "@"), so a
 * mistyped ID is still looked up as an ID and fails as an ordinary wrong
 * credential rather than as a malformed email.
 */
export function parseLoginId(raw: string): LoginId | null {
  const trimmed = toAsciiDigits(raw).trim();
  if (!trimmed) return null;
  if (trimmed.includes("@")) return { kind: "email", value: trimmed.toLowerCase() };
  const digits = trimmed.replace(/[\s-]/g, "");
  if (/^\d+$/.test(digits)) return { kind: "national_id", value: digits };
  return null;
}
