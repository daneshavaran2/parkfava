/**
 * Build-time script for the offline Windows app (see electron/): fetches
 * GET /api/public/export from the live site and writes everything the
 * packaged app needs to seed its own local database on first launch:
 *   - electron/seed/content.json   — the export JSON, as-is
 *   - electron/seed/assets/<path>  — every referenced local asset (logos,
 *     product images, catalogs, attachments…), downloaded from
 *     <site>/assets/<path>, saved at the SAME relative path it's stored
 *     under in the DB. electron/main.cjs later copies this folder verbatim
 *     into the app's local UPLOAD_DIR, so every stored path in the seeded
 *     rows resolves with zero extra mapping.
 *
 * Deliberately does NOT touch DATABASE_URL / Postgres directly — this only
 * ever talks to the public, unauthenticated HTTPS endpoints of the live
 * site, same as the in-app "به‌روزرسانی از سایت اصلی" admin action
 * (src/lib/offline-sync.functions.ts) does at runtime. That's intentional:
 * parkfava-db's real address is a Liara-private hostname that isn't
 * reachable from outside their network anyway (confirmed — DNS ENOTFOUND).
 *
 * Run: bun run scripts/build-offline-seed.ts
 *   (SITE_URL env var overrides the default https://favapark.liara.run,
 *   for testing against a local dev server instead.)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_URL = (process.env.SITE_URL || "https://favapark.liara.run").replace(/\/$/, "");
const SEED_DIR = join(__dirname, "..", "electron", "seed");
const ASSET_FIELDS = [
  "logo_url",
  "image_url",
  "video_url",
  "video_url_2",
  "catalog_url",
  "file_url",
  "link_url",
];

function collectAssetPaths(snapshot: Record<string, unknown>): Set<string> {
  const paths = new Set<string>();
  const tables = [
    "parks",
    "companies",
    "products",
    "attachments",
    "aboutSections",
    "parkContent",
    "parkImages",
  ];
  for (const table of tables) {
    const rows = (snapshot[table] as Record<string, unknown>[] | undefined) ?? [];
    for (const row of rows) {
      for (const field of ASSET_FIELDS) {
        const v = row[field];
        if (typeof v === "string" && v && !/^https?:\/\//i.test(v)) {
          paths.add(v.replace(/^\/+/, ""));
        }
      }
    }
  }
  return paths;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// A run against the live site reliably hit a stretch of transient
// connection failures partway through (started failing consistently around
// item ~200/258, cleared up on a full re-run) — the same "sandbox outbound
// network blip, not a real error" pattern already seen in this project's
// other live-fetch scripts. A few retries with backoff absorbs that instead
// of needing a manual re-run every time.
async function downloadAssetOnce(relPath: string): Promise<"ok" | "missing" | "error"> {
  const dest = join(SEED_DIR, "assets", relPath);
  try {
    const res = await fetch(
      `${SITE_URL}/assets/${relPath.split("/").map(encodeURIComponent).join("/")}`,
    );
    if (res.status === 404) return "missing";
    if (!res.ok) return "error";
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, buf);
    return "ok";
  } catch {
    return "error";
  }
}

async function downloadAsset(relPath: string, retries = 3): Promise<"ok" | "missing" | "error"> {
  for (let i = 0; i < retries; i++) {
    const result = await downloadAssetOnce(relPath);
    if (result !== "error") return result;
    if (i < retries - 1) await sleep(1500 * (i + 1));
  }
  return "error";
}

async function main() {
  console.log(`Fetching ${SITE_URL}/api/public/export …`);
  const res = await fetch(`${SITE_URL}/api/public/export`);
  if (!res.ok) {
    console.error(`Export request failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const snapshot = await res.json();

  await mkdir(SEED_DIR, { recursive: true });
  await writeFile(join(SEED_DIR, "content.json"), JSON.stringify(snapshot, null, 2));
  console.log(
    `Wrote content.json — ${snapshot.parks?.length ?? 0} parks, ${snapshot.companies?.length ?? 0} companies, ` +
      `${snapshot.products?.length ?? 0} products, ${snapshot.attachments?.length ?? 0} attachments, ` +
      `${snapshot.aboutSections?.length ?? 0} about sections.`,
  );

  const assetPaths = [...collectAssetPaths(snapshot)];
  console.log(`Downloading ${assetPaths.length} referenced asset file(s)…`);
  let ok = 0,
    missing = 0,
    error = 0;
  for (const [i, relPath] of assetPaths.entries()) {
    const result = await downloadAsset(relPath);
    if (result === "ok") ok++;
    else if (result === "missing") missing++;
    else error++;
    if ((i + 1) % 25 === 0 || i === assetPaths.length - 1) {
      console.log(`  ${i + 1}/${assetPaths.length} (ok=${ok} missing=${missing} error=${error})`);
    }
  }

  console.log(
    `\n✓ Done. electron/seed/content.json + electron/seed/assets/ (${ok} file(s)) are ready to bundle.` +
      (missing || error
        ? `\n  ${missing} asset(s) 404'd, ${error} failed to download — check the log above.`
        : ""),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
