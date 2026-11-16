/**
 * Server-side guard for user-supplied URL fields (company website, catalog,
 * video, product links, image paths). These end up in href/src attributes,
 * so a value whose scheme runs script or embeds content — javascript:,
 * vbscript:, data:, file: — must never be stored. React 19 already blocks
 * javascript: in JSX hrefs; this keeps the stored data itself clean for every
 * other consumer (the offline export, admin tools, future renderers).
 *
 * Scheme-less values stay allowed: sites are often entered as
 * "www.example.com", and uploaded files are stored as relative paths such as
 * "exhibition/<id>/<file>.png".
 */
import { z } from "zod";

const BLOCKED_SCHEMES = ["javascript:", "vbscript:", "data:", "file:"];

export function hasBlockedScheme(value: string): boolean {
  // Browsers ignore ASCII whitespace and control characters inside a scheme
  // ("java\tscript:" still runs), so drop them before comparing.
  // eslint-disable-next-line no-control-regex
  const folded = value.replace(/[\u0000- \u007f]/g, "").toLowerCase();
  return BLOCKED_SCHEMES.some((scheme) => folded.startsWith(scheme));
}

/** A trimmed string of at most `max` characters whose URL scheme is safe. */
export function safeUrlString(max = 1000) {
  return z
    .string()
    .trim()
    .max(max)
    .refine((v) => !hasBlockedScheme(v), { message: "UNSAFE_URL" });
}
