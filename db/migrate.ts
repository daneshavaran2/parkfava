/**
 * Applies db/migrations/*.sql to DATABASE_URL, in filename order, tracking
 * what's already been applied in a `_migrations` table so re-running is
 * safe. This is the self-hosted-Postgres equivalent of Supabase's
 * migration flow — unlike that flow, this one actually runs from a script
 * instead of requiring manual dashboard/CLI steps.
 *
 * Usage: bun run db:migrate
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { config } from "dotenv";

config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

async function main() {
  const sql = postgres(url!, { ssl: url!.includes("sslmode=require") ? "require" : false });

  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const applied = new Set((await sql<{ name: string }[]>`SELECT name FROM _migrations`).map((r) => r.name));
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const contents = readFileSync(join(migrationsDir, file), "utf8");
    console.log(`Applying ${file}...`);
    await sql.begin(async (tx) => {
      await tx.unsafe(contents);
      await tx`INSERT INTO _migrations (name) VALUES (${file})`;
    });
    ran++;
  }

  console.log(ran ? `\n✓ Applied ${ran} migration(s).` : "\nNothing to apply — already up to date.");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
