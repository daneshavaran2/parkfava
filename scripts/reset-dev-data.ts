/**
 * Purges rows created by `scripts/seed-dev-data.ts`.
 * Identifies seed rows by the `[SEED]` prefix in their name/title columns.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config();

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to reset a production environment.");
  process.exit(1);
}

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function purge(table: string, column: string) {
  const { error, count } = await sb.from(table).delete({ count: "exact" }).like(column, "[SEED]%");
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`  ✓ ${table}: removed ${count ?? 0} rows`);
}

async function main() {
  // order matters: children before parents (products -> images -> companies -> parks)
  await purge("exhibition_products", "name");
  await sb.from("exhibition_images").delete().like("caption", "[SEED]%");
  await purge("exhibition_companies", "name");
  await sb.from("park_content").delete().like("hero_title", "[SEED]%");
  await purge("parks", "name");
  console.log("\nSeed data cleared.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
