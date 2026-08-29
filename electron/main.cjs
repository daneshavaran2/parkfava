// Electron main process for the offline Windows build of FAVA Park Atlas.
//
// Architecture (see the plan this shipped from,
// C:\Users\surface pro7\.claude\plans\humble-petting-gem.md, for the why):
//   1. Start a real, embedded PostgreSQL cluster on loopback-only
//      (embedded-postgres — bundles actual Windows PG binaries, no
//      separate install needed).
//   2. Spawn the SAME built server (`.output/server/index.mjs`, produced by
//      `vite build`) as a plain Node child process, pointed at that local
//      Postgres via DATABASE_URL. Zero server-code changes — every
//      createServerFn/route works exactly as it does on the live site.
//   3. On first launch only: apply db/migrations/*.sql ourselves (see
//      runMigrations below — src/lib/db/auto-migrate.server.ts looks like
//      it does this at server boot, but nothing in the app actually calls
//      it; confirmed by grepping both src/ and the built .output/ for a
//      call site — zero. Real gap in the live app too, not just here, but
//      out of scope to fix from this file — worth flagging separately),
//      seed it from the bundled electron/seed/content.json + assets (built
//      by scripts/build-offline-seed.ts), and auto-promote the first
//      person who signs up to admin (there's no existing admin to do it
//      for them).
//   4. Open a BrowserWindow pointed at that local server.
//
// Plain CommonJS on purpose (`.cjs`) — this process never goes through
// Vite/TypeScript, so it stays directly runnable and easy to debug.
const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
// embedded-postgres ships as an ESM default export; required from this CJS
// file, Node's interop puts the actual class under `.default`.
const EmbeddedPostgres = require("embedded-postgres").default;
const postgres = require("postgres");

// app.getPath('userData') is keyed off app.getName(), which defaults to
// package.json's `name` ("tanstack_start_ts", the internal project name) —
// not `build.productName`. Left unset, every install's local database/
// uploads/logs would sit in a folder named after the source repo instead of
// the product, which is confusing for anyone poking around their own
// AppData. Must be called before app.getPath() is used anywhere below.
app.setName("FAVA Park Atlas Offline");

const APP_PORT = 34177;
const PG_PORT = 55432;
const PG_USER = "postgres";
const PG_DB = "favapark";

// Two different roots depending on whether we're running from a packaged
// installer (resources live under process.resourcesPath, added via
// electron-builder's `extraResources`) or `electron .` against the repo
// during development (nothing packaged — read straight from disk).
function resourcePath(relPath) {
  return app.isPackaged
    ? path.join(process.resourcesPath, relPath)
    : path.join(__dirname, "..", relPath);
}

function getOrCreatePgPassword(userDataDir) {
  const file = path.join(userDataDir, ".pgsecret");
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
  const pw = crypto.randomBytes(24).toString("hex");
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(file, pw, { mode: 0o600 });
  return pw;
}

// Plain-JS port of src/lib/db/auto-migrate.server.ts's logic (same
// _migrations bookkeeping table, same ordered-by-filename application) —
// that module is never actually invoked anywhere in the app (see the
// comment at the top of this file), so this Electron process is the only
// thing that will ever create the schema on a fresh local database. No
// advisory lock here, unlike the original: this is the only process that
// will ever write to this local cluster (single-instance-locked below).
async function runMigrations(sql) {
  const migrationsDir = resourcePath(path.join("db", "migrations"));
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  const applied = new Set((await sql`SELECT name FROM _migrations`).map((r) => r.name));

  for (const name of files) {
    if (applied.has(name)) continue;
    console.log(`[offline-migrate] applying ${name}`);
    const contents = fs.readFileSync(path.join(migrationsDir, name), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(contents);
      await tx`INSERT INTO _migrations (name) VALUES (${name}) ON CONFLICT DO NOTHING`;
    });
  }
}

async function waitForHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // Server not listening yet — keep polling.
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

// Same upsert shape as src/lib/offline-import.server.ts (used at runtime by
// the in-app "به‌روزرسانی از سایت اصلی" admin action). Duplicated rather
// than shared: that module is TypeScript wired for the Vite/Nitro server
// build, and pulling it into this plain-Node Electron process would need a
// separate compile step for one small, self-contained function. Keep the
// two in sync if the export/import shape changes.
// GENERATED ALWAYS columns (search_text on parks/exhibition_companies/
// exhibition_products, see db/migrations/0004 and 0013) reject an explicit
// value on INSERT — confirmed against a real local run, must be excluded
// from every upsert. Keep in sync with the same set in
// src/lib/offline-import.server.ts.
const GENERATED_COLUMNS = new Set(["search_text"]);

async function importSeedContent(sql, snapshot) {
  async function upsertTable(table, pkCols, rows, conflictTarget) {
    if (!rows || !rows.length) return { table, ok: 0, failed: 0 };
    let ok = 0,
      failed = 0;
    for (const row of rows) {
      const cols = Object.keys(row).filter((c) => !GENERATED_COLUMNS.has(c));
      const updateCols = cols.filter((c) => !pkCols.includes(c));
      try {
        await sql.unsafe(
          `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(", ")})
           VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})
           ON CONFLICT (${conflictTarget}) DO UPDATE SET
             ${updateCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ")}`,
          cols.map((c) => row[c]),
        );
        ok++;
      } catch (e) {
        failed++;
        console.error(`[offline-seed] ${table} row failed:`, e.message);
      }
    }
    return { table, ok, failed };
  }

  const results = [];
  results.push(await upsertTable("parks", ["park_id"], snapshot.parks, "park_id"));
  results.push(
    await upsertTable("exhibition_companies", ["company_id"], snapshot.companies, "company_id"),
  );
  results.push(await upsertTable("exhibition_products", ["id"], snapshot.products, "id"));
  results.push(await upsertTable("company_attachments", ["id"], snapshot.attachments, "id"));
  results.push(await upsertTable("about_sections", ["id"], snapshot.aboutSections, "id"));
  results.push(await upsertTable("park_content", ["park_id"], snapshot.parkContent, "park_id"));
  results.push(await upsertTable("park_images", ["id"], snapshot.parkImages, "id"));
  results.push(await upsertTable("park_news", ["id"], snapshot.parkNews, "id"));
  console.log("[offline-seed] import results:", results);
  return results;
}

// No admin exists yet on a fresh local DB (real production credentials are
// deliberately never bundled — see the plan). Poll for the first person to
// sign up through the app's own /auth page and grant them the admin role
// directly against the local DB, bypassing the app's normal
// admin-promotes-you flow (there's no admin to do that promoting yet).
// Cheap (one COUNT query every few seconds) and self-terminating — stops
// the moment an admin exists, whether that happened just now or already
// existed from a previous launch.
function watchForFirstAdmin(sql) {
  const interval = setInterval(async () => {
    try {
      const [{ count }] = await sql`SELECT count(*)::int FROM user_roles WHERE role = 'admin'`;
      if (count > 0) {
        clearInterval(interval);
        return;
      }
      const [oldest] = await sql`SELECT id FROM users ORDER BY created_at ASC LIMIT 1`;
      if (!oldest) return; // nobody signed up yet
      await sql`
        INSERT INTO user_roles (user_id, role) VALUES (${oldest.id}, 'admin')
        ON CONFLICT (user_id, role) DO NOTHING
      `;
      console.log("[offline-seed] promoted first local user to admin:", oldest.id);
      clearInterval(interval);
    } catch (e) {
      console.error("[offline-seed] admin-watch check failed:", e.message);
    }
  }, 3000);
  app.on("before-quit", () => clearInterval(interval));
}

let serverProcess = null;
let pgInstance = null;

async function startBackend() {
  const userDataDir = app.getPath("userData");
  const pgDataDir = path.join(userDataDir, "pgdata");
  const uploadDir = path.join(userDataDir, "uploads");
  const isFirstRun = !fs.existsSync(pgDataDir);
  const pgPassword = getOrCreatePgPassword(userDataDir);

  pgInstance = new EmbeddedPostgres({
    databaseDir: pgDataDir,
    port: PG_PORT,
    user: PG_USER,
    password: pgPassword,
    persistent: true,
    // Without this, initdb defaults to the Windows system locale's codepage
    // (e.g. WIN1252 on an English_United States install) — Persian text
    // (basically the entire dataset: company names, descriptions, park
    // names…) can't be represented in that encoding at all, and the very
    // first migration containing Persian text fails outright. --locale=C
    // sidesteps ICU/Windows-locale collation quirks entirely.
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    // Loopback-only — this Postgres instance exists solely for this app to
    // talk to itself; it must never be reachable from the network.
    postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
  });

  if (isFirstRun) {
    console.log("[offline] first launch — initialising local database…");
    await pgInstance.initialise();
  }
  await pgInstance.start();
  if (isFirstRun) {
    await pgInstance.createDatabase(PG_DB);
  }

  if (isFirstRun && !fs.existsSync(uploadDir)) {
    const seedAssets = resourcePath(path.join("electron", "seed", "assets"));
    if (fs.existsSync(seedAssets)) {
      console.log("[offline] copying bundled seed images into local uploads…");
      fs.cpSync(seedAssets, uploadDir, { recursive: true });
    } else {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
  }

  const databaseUrl = `postgresql://${PG_USER}:${encodeURIComponent(pgPassword)}@127.0.0.1:${PG_PORT}/${PG_DB}`;

  // Schema must exist before the server starts serving requests — the
  // server itself never applies migrations (see the comment at the top of
  // this file), so this is the only place it happens.
  const sql = postgres(databaseUrl);
  console.log("[offline] applying database migrations…");
  await runMigrations(sql);

  const serverEntry = resourcePath(path.join(".output", "server", "index.mjs"));

  serverProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1", // run the Electron binary as plain Node for this child
      DATABASE_URL: databaseUrl,
      UPLOAD_DIR: uploadDir,
      PORT: String(APP_PORT),
      HOST: "127.0.0.1",
      NODE_ENV: "production",
    },
    stdio: "inherit",
  });
  serverProcess.on("exit", (code, signal) => {
    console.error(`[offline] server process exited (code=${code} signal=${signal})`);
  });

  const healthy = await waitForHealth(`http://127.0.0.1:${APP_PORT}/api/public/health`, 30_000);
  if (!healthy) {
    throw new Error("Local server did not become healthy within 30s.");
  }

  if (isFirstRun) {
    const seedFile = resourcePath(path.join("electron", "seed", "content.json"));
    if (fs.existsSync(seedFile)) {
      console.log("[offline] seeding local database from bundled content…");
      const snapshot = JSON.parse(fs.readFileSync(seedFile, "utf8"));
      await importSeedContent(sql, snapshot);
    } else {
      console.warn("[offline] no bundled electron/seed/content.json found — starting empty.");
    }
  }
  // Keeps using `sql` on its own interval — left open for the app's life,
  // not closed here (it stops polling, but doesn't close the connection,
  // once an admin exists).
  watchForFirstAdmin(sql);

  return { isFirstRun };
}

function createWindow(isFirstRun) {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const urlPath = isFirstRun ? "/auth" : "/";
  win.loadURL(`http://127.0.0.1:${APP_PORT}${urlPath}`);
}

async function shutdownBackend() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
  if (pgInstance) {
    try {
      await pgInstance.stop();
    } catch (e) {
      console.error("[offline] error stopping local database:", e.message);
    }
  }
}

// Two instances would both try to run the same local Postgres data
// directory at the same port — refuse the second one outright instead of
// risking data-directory corruption.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      const { isFirstRun } = await startBackend();
      createWindow(isFirstRun);
    } catch (e) {
      console.error("[offline] failed to start:", e);
      app.quit();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  let shuttingDown = false;
  app.on("before-quit", async (event) => {
    if (shuttingDown) return;
    shuttingDown = true;
    event.preventDefault();
    await shutdownBackend();
    app.exit(0);
  });
}
