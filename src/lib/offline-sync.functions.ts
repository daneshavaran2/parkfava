/**
 * Admin action for the offline Windows build: the "refresh from live site"
 * button pulls a fresh GET /api/public/export snapshot from the real, public
 * favapark.liara.run and upserts it into whatever local database this
 * running instance is pointed at (the embedded Postgres electron/main.cjs
 * starts — see importOfflineSnapshot's docstring).
 *
 * Deliberately one-way (live site -> local copy) — see the plan this
 * shipped from. Local edits are never pushed back automatically.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireMfaVerified } from "./auth/middleware";
import { importOfflineSnapshot, type OfflineExportSnapshot } from "./offline-import.server";

function assertIsAdmin(context: { user: { roles: string[] } }) {
  if (!context.user.roles.includes("admin")) throw new Error("FORBIDDEN");
}

// Overridable only for local testing against a non-default deploy — the
// offline app has no UI to point this elsewhere, on purpose (no arbitrary
// user-supplied sync target).
const LIVE_SITE_URL = process.env.OFFLINE_SYNC_SOURCE || "https://favapark.liara.run";

export const refreshFromLiveSite = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .handler(async ({ context }) => {
    assertIsAdmin(context);
    const res = await fetch(`${LIVE_SITE_URL}/api/public/export`);
    if (!res.ok) {
      throw new Error(`LIVE_SITE_UNREACHABLE (${res.status})`);
    }
    const snapshot = (await res.json()) as OfflineExportSnapshot;
    const results = await importOfflineSnapshot(snapshot);
    return { ok: true, exportedAt: snapshot.exportedAt ?? null, results };
  });
