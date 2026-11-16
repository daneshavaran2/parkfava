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
 * How many reverse proxies in front of the app append to X-Forwarded-For.
 * Liara's router is one. Set TRUSTED_PROXY_HOPS if another proxy (a CDN,
 * say) is ever put in front of it.
 */
function trustedProxyHops(): number {
  const n = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "", 10);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/**
 * Best-effort client identity. Behind Liara's proxy the socket address is the
 * proxy's, so the forwarded header is what actually distinguishes callers.
 * Falls back to a shared "unknown" bucket — which throttles collectively
 * rather than failing open.
 *
 * Only the entries our own proxies appended can be trusted. A client can send
 * any X-Forwarded-For it likes and the proxy appends the real address after
 * it, so the *leftmost* entry is attacker-chosen: keying on it (as
 * getRequestIP({ xForwardedFor: true }) does) gave every request a fresh
 * bucket and disabled every per-IP limit here — login spraying, sign-up, and
 * the paid assistant. The entry `hops` from the right is the address the
 * outermost trusted proxy actually received the connection from.
 */
export function clientKey(): string {
  try {
    const fwd = getRequestHeader("x-forwarded-for");
    if (fwd) {
      const chain = fwd.split(",").map((s) => s.trim()).filter(Boolean);
      if (chain.length) return chain[Math.max(0, chain.length - trustedProxyHops())]!;
    }
  } catch {
    /* no request context (e.g. called outside a server fn) */
  }
  try {
    const ip = getRequestIP();
    if (ip) return ip;
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
