/**
 * Generates the SQL that folds scripts/company-directory-2026-08.json into
 * exhibition_companies — a 105-row company directory (name, location,
 * contact, a short intro) exported from a separate intake spreadsheet, not
 * from the atlas booklets.
 *
 * 44 of the 105 rows are companies already in exhibition_companies (matched
 * by name/website/email, via scripts/lib/company-match.ts). For those, the
 * generated SQL only fills columns that are currently NULL — this directory
 * is additive enrichment (it has per-company GPS coordinates and founders
 * that the booklet import didn't capture for everyone), not a source of
 * truth that should overwrite the more authoritative booklet content.
 *
 * The other 61 rows are companies with no existing row at all. For those the
 * generated SQL INSERTs a new, immediately public (status='approved',
 * is_active=true) row — company_id is a slug derived from the English name,
 * de-duplicated against every id already in use (existing + newly assigned
 * in this same run).
 *
 * park_id is inferred from the row's province/city against the *real* parks
 * table, not from the spreadsheet's own "park" column — every one of the 105
 * rows has the same literal park text regardless of the company's actual
 * park (a leftover form default, not real data).
 *
 * category is inferred from the spreadsheet's free-text field with a
 * keyword classifier into this app's fixed category set (src/lib/fava/data.js
 * CATEGORIES): soft, telecom, hw, auto, sec, fintech, cloud, health.
 *
 * Run: node scripts/generate-company-directory-migration.mjs
 * Requires DATABASE_URL — it reads current company ids, park provinces, and
 * which fields are already populated, so the UPDATE/INSERT split and the
 * "fill only if empty" rule are both computed from live data, not guessed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";
import { findMatch } from "./lib/company-match.ts";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
const sql = postgres(DATABASE_URL, { ssl: false });

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rows = JSON.parse(readFileSync(join(scriptDir, "company-directory-2026-08.json"), "utf8"));

/* ============ category classification ============ */

const CATEGORY_RULES = [
  ["health", /سلامت|پزشکی|درمان/],
  ["fintech", /مالی|فین[‌\s]?تک|بیمه|پرداخت|تجاری[‌\s]?سازی/],
  ["sec", /امنیت/],
  ["cloud", /ابری|هاستینگ|میزبانی/],
  ["auto", /اتوماسیون|هوشمندساز|کنترل تردد|اسکادا|رباتیک|مکاترونیک/],
  ["soft", /نرم[‌\s]?افزار|برنامه[‌\s]?نویسی|SaaS|هوش مصنوعی|سامانه/i],
  ["hw", /الکترونیک|سخت[‌\s]?افزار|\bبرد\b|دیتاسنتر|دیتا سنتر|تجهیزات/],
  ["telecom", /مخابرات|تله[‌\s]?کام|فیبر نوری|مودم|ارتباطات/],
];
function classifyCategory(text) {
  const t = text || "";
  for (const [id, re] of CATEGORY_RULES) if (re.test(t)) return id;
  return null;
}

/* ============ park inference from province/city ============ */

const parks = await sql`SELECT park_id, province, city FROM parks`;

// Two rows arrived with no province at all. "آریا گستر ساری" names its own
// city in the company name (Sari, Mazandaran's capital); "جاپکو" gives a
// city ("سمنان") but not a province — and Semnan the city is also Semnan
// the province's capital, so the city alone is enough there.
const PROVINCE_OVERRIDE = { "آریا گستر ساری": "مازندران" };

function inferParkId(name, province, city) {
  const p = (province || PROVINCE_OVERRIDE[name] || "").trim();
  const c = (city || (name === "آریا گستر ساری" ? "ساری" : "")).trim();
  const byProvince = p ? parks.filter((k) => k.province === p) : [];
  if (byProvince.length === 1) return byProvince[0].park_id;
  const byBoth = byProvince.find((k) => k.city === c);
  if (byBoth) return byBoth.park_id;
  if (byProvince[0]) return byProvince[0].park_id;
  // No province at all: the city alone still identifies a park when a park's
  // own city has the same name (true for every single-city province here).
  if (c) {
    const byCity = parks.find((k) => k.city === c);
    if (byCity) return byCity.park_id;
  }
  return null;
}

/* ============ Jalali year -> Gregorian date ============ */

function foundedAt(jalaliYear) {
  const y = Number(jalaliYear);
  if (!y || y < 1200 || y > 1450) return null;
  return `${y + 621}-01-01`;
}

/* ============ company_id slug generation ============ */

// SELECT * (not a narrow column list): findMatch only needs name/name_en/
// website/email, but the "fill only if currently empty" patch logic below
// reads every one of FIELDS off this same row — a column missing from the
// SELECT reads as undefined, which the emptiness check can't tell apart from
// a real NULL, and every field would look "empty" and get overwritten
// regardless of what is actually already there.
const existing = await sql`SELECT * FROM exhibition_companies`;
const usedIds = new Set(existing.map((c) => c.company_id));

function slugify(nameEn, nameFa) {
  const base = (nameEn || nameFa || "company")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 3)
    .join("-");
  let slug = base || "company";
  let n = 2;
  while (usedIds.has(slug)) slug = `${base}-${n++}`;
  usedIds.add(slug);
  return slug;
}

/* ============ split matched vs new ============ */

const FIELDS = [
  "name_en", "tagline", "category", "park_id", "city", "description", "intro",
  "founders", "website", "phone", "email", "address", "latitude", "longitude",
  "founded_at", "headcount_full_time", "headcount_part_time",
];

function toRow(r) {
  const parkId = inferParkId(r.name, r.province, r.city);
  return {
    name_en: r.name_en || null,
    tagline: r.tagline || null,
    category: classifyCategory(r.category),
    park_id: parkId,
    city: r.city || null,
    description: r.intro_short || null,
    intro: r.intro_full || r.intro_short || null,
    founders: r.founders || null,
    website: r.website || null,
    phone: r.phone || null,
    email: r.email || null,
    address: r.address || null,
    latitude: r.lat ? Number(r.lat) : null,
    longitude: r.lng ? Number(r.lng) : null,
    founded_at: foundedAt(r.founded),
    headcount_full_time: r.headcount_full ?? null,
    headcount_part_time: r.headcount_part ?? null,
  };
}

const updates = [];
const inserts = [];
const skippedNoLocation = [];

for (const r of rows) {
  const match = findMatch({ name: r.name, name_en: r.name_en, website: r.website, email: r.email }, existing);
  const computed = toRow(r);
  if (match) {
    const current = match.company;
    const patch = {};
    for (const f of FIELDS) {
      if ((current[f] === null || current[f] === undefined) && computed[f] != null) {
        patch[f] = computed[f];
      }
    }
    if (Object.keys(patch).length) updates.push({ company_id: current.company_id, name: r.name, patch });
  } else {
    if (!computed.park_id) {
      skippedNoLocation.push(r.name);
      continue;
    }
    const company_id = slugify(r.name_en, r.name);
    inserts.push({ company_id, name: r.name, ...computed });
  }
}

/* ============ SQL generation ============ */

const lit = (v) => (v == null || v === "" ? "NULL" : `'${String(v).replaceAll("'", "''")}'`);
const numLit = (v) => (v == null ? "NULL" : String(v));

const maxSort = (await sql`SELECT COALESCE(MAX(sort_order), 0) AS m FROM exhibition_companies`)[0].m;

let sqlOut = `-- Generated by scripts/generate-company-directory-migration.mjs from
-- scripts/company-directory-2026-08.json (a separate company-intake
-- spreadsheet, not the atlas booklets). Do not hand-edit.
--
-- ${updates.length} existing companies get empty fields filled in (GPS
-- coordinates, founders, contact info the booklet import didn't capture).
-- ${inserts.length} companies with no prior row are inserted, public
-- immediately (status='approved', is_active=true).
`;

for (const u of updates) {
  const cols = Object.keys(u.patch);
  const sets = cols
    .map((c) => `${c} = ${typeof u.patch[c] === "number" ? numLit(u.patch[c]) : lit(u.patch[c])}`)
    .join(", ");
  sqlOut += `\n-- ${u.name}\nUPDATE exhibition_companies SET ${sets}, updated_at = now() WHERE company_id = ${lit(u.company_id)};\n`;
}

let sortOrder = Number(maxSort);
for (const ins of inserts) {
  sortOrder += 1;
  const cols = {
    company_id: ins.company_id,
    name: ins.name,
    name_en: ins.name_en,
    tagline: ins.tagline,
    category: ins.category,
    park_id: ins.park_id,
    city: ins.city,
    description: ins.description,
    intro: ins.intro,
    founders: ins.founders,
    website: ins.website,
    phone: ins.phone,
    email: ins.email,
    address: ins.address,
    latitude: ins.latitude,
    longitude: ins.longitude,
    founded_at: ins.founded_at,
    headcount_full_time: ins.headcount_full_time,
    headcount_part_time: ins.headcount_part_time,
    status: "approved",
    is_active: true,
    sort_order: sortOrder,
  };
  const colNames = Object.keys(cols).join(", ");
  const colVals = Object.values(cols)
    .map((v) => (typeof v === "number" ? numLit(v) : typeof v === "boolean" ? v : lit(v)))
    .join(", ");
  sqlOut += `\n-- NEW: ${ins.name}\nINSERT INTO exhibition_companies (${colNames}) VALUES (${colVals});\n`;
}

writeFileSync(join(scriptDir, "../db/migrations/0014_company_directory_2026_08.sql"), sqlOut, "utf8");
writeFileSync(
  join(scriptDir, "../supabase/migrations/20260824000000_company_directory_2026_08.sql"),
  sqlOut,
  "utf8",
);

console.log(`Matched (fields filled where empty): ${updates.length}`);
console.log(`New companies inserted: ${inserts.length}`);
if (skippedNoLocation.length) {
  console.log(`Skipped (no province match to a real park): ${skippedNoLocation.length}`);
  skippedNoLocation.forEach((n) => console.log("  -", n));
}
await sql.end();
