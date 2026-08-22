import { readFileSync, writeFileSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("./atlas-data.json", import.meta.url), "utf8"));
const sqlString = (value) => value == null || value === "" ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;

const companyRows = data.map((c) => `  (${[
  c.name, c.website, c.email, c.name_en, c.activity_domain_en, c.intro_en,
  c.founders_en, c.flagship_product_en, c.export_potential_en,
].map(sqlString).join(", ")})`).join(",\n");

const productRows = data.flatMap((c) => (c.products || []).map((p) => `  (${[
  c.name, c.website, c.email, p.name, p.name_en, p.description_en,
].map(sqlString).join(", ")})`)).join(",\n");

const output = `-- Generated from scripts/atlas-data.json. Do not hand-edit translation rows.\n` +
`WITH translations(company_name, website, email, name_en, tagline_en, intro_en, founders_en, knowledge_en, export_en) AS (\nVALUES\n${companyRows}\n)\n` +
`UPDATE exhibition_companies AS c SET\n` +
`  name_en = COALESCE(t.name_en, c.name_en), tagline_en = t.tagline_en,\n` +
`  description_en = t.intro_en, intro_en = t.intro_en, founders_en = t.founders_en,\n` +
`  knowledge_products_intro_en = t.knowledge_en, export_potential_en = t.export_en\n` +
`FROM translations AS t\nWHERE c.name = t.company_name\n` +
`   OR (t.email IS NOT NULL AND lower(c.email) = lower(t.email))\n` +
`   OR (t.website IS NOT NULL AND lower(regexp_replace(c.website, '^https?://(www\\.)?', '')) = lower(regexp_replace(t.website, '^https?://(www\\.)?', '')));\n\n` +
`WITH translations(company_name, website, email, product_name, name_en, description_en) AS (\nVALUES\n${productRows}\n), matched AS (\n` +
`  SELECT c.company_id, t.product_name, t.name_en, t.description_en\n` +
`  FROM exhibition_companies c JOIN translations t ON c.name = t.company_name\n` +
`    OR (t.email IS NOT NULL AND lower(c.email) = lower(t.email))\n` +
`    OR (t.website IS NOT NULL AND lower(regexp_replace(c.website, '^https?://(www\\.)?', '')) = lower(regexp_replace(t.website, '^https?://(www\\.)?', '')))\n` +
`)\nUPDATE exhibition_products p SET name_en = m.name_en, description_en = m.description_en\n` +
`FROM matched m WHERE p.company_id = m.company_id AND p.name = m.product_name;\n`;

writeFileSync(new URL("../db/migrations/0007_exhibition_english_content.sql", import.meta.url), output, "utf8");
writeFileSync(new URL("../supabase/migrations/20260821001000_exhibition_english_content.sql", import.meta.url), output, "utf8");
console.log(`Generated translations for ${data.length} companies and ${data.reduce((n, c) => n + c.products.length, 0)} products.`);
