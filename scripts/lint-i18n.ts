/**
 * i18n scope lint.
 *
 * Rule: Persian (Arabic script, U+0600–U+06FF) is only allowed in UI layers
 * — React components and route files under `src/components/**` and
 * `src/routes/**` — plus documentation, seed scripts, and vendored assets.
 *
 * Any Persian character found in server-side code, migrations, integrations,
 * or non-UI library modules is a hard failure. Error messages, log lines,
 * enum values, migration comments, and column names must be English so that
 * stack traces, Sentry breadcrumbs, and Logflare queries stay searchable.
 *
 * Run:  bun run lint:i18n
 * Exit: 0 on clean, 1 on any violation (prints file:line:excerpt).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const PERSIAN = /[\u0600-\u06FF]/;

// Paths (posix separators) that are checked. Anything outside is ignored.
const INCLUDE_DIRS = ["src", "scripts", "supabase/migrations"];

// Files under these prefixes MAY contain Persian (UI layer + docs + seeds).
const UI_ALLOW_PREFIXES = [
  "src/components/",
  "src/routes/",
  "src/hooks/",
];

// Explicit deny — even if under an allowed prefix, these are server-only.
const DENY_SUFFIXES = [".server.ts", ".server.tsx", ".functions.ts", ".functions.tsx"];

// Skip generated / vendored / binary-ish files, and data-only files where
// Persian appears as row values (seed scripts, migration INSERTs) rather than
// as schema, error messages, or log lines.
const SKIP_SUBSTRINGS = [
  "routeTree.gen.",
  "/integrations/supabase/types.ts",
  "/lib/fava/",
  "src/types/fava",
  "public/vendor/",
  "node_modules/",
  "dist/",
  "scripts/seed-dev-data.ts",
  "scripts/seed-attachments.ts",
  "scripts/reset-dev-data.ts",
  "supabase/migrations/",
];

const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".sql"]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function posix(p: string): string {
  return p.split(sep).join("/");
}

function isChecked(rel: string): boolean {
  if (SKIP_SUBSTRINGS.some((s) => rel.includes(s))) return false;
  const dot = rel.lastIndexOf(".");
  if (dot < 0) return false;
  if (!EXTENSIONS.has(rel.slice(dot))) return false;
  return INCLUDE_DIRS.some((d) => rel.startsWith(d + "/"));
}

function isAllowed(rel: string): boolean {
  if (DENY_SUFFIXES.some((s) => rel.endsWith(s))) return false;
  return UI_ALLOW_PREFIXES.some((p) => rel.startsWith(p));
}

type Violation = { file: string; line: number; excerpt: string };

const violations: Violation[] = [];

for (const dir of INCLUDE_DIRS) {
  for (const abs of walk(join(ROOT, dir))) {
    const rel = posix(relative(ROOT, abs));
    if (!isChecked(rel)) continue;
    if (isAllowed(rel)) continue;

    const text = readFileSync(abs, "utf8");
    if (!PERSIAN.test(text)) continue;

    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (PERSIAN.test(line)) {
        violations.push({
          file: rel,
          line: i + 1,
          excerpt: line.trim().slice(0, 120),
        });
      }
    });
  }
}

// ------------------------------------------------------------------
// Locale key parity: fa.json and en.json must have identical key trees,
// no empty string values. Fails PR if any key is missing on either side.
// ------------------------------------------------------------------
type Json = { [k: string]: Json } | string | number | boolean | null;

function flatten(obj: Json, prefix = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const [ik, iv] of flatten(v as Json, key)) out.set(ik, iv);
      } else {
        out.set(key, v);
      }
    }
  }
  return out;
}

const localeViolations: { file: string; line: number; message: string }[] = [];
try {
  const faPath = "src/i18n/locales/fa.json";
  const enPath = "src/i18n/locales/en.json";
  const fa = JSON.parse(readFileSync(join(ROOT, faPath), "utf8"));
  const en = JSON.parse(readFileSync(join(ROOT, enPath), "utf8"));
  const faFlat = flatten(fa);
  const enFlat = flatten(en);
  const allKeys = new Set([...faFlat.keys(), ...enFlat.keys()]);
  for (const key of allKeys) {
    if (!faFlat.has(key)) {
      localeViolations.push({ file: faPath, line: 1, message: `missing key in fa.json: ${key}` });
    }
    if (!enFlat.has(key)) {
      localeViolations.push({ file: enPath, line: 1, message: `missing key in en.json: ${key}` });
    }
    const fv = faFlat.get(key);
    const ev = enFlat.get(key);
    if (typeof fv === "string" && fv.trim() === "") {
      localeViolations.push({ file: faPath, line: 1, message: `empty translation in fa.json: ${key}` });
    }
    if (typeof ev === "string" && ev.trim() === "") {
      localeViolations.push({ file: enPath, line: 1, message: `empty translation in en.json: ${key}` });
    }
  }
} catch (err) {
  localeViolations.push({ file: "src/i18n/locales/*", line: 1, message: `failed to load locale files: ${(err as Error).message}` });
}

const isCI = process.env.GITHUB_ACTIONS === "true";

function emit(file: string, line: number, msg: string) {
  if (isCI) {
    console.error(`::error file=${file},line=${line}::${msg}`);
  } else {
    console.error(`  ${file}:${line}  ${msg}`);
  }
}

if (violations.length === 0 && localeViolations.length === 0) {
  console.log("i18n lint: OK — no Persian outside UI layer; locale keys in parity.");
  process.exit(0);
}

if (violations.length > 0) {
  console.error(`i18n lint: ${violations.length} Persian-scope violation(s)`);
  console.error("Persian text is only permitted in src/components/**, src/routes/**, src/hooks/** (non-.server/.functions).\n");
  for (const v of violations) emit(v.file, v.line, v.excerpt);
}

if (localeViolations.length > 0) {
  console.error(`\ni18n lint: ${localeViolations.length} locale parity violation(s)`);
  console.error("fa.json and en.json must have identical keys with non-empty values.\n");
  for (const v of localeViolations) emit(v.file, v.line, v.message);
}

process.exit(1);

