/**
 * One-off, resumable Persian -> English translation pass for atlas-data.json.
 * Uses numbered sentinels so several fields can be translated in one request.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const sourcePath = new URL("./atlas-data.json", import.meta.url);
const data = JSON.parse(readFileSync(sourcePath, "utf8"));
const items = [];

for (const company of data) {
  for (const [source, target] of [
    ["name", "name_en"],
    ["activity_domain", "activity_domain_en"],
    ["intro", "intro_en"],
    ["founders", "founders_en"],
    ["flagship_product", "flagship_product_en"],
    ["export_potential", "export_potential_en"],
  ]) {
    if (company[source] && !company[target]) items.push({ owner: company, source, target });
  }
  for (const product of company.products || []) {
    for (const [source, target] of [["name", "name_en"], ["description", "description_en"]]) {
      if (product[source] && !product[target]) items.push({ owner: product, source, target });
    }
  }
}

const chunks = [];
let chunk = [];
let length = 0;
for (const item of items) {
  const size = item.owner[item.source].length + 30;
  if (chunk.length && length + size > 3200) {
    chunks.push(chunk);
    chunk = [];
    length = 0;
  }
  chunk.push(item);
  length += size;
}
if (chunk.length) chunks.push(chunk);

const marker = (index) => `[[[98765${String(index).padStart(4, "0")}]]]`;
for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
  const current = chunks[chunkIndex];
  const input = current.map((item, index) => `${marker(index)}\n${item.owner[item.source]}`).join("\n");
  const raw = execFileSync("curl.exe", [
    "-sS", "--ssl-no-revoke", "--get",
    "https://translate.googleapis.com/translate_a/single",
    "--data-urlencode", "client=gtx",
    "--data-urlencode", "sl=fa",
    "--data-urlencode", "tl=en",
    "--data-urlencode", "dt=t",
    "--data-urlencode", `q=${input}`,
  ], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const response = JSON.parse(raw);
  const translated = response[0].map((part) => part[0]).join("");
  const matches = [...translated.matchAll(/\[\[\[98765(\d{4})\]\]\]\s*([\s\S]*?)(?=\[\[\[98765\d{4}\]\]\]|$)/g)];
  if (matches.length !== current.length) {
    throw new Error(`Translation alignment failed in chunk ${chunkIndex + 1}: ${matches.length}/${current.length}`);
  }
  for (const match of matches) {
    const index = Number(match[1]);
    current[index].owner[current[index].target] = match[2].trim();
  }
  writeFileSync(sourcePath, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`Translated chunk ${chunkIndex + 1}/${chunks.length}`);
}

console.log(`Translated ${items.length} exhibition fields.`);
