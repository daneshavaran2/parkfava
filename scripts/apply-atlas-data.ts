/**
 * One-off script: enriches exhibition_companies / exhibition_products with
 * data extracted from the official "اطلس جامع محصولات شرکت‌های پارک فاوا"
 * PDF catalog (see scripts/atlas-data.json). Matches each catalog entry to
 * an existing company by website/email domain, falling back to fuzzy name
 * comparison, then updates that company's description/founders/headcount/
 * export potential/founded year and upserts its products.
 *
 * findMatch()'s normalized-name comparison also fixes a gap the original
 * SQL migration (db/migrations/0012, built from raw `c.name = t.company_name`
 * string equality) had: companies whose stored name differs only by ZWNJ vs
 * plain space (e.g. "فنون داده‌پروری بسامد" vs "فنون داده پروری بسامد")
 * never matched there and so never got any English translation. Re-running
 * this script picks those up too.
 *
 * Run (dry run, default): bun run scripts/apply-atlas-data.ts
 *   Prints MATCH/NO MATCH per company and, for each match, exactly which
 *   columns would change (old -> new) and which products would be inserted
 *   vs updated — writes nothing.
 * Run (write): bun run scripts/apply-atlas-data.ts --apply
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

const APPLY = process.argv.includes("--apply");

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
  description: string | null;
  description_en: string | null;
  intro: string | null;
  intro_en: string | null;
  tagline: string | null;
  tagline_en: string | null;
  founders: string | null;
  founders_en: string | null;
  headcount_full_time: number | null;
  headcount_part_time: number | null;
  knowledge_products_intro: string | null;
  knowledge_products_intro_en: string | null;
  export_potential: string | null;
  export_potential_en: string | null;
  phone: string | null;
  founded_at: string | null;
};

const dataPath = join(dirname(fileURLToPath(import.meta.url)), "atlas-data.json");
const atlasCompanies: AtlasCompany[] = JSON.parse(readFileSync(dataPath, "utf8"));

// Truncates long text in the dry-run diff printout so a full company essay
// doesn't flood the terminal — the point is to see *that* it changed and
// spot-check the shape of it, not to review the full text on screen (the
// backfill script's JSON review file is where a full read happens).
function short(v: unknown, max = 80): string {
  if (v === null || v === undefined) return "∅";
  const s = String(v).replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

async function main() {
  const dbCompanies = await sql<DbCompany[]>`
    SELECT company_id, name, name_en, website, email,
           description, description_en, intro, intro_en,
           tagline, tagline_en, founders, founders_en,
           headcount_full_time, headcount_part_time,
           knowledge_products_intro, knowledge_products_intro_en,
           export_potential, export_potential_en, phone, founded_at
    FROM exhibition_companies
  `;

  let matched = 0;
  let unmatched = 0;
  let companiesChanged = 0;
  let productsWouldChange = 0;

  for (const atlas of atlasCompanies) {
    const result = findMatch(atlas, dbCompanies);
    if (!result) {
      console.log(`NO MATCH: ${atlas.name}`);
      unmatched++;
      continue;
    }
    const { company, method } = result;
    matched++;

    const next = {
      name_en: atlas.name_en || company.name_en,
      description: atlas.intro || null,
      description_en: atlas.intro_en || null,
      intro: atlas.intro || null,
      intro_en: atlas.intro_en || null,
      tagline: atlas.activity_domain || company.tagline,
      tagline_en: atlas.activity_domain_en || company.tagline_en,
      founders: atlas.founders || null,
      founders_en: atlas.founders_en || null,
      headcount_full_time: atlas.headcount_full_time ?? null,
      headcount_part_time: atlas.headcount_part_time ?? null,
      knowledge_products_intro: atlas.flagship_product || null,
      knowledge_products_intro_en: atlas.flagship_product_en || null,
      export_potential: atlas.export_potential || null,
      export_potential_en: atlas.export_potential_en || null,
      website: atlas.website || company.website,
      email: atlas.email || company.email,
      phone: atlas.phone || company.phone,
      founded_at: atlas.founded_year ? `${atlas.founded_year + 621}-01-01` : null,
    } as const;

    const diffs: string[] = [];
    for (const [key, value] of Object.entries(next)) {
      const before = (company as Record<string, unknown>)[key] ?? null;
      const after = value ?? null;
      // founded_at comes back from Postgres as a Date-bearing ISO string;
      // compare by date-only prefix so an unchanged date doesn't print as
      // "different" just because of a time-of-day/timezone tail.
      const same =
        key === "founded_at"
          ? String(before ?? "").slice(0, 10) === String(after ?? "").slice(0, 10)
          : before === after;
      if (!same) diffs.push(`    ${key}: ${short(before)} -> ${short(after)}`);
    }

    console.log(
      `MATCH (${method}): ${atlas.name} -> ${company.company_id} (${company.name})` +
        (diffs.length ? ` — ${diffs.length} field(s) change` : " — no change"),
    );
    diffs.forEach((d) => console.log(d));
    if (diffs.length) companiesChanged++;

    if (APPLY && diffs.length) {
      try {
        await sql`
          UPDATE exhibition_companies SET
            name_en = ${next.name_en},
            description = ${next.description},
            description_en = ${next.description_en},
            intro = ${next.intro},
            intro_en = ${next.intro_en},
            tagline = ${next.tagline},
            tagline_en = ${next.tagline_en},
            founders = ${next.founders},
            founders_en = ${next.founders_en},
            headcount_full_time = ${next.headcount_full_time},
            headcount_part_time = ${next.headcount_part_time},
            knowledge_products_intro = ${next.knowledge_products_intro},
            knowledge_products_intro_en = ${next.knowledge_products_intro_en},
            export_potential = ${next.export_potential},
            export_potential_en = ${next.export_potential_en},
            website = ${next.website},
            email = ${next.email},
            phone = ${next.phone},
            founded_at = ${next.founded_at},
            updated_at = now()
          WHERE company_id = ${company.company_id}
        `;
      } catch (e) {
        console.error(`  FAILED to apply ${atlas.name}:`, (e as Error).message);
      }
    }

    for (const p of atlas.products) {
      if (!p.name || !p.description) continue;
      const existing = await sql<
        { id: string; name_en: string | null; description: string; description_en: string | null }[]
      >`
        SELECT id, name_en, description, description_en
        FROM exhibition_products WHERE company_id = ${company.company_id} AND name = ${p.name}
      `;
      if (existing.length) {
        const row = existing[0];
        const changed =
          (p.name_en || null) !== row.name_en ||
          p.description !== row.description ||
          (p.description_en || null) !== row.description_en;
        if (changed) {
          console.log(`  PRODUCT UPDATE: ${p.name}`);
          productsWouldChange++;
          if (APPLY) {
            await sql`UPDATE exhibition_products SET name_en = ${p.name_en || null}, description = ${p.description}, description_en = ${p.description_en || null}, updated_at = now() WHERE id = ${row.id}`;
          }
        }
      } else {
        console.log(`  PRODUCT INSERT: ${p.name}`);
        productsWouldChange++;
        if (APPLY) {
          await sql`INSERT INTO exhibition_products (company_id, name, name_en, description, description_en) VALUES (${company.company_id}, ${p.name}, ${p.name_en || null}, ${p.description}, ${p.description_en || null})`;
        }
      }
    }
  }

  console.log(
    `\n✓ ${APPLY ? "Applied" : "Dry run"}. ${matched} matched, ${unmatched} unmatched, ` +
      `${companiesChanged} compan${companiesChanged === 1 ? "y" : "ies"} with changes, ` +
      `${productsWouldChange} product row(s) ${APPLY ? "written" : "would change"}.` +
      (APPLY ? "" : "\n  Re-run with --apply to write these changes."),
  );
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
