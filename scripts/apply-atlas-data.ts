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

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
const sql = postgres(DATABASE_URL, {
  ssl: DATABASE_URL.includes("sslmode=require") ? "require" : false,
});

type AtlasProduct = { name: string; description: string };
type AtlasCompany = {
  name: string;
  founded_year: number | null;
  activity_domain: string | null;
  intro: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  name_en: string | null;
  founders: string | null;
  headcount_full_time: number | null;
  headcount_part_time: number | null;
  flagship_product: string | null;
  export_potential: string | null;
  products: AtlasProduct[];
};

type DbCompany = {
  company_id: string;
  name: string;
  name_en: string | null;
  website: string | null;
  email: string | null;
};

const dataPath = join(dirname(fileURLToPath(import.meta.url)), "atlas-data.json");
const atlasCompanies: AtlasCompany[] = JSON.parse(readFileSync(dataPath, "utf8"));

function normDomain(s: string | null | undefined): string | null {
  if (!s) return null;
  return s
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();
}

function normName(s: string | null | undefined): string {
  return (s || "")
    .replace(/[‌\s]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[()«»"'.,،]/g, "")
    .toLowerCase()
    .trim();
}

function findMatch(
  atlas: AtlasCompany,
  dbCompanies: DbCompany[],
): { company: DbCompany; method: string } | null {
  const atlasDomain = normDomain(atlas.website);
  if (atlasDomain) {
    const byWebsite = dbCompanies.find((d) => normDomain(d.website) === atlasDomain);
    if (byWebsite) return { company: byWebsite, method: "website" };
  }
  const atlasEmailDomain = atlas.email ? atlas.email.split("@")[1]?.toLowerCase() : null;
  if (atlasEmailDomain) {
    const byEmail = dbCompanies.find(
      (d) => d.email && d.email.split("@")[1]?.toLowerCase() === atlasEmailDomain,
    );
    if (byEmail) return { company: byEmail, method: "email" };
  }
  const atlasNorm = normName(atlas.name);
  const byName = dbCompanies.find((d) => normName(d.name) === atlasNorm);
  if (byName) return { company: byName, method: "name" };
  const bySubstring = dbCompanies.find(
    (d) => normName(d.name).includes(atlasNorm) || atlasNorm.includes(normName(d.name)),
  );
  if (bySubstring) return { company: bySubstring, method: "name-substring" };
  if (atlas.name_en) {
    const enNorm = normName(atlas.name_en);
    const byNameEn = dbCompanies.find((d) => d.name_en && normName(d.name_en) === enNorm);
    if (byNameEn) return { company: byNameEn, method: "name_en" };
  }
  return null;
}

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
          description = ${atlas.intro || null},
          intro = ${atlas.intro || null},
          tagline = COALESCE(${atlas.activity_domain || null}, tagline),
          founders = ${atlas.founders || null},
          headcount_full_time = ${atlas.headcount_full_time},
          headcount_part_time = ${atlas.headcount_part_time},
          knowledge_products_intro = ${atlas.flagship_product || null},
          export_potential = ${atlas.export_potential || null},
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
          await sql`UPDATE exhibition_products SET description = ${p.description}, updated_at = now() WHERE id = ${existing[0].id}`;
        } else {
          await sql`INSERT INTO exhibition_products (company_id, name, description) VALUES (${company.company_id}, ${p.name}, ${p.description})`;
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
