/**
 * Imports a GET /api/public/export snapshot into whatever database
 * getDb() currently points to. Two callers, same logic (no copy-paste):
 *   - electron/main.cjs, once, on first launch, to seed the bundled local
 *     Postgres from electron/seed/content.json (built by
 *     scripts/build-offline-seed.ts).
 *   - src/lib/offline-sync.functions.ts's refreshFromLiveSite, at runtime,
 *     when an admin clicks the "refresh from live site" button and the
 *     machine has internet — same shape, fetched live instead of from disk.
 *
 * Every row already carries its real primary key (this is a straight copy
 * of production rows, not new data), so this is a plain per-table upsert —
 * insert on first import, overwrite on a later refresh. Order matters:
 * parents before children (parks/companies before products/attachments/
 * park_content, which reference them by id).
 *
 * One row failing (a stale FK, a column drift) must not abort the whole
 * import — the same defensive per-row try/catch as scripts/apply-atlas-data.ts.
 */
import { getDb } from "../../db/connection";

export type OfflineExportSnapshot = {
  exportedAt?: string;
  parks?: Record<string, unknown>[];
  companies?: Record<string, unknown>[];
  products?: Record<string, unknown>[];
  attachments?: Record<string, unknown>[];
  aboutSections?: Record<string, unknown>[];
  parkContent?: Record<string, unknown>[];
  parkImages?: Record<string, unknown>[];
  parkNews?: Record<string, unknown>[];
};

export type ImportResult = {
  table: string;
  ok: number;
  failed: number;
};

// GENERATED ALWAYS columns (parks/exhibition_companies/exhibition_products'
// full-text search_text, see db/migrations/0004 and 0013) come back from
// `SELECT *` like any other column, but Postgres refuses an explicit value
// for them — they're always computed server-side, never written to
// directly. Confirmed against a real local run: importing a `SELECT *`
// export as-is fails every single row with "cannot insert a non-DEFAULT
// value into column \"search_text\"".
const GENERATED_COLUMNS = new Set(["search_text"]);

async function upsertTable(
  sql: ReturnType<typeof getDb>,
  table: string,
  pkCols: string[],
  rows: Record<string, unknown>[] | undefined,
  conflictTarget: string,
): Promise<ImportResult> {
  const result: ImportResult = { table, ok: 0, failed: 0 };
  if (!rows?.length) return result;
  for (const row of rows) {
    const cols = Object.keys(row).filter((c) => !GENERATED_COLUMNS.has(c));
    const updateCols = cols.filter((c) => !pkCols.includes(c));
    try {
      await sql.unsafe(
        `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(", ")})
         VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})
         ON CONFLICT (${conflictTarget}) DO UPDATE SET
           ${updateCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ")}`,
        cols.map((c) => row[c] as never),
      );
      result.ok++;
    } catch (e) {
      result.failed++;
      console.error(`[offline-import] ${table} row failed:`, (e as Error).message);
    }
  }
  return result;
}

export async function importOfflineSnapshot(
  snapshot: OfflineExportSnapshot,
): Promise<ImportResult[]> {
  const sql = getDb();
  const results: ImportResult[] = [];

  // Parents first.
  results.push(await upsertTable(sql, "parks", ["park_id"], snapshot.parks, "park_id"));
  results.push(
    await upsertTable(
      sql,
      "exhibition_companies",
      ["company_id"],
      snapshot.companies,
      "company_id",
    ),
  );
  // Children — safe once their parents above exist.
  results.push(await upsertTable(sql, "exhibition_products", ["id"], snapshot.products, "id"));
  results.push(await upsertTable(sql, "company_attachments", ["id"], snapshot.attachments, "id"));
  results.push(await upsertTable(sql, "about_sections", ["id"], snapshot.aboutSections, "id"));
  results.push(
    await upsertTable(sql, "park_content", ["park_id"], snapshot.parkContent, "park_id"),
  );
  results.push(await upsertTable(sql, "park_images", ["id"], snapshot.parkImages, "id"));
  results.push(await upsertTable(sql, "park_news", ["id"], snapshot.parkNews, "id"));

  return results;
}
