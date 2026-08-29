// Copies electron/main.cjs's small, fixed set of runtime dependencies (the
// embedded-postgres stack) out of the real node_modules into
// electron/vendor/node_modules, which package.json's `build.extraResources`
// then places as a sibling of the packaged app's resources/app.asar — Node's
// normal upward node_modules search finds it there with zero code changes.
//
// Why not just point electron-builder's `files` at node_modules/** and let
// it figure out what's needed? Because it can't ask bun for a dependency
// tree (no equivalent of `npm ls --json`) and falls back to manually
// walking the entire node_modules folder to build one itself — with the
// ~900 packages a full web-app install pulls in, that walk is not merely
// slow, it never finished in a 45+ minute test run. Vendoring a fixed list
// here means electron-builder's `files` never matches anything under
// node_modules, so it skips that walk entirely — extraResources is a plain
// file copy, no dependency analysis involved.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const nodeModules = join(root, "node_modules");
const vendorDir = join(root, "electron", "vendor", "node_modules");

// Keep this list in sync with electron/main.cjs's requires — it's
// `embedded-postgres` + `postgres` and their full transitive dependency
// tree (traced by hand once; none of these packages have deps beyond what's
// listed here as of embedded-postgres 17.10.0-beta.17 / postgres 3.4.9).
const PACKAGES = [
  "postgres",
  "embedded-postgres",
  "@embedded-postgres",
  "pg",
  "pg-connection-string",
  "pg-pool",
  "pg-protocol",
  "pg-types",
  "pg-int8",
  "postgres-array",
  "postgres-bytea",
  "postgres-date",
  "postgres-interval",
  "xtend",
  "pgpass",
  "split2",
  "async-exit-hook",
];

rmSync(vendorDir, { recursive: true, force: true });
mkdirSync(vendorDir, { recursive: true });

let copied = 0;
for (const pkg of PACKAGES) {
  const src = join(nodeModules, pkg);
  if (!existsSync(src)) {
    console.warn(`[electron-vendor-deps] not installed, skipping: ${pkg}`);
    continue;
  }
  const dest = join(vendorDir, pkg);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  copied++;
}

console.log(`[electron-vendor-deps] vendored ${copied}/${PACKAGES.length} package(s) into electron/vendor/node_modules`);
