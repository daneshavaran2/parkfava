/**
 * One-off script: enriches exhibition_companies / exhibition_products with
 * data extracted from the official "اطلس جامع محصولات شرکت‌های پارک فاوا"
 * PDF catalog (see scripts/atlas-data.json). Matches each catalog entry to
 * an existing company by website/email domain, falling back to fuzzy name
 * comparison, then updates that company's description/founders/headcount/
 * export potential/founded year and upserts its products.
 *
 * Run: bun run scripts/apply-atlas-data.ts
 * Safe to re-run — company updates are plain field overwrites keyed by
 * company_id, and products are matched by (company_id, name) before
 * deciding to update vs insert.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { findMatch } from "./lib/company-match";
import type { AtlasCompany } from "./lib/atlas-data";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
const sql = postgres(DATABASE_URL, {
  ssl: DATABASE_URL.includes("sslmode=require") ? "require" : false,
});

type DbCompany = {
  company_id: string;
  name: string;
  name_en: string | null;
  website: string | null;
  email: string | null;
};

const dataPath = join(dirname(fileURLToPath(import.meta.url)), "atlas-data.json");
const atlasCompanies: AtlasCompany[] = JSON.parse(readFileSync(dataPath, "utf8"));

async function main() {
  const dbCompanies = await sql<
    DbCompany[]
  >`SELECT company_id, name, name_en, website, email FROM exhibition_companies`;

  let matched = 0;
  let unmatched = 0;
  let productsUpserted = 0;

  for (const atlas of atlasCompanies) {
    const result = findMatch(atlas, dbCompanies);
    if (!result) {
      console.log(`NO MATCH: ${atlas.name}`);
      unmatched++;
      continue;
    }
    const { company, method } = result;
    console.log(`MATCH (${method}): ${atlas.name} -> ${company.company_id} (${company.name})`);
    matched++;

    try {
      await sql`
        UPDATE exhibition_companies SET
          name_en = COALESCE(${atlas.name_en || null}, name_en),
          description = ${atlas.intro || null},
          description_en = ${atlas.intro_en || null},
          intro = ${atlas.intro || null},
          intro_en = ${atlas.intro_en || null},
          tagline = COALESCE(${atlas.activity_domain || null}, tagline),
          tagline_en = COALESCE(${atlas.activity_domain_en || null}, tagline_en),
          founders = ${atlas.founders || null},
          founders_en = ${atlas.founders_en || null},
          headcount_full_time = ${atlas.headcount_full_time},
          headcount_part_time = ${atlas.headcount_part_time},
          knowledge_products_intro = ${atlas.flagship_product || null},
          knowledge_products_intro_en = ${atlas.flagship_product_en || null},
          export_potential = ${atlas.export_potential || null},
          export_potential_en = ${atlas.export_potential_en || null},
          website = COALESCE(${atlas.website || null}, website),
          email = COALESCE(${atlas.email || null}, email),
          phone = COALESCE(${atlas.phone || null}, phone),
          founded_at = ${atlas.founded_year ? `${atlas.founded_year + 621}-01-01` : null},
          updated_at = now()
        WHERE company_id = ${company.company_id}
      `;

      for (const p of atlas.products) {
        if (!p.name || !p.description) continue;
        const existing = await sql<{ id: string }[]>`
          SELECT id FROM exhibition_products WHERE company_id = ${company.company_id} AND name = ${p.name}
        `;
        if (existing.length) {
          await sql`UPDATE exhibition_products SET name_en = ${p.name_en || null}, description = ${p.description}, description_en = ${p.description_en || null}, updated_at = now() WHERE id = ${existing[0].id}`;
        } else {
          await sql`INSERT INTO exhibition_products (company_id, name, name_en, description, description_en) VALUES (${company.company_id}, ${p.name}, ${p.name_en || null}, ${p.description}, ${p.description_en || null})`;
        }
        productsUpserted++;
      }
    } catch (e) {
      console.error(`  FAILED to apply ${atlas.name}:`, (e as Error).message);
    }
  }

  console.log(
    `\n✓ Done. ${matched} matched, ${unmatched} unmatched, ${productsUpserted} products upserted.`,
  );
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
