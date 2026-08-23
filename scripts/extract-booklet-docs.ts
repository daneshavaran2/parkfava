/**
 * Imports the official ICT Park booklet forms into scripts/atlas-data.json.
 *
 * Each company returned a pair of Word forms — "فرم ۱ (فارسی)" and "فرم ۲
 * (انگلیسی)" — usually inside a per-company .zip/.rar along with logos and
 * product images. Those forms are the authoritative source for company
 * content, and they matter for two reasons:
 *
 *   1. The Persian text currently in atlas-data.json was scraped out of the
 *      atlas PDF, which scrambled the RTL word order ("تأسیس گردید و با تکیه
 *      بر دانش فنی و۱۳۹۰ شرکت ... در سال" instead of "شرکت ... در سال ۱۳۹۰
 *      تأسیس گردید و با تکیه بر دانش فنی و ..."). The forms have it intact.
 *   2. The English in atlas-data.json is a machine translation *of that
 *      scrambled text*. The forms carry English the companies wrote
 *      themselves.
 *
 * So this overwrites both languages from the forms, and leaves any company
 * with no form untouched.
 *
 * Usage:
 *   bun run scripts/extract-booklet-docs.ts <source-dir> [--dry-run]
 *
 * Requires 7z (or WinRAR's UnRAR) on PATH only if the directory contains
 * .rar archives; .zip and bare .docx are read with JSZip, which the app
 * already depends on. Re-running is safe — it rewrites atlas-data.json from
 * the forms each time.
 *
 * After running: `node scripts/generate-atlas-english-migration.mjs` to
 * regenerate the SQL migration, then `bun run db:migrate` against the target
 * database.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import JSZip from "jszip";
import { findMatch } from "./lib/company-match";
import type { AtlasCompany, AtlasProduct } from "./lib/atlas-data";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const dataPath = join(scriptDir, "atlas-data.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const sourceDir = args.find((a) => !a.startsWith("--"));
if (!sourceDir) {
  console.error("Usage: bun run scripts/extract-booklet-docs.ts <source-dir> [--dry-run]");
  process.exit(1);
}

/* ============ archive names that don't match a company name ============ */

// Resolved by opening each file during the initial survey; the archive name
// is a nickname, a typo, or a shortened form of the registered company name.
// Two of these ("تسنیم", "سیگما") point at a name that is itself misspelled
// in atlas-data.json — the atlas PDF rendered the لا ligature as ال, giving
// "اطالعات" where the company writes "اطلاعات". The alias has to spell it the
// broken way to find the row; the booklet form then corrects the name.
const ARCHIVE_ALIASES: Record<string, string> = {
  "خوارزم ارتباط خاوریانه": "خوارزم ارتباط خاورمیانه",
  "سلامت الکترونیکی تامین": "ساتا-سالمت الکترونیکی تامین",
  "شتاب دهنده نوآفرین": "شتابدهنده فناوری های مالی نوآفرین",
  "فرم کتابچه پارک فاوا شرکت سماتوس": "توسعه سامانه های رایانه سماتوس",
  "مانا اندیشه خاوران": "مانا اندیشه ستاره خاوران",
  "فرم 2(انگلیسی)": "هوشمند سازان بیتا",
  "توسعه فناوری لوتوس شبک": "توسعه فناوری لوتوس شبکه",
  "تسنیم": "فناوری اطالعات و ارتباطات تسنیم",
  "سیگما": "توسعه زیر ساخت های فناوری اطالعات سیگما",
  "نسیم فدک ایرانیان - انگلیسی": "نسیم فدک ایرانیان",
  // Same company, one archive per language — aliased to a single key so the
  // Persian and English forms merge into one company instead of two passes.
  "اطلاعات شرکت آرا الکترونیک افزار نهایی": "آرا الکترونیک افزار",
  "فایل انگلیسی اطلاعات شرکت آرا الکترونیک افزار": "آرا الکترونیک افزار",
  "اطلاعات شرکت تیم_یار کیش": "تیم یار",
  "اطلاعات شرکت تیم_یار (نسخه انگلیسی) )": "تیم یار",
};

// Not company profile content. The contract in particular is a commercial
// agreement between the park and a company, carrying registration numbers,
// national IDs and signatories — it must never reach the public exhibition.
const SKIP_FILES: { match: RegExp; reason: string }[] = [
  { match: /قرار\s*داد/, reason: "commercial contract, not booklet content" },
];

/* ============ docx text ============ */

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

/**
 * Word splits a single word across several <w:t> runs whenever formatting
 * changes mid-word, so runs are concatenated with nothing between them.
 * Paragraph and table-cell ends are the only real line breaks.
 */
async function docxToText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const doc = zip.file("word/document.xml");
  if (!doc) return "";
  let xml = await doc.async("string");
  xml = xml
    .replace(/<w:br\s*\/?>/g, "\n")
    .replace(/<w:tab\s*\/?>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tc>/g, "\n")
    .replace(/<[^>]+>/g, "");
  xml = xml.replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m);
  xml = xml.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
  return xml
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ============ label matching ============ */

/**
 * Persian in these forms is typed inconsistently: Arabic vs Persian yeh and
 * kaf, ZWNJ vs space vs nothing between words, optional trailing colon. A
 * literal label string would match maybe half the documents.
 */
function tolerantLabel(label: string): string {
  const escaped = label
    .split("")
    .map((ch) => {
      if (ch === "ی" || ch === "ي") return "[یي]";
      if (ch === "ک" || ch === "ك") return "[کك]";
      if (ch === "ه") return "[هة]";
      if (ch === " ") return "[\\s\\u200c]*";
      if (ch === "'" || ch === "\u2019") return "['\u2019\u02bc]?";
      return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return `${escaped}[\\s\\u200c]*:?`;
}

type FieldKey =
  | "name"
  | "logo"
  | "founded"
  | "activity"
  | "founders"
  | "headcount"
  | "intro"
  | "products";

const FA_LABELS: [FieldKey, string[]][] = [
  ["name", ["نام شرکت"]],
  ["logo", ["لوگو شرکت"]],
  ["founded", ["تاریخ تأسیس", "تاریخ تاسیس", "سال تأسیس", "سال تاسیس"]],
  ["activity", ["حوزه فعالیت", "زمینه فعالیت"]],
  ["founders", ["نام بنیانگذاران", "نام بنیان گذاران", "اسامی بنیانگذاران"]],
  ["headcount", ["تعداد نیروی انسانی", "تعداد کارکنان"]],
  ["intro", ["معرفی مختصری از شرکت", "معرفی مختصر شرکت", "معرفی شرکت"]],
  ["products", ["معرفی محصولات شرکت"]],
];

const EN_LABELS: [FieldKey, string[]][] = [
  ["founded", ["Date of Establishment"]],
  ["logo", ["Company Logo"]],
  ["name", ["Company Name"]],
  ["activity", ["Field of Activity"]],
  ["founders", ["Founders' Names", "Founder's Names", "Founders Names"]],
  ["headcount", ["Number of Employees"]],
  [
    "intro",
    [
      "A brief Introduction to the Company",
      "Brief Introduction of the Company",
      "A Brief Introduction of the Company",
      "Brief Introduction to the Company",
    ],
  ],
  ["products", ["Introduction of the Company"]],
];

type Hit = { key: FieldKey; start: number; end: number };

/** Every label occurrence in document order, so a field's value is simply the gap to the next one. */
function locateLabels(text: string, labels: [FieldKey, string[]][]): Hit[] {
  const hits: Hit[] = [];
  for (const [key, variants] of labels) {
    for (const variant of variants) {
      const re = new RegExp(tolerantLabel(variant), "gi");
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        hits.push({ key, start: m.index, end: m.index + m[0].length });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  // Overlapping variants of the same label ("Brief Introduction of the
  // Company" inside "A brief Introduction to the Company") would otherwise
  // each contribute a hit and truncate the value to nothing.
  const deduped: Hit[] = [];
  for (const h of hits) {
    const prev = deduped[deduped.length - 1];
    if (prev && h.start < prev.end) continue;
    deduped.push(h);
  }
  return deduped;
}

function fieldValue(text: string, hits: Hit[], key: FieldKey): string | null {
  const i = hits.findIndex((h) => h.key === key);
  if (i === -1) return null;
  const next = hits[i + 1];
  const raw = text.slice(hits[i].end, next ? next.start : text.length);
  return cleanValue(raw);
}

// Blank form fields are left as a run of dots or underscores by whoever
// filled it in; those are empty, not content.
function cleanValue(raw: string): string | null {
  const v = raw
    .replace(/[.．_]{4,}/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  return v || null;
}

/* ============ value parsers ============ */

const DIGIT_MAP: Record<string, string> = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

function toAsciiDigits(s: string): string {
  return s.replace(/[۰-۹٠-٩]/g, (d) => DIGIT_MAP[d] ?? d);
}

/**
 * atlas-data.json stores `founded_year` as a Jalali year (apply-atlas-data.ts
 * adds 621 to get a Gregorian date), so a Gregorian year off the English form
 * has to be converted back. Both forms are read; the Persian one wins because
 * it states the Jalali year directly.
 */
function parseFoundedYear(value: string | null, lang: "fa" | "en"): number | null {
  if (!value) return null;
  const text = toAsciiDigits(value);
  const jalali = text.match(/\b(1[2-4]\d{2})\b/);
  if (jalali) return Number(jalali[1]);
  const gregorian = text.match(/\b(19\d{2}|20\d{2})\b/);
  if (gregorian) return Number(gregorian[1]) - 621;
  if (lang === "fa") {
    const short = text.match(/\b(\d{2})\b/);
    if (short) return 1300 + Number(short[1]);
  }
  return null;
}

const FULL_TIME_LABEL = /(?:full[\s-]*time|تمام[\s‌]*وقت)/i;
const PART_TIME_LABEL = /(?:part[\s-]*time|پاره[\s‌]*وقت)/i;

/**
 * The two templates put the number on opposite sides of its label: the
 * Persian form reads "۱۵۹ تمام‌وقت", the English one "Full-time:
159".
 *
 * The direction has to be decided once for the whole field rather than per
 * label. Trying "after the label" and falling back to "before the label"
 * misreads the English "159Part-time/Project-based: ......" — where the
 * full-time count is written flush against the *next* label and the
 * part-time box was left blank — as a part-time count of 159.
 */
function parseHeadcount(value: string | null): {
  full: number | null;
  part: number | null;
} {
  if (!value) return { full: null, part: null };
  const text = toAsciiDigits(value);
  const fullAt = text.match(FULL_TIME_LABEL);
  const partAt = text.match(PART_TIME_LABEL);
  if (!fullAt && !partAt) {
    const lone = text.match(/(\d{1,5})/);
    return { full: lone ? Number(lone[1]) : null, part: null };
  }

  const firstNumber = (s: string) => {
    const m = s.match(/(\d{1,5})/);
    return m ? Number(m[1]) : null;
  };
  const lastNumber = (s: string) => {
    const m = s.match(/(\d{1,5})(?![\s\S]*\d)/);
    return m ? Number(m[1]) : null;
  };

  const fullStart = fullAt?.index ?? -1;
  const fullEnd = fullStart >= 0 ? fullStart + fullAt![0].length : -1;
  const partStart = partAt?.index ?? -1;
  const partEnd = partStart >= 0 ? partStart + partAt![0].length : -1;

  // A digit written immediately before the full-time label is the Persian
  // layout; anything else is the English one, where each count follows its
  // own label.
  const beforeFull = fullStart >= 0 ? text.slice(0, fullStart) : "";
  if (/\d\s*(?:نفر\s*)?$/.test(beforeFull)) {
    const betweenLabels =
      partStart > fullEnd ? text.slice(fullEnd, partStart) : text.slice(fullEnd);
    return { full: lastNumber(beforeFull), part: lastNumber(betweenLabels) };
  }

  const afterFull =
    fullEnd < 0 ? "" : partStart > fullEnd ? text.slice(fullEnd, partStart) : text.slice(fullEnd);
  return {
    full: firstNumber(afterFull),
    part: partEnd >= 0 ? firstNumber(text.slice(partEnd)) : null,
  };
}

const FA_PRODUCT_NAME = tolerantLabel("نام محصول");
const FA_PRODUCT_DESC = tolerantLabel("شرح کوتاهی از محصول");
const FA_PRODUCT_IMAGE = tolerantLabel("تصویر محصول");
const EN_PRODUCT_NAME = "Product\\s*Name\\s*:?";
const EN_PRODUCT_DESC = "Short\\s*Description\\s*of\\s*the\\s*Product\\s*:?";
const EN_PRODUCT_IMAGE = "Product\\s*Image\\s*:?";

/**
 * The products block repeats "name / image / description" per product, so
 * each product runs from its name label to the next one.
 */
function parseProducts(block: string | null, lang: "fa" | "en"): { name: string; description: string }[] {
  if (!block) return [];
  const nameRe = new RegExp(lang === "fa" ? FA_PRODUCT_NAME : EN_PRODUCT_NAME, "gi");
  const descSrc = lang === "fa" ? FA_PRODUCT_DESC : EN_PRODUCT_DESC;
  const imageSrc = lang === "fa" ? FA_PRODUCT_IMAGE : EN_PRODUCT_IMAGE;

  const starts: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = nameRe.exec(block))) {
    starts.push({ start: m.index, end: m.index + m[0].length });
    if (m.index === nameRe.lastIndex) nameRe.lastIndex++;
  }

  const products: { name: string; description: string }[] = [];
  for (let i = 0; i < starts.length; i++) {
    const chunk = block.slice(starts[i].end, starts[i + 1]?.start ?? block.length);
    const descMatch = new RegExp(descSrc, "i").exec(chunk);
    const name = cleanValue(
      chunk
        .slice(0, descMatch ? descMatch.index : chunk.length)
        .replace(new RegExp(imageSrc, "gi"), " "),
    );
    const description = descMatch ? cleanValue(chunk.slice(descMatch.index + descMatch[0].length)) : null;
    if (!name) continue;
    // "Product Image" with nothing after it is a placeholder row, not a product.
    products.push({ name: name.split("\n")[0].trim(), description: description ?? "" });
  }
  return products;
}

/**
 * Product identity across sources.
 *
 * The two sources describe the same product differently. Word order moves the
 * model number from one end to the other ("مودم سیمکارت خور ML145" vs "ML145
 * مودم سیمکارت خور"), and the surrounding words change outright
 * ("ML3121 مودم سیمکارت خور" vs "مود؅4G مدل ML3121"). Comparing the
 * strings, even normalised, files one product under two names and doubles
 * every hardware product list on import.
 *
 * A latin model code is the one stable identifier when there is one; product
 * names without one (software, services) fall back to comparing the set of
 * words, which handles reordering.
 */
function productTokens(name: string): string[] {
  return (name || "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .toLowerCase()
    .split(/[^0-9a-z؀-ۿ]+/i)
    .filter(Boolean);
}

/** "ML145", "HF6028", "MF300" — letters then digits, latin only. */
function modelCodes(name: string): string[] {
    return (name || "").toLowerCase().match(/[a-z]{1,4}\d{2,5}/g) ?? [];
}

function sameProduct(a: string, b: string): boolean {
  const codesA = modelCodes(a);
  const codesB = modelCodes(b);
  if (codesA.length && codesB.length) return codesA.some((c) => codesB.includes(c));
  return productTokens(a).sort().join(" ") === productTokens(b).sort().join(" ");
}

/* ============ form parsing ============ */

type ParsedForm = {
  lang: "fa" | "en";
  name: string | null;
  activity: string | null;
  founders: string | null;
  intro: string | null;
  foundedYear: number | null;
  headcountFull: number | null;
  headcountPart: number | null;
  products: { name: string; description: string }[];
  score: number;
};

function parseForm(text: string, lang: "fa" | "en"): ParsedForm {
  const hits = locateLabels(text, lang === "fa" ? FA_LABELS : EN_LABELS);
  const value = (k: FieldKey) => fieldValue(text, hits, k);
  const headcount = parseHeadcount(value("headcount"));
  const name = value("name");
  return {
    lang,
    // Some forms wrap the value onto its own line under the label and then
    // continue with the next section; only the first line is the name.
    name: name ? name.split("\n")[0].trim() : null,
    activity: value("activity"),
    founders: value("founders"),
    intro: value("intro"),
    foundedYear: parseFoundedYear(value("founded"), lang),
    headcountFull: headcount.full,
    headcountPart: headcount.part,
    products: parseProducts(value("products"), lang),
    score: new Set(hits.map((h) => h.key)).size,
  };
}

/** Which template a document is, decided by which label set actually appears in it. */
function detectAndParse(text: string): ParsedForm | null {
  const fa = parseForm(text, "fa");
  const en = parseForm(text, "en");
  const best = en.score > fa.score ? en : fa;
  // Two labels is the floor for calling something one of these forms — a
  // cover letter or a contract scores below it.
  return best.score >= 2 ? best : null;
}

/* ============ reading archives ============ */

type DocEntry = { archive: string; entry: string; buffer: Buffer };

function sevenZipCommand(): string | null {
  for (const candidate of ["7z", "C:\\Program Files\\7-Zip\\7z.exe"]) {
    try {
      execFileSync(candidate, ["i"], { stdio: "ignore" });
      return candidate;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/**
 * Some submissions are an archive of archives (سیگما.rar holds two .zips), so
 * nested zips have to be followed rather than reported as "no .docx inside".
 *
 * But only when the archive has no forms of its own: آراد کنترل.rar happens
 * to carry a copy of *another company's* zip alongside its own documents, and
 * descending into that unconditionally imports one company's products under
 * the other's name. An archive that already contains .docx files is answering
 * for itself, so nothing nested is opened.
 */
async function docxFromZipBuffer(
  buffer: Buffer,
  archive: string,
  prefix = "",
): Promise<DocEntry[]> {
  const zip = await JSZip.loadAsync(buffer);
  const own: DocEntry[] = [];
  const nested: { path: string; read: () => Promise<Buffer> }[] = [];
  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir || basename(path).startsWith("~$")) continue;
    const lower = path.toLowerCase();
    if (lower.endsWith(".docx")) {
      own.push({ archive, entry: prefix + path, buffer: Buffer.from(await file.async("nodebuffer")) });
    } else if (lower.endsWith(".zip")) {
      nested.push({ path, read: async () => Buffer.from(await file.async("nodebuffer")) });
    }
  }
  if (own.length) return own;
  const out: DocEntry[] = [];
  for (const n of nested) {
    out.push(...(await docxFromZipBuffer(await n.read(), archive, `${prefix}${n.path}/`)));
  }
  return out;
}

/** RAR has no pure-JS reader here, so it goes through 7z into a temp directory. */
async function readRarDocx(archivePath: string, sevenZip: string): Promise<DocEntry[]> {
  const temp = mkdtempSync(join(tmpdir(), "booklet-"));
  const archive = basename(archivePath);
  try {
    execFileSync(sevenZip, ["x", archivePath, `-o${temp}`, "-y"], { stdio: "ignore" });
    const files = walk(temp).filter((f) => !basename(f).startsWith("~$"));
    const own = files
      .filter((f) => f.toLowerCase().endsWith(".docx"))
      .map((f) => ({ archive, entry: f.slice(temp.length + 1), buffer: readFileSync(f) }));
    // Same rule as docxFromZipBuffer: its own forms win over anything nested.
    if (own.length) return own;
    const out: DocEntry[] = [];
    for (const f of files.filter((f) => f.toLowerCase().endsWith(".zip"))) {
      out.push(...(await docxFromZipBuffer(readFileSync(f), archive, `${f.slice(temp.length + 1)}/`)));
    }
    return out;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

async function readZipDocx(archivePath: string): Promise<DocEntry[]> {
  return docxFromZipBuffer(readFileSync(archivePath), basename(archivePath));
}

/* ============ main ============ */

/** The company this archive is about, from its filename plus the alias table. */
function archiveCompanyName(archive: string): string {
  const base = basename(archive, extname(archive)).replace(/\s*\(\d+\)\s*$/, "").trim();
  return ARCHIVE_ALIASES[base] ?? base;
}

async function main() {
  const companies: AtlasCompany[] = JSON.parse(readFileSync(dataPath, "utf8"));

  const files = readdirSync(sourceDir!)
    .filter((f) => /\.(zip|rar|docx)$/i.test(f))
    .filter((f) => !f.startsWith("~$"))
    .sort();

  const sevenZip = files.some((f) => f.toLowerCase().endsWith(".rar")) ? sevenZipCommand() : null;
  if (files.some((f) => f.toLowerCase().endsWith(".rar")) && !sevenZip) {
    console.error("! .rar archives present but no 7z on PATH — those archives will be skipped.");
  }

  // Several companies sent the same archive twice ("بیستون.rar" and "بیستون
  // (1).rar"). Group by resolved company so the duplicate is just a second
  // source of documents for the same target, not a second import.
  const byCompany = new Map<string, DocEntry[]>();
  const skipped: string[] = [];

  for (const file of files) {
    const full = join(sourceDir!, file);
    const skip = SKIP_FILES.find((s) => s.match.test(file));
    if (skip) {
      skipped.push(`${file} — ${skip.reason}`);
      continue;
    }
    let docs: DocEntry[] = [];
    try {
      if (/\.zip$/i.test(file)) docs = await readZipDocx(full);
      else if (/\.rar$/i.test(file)) docs = sevenZip ? await readRarDocx(full, sevenZip) : [];
      else docs = [{ archive: file, entry: file, buffer: readFileSync(full) }];
    } catch (e) {
      skipped.push(`${file} — could not read (${(e as Error).message})`);
      continue;
    }
    docs = docs.filter((d) => !SKIP_FILES.some((s) => s.match.test(d.entry)));
    if (!docs.length) {
      skipped.push(`${file} — no .docx inside (images only?)`);
      continue;
    }
    const key = archiveCompanyName(file);
    byCompany.set(key, [...(byCompany.get(key) ?? []), ...docs]);
  }

  let updated = 0;
  const unmatched: string[] = [];
  const warnings: string[] = [];
  const report: string[] = [];

  for (const [label, docs] of byCompany) {
    const parsed: ParsedForm[] = [];
    for (const doc of docs) {
      try {
        const form = detectAndParse(await docxToText(doc.buffer));
        if (form) parsed.push(form);
      } catch (e) {
        skipped.push(`${doc.archive}:${doc.entry} — ${(e as Error).message}`);
      }
    }
    if (!parsed.length) {
      unmatched.push(`${label} — no parseable form found`);
      continue;
    }

    // Best of each language: a company that sent the form twice gets the
    // copy with more fields filled in.
    const pickBest = (lang: "fa" | "en") =>
      parsed.filter((p) => p.lang === lang).sort((a, b) => b.score - a.score)[0] ?? null;
    const fa = pickBest("fa");
    const en = pickBest("en");

    const match = findMatch(
      { name: label, name_en: en?.name ?? null, website: null, email: null },
      companies,
    ) ?? findMatch(
      { name: fa?.name ?? "", name_en: en?.name ?? null, website: null, email: null },
      companies,
    );

    if (!match) {
      unmatched.push(`${label} — no company in atlas-data.json (fa="${fa?.name ?? "-"}" en="${en?.name ?? "-"}")`);
      continue;
    }

    const c = match.company;
    const before = JSON.stringify(c);

    if (fa?.name) c.name = fa.name;
    if (en?.name) c.name_en = en.name;
    if (fa?.activity) c.activity_domain = fa.activity;
    if (en?.activity) c.activity_domain_en = en.activity;
    if (fa?.founders) c.founders = fa.founders;
    if (en?.founders) c.founders_en = en.founders;
    if (fa?.intro) c.intro = fa.intro;
    if (en?.intro) c.intro_en = en.intro;
    const year = fa?.foundedYear ?? en?.foundedYear ?? null;
    if (year) c.founded_year = year;
    const full = fa?.headcountFull ?? en?.headcountFull ?? null;
    const part = fa?.headcountPart ?? en?.headcountPart ?? null;
    if (full != null) c.headcount_full_time = full;
    if (part != null) c.headcount_part_time = part;

    // A product's Persian and English entries can only be tied together by
    // position — the names are in different scripts, so there is nothing to
    // compare. That is sound when both forms list the same products in the
    // same order, which is exactly what an equal count is evidence of. When
    // the counts differ, position proves nothing, and pairing anyway would
    // staple one product's English onto another's Persian; the Persian list
    // is taken as the product set and the mismatch is reported for review.
    const faProducts = fa?.products ?? [];
    const enProducts = en?.products ?? [];
    const pairable = faProducts.length > 0 && faProducts.length === enProducts.length;
    if (faProducts.length && enProducts.length && !pairable) {
      warnings.push(
        `${c.name} — ${faProducts.length} Persian vs ${enProducts.length} English products; ` +
          `kept Persian, left English product text out (add it in the admin panel)`,
      );
    }

    const incoming: AtlasProduct[] = faProducts.length
      ? faProducts.map((f, i) => ({
          name: f.name,
          description: f.description,
          ...(pairable
            ? { name_en: enProducts[i].name, description_en: enProducts[i].description || null }
            : {}),
        }))
      : // English-only submission: better to carry the product with an English
        // name than to drop it, and an admin can add the Persian later.
        enProducts.map((e) => ({
          name: e.name,
          description: "",
          name_en: e.name,
          description_en: e.description || null,
        }));

    for (const p of incoming) {
      if (!p.name) continue;
      const existing = c.products.find((x) => sameProduct(x.name, p.name));
      if (!existing) {
        c.products.push(p);
        continue;
      }
      // The booklet renames products the atlas PDF had under a different
      // wording. The old name is the only handle the migration has on the row
      // that already exists in the database — which carries the product's
      // image — so it is recorded once and never overwritten on re-runs.
      if (!existing.legacy_name && existing.name !== p.name) existing.legacy_name = existing.name;
      Object.assign(existing, p);
      if (existing.legacy_name === existing.name) delete existing.legacy_name;
    }

    if (JSON.stringify(c) !== before) updated++;
    report.push(
      `  ${label} -> ${c.name} (${match.method}) ` +
        `[fa=${fa ? "yes" : "no"} en=${en ? "yes" : "no"} products fa=${faProducts.length} en=${enProducts.length}]`,
    );
  }

  console.log(`\n=== Matched (${report.length}) ===`);
  report.sort().forEach((l) => console.log(l));
  if (unmatched.length) {
    console.log(`\n=== Unmatched (${unmatched.length}) ===`);
    unmatched.forEach((l) => console.log(`  ${l}`));
  }
  if (warnings.length) {
    console.log(`\n=== Needs review (${warnings.length}) ===`);
    warnings.forEach((l) => console.log(`  ${l}`));
  }
  if (skipped.length) {
    console.log(`\n=== Skipped (${skipped.length}) ===`);
    skipped.forEach((l) => console.log(`  ${l}`));
  }

  const untouched = companies.filter((c) => !report.some((r) => r.includes(`-> ${c.name} `)));
  if (untouched.length) {
    console.log(`\n=== No booklet form, left as-is (${untouched.length}) ===`);
    untouched.forEach((c) => console.log(`  ${c.name}`));
  }

  if (dryRun) {
    console.log(`\n(dry run — atlas-data.json not written; ${updated} companies would change)`);
    return;
  }
  writeFileSync(dataPath, `${JSON.stringify(companies, null, 2)}\n`, "utf8");
  console.log(
    `\n✓ Updated ${updated} companies in scripts/atlas-data.json ` +
      `(${companies.reduce((n, c) => n + c.products.length, 0)} products total).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
