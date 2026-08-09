/**
 * Purges rows created by `scripts/seed-dev-data.ts`.
 * Identifies seed rows by the `[SEED]` prefix in their name/title columns.
 *
 * Usage:  bun run reset:dev
 */
import postgres from "postgres";
import { config } from "dotenv";

config();

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to reset a production environment.");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sql = postgres(url, { ssl: url.includes("sslmode=require") ? "require" : false });

/** Table and column names are literals below, never input. */
async function purge(table: string, column: string) {
  const rows = await sql`DELETE FROM ${sql(table)} WHERE ${sql(column)} LIKE '[SEED]%'`;
  console.log(`  ✓ ${table}: removed ${rows.count} rows`);
}

async function main() {
  // Order matters: children before parents. exhibition_products/_images
  // cascade from exhibition_companies and park_content from parks, so this is
  // belt-and-braces — but it keeps the reported counts accurate rather than
  // showing zero for rows the cascade already took.
  await purge("exhibition_products", "name");
  await purge("exhibition_images", "caption");
  await purge("exhibition_companies", "name");
  await purge("park_content", "display_name");
  await purge("parks", "name");
  await purge("about_sections", "title");
  console.log("\nSeed data cleared.");
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end().catch(() => {});
  process.exit(1);
});
