/**
 * One-off script (phase 2 of the atlas import — run after apply-atlas-data.ts
 * has matched companies and inserted products): matches each entry in
 * atlas-images-manifest.json to its exhibition_products row (by company
 * match + exact product name) and sets that row's image_url to the path
 * the image will live at on the production uploads disk.
 *
 * It does NOT copy the image bytes anywhere — the production disk is only
 * writable from inside the running container. Instead it writes
 * container-fetch-atlas-images.js, a plain-Node script with no
 * dependencies: paste it into `liara shell` and run `node
 * container-fetch-atlas-images.js` to have the container fetch each image
 * from this repo's raw GitHub URL and save it to the right path.
 *
 * Run: bun run scripts/apply-atlas-images.ts
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
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

const RAW_BASE =
  "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images";

type ManifestEntry = {
  company_index: number;
  product_index: number;
  company_name: string;
  product_name: string;
  file: string;
};

type DbCompany = {
  company_id: string;
  name: string;
  name_en: string | null;
  website: string | null;
  email: string | null;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const manifest: ManifestEntry[] = JSON.parse(
  readFileSync(join(scriptDir, "atlas-images-manifest.json"), "utf8"),
);
const atlasCompanies: {
  name: string;
  website: string | null;
  email: string | null;
  name_en: string | null;
}[] = JSON.parse(readFileSync(join(scriptDir, "atlas-data.json"), "utf8"));

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

function findMatch(atlasName: string, dbCompanies: DbCompany[]): DbCompany | null {
  const atlas = atlasCompanies.find((c) => c.name === atlasName);
  const atlasDomain = normDomain(atlas?.website);
  if (atlasDomain) {
    const byWebsite = dbCompanies.find((d) => normDomain(d.website) === atlasDomain);
    if (byWebsite) return byWebsite;
  }
  const atlasEmailDomain = atlas?.email ? atlas.email.split("@")[1]?.toLowerCase() : null;
  if (atlasEmailDomain) {
    const byEmail = dbCompanies.find(
      (d) => d.email && d.email.split("@")[1]?.toLowerCase() === atlasEmailDomain,
    );
    if (byEmail) return byEmail;
  }
  const atlasNorm = normName(atlasName);
  const byName = dbCompanies.find((d) => normName(d.name) === atlasNorm);
  if (byName) return byName;
  const bySubstring = dbCompanies.find(
    (d) => normName(d.name).includes(atlasNorm) || atlasNorm.includes(normName(d.name)),
  );
  if (bySubstring) return bySubstring;
  if (atlas?.name_en) {
    const enNorm = normName(atlas.name_en);
    const byNameEn = dbCompanies.find((d) => d.name_en && normName(d.name_en) === enNorm);
    if (byNameEn) return byNameEn;
  }
  return null;
}

async function main() {
  const dbCompanies = await sql<
    DbCompany[]
  >`SELECT company_id, name, name_en, website, email FROM exhibition_companies`;

  const fetchList: { url: string; dest: string }[] = [];
  let matched = 0;
  let unmatched = 0;

  for (const entry of manifest) {
    const company = findMatch(entry.company_name, dbCompanies);
    if (!company) {
      console.log(`NO COMPANY MATCH: ${entry.company_name} (product: ${entry.product_name})`);
      unmatched++;
      continue;
    }
    const product = await sql<{ id: string }[]>`
      SELECT id FROM exhibition_products WHERE company_id = ${company.company_id} AND name = ${entry.product_name}
    `;
    if (!product.length) {
      console.log(`NO PRODUCT MATCH: ${company.company_id} / ${entry.product_name}`);
      unmatched++;
      continue;
    }
    const destPath = `exhibition/${company.company_id}/${entry.file}`;
    await sql`UPDATE exhibition_products SET image_url = ${destPath}, updated_at = now() WHERE id = ${product[0].id}`;
    fetchList.push({ url: `${RAW_BASE}/${entry.file}`, dest: destPath });
    matched++;
  }

  const lines = [
    "// One-off script - run with: node container-fetch-atlas-images.js",
    'const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/data/uploads";',
    "const files = " + JSON.stringify(fetchList, null, 2) + ";",
    "",
    'const fs = require("fs");',
    'const path = require("path");',
    "",
    "async function main() {",
    "  let ok = 0, fail = 0;",
    "  for (const f of files) {",
    "    try {",
    "      const res = await fetch(f.url);",
    "      if (!res.ok) {",
    '        console.error("FAIL", f.dest, res.status);',
    "        fail++;",
    "        continue;",
    "      }",
    "      const buf = Buffer.from(await res.arrayBuffer());",
    "      const full = path.join(UPLOAD_DIR, f.dest);",
    "      fs.mkdirSync(path.dirname(full), { recursive: true });",
    "      fs.writeFileSync(full, buf);",
    "      ok++;",
    "    } catch (e) {",
    '      console.error("FAIL", f.dest, e.message);',
    "      fail++;",
    "    }",
    "  }",
    '  console.log("\\nDone. " + ok + " downloaded, " + fail + " failed.");',
    "}",
    "",
    "main();",
    "",
  ].join("\n");
  writeFileSync(join(process.cwd(), "container-fetch-atlas-images.js"), lines, "utf8");

  console.log(`\n✓ Done. ${matched} products matched + image_url set, ${unmatched} unmatched.`);
  console.log(
    "Wrote container-fetch-atlas-images.js -- open it, copy all of it, and paste into liara shell.",
  );
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
