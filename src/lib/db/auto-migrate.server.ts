/**
 * Applies db/migrations/*.sql at server boot.
 *
 * On a container host (Liara) there is no shell step between `docker run` and
 * the first request, and the runtime image has no bun to run `db:migrate` with.
 * The SQL files are therefore inlined into the server bundle at build time
 * (import.meta.glob + ?raw) and applied here, using the same `_migrations`
 * bookkeeping table as the CLI runner so the two never double-apply.
 *
 * A Postgres advisory lock serialises the run across cluster workers: the
 * first worker migrates, the others wait and then find nothing to do. The
 * lock is taken and released on one reserved connection: a session-level
 * advisory lock belongs to the connection that took it, and the pool may hand
 * each query a different one.
 *
 * Called by src/server.ts at boot and awaited before every request, so no
 * request runs against an older schema. Opt out with AUTO_MIGRATE=0.
 */
import { getDb, hasDb } from "../../../db/connection";

const files = import.meta.glob("../../../db/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const LOCK_KEY = 918273645;

let started: Promise<void> | null = null;

export function runAutoMigrations(): Promise<void> {
  if (started) return started;
  started = (async () => {
    if (!hasDb() || process.env.AUTO_MIGRATE === "0") return;
    const sql = getDb();
    let lock: Awaited<ReturnType<typeof sql.reserve>> | undefined;
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS _migrations (
          name text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      lock = await sql.reserve();
      await lock`SELECT pg_advisory_lock(${LOCK_KEY})`;
      try {
        const applied = new Set(
          (await sql<{ name: string }[]>`SELECT name FROM _migrations`).map((r) => r.name),
        );
        const ordered = Object.entries(files)
          .map(([path, contents]) => [path.split("/").pop()!, contents] as const)
          .sort((a, b) => a[0].localeCompare(b[0]));

        for (const [name, contents] of ordered) {
          if (applied.has(name)) continue;
          console.log(`[auto-migrate] applying ${name}`);
          await sql.begin(async (tx) => {
            await tx.unsafe(contents);
            await tx`INSERT INTO _migrations (name) VALUES (${name}) ON CONFLICT DO NOTHING`;
          });
        }
      } finally {
        await lock`SELECT pg_advisory_unlock(${LOCK_KEY})`;
      }
    } catch (error) {
      // A migration failure must not stop the process from serving: the health
      // endpoint already reports database reachability, and crash-looping the
      // container hides the real error. Tried again a minute later (for
      // example once the database is reachable), not on every request.
      console.error("[auto-migrate] failed", error);
      setTimeout(() => {
        started = null;
      }, 60_000).unref();
    } finally {
      lock?.release();
    }
  })();
  return started;
}
