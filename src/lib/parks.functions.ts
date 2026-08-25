import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb, hasDb } from "../../db/connection";
import { requireMfaVerified } from "./auth/middleware";
import type { Park } from "@/lib/parks-api";

function assertIsAdmin(context: { user: { roles: string[] } }) {
  if (!context.user.roles.includes("admin")) throw new Error("FORBIDDEN");
}

const parkSchema = z.object({
  park_id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(255),
  name_en: z.string().trim().max(255).nullable().optional(),
  province: z.string().trim().max(120).nullable().optional(),
  province_en: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  city_en: z.string().trim().max(120).nullable().optional(),
  // Postgres `numeric` columns (mx, my) come back from the `postgres` client
  // as strings, not numbers — z.number() rejected them outright, so any save
  // that carries mx/my through unchanged (e.g. ParkStatsEditor, which only
  // edits jobs/area/province/city and spreads the rest of the row as-is)
  // failed validation on every single request. z.coerce.number() accepts
  // either shape; applied to all four numeric fields defensively, not just
  // the two that are actually string-typed today.
  mx: z.coerce.number(),
  my: z.coerce.number(),
  color: z.string().trim().max(40),
  jobs: z.coerce.number().int(),
  area: z.coerce.number(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

// Live count, not a stored column: a park's resident-company number must
// never drift from exhibition_companies again the way the old companies_hint
// column did (it was seeded once and never updated).
export const getParks = createServerFn({ method: "GET" }).handler(async () => {
  if (!hasDb()) return [] as Park[];
  const sql = getDb();
  return await sql<Park[]>`
    SELECT p.*,
      (SELECT COUNT(*)::int FROM exhibition_companies ec
         WHERE ec.park_id = p.park_id AND ec.status = 'approved' AND ec.is_active = true
      ) AS companies_count
    FROM parks p ORDER BY p.sort_order ASC
  `;
});

export const getActiveParks = createServerFn({ method: "GET" }).handler(async () => {
  if (!hasDb()) return [] as Park[];
  const sql = getDb();
  return await sql<Park[]>`
    SELECT p.*,
      (SELECT COUNT(*)::int FROM exhibition_companies ec
         WHERE ec.park_id = p.park_id AND ec.status = 'approved' AND ec.is_active = true
      ) AS companies_count
    FROM parks p WHERE p.is_active = true ORDER BY p.sort_order ASC
  `;
});

export const upsertParkAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => parkSchema.parse(i))
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const sql = getDb();
    const cols = Object.keys(data);
    const updateCols = cols.filter((c) => c !== "park_id");
    await sql`
      INSERT INTO parks ${sql(data as any, ...cols)}
      ON CONFLICT (park_id) DO UPDATE SET ${sql(data as any, ...updateCols)}
    `;
    return { ok: true };
  });

export const deleteParkAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ park_id: z.string().trim().min(1).max(120) }).parse(i))
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const sql = getDb();
    // Same polymorphic-attachment problem as a company delete: nothing
    // cascades to company_attachments, and park_images leaves its files.
    const { purgeParkAssets } = await import("./storage/owner-assets.server");
    await purgeParkAssets(sql, data.park_id);
    await sql`DELETE FROM parks WHERE park_id = ${data.park_id}`;
    return { ok: true };
  });

export const reorderParksAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ ids: z.array(z.string().trim().min(1).max(120)) }).parse(i))
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const sql = getDb();
    await sql.begin((tx) =>
      data.ids.map((id, i) => tx`UPDATE parks SET sort_order = ${i + 1} WHERE park_id = ${id}`),
    );
    return { ok: true };
  });
