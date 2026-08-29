/**
 * One-off script: reassigns exhibition_companies.park_id based on each
 * company's REAL province, taken from a real company-submitted form export
 * (scripts/output/atlas-form-provinces.json — {name, province, city,
 * website, email} for 105 companies, extracted from
 * scripts/output/atlas-form-1.xlsx).
 *
 * The form's own "پارک فناوری" (which park) column is NOT used — every one
 * of the 105 rows has the identical value "پارک فناوری اطلاعات و ارتباطات"
 * regardless of the company's real province, clearly a dropdown nobody
 * differentiated. The "استان" (province) column is the real signal.
 *
 * Run (dry run, default): bun run scripts/reassign-park-by-province.ts
 *   Prints every form row bucketed into skipped / no-match / already-correct
 *   / would-reassign — writes nothing.
 * Run (write): bun run scripts/reassign-park-by-province.ts --apply
 *   Only ever writes rows in the would-reassign bucket.
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { findMatch } from "./lib/company-match";

const APPLY = process.argv.includes("--apply");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
const sql = postgres(DATABASE_URL, {
  ssl: DATABASE_URL.includes("sslmode=require") ? "require" : false,
});

type FormRow = {
  name: string;
  province: string | null;
  city: string | null;
  website: string | null;
  email: string | null;
};

type DbCompany = {
  company_id: string;
  name: string;
  name_en: string | null;
  website: string | null;
  email: string | null;
  park_id: string | null;
};

const dataPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "output",
  "atlas-form-provinces.json",
);
if (!existsSync(dataPath)) {
  console.error(
    `Missing ${dataPath} — re-run the atlas-form province extraction first (see the plan this script came from).`,
  );
  process.exit(1);
}
const formRows: FormRow[] = JSON.parse(readFileSync(dataPath, "utf8"));

const PROVINCE_TO_PARK: Record<string, string> = {
  "خراسان رضوی": "razavi",
  اصفهان: "isfahan",
  البرز: "alborz",
  سمنان: "semnan",
  مازندران: "mazand",
};

// Only exercised when province is blank. Currently 2 of 105 rows hit this:
// "جوان اندیشان پویای قومس (جاپکو)" (blank province, city="سمنان") and
// "آریا گستر ساری" (blank province, blank city, but name contains "ساری").
const CITY_TO_PARK: Record<string, string> = {
  سمنان: "semnan",
  ساری: "mazand",
  مشهد: "razavi",
  اصفهان: "isfahan",
};

function resolveParkId(row: FormRow): { parkId: string | null; reason: string } {
  const province = (row.province || "").trim();
  if (province) {
    const parkId = PROVINCE_TO_PARK[province];
    return parkId
      ? { parkId, reason: `province="${province}"` }
      : { parkId: null, reason: `unrecognized province "${province}"` };
  }
  const city = (row.city || "").trim();
  if (city && CITY_TO_PARK[city]) {
    return { parkId: CITY_TO_PARK[city], reason: `blank province, city="${city}"` };
  }
  if (row.name.includes("ساری")) {
    return { parkId: "mazand", reason: 'blank province/city, name contains "ساری"' };
  }
  return { parkId: null, reason: "blank province, no city/name fallback matched" };
}

type Bucketed = {
  form: FormRow;
  parkId?: string;
  reason?: string;
  company?: DbCompany;
  method?: string;
};

async function main() {
  // Sanity check: every destination park must exist and be active, or this
  // script would silently write to a park that's about to vanish from the
  // UI (see the earlier deactivated-park-stale-fallback bug this session).
  const TARGET_PARK_IDS = ["razavi", "semnan", "mazand", "isfahan", "alborz"];
  const active = await sql<{ park_id: string }[]>`
    SELECT park_id FROM parks WHERE park_id = ANY(${TARGET_PARK_IDS}) AND is_active = true
  `;
  const activeSet = new Set(active.map((p) => p.park_id));
  const missingOrInactive = TARGET_PARK_IDS.filter((id) => !activeSet.has(id));
  if (missingOrInactive.length) {
    console.error(
      `REFUSING TO PROCEED: target park(s) missing or inactive: ${missingOrInactive.join(", ")}`,
    );
    process.exit(1);
  }

  const dbCompanies = await sql<DbCompany[]>`
    SELECT company_id, name, name_en, website, email, park_id FROM exhibition_companies
  `;

  const skipped: Bucketed[] = [];
  const noMatch: Bucketed[] = [];
  const alreadyCorrect: Bucketed[] = [];
  const wouldReassign: Bucketed[] = [];

  for (const form of formRows) {
    const { parkId, reason } = resolveParkId(form);
    if (!parkId) {
      skipped.push({ form, reason });
      continue;
    }

    const result = findMatch(
      { name: form.name, website: form.website, email: form.email },
      dbCompanies,
    );
    if (!result) {
      noMatch.push({ form, parkId, reason });
      continue;
    }

    const { company, method } = result;
    const row: Bucketed = { form, parkId, reason, company, method };
    if ((company.park_id ?? null) === parkId) alreadyCorrect.push(row);
    else wouldReassign.push(row);
  }

  console.log(`SKIPPED (unknown province) — ${skipped.length}`);
  for (const r of skipped) console.log(`  SKIP: ${r.form.name} — ${r.reason}`);

  console.log(`\nNO MATCH — ${noMatch.length}`);
  for (const r of noMatch) {
    console.log(
      `  NO MATCH: ${r.form.name} [province="${r.form.province ?? ""}" city="${r.form.city ?? ""}"]`,
    );
  }

  console.log(`\nALREADY CORRECT — ${alreadyCorrect.length}`);
  for (const r of alreadyCorrect) {
    console.log(
      `  ok  (${r.method}) ${r.form.name} -> ${r.company!.company_id} (${r.company!.name}): already ${r.parkId}`,
    );
  }

  console.log(`\n${APPLY ? "REASSIGNED" : "WOULD REASSIGN"} — ${wouldReassign.length}`);
  for (const r of wouldReassign) {
    const before = r.company!.park_id ?? "∅";
    console.log(
      `>>> REASSIGN (${r.method}) ${r.form.name} -> ${r.company!.company_id} (${r.company!.name}): ${before} -> ${r.parkId}`,
    );
    if (APPLY) {
      try {
        await sql`UPDATE exhibition_companies SET park_id = ${r.parkId}, updated_at = now() WHERE company_id = ${r.company!.company_id}`;
      } catch (e) {
        console.error(`  FAILED to apply ${r.form.name}:`, (e as Error).message);
      }
    }
  }

  const total = skipped.length + noMatch.length + alreadyCorrect.length + wouldReassign.length;
  console.log(
    `\n✓ ${APPLY ? "Applied" : "Dry run"}. ${formRows.length} form rows (bucketed: ${total}): ` +
      `${skipped.length} skipped, ${noMatch.length} no match, ${alreadyCorrect.length} already correct, ` +
      `${wouldReassign.length} ${APPLY ? "reassigned" : "would reassign"}.` +
      (APPLY ? "" : "\n  Re-run with --apply to write these changes."),
  );
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
