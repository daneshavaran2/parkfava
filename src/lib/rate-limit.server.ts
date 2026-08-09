// Server-only. Fixed-window rate limiting backed by the `rate_limit_hits`
// table (see db/migrations/0004_scale_and_integrity.sql).
//
// Postgres-backed rather than in-process on purpose: the app can run as
// several worker processes (server/cluster.mjs), and a per-process counter
// would let a client get N times the allowance — and reset to zero on every
// deploy. One small INSERT is negligible next to what it's protecting (an
// OpenRouter call that takes seconds and costs money).
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { getDb } from "../../db/connection";

export class RateLimitError extends Error {
  constructor() {
    super("RATE_LIMITED");
    this.name = "RateLimitError";
  }
}

/**
 * Best-effort client identity. Behind Liara's proxy the socket address is the
 * proxy's, so the forwarded headers are what actually distinguish callers.
 * Falls back to a shared "unknown" bucket — which throttles collectively
 * rather than failing open.
 */
export function clientKey(): string {
  try {
    const ip = getRequestIP({ xForwardedFor: true });
    if (ip) return ip;
  } catch {
    /* no request context (e.g. called outside a server fn) */
  }
  try {
    const fwd = getRequestHeader("x-forwarded-for");
    if (fwd) return fwd.split(",")[0]!.trim();
  } catch {
    /* ignore */
  }
  return "unknown";
}

/**
 * Records a hit and throws RateLimitError if `key` has already used up
 * `limit` requests within the trailing `windowSeconds`.
 *
 * Rows older than the window are pruned opportunistically (1-in-20 calls) so
 * the table stays small without needing pg_cron or a separate worker.
 */
export async function enforceRateLimit(
  key: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
): Promise<void> {
  const sql = getDb();
  const bucket = key;

  const [{ count }] = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM rate_limit_hits
    WHERE bucket = ${bucket}
      AND created_at > now() - make_interval(secs => ${windowSeconds})
  `;

  if (Number(count) >= limit) throw new RateLimitError();

  await sql`INSERT INTO rate_limit_hits (bucket) VALUES (${bucket})`;

  if (Math.random() < 0.05) {
    // Keep a generous margin over the longest window in use rather than
    // deleting exactly at the boundary, so a concurrent count() can't race
    // against the prune and under-count.
    await sql`
      DELETE FROM rate_limit_hits
      WHERE created_at < now() - make_interval(secs => ${windowSeconds * 4})
    `;
  }
}
