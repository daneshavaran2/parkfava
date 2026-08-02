/**
 * Server-only Postgres connection. Do not import this from client code —
 * it reads DATABASE_URL and opens a real TCP connection, which only makes
 * sense inside a TanStack Start server function or a Node script.
 */
import postgres from "postgres";

let sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (sql) return sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required.");
  sql = postgres(url, {
    // Liara's managed Postgres (and most self-hosted setups behind a
    // reverse proxy) terminate TLS with a cert that isn't in the default
    // trust store; `require` still encrypts the connection without
    // insisting on chain verification. Local dev (no sslmode in the URL)
    // stays plain TCP.
    ssl: url.includes("sslmode=require") ? "require" : false,
  });
  return sql;
}
