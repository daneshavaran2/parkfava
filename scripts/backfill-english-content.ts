/**
 * One-off script: backfills missing English content across the exhibition
 * directory using a real LLM (askOpenRouter — the same provider the site's
 * own AI assistant uses), instead of the free, unauthenticated Google
 * Translate pass (scripts/translate-atlas-data.mjs) that produced this
 * repo's known bad-transliteration bug: "تین کالینت آرتیان" (a Persian
 * phonetic transliteration of "Thin Client Artian") came back as the
 * nonsense "Tin Caliente Artian".
 *
 * Background: of ~125 companies in the directory, only the 48 covered by
 * scripts/atlas-data.json (the printed-booklet subset) have ever received
 * any translation pass. The other ~77 — added/enriched by
 * db/migrations/0014_company_directory_2026_08.sql from an intake
 * spreadsheet whose schema only ever had a `name_en` column — have zero
 * English content for anything else. The UI (pickName/pickLocalized in
 * src/components/fava/primitives.tsx) silently falls back to the Persian
 * value with no indicator, which is how this went unnoticed.
 *
 * Two modes:
 *   - default: companies with NO English content at all
 *     (description_en IS NULL AND intro_en IS NULL) — fills the gap.
 *   - --audit-only: re-checks the *already-translated* companies' short,
 *     most transliteration-prone fields (name_en, knowledge_products_intro_en,
 *     product name_en) for the "Tin Caliente" class of mistranslation, and
 *     proposes corrections.
 *
 * Always dry-run by default: writes a reviewable JSON file under
 * scripts/output/ (git-ignored) with the current DB value and the proposed
 * value side by side, and touches nothing in the database.
 *
 *   bun run scripts/backfill-english-content.ts                  # dry run, fill gaps
 *   bun run scripts/backfill-english-content.ts --audit-only      # dry run, find bad translations
 *   bun run scripts/backfill-english-content.ts --apply           # generate AND write in one step
 *   bun run scripts/backfill-english-content.ts --apply --from scripts/output/backfill-english-content-fill-<timestamp>.json
 *                                                                  # write a previously-reviewed batch
 *                                                                  # without calling the LLM again
 *
 * Fill mode only ever fills currently-NULL columns (COALESCE-guarded) —
 * it never overwrites existing content. Audit mode is the one case that
 * intentionally overwrites (it exists to correct wrong values), which is
 * exactly why it's review-then-apply rather than write-on-sight.
 *
 * Requires DATABASE_URL and either LOVABLE_API_KEY or an OpenRouter key
 * (OPENROUTER_API_KEY env, or one configured in the admin panel) — neither
 * is available in a plain dev shell; run this wherever the deploy's real
 * credentials live.
 */
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { askOpenRouter } from "../src/lib/assistant-ai.server";

const APPLY = process.argv.includes("--apply");
const AUDIT_ONLY = process.argv.includes("--audit-only");
const fromIdx = process.argv.indexOf("--from");
const FROM_FILE = fromIdx !== -1 ? process.argv[fromIdx + 1] : null;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
// Separate connection from the one askOpenRouter's getAssistantRuntimeConfig
// opens internally via db/connection.ts's getDb() singleton — two pools
// alive for the duration of a one-off script is fine, this isn't a
// long-running server.
const sql = postgres(DATABASE_URL, {
  ssl: DATABASE_URL.includes("sslmode=require") ? "require" : false,
});

const scriptDir = dirname(fileURLToPath(import.meta.url));

type CompanyRow = {
  company_id: string;
  name: string;
  name_en: string | null;
  tagline: string | null;
  tagline_en: string | null;
  city: string | null;
  city_en: string | null;
  description_en: string | null;
  intro: string | null;
  intro_en: string | null;
  founders: string | null;
  founders_en: string | null;
  export_potential: string | null;
  export_potential_en: string | null;
  knowledge_products_intro: string | null;
  knowledge_products_intro_en: string | null;
  address: string | null;
  address_en: string | null;
};

type ProductRow = {
  id: string;
  company_id: string;
  name: string;
  name_en: string | null;
  description: string | null;
  description_en: string | null;
};

// Shapes of the LLM's parsed JSON response, per mode — see the system
// prompts in translateCompany()/auditCompany() below, which spell out
// exactly this structure to the model.
type FillProposal = {
  tagline_en?: string | null;
  city_en?: string | null;
  intro_en?: string | null;
  description_en?: string | null;
  founders_en?: string | null;
  export_potential_en?: string | null;
  knowledge_products_intro_en?: string | null;
  address_en?: string | null;
  products?: { id: string; name_en?: string | null; description_en?: string | null }[];
};

type AuditProposal = {
  name_en?: string | null;
  knowledge_products_intro_en?: string | null;
  products?: { id: string; name_en?: string | null }[];
};

type AuditBefore = {
  name_en: string | null;
  knowledge_products_intro_en: string | null;
  products: { id: string; name_en: string | null }[];
};

type Entry = {
  company_id: string;
  name: string;
  before?: CompanyRow | AuditBefore;
  proposal?: FillProposal | AuditProposal;
  error?: string;
};

const TRANSLITERATION_GUIDANCE =
  "اگر بخشی از متن فارسی یک وام‌واژه انگلیسی است که به فارسی نویسه‌گردانی شده " +
  "(مثلاً «تین کلاینت» که در واقع همان «Thin Client» انگلیسی است)، آن را به " +
  "همان واژه انگلیسی اصلی برگردان — نه یک بازنویسی آوایی نادرست. اگر مطمئن " +
  "نیستی واژه انگلیسی اصلی چیست، متن را عادی ترجمه کن و حدس عجیب نزن.";

function outPath(tag: "fill" | "audit") {
  const dir = join(scriptDir, "output");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return join(dir, `backfill-english-content-${tag}-${stamp}.json`);
}

/** The model is asked not to wrap its answer, but strip a ```json fence if it does anyway. */
function parseJsonResponse(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  return JSON.parse(cleaned);
}

async function loadProducts(companyId: string): Promise<ProductRow[]> {
  return sql<ProductRow[]>`
    SELECT id, company_id, name, name_en, description, description_en
    FROM exhibition_products WHERE company_id = ${companyId}
  `;
}

async function loadFillTargets() {
  const companies = await sql<CompanyRow[]>`
    SELECT company_id, name, name_en, tagline, tagline_en, city, city_en,
           description_en, intro, intro_en, founders, founders_en,
           export_potential, export_potential_en,
           knowledge_products_intro, knowledge_products_intro_en,
           address, address_en
    FROM exhibition_companies
    WHERE description_en IS NULL AND intro_en IS NULL
    ORDER BY name
  `;
  const out: { company: CompanyRow; products: ProductRow[] }[] = [];
  for (const company of companies) {
    out.push({ company, products: await loadProducts(company.company_id) });
  }
  return out;
}

async function loadAuditTargets() {
  const companies = await sql<CompanyRow[]>`
    SELECT company_id, name, name_en, tagline, tagline_en, city, city_en,
           description_en, intro, intro_en, founders, founders_en,
           export_potential, export_potential_en,
           knowledge_products_intro, knowledge_products_intro_en,
           address, address_en
    FROM exhibition_companies
    WHERE name_en IS NOT NULL
    ORDER BY name
  `;
  const out: { company: CompanyRow; products: ProductRow[] }[] = [];
  for (const company of companies) {
    const products = (await loadProducts(company.company_id)).filter((p) => p.name_en);
    out.push({ company, products });
  }
  return out;
}

/**
 * Returns { intro_en, tagline_en, city_en, founders_en, export_potential_en,
 * knowledge_products_intro_en, address_en, products: [{id, name_en, description_en}] }.
 * description_en is not asked for separately — it mirrors intro_en, same
 * convention scripts/apply-atlas-data.ts already uses (description === intro).
 */
async function translateCompany(row: CompanyRow, products: ProductRow[]) {
  const input = {
    tagline: row.tagline,
    city: row.city,
    intro: row.intro,
    founders: row.founders,
    export_potential: row.export_potential,
    knowledge_products_intro: row.knowledge_products_intro,
    address: row.address,
    products: products.map((p) => ({ id: p.id, name: p.name, description: p.description })),
  };

  const system =
    "تو یک مترجم حرفه‌ای فارسی به انگلیسی برای یک اطلس آنلاین شرکت‌های فناوری هستی. " +
    TRANSLITERATION_GUIDANCE +
    " ورودی یک شیء JSON با فیلدهای فارسی است؛ دقیقاً همین ساختار JSON را با ترجمهٔ " +
    "انگلیسی هر مقدار برگردان: " +
    '{"tagline_en": "...", "city_en": "...", "intro_en": "...", "founders_en": "...", ' +
    '"export_potential_en": "...", "knowledge_products_intro_en": "...", "address_en": "...", ' +
    '"products": [{"id": "...", "name_en": "...", "description_en": "..."}]}. ' +
    "اگر مقدار ورودی یک فیلد null بود، همان فیلد را در خروجی null برگردان. " +
    "فقط یک شیء JSON معتبر خروجی بده — بدون توضیح اضافه، بدون Markdown fence.";

  const raw = await askOpenRouter(system, [], JSON.stringify(input, null, 2), 3000);
  const proposal = parseJsonResponse(raw) as FillProposal;
  proposal.description_en = proposal.intro_en ?? null;
  return proposal;
}

/** Returns { name_en, knowledge_products_intro_en, products: [{id, name_en}] } — corrected or unchanged. */
async function auditCompany(row: CompanyRow, products: ProductRow[]) {
  const input = {
    name_fa: row.name,
    name_en: row.name_en,
    knowledge_products_intro_fa: row.knowledge_products_intro,
    knowledge_products_intro_en: row.knowledge_products_intro_en,
    products: products.map((p) => ({ id: p.id, name_fa: p.name, name_en: p.name_en })),
  };
  const system =
    "تو یک ویراستار ترجمه فارسی به انگلیسی هستی. برای هر مقدار انگلیسی داده‌شده در " +
    "ورودی، بررسی کن آیا شبیه بازنویسی آوایی غلط یک وام‌واژه انگلیسی نویسه‌گردانی‌شده " +
    'به فارسی است (مثلاً "Tin Caliente" به‌جای "Thin Client" برای «تین کلاینت»). ' +
    "اگر مقدار درست بود، همان مقدار فعلی را بدون تغییر برگردان. اگر غلط بود، مقدار " +
    "تصحیح‌شده را برگردان. دقیقاً همین ساختار JSON را خروجی بده: " +
    '{"name_en": "...", "knowledge_products_intro_en": "...", ' +
    '"products": [{"id": "...", "name_en": "..."}]}. ' +
    "فقط یک شیء JSON معتبر خروجی بده — بدون توضیح اضافه، بدون Markdown fence.";

  const raw = await askOpenRouter(system, [], JSON.stringify(input, null, 2), 800);
  return parseJsonResponse(raw) as AuditProposal;
}

async function applyFill(entries: Entry[]) {
  let companiesWritten = 0;
  let productsWritten = 0;
  for (const entry of entries) {
    if (entry.error || !entry.proposal) continue;
    const p = entry.proposal as FillProposal;
    await sql`
      UPDATE exhibition_companies SET
        tagline_en = COALESCE(tagline_en, ${p.tagline_en ?? null}),
        city_en = COALESCE(city_en, ${p.city_en ?? null}),
        intro_en = COALESCE(intro_en, ${p.intro_en ?? null}),
        description_en = COALESCE(description_en, ${p.description_en ?? null}),
        founders_en = COALESCE(founders_en, ${p.founders_en ?? null}),
        export_potential_en = COALESCE(export_potential_en, ${p.export_potential_en ?? null}),
        knowledge_products_intro_en = COALESCE(knowledge_products_intro_en, ${p.knowledge_products_intro_en ?? null}),
        address_en = COALESCE(address_en, ${p.address_en ?? null}),
        updated_at = now()
      WHERE company_id = ${entry.company_id}
    `;
    companiesWritten++;
    for (const prod of p.products ?? []) {
      if (!prod.id) continue;
      await sql`
        UPDATE exhibition_products SET
          name_en = COALESCE(name_en, ${prod.name_en ?? null}),
          description_en = COALESCE(description_en, ${prod.description_en ?? null}),
          updated_at = now()
        WHERE id = ${prod.id}
      `;
      productsWritten++;
    }
  }
  console.log(`Applied: ${companiesWritten} companies, ${productsWritten} products updated.`);
}

async function applyAudit(entries: Entry[]) {
  let corrected = 0;
  for (const entry of entries) {
    if (entry.error || !entry.proposal) continue;
    const p = entry.proposal as AuditProposal;
    const before = entry.before as AuditBefore | undefined;
    if (p.name_en && p.name_en !== before?.name_en) {
      await sql`UPDATE exhibition_companies SET name_en = ${p.name_en}, updated_at = now() WHERE company_id = ${entry.company_id}`;
      corrected++;
    }
    if (
      p.knowledge_products_intro_en &&
      p.knowledge_products_intro_en !== before?.knowledge_products_intro_en
    ) {
      await sql`UPDATE exhibition_companies SET knowledge_products_intro_en = ${p.knowledge_products_intro_en}, updated_at = now() WHERE company_id = ${entry.company_id}`;
      corrected++;
    }
    for (const prod of p.products ?? []) {
      const beforeProd = (before?.products ?? []).find((x) => x.id === prod.id);
      if (prod.id && prod.name_en && prod.name_en !== beforeProd?.name_en) {
        await sql`UPDATE exhibition_products SET name_en = ${prod.name_en}, updated_at = now() WHERE id = ${prod.id}`;
        corrected++;
      }
    }
  }
  console.log(`Applied: ${corrected} correction(s).`);
}

async function main() {
  if (FROM_FILE) {
    if (!APPLY) {
      console.error("--from only makes sense together with --apply.");
      process.exit(1);
    }
    const batch = JSON.parse(readFileSync(FROM_FILE, "utf8"));
    if (batch.mode === "audit") await applyAudit(batch.entries);
    else await applyFill(batch.entries);
    await sql.end();
    return;
  }

  const targets = AUDIT_ONLY ? await loadAuditTargets() : await loadFillTargets();
  console.log(`${AUDIT_ONLY ? "Auditing" : "Backfilling"} ${targets.length} companies...`);

  const entries: Entry[] = [];
  for (const { company, products } of targets) {
    try {
      const proposal = AUDIT_ONLY
        ? await auditCompany(company, products)
        : await translateCompany(company, products);
      entries.push({
        company_id: company.company_id,
        name: company.name,
        before: AUDIT_ONLY
          ? {
              name_en: company.name_en,
              knowledge_products_intro_en: company.knowledge_products_intro_en,
              products: products.map((p) => ({ id: p.id, name_en: p.name_en })),
            }
          : company,
        proposal,
      });
      console.log(`  ✓ ${company.name}`);
    } catch (e) {
      console.error(`  ✗ ${company.name}: ${(e as Error).message}`);
      entries.push({
        company_id: company.company_id,
        name: company.name,
        error: (e as Error).message,
      });
    }
  }

  const file = outPath(AUDIT_ONLY ? "audit" : "fill");
  writeFileSync(file, JSON.stringify({ mode: AUDIT_ONLY ? "audit" : "fill", entries }, null, 2));
  console.log(`\nWrote ${entries.length} result(s) to ${file}`);

  if (APPLY) {
    if (AUDIT_ONLY) await applyAudit(entries);
    else await applyFill(entries);
  } else {
    console.log("Dry run only — review the file above, then either:");
    console.log(`  bun run scripts/backfill-english-content.ts --apply --from ${file}`);
    console.log("  (re-uses this exact reviewed batch, no new LLM calls)");
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
