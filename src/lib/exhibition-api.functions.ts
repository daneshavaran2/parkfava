import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb, hasDb } from "../../db/connection";
import { requireAuth, requireMfaVerified } from "./auth/middleware";
import { parseLatLngValue } from "@/lib/geo";
import type { ExhibitionCompany, ExhibitionImage, ExhibitionProduct, ExhibitionChangeRequest } from "@/lib/exhibition-api";

const nullableText = z.string().trim().max(4000).nullable().optional();
const nullableUrlText = z.string().trim().max(1000).nullable().optional();

const companyPatchSchema = z.object({
  company_id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(255).optional(),
  name_en: z.string().trim().max(255).nullable().optional(),
  tagline: nullableText,
  tagline_en: nullableText,
  category: z.string().trim().max(120).nullable().optional(),
  park_id: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  city_en: z.string().trim().max(120).nullable().optional(),
  description: nullableText,
  description_en: nullableText,
  logo_url: nullableUrlText,
  website: nullableUrlText,
  phone: z.string().trim().max(80).nullable().optional(),
  email: z.string().trim().max(255).nullable().optional(),
  address: nullableText,
  address_en: nullableText,
  sort_order: z.number().int().nullable().optional(),
  is_active: z.boolean().optional(),
  catalog_url: nullableUrlText,
  video_url: nullableUrlText,
  founded_at: z.string().trim().max(80).nullable().optional(),
  intro: nullableText,
  intro_en: nullableText,
  founders: nullableText,
  founders_en: nullableText,
  export_potential: nullableText,
  export_potential_en: nullableText,
  headcount: z.number().int().min(0).nullable().optional(),
  headcount_full_time: z.number().int().min(0).nullable().optional(),
  headcount_part_time: z.number().int().min(0).nullable().optional(),
  knowledge_products_intro: nullableText,
  knowledge_products_intro_en: nullableText,
  linkedin_url: nullableUrlText,
  owner_user_id: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "pending", "approved", "rejected"]).nullable().optional(),
  submitted_at: z.string().nullable().optional(),
  reviewed_at: z.string().nullable().optional(),
  reviewed_by: z.string().uuid().nullable().optional(),
  rejection_note: nullableText,
  latitude: z.union([z.string(), z.number(), z.null()]).optional(),
  longitude: z.union([z.string(), z.number(), z.null()]).optional(),
  map_zoom: z.number().int().min(1).max(22).nullable().optional(),
});

type AuthedContext = { user: { id: string; roles: string[] } };

function isAdmin(context: AuthedContext) {
  return context.user.roles.includes("admin");
}

function assertIsAdmin(context: AuthedContext) {
  if (!isAdmin(context)) throw new Error("FORBIDDEN");
}

type EditMode = "admin" | "direct" | "propose";

// Shared by every mutation below: admins can always write directly. An
// owner editing their own company writes directly too, UNLESS the company
// has already been approved once — at that point it's live on the public
// exhibition, so further owner edits are staged in
// exhibition_change_requests instead of touching the live row (see
// db/migrations/0019_exhibition_change_requests.sql) until an admin
// re-approves them. A company that's never been approved yet isn't public,
// so there's nothing to protect and edits stay direct.
async function resolveEditMode(
  sql: ReturnType<typeof getDb>,
  context: AuthedContext,
  company_id: string,
): Promise<EditMode> {
  if (isAdmin(context)) return "admin";
  const [company] = await sql<{ owner_user_id: string | null; status: string }[]>`
    SELECT owner_user_id, status FROM exhibition_companies WHERE company_id = ${company_id}
  `;
  if (!company || company.owner_user_id !== context.user.id) throw new Error("FORBIDDEN");
  return company.status === "approved" ? "propose" : "direct";
}

// Thin wrapper for call sites that only need the permission check, not the
// direct-vs-propose decision (reorder/caption editing have no owner-facing
// UI today).
async function assertCanEditCompany(
  sql: ReturnType<typeof getDb>,
  context: AuthedContext,
  company_id: string,
) {
  await resolveEditMode(sql, context, company_id);
}

function normalizeLatLng(patch: Record<string, unknown>) {
  const lat = parseLatLngValue(patch["latitude"], "lat");
  const lng = parseLatLngValue(patch["longitude"], "lng");
  if (!lat.ok || !lng.ok) throw new Error("INVALID_COORDINATES");
  patch["latitude"] = lat.value;
  patch["longitude"] = lng.value;
}

export const saveAdminCompany = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((input) => companyPatchSchema.parse(input))
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const patch: Record<string, unknown> = { ...(data as Record<string, unknown>) };
    normalizeLatLng(patch);

    const sql = getDb();
    const cols = Object.keys(patch);
    const updateCols = cols.filter((c) => c !== "company_id");
    await sql`
      INSERT INTO exhibition_companies ${sql(patch as any, ...cols)}
      ON CONFLICT (company_id) DO UPDATE SET ${sql(patch as any, ...updateCols)}
    `;
    return { ok: true };
  });

export const listAdminCompanies = createServerFn({ method: "GET" })
  .middleware([requireMfaVerified])
  .handler(async ({ context }) => {
    assertIsAdmin(context);
    const sql = getDb();
    return await sql<ExhibitionCompany[]>`
      SELECT * FROM exhibition_companies
      ORDER BY sort_order ASC NULLS LAST, name ASC
    `;
  });

export const saveOwnedCompany = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((input) =>
    z
      .object({
        company_id: z.string().trim().min(1).max(120),
        patch: companyPatchSchema.partial(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const {
      status,
      is_active,
      owner_user_id,
      reviewed_at,
      reviewed_by,
      // rejection_note/submitted_at are also owner-admin fields: harmless to
      // strip under direct writes, but under the propose path below a stale
      // echoed value could overwrite something an admin set in the meantime.
      rejection_note,
      submitted_at,
      company_id: _ignored,
      ...safe
    } = data.patch as any;
    const patch: Record<string, unknown> = { ...(safe as Record<string, unknown>) };
    normalizeLatLng(patch);

    const cols = Object.keys(patch);
    if (cols.length === 0) return { ok: true };

    const sql = getDb();
    const [company] = await sql<{ status: string }[]>`
      SELECT status FROM exhibition_companies
      WHERE company_id = ${data.company_id} AND owner_user_id = ${context.user.id}
    `;
    if (!company) return { ok: true }; // not this user's company — silent no-op, same as before

    if (company.status !== "approved") {
      await sql`
        UPDATE exhibition_companies SET ${sql(patch as any, ...cols)}
        WHERE company_id = ${data.company_id} AND owner_user_id = ${context.user.id}
      `;
      return { ok: true };
    }

    // Approved company: changes need review. Diff against the current live
    // row (not the client's possibly-stale cache) so the change request only
    // carries fields the owner actually changed.
    const [live] = await sql<Record<string, unknown>[]>`
      SELECT * FROM exhibition_companies WHERE company_id = ${data.company_id}
    `;
    const diffed: Record<string, unknown> = {};
    for (const k of cols) {
      if (JSON.stringify(patch[k] ?? null) !== JSON.stringify((live as any)?.[k] ?? null)) diffed[k] = patch[k];
    }
    if (Object.keys(diffed).length === 0) return { ok: true };

    const [row] = await sql`
      INSERT INTO exhibition_change_requests (company_id, entity_type, entity_id, action, payload, created_by)
      VALUES (${data.company_id}, 'company', NULL, 'update', ${sql.json(diffed as any)}, ${context.user.id})
      ON CONFLICT (company_id) WHERE status = 'pending' AND entity_type = 'company'
      DO UPDATE SET payload = EXCLUDED.payload, submitted_at = now(), updated_at = now(), created_by = EXCLUDED.created_by
      RETURNING id
    `;
    return { ok: true, pending: true, changeRequestId: row.id };
  });

export const submitCompanyForReview = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ company_id: z.string().trim().min(1).max(120) }).parse(i))
  .handler(async ({ data, context }) => {
    const sql = getDb();
    await assertCanEditCompany(sql, context, data.company_id);
    await sql`
      UPDATE exhibition_companies SET status = 'pending', submitted_at = now()
      WHERE company_id = ${data.company_id}
    `;
    return { ok: true };
  });

export const addExhibitionImage = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) =>
    z
      .object({
        company_id: z.string().trim().min(1).max(120),
        image_url: z.string().trim().min(1).max(1000),
        caption: nullableText,
        caption_en: nullableText,
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const sql = getDb();
    const mode = await resolveEditMode(sql, context, data.company_id);
    const payload = {
      image_url: data.image_url,
      caption: data.caption ?? null,
      caption_en: data.caption_en ?? null,
      sort_order: 0,
    };

    if (mode !== "propose") {
      await sql`
        INSERT INTO exhibition_images (company_id, image_url, caption, caption_en, sort_order)
        VALUES (${data.company_id}, ${payload.image_url}, ${payload.caption}, ${payload.caption_en}, 0)
      `;
      return { ok: true };
    }

    const [row] = await sql`
      INSERT INTO exhibition_change_requests (company_id, entity_type, entity_id, action, payload, created_by)
      VALUES (${data.company_id}, 'image', NULL, 'create', ${sql.json(payload)}, ${context.user.id})
      RETURNING id
    `;
    return { ok: true, pending: true, changeRequestId: row.id };
  });

export const deleteExhibitionImage = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const sql = getDb();
    const [img] = await sql<
      { company_id: string }[]
    >`SELECT company_id FROM exhibition_images WHERE id = ${data.id}`;
    if (!img) throw new Error("NOT_FOUND");
    const mode = await resolveEditMode(sql, context, img.company_id);

    if (mode !== "propose") {
      await sql`DELETE FROM exhibition_images WHERE id = ${data.id}`;
      return { ok: true };
    }

    const [row] = await sql`
      INSERT INTO exhibition_change_requests (company_id, entity_type, entity_id, action, payload, created_by)
      VALUES (${img.company_id}, 'image', ${data.id}, 'delete', '{}'::jsonb, ${context.user.id})
      ON CONFLICT (entity_type, entity_id) WHERE status = 'pending' AND entity_id IS NOT NULL
      DO UPDATE SET action = 'delete', payload = '{}'::jsonb, submitted_at = now(), updated_at = now(), created_by = EXCLUDED.created_by
      RETURNING id
    `;
    return { ok: true, pending: true, changeRequestId: row.id };
  });

const productWriteSchema = z.object({
  id: z.string().uuid().optional(),
  // id of an existing, still-pending 'create' change request — set when the
  // owner keeps editing a not-yet-approved new product draft, so the save
  // updates that same pending row instead of creating another proposal.
  change_request_id: z.string().uuid().optional(),
  company_id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(255),
  name_en: z.string().trim().max(255).nullable().optional(),
  description: nullableText,
  description_en: nullableText,
  image_url: nullableUrlText,
  video_url: nullableUrlText,
  catalog_url: nullableUrlText,
  link_url: nullableUrlText,
  sort_order: z.number().int().nullable().optional(),
});

export const upsertExhibitionProduct = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => productWriteSchema.parse(i))
  .handler(async ({ data, context }) => {
    const sql = getDb();
    const { id, change_request_id, company_id, ...payload } = data;

    // company_id is client-supplied and only safe to trust outright for a
    // brand-new product (no id yet). For an edit, an existing product's
    // real owning company is the only thing that may ever be touched —
    // verify id actually belongs to the claimed company_id before doing
    // anything else, the same way deleteExhibitionProduct/
    // updateExhibitionImage derive company_id from the row instead of the
    // request. Without this, a caller who legitimately owns company A
    // could pass an id belonging to company B's product and mutate it.
    if (id) {
      const [existing] = await sql<{ company_id: string }[]>`
        SELECT company_id FROM exhibition_products WHERE id = ${id}
      `;
      if (!existing) throw new Error("NOT_FOUND");
      if (existing.company_id !== company_id) throw new Error("FORBIDDEN");
    }

    const mode = await resolveEditMode(sql, context, company_id);

    if (mode !== "propose") {
      const cols = Object.keys(payload);
      if (id) {
        // company_id filter here is defense in depth — the check above
        // already guarantees the match, but a WHERE clause that can never
        // silently touch another company's row is worth keeping even if
        // the guard above is ever weakened by a future edit.
        await sql`UPDATE exhibition_products SET ${sql(payload as any, ...cols)} WHERE id = ${id} AND company_id = ${company_id}`;
      } else {
        await sql`INSERT INTO exhibition_products ${sql({ ...payload, company_id } as any, "company_id", ...cols)}`;
      }
      return { ok: true };
    }

    // Continuing to edit an already-proposed (still pending) new product.
    if (change_request_id) {
      const [updated] = await sql`
        UPDATE exhibition_change_requests
        SET payload = ${sql.json(payload)}, submitted_at = now(), updated_at = now()
        WHERE id = ${change_request_id} AND company_id = ${company_id}
          AND entity_type = 'product' AND action = 'create' AND status = 'pending'
        RETURNING id
      `;
      if (!updated) throw new Error("NOT_FOUND");
      return { ok: true, pending: true, changeRequestId: change_request_id };
    }

    // Editing an existing live product — diff against it.
    if (id) {
      const [live] = await sql<Record<string, unknown>[]>`SELECT * FROM exhibition_products WHERE id = ${id}`;
      if (!live) throw new Error("NOT_FOUND");
      const diffed: Record<string, unknown> = {};
      for (const k of Object.keys(payload)) {
        if (JSON.stringify((payload as any)[k] ?? null) !== JSON.stringify((live as any)[k] ?? null)) {
          diffed[k] = (payload as any)[k];
        }
      }
      if (Object.keys(diffed).length === 0) return { ok: true };
      const [row] = await sql`
        INSERT INTO exhibition_change_requests (company_id, entity_type, entity_id, action, payload, created_by)
        VALUES (${company_id}, 'product', ${id}, 'update', ${sql.json(diffed as any)}, ${context.user.id})
        ON CONFLICT (entity_type, entity_id) WHERE status = 'pending' AND entity_id IS NOT NULL
        DO UPDATE SET action = 'update', payload = EXCLUDED.payload, submitted_at = now(), updated_at = now(), created_by = EXCLUDED.created_by
        RETURNING id
      `;
      return { ok: true, pending: true, changeRequestId: row.id };
    }

    // Brand-new product proposal.
    const [row] = await sql`
      INSERT INTO exhibition_change_requests (company_id, entity_type, entity_id, action, payload, created_by)
      VALUES (${company_id}, 'product', NULL, 'create', ${sql.json(payload)}, ${context.user.id})
      RETURNING id
    `;
    return { ok: true, pending: true, changeRequestId: row.id };
  });

export const deleteExhibitionProduct = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const sql = getDb();
    const [prod] = await sql<
      { company_id: string }[]
    >`SELECT company_id FROM exhibition_products WHERE id = ${data.id}`;
    if (!prod) throw new Error("NOT_FOUND");
    const mode = await resolveEditMode(sql, context, prod.company_id);

    if (mode !== "propose") {
      await sql`DELETE FROM exhibition_products WHERE id = ${data.id}`;
      return { ok: true };
    }

    const [row] = await sql`
      INSERT INTO exhibition_change_requests (company_id, entity_type, entity_id, action, payload, created_by)
      VALUES (${prod.company_id}, 'product', ${data.id}, 'delete', '{}'::jsonb, ${context.user.id})
      ON CONFLICT (entity_type, entity_id) WHERE status = 'pending' AND entity_id IS NOT NULL
      DO UPDATE SET action = 'delete', payload = '{}'::jsonb, submitted_at = now(), updated_at = now(), created_by = EXCLUDED.created_by
      RETURNING id
    `;
    return { ok: true, pending: true, changeRequestId: row.id };
  });

export const deleteExhibitionCompanyAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ company_id: z.string().trim().min(1).max(120) }).parse(i))
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const sql = getDb();
    // Attachments have no foreign key to cascade through, and cascaded rows
    // leave their files behind either way, so both are cleared first — while
    // the rows naming them still exist.
    const { purgeCompanyAssets } = await import("./storage/owner-assets.server");
    await purgeCompanyAssets(sql, data.company_id);
    await sql`DELETE FROM exhibition_companies WHERE company_id = ${data.company_id}`;
    return { ok: true };
  });

export const reorderExhibitionCompaniesAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ ids: z.array(z.string().trim().min(1).max(120)) }).parse(i))
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const sql = getDb();
    await sql.begin((tx) =>
      data.ids.map(
        (id, i) => tx`UPDATE exhibition_companies SET sort_order = ${i} WHERE company_id = ${id}`,
      ),
    );
    return { ok: true };
  });

export const approveCompanyAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ company_id: z.string().trim().min(1).max(120) }).parse(i))
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const sql = getDb();
    await sql`
      UPDATE exhibition_companies SET
        status = 'approved', is_active = true,
        reviewed_at = now(), reviewed_by = ${context.user.id}, rejection_note = null
      WHERE company_id = ${data.company_id}
    `;
    return { ok: true };
  });

export const rejectCompanyAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) =>
    z
      .object({ company_id: z.string().trim().min(1).max(120), note: z.string().trim().max(2000) })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const sql = getDb();
    await sql.begin(async (tx) => {
      await tx`
        UPDATE exhibition_companies SET
          status = 'rejected',
          reviewed_at = now(), reviewed_by = ${context.user.id}, rejection_note = ${data.note}
        WHERE company_id = ${data.company_id}
      `;
      // The company is coming off the public exhibition, so any edits still
      // awaiting review are moot — re-review starts fresh once it's
      // re-approved.
      await tx`
        UPDATE exhibition_change_requests SET
          status = 'rejected', reviewed_at = now(), reviewed_by = ${context.user.id},
          rejection_note = 'Auto-rejected: the company was unpublished.'
        WHERE company_id = ${data.company_id} AND status = 'pending'
      `;
    });
    return { ok: true };
  });

export const approveChangeRequestAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const sql = getDb();
    const [cr] = await sql<
      {
        id: string;
        company_id: string;
        entity_type: "company" | "product" | "image";
        entity_id: string | null;
        action: "update" | "create" | "delete";
        payload: Record<string, unknown>;
        status: string;
      }[]
    >`SELECT * FROM exhibition_change_requests WHERE id = ${data.id}`;
    if (!cr) throw new Error("NOT_FOUND");
    if (cr.status !== "pending") throw new Error("NOT_PENDING");

    let notFoundTarget = false;

    await sql.begin(async (tx) => {
      const payload = cr.payload as Record<string, unknown>;
      const cols = Object.keys(payload);

      if (cr.entity_type === "company") {
        if (cols.length) {
          await tx`UPDATE exhibition_companies SET ${tx(payload as any, ...cols)} WHERE company_id = ${cr.company_id}`;
        }
      } else if (cr.entity_type === "product") {
        if (cr.action === "create") {
          await tx`INSERT INTO exhibition_products ${tx({ ...payload, company_id: cr.company_id } as any, "company_id", ...cols)}`;
        } else if (cr.action === "update") {
          if (cols.length) {
            // company_id filter: entity_id alone isn't enough to trust —
            // the request that created this change_requests row is what's
            // fixed by the upsertExhibitionProduct-side check now, but this
            // is the layer that would still catch a mismatched/stale row
            // some other way (e.g. one filed before that fix existed).
            const [updated] = await tx`UPDATE exhibition_products SET ${tx(payload as any, ...cols)} WHERE id = ${cr.entity_id} AND company_id = ${cr.company_id} RETURNING id`;
            if (!updated) notFoundTarget = true;
          }
        } else {
          const [deleted] = await tx`DELETE FROM exhibition_products WHERE id = ${cr.entity_id} AND company_id = ${cr.company_id} RETURNING id`;
          if (!deleted) notFoundTarget = true;
        }
      } else {
        if (cr.action === "create") {
          await tx`INSERT INTO exhibition_images ${tx({ ...payload, company_id: cr.company_id } as any, "company_id", ...cols)}`;
        } else {
          const [deleted] = await tx`DELETE FROM exhibition_images WHERE id = ${cr.entity_id} AND company_id = ${cr.company_id} RETURNING id`;
          if (!deleted) notFoundTarget = true;
        }
      }

      // Defensive: the target row was deleted directly by an admin while
      // this request sat pending. Don't mark it "approved" when nothing was
      // actually applied — auto-reject with an explanatory note instead.
      const [updatedCr] = notFoundTarget
        ? await tx`
            UPDATE exhibition_change_requests
            SET status = 'rejected', reviewed_at = now(), reviewed_by = ${context.user.id},
                rejection_note = 'Auto-rejected: the product/image this change referred to no longer exists.'
            WHERE id = ${data.id} AND status = 'pending'
            RETURNING id
          `
        : await tx`
            UPDATE exhibition_change_requests SET status = 'approved', reviewed_at = now(), reviewed_by = ${context.user.id}
            WHERE id = ${data.id} AND status = 'pending'
            RETURNING id
          `;
      if (!updatedCr) throw new Error("ALREADY_REVIEWED");
    });

    return { ok: true, autoRejected: notFoundTarget };
  });

export const rejectChangeRequestAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ id: z.string().uuid(), note: z.string().trim().max(2000) }).parse(i))
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const sql = getDb();
    const [updated] = await sql`
      UPDATE exhibition_change_requests SET status = 'rejected', reviewed_at = now(), reviewed_by = ${context.user.id}, rejection_note = ${data.note}
      WHERE id = ${data.id} AND status = 'pending'
      RETURNING id
    `;
    if (!updated) throw new Error("NOT_FOUND_OR_ALREADY_REVIEWED");
    return { ok: true };
  });

export const updateExhibitionImage = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid(), caption: nullableText, caption_en: nullableText }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const sql = getDb();
    const [img] = await sql<
      { company_id: string }[]
    >`SELECT company_id FROM exhibition_images WHERE id = ${data.id}`;
    if (!img) throw new Error("NOT_FOUND");
    await assertCanEditCompany(sql, context, img.company_id);
    const patch = { caption: data.caption, caption_en: data.caption_en };
    const cols = Object.keys(patch).filter((key) => patch[key as keyof typeof patch] !== undefined);
    if (cols.length) await sql`UPDATE exhibition_images SET ${sql(patch as any, ...cols)} WHERE id = ${data.id}`;
    return { ok: true };
  });

export const reorderExhibitionImages = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    const sql = getDb();
    const rows = await sql<{ id: string; company_id: string }[]>`
      SELECT id, company_id FROM exhibition_images WHERE id = ANY(${data.ids})
    `;
    if (rows.length !== data.ids.length) throw new Error("NOT_FOUND");
    const companyIds = new Set(rows.map((r) => r.company_id));
    if (companyIds.size !== 1) throw new Error("FORBIDDEN");
    await assertCanEditCompany(sql, context, rows[0].company_id);
    await sql.begin((tx) =>
      data.ids.map((id, i) => tx`UPDATE exhibition_images SET sort_order = ${i} WHERE id = ${id}`),
    );
    return { ok: true };
  });

export const reorderExhibitionProducts = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    const sql = getDb();
    const rows = await sql<{ id: string; company_id: string }[]>`
      SELECT id, company_id FROM exhibition_products WHERE id = ANY(${data.ids})
    `;
    if (rows.length !== data.ids.length) throw new Error("NOT_FOUND");
    const companyIds = new Set(rows.map((r) => r.company_id));
    if (companyIds.size !== 1) throw new Error("FORBIDDEN");
    await assertCanEditCompany(sql, context, rows[0].company_id);
    await sql.begin((tx) =>
      data.ids.map(
        (id, i) => tx`UPDATE exhibition_products SET sort_order = ${i} WHERE id = ${id}`,
      ),
    );
    return { ok: true };
  });

/* ============ PUBLIC READS ============ */

export const getExhibitionCompanies = createServerFn({ method: "GET" }).handler(async () => {
  // No database configured (e.g. local preview): fall back to the bundled
  // static dataset instead of crashing the page.
  if (!hasDb()) return [] as ExhibitionCompany[];
  const sql = getDb();
  // This backs card-only listing views (useMergedCompanies in views.tsx,
  // the assistant's chip lookup, the admin attachments company filter) —
  // none render intro/founders/export_potential/knowledge_products_intro or
  // any of the other long text columns, so SELECT * was pulling every
  // company's full bilingual essay text just to render a name and a logo.
  return await sql<ExhibitionCompany[]>`
    SELECT company_id, name, name_en, tagline, tagline_en, category, park_id,
           city, city_en, description, description_en, logo_url, website,
           phone, email, address, address_en, sort_order, is_active,
           headcount_full_time, headcount_part_time, founded_at
    FROM exhibition_companies
    WHERE status = 'approved' AND is_active = true
    ORDER BY sort_order ASC
  `;
});

export const getPublicExhibitionProducts = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ companyIds: z.array(z.string()) }).parse(i))
  .handler(async ({ data }) => {
    if (!data.companyIds.length || !hasDb()) return [] as ExhibitionProduct[];
    const sql = getDb();
    // Join against the parent company's publish state rather than trusting
    // the caller's companyIds — mirrors the old "exh_products public read"
    // RLS policy, which gated every product read on its company being
    // approved+active, regardless of how the caller arrived at the id list.
    return await sql<ExhibitionProduct[]>`
      SELECT p.* FROM exhibition_products p
      JOIN exhibition_companies c ON c.company_id = p.company_id
      WHERE p.company_id IN ${sql(data.companyIds)} AND c.status = 'approved' AND c.is_active = true
      ORDER BY p.sort_order ASC
    `;
  });

export const getExhibitionCompanyDetail = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ id: z.string().trim().min(1).max(120) }).parse(i))
  .handler(async ({ data }) => {
    if (!hasDb()) return { company: null, images: [] as ExhibitionImage[], products: [] as ExhibitionProduct[] };
    const sql = getDb();
    const [company] = await sql<
      ExhibitionCompany[]
    >`SELECT * FROM exhibition_companies WHERE company_id = ${data.id}`;
    if (!company) return { company: null, images: [], products: [] };

    // Mirrors the old RLS visibility union: public can see approved+active
    // companies, owners can see their own regardless of status, admins can
    // see any. Anything else (draft/pending/rejected, not yours) must be
    // indistinguishable from "doesn't exist" to an unauthorized caller —
    // draft company data (rejection notes, founders, contact info) is not
    // meant to be publicly readable by id.
    const isPublic = company.status === "approved" && company.is_active === true;
    let allowed = isPublic;
    if (!allowed) {
      const { getSessionUser } = await import("./auth/session.server");
      const user = await getSessionUser();
      allowed = !!user && (user.roles.includes("admin") || company.owner_user_id === user.id);
    }
    if (!allowed) return { company: null, images: [], products: [] };

    const [images, products] = await Promise.all([
      sql<
        ExhibitionImage[]
      >`SELECT * FROM exhibition_images WHERE company_id = ${data.id} ORDER BY sort_order ASC`,
      sql<
        ExhibitionProduct[]
      >`SELECT * FROM exhibition_products WHERE company_id = ${data.id} ORDER BY sort_order ASC`,
    ]);
    return { company, images, products };
  });

/* ============ OWNER: MY COMPANY ============ */

export const getMyCompany = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const sql = getDb();
    const [company] = await sql<ExhibitionCompany[]>`
      SELECT * FROM exhibition_companies
      WHERE owner_user_id = ${context.user.id}
      ORDER BY submitted_at DESC NULLS LAST
      LIMIT 1
    `;
    return company ?? null;
  });

// Owner withdraws or dismisses a proposal they made — a pending edit
// reverts to the live value, a pending/rejected new product/image draft is
// discarded, and a pending deletion is called off. Rejected requests are
// included (not just pending) so the owner has a way to clear a rejected
// draft from their view instead of it sitting there forever — nothing live
// is affected either way, since a rejected request never touched the live
// tables. Deliberately owner-only (no admin bypass): an admin reviews via
// approve/reject, not cancel.
export const cancelOwnPendingChange = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const sql = getDb();
    const [cr] = await sql<{ created_by: string; status: string }[]>`
      SELECT created_by, status FROM exhibition_change_requests WHERE id = ${data.id}
    `;
    if (!cr) throw new Error("NOT_FOUND");
    if (cr.created_by !== context.user.id) throw new Error("FORBIDDEN");
    if (cr.status !== "pending" && cr.status !== "rejected") throw new Error("NOT_CANCELABLE");
    await sql`DELETE FROM exhibition_change_requests WHERE id = ${data.id} AND status IN ('pending', 'rejected')`;
    return { ok: true };
  });

// Pending/rejected change requests for one company — approved rows are
// omitted since the live data already reflects them, nothing more to show.
// Kept separate from getExhibitionCompanyDetail (the public, high-traffic
// read for the exhibition page) so that path never pays for a session
// lookup or an extra query it doesn't need.
export const getCompanyChangeRequests = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((i) => z.object({ company_id: z.string().trim().min(1).max(120) }).parse(i))
  .handler(async ({ data, context }) => {
    const sql = getDb();
    if (!isAdmin(context)) {
      const [company] = await sql<{ owner_user_id: string | null }[]>`
        SELECT owner_user_id FROM exhibition_companies WHERE company_id = ${data.company_id}
      `;
      if (!company || company.owner_user_id !== context.user.id) throw new Error("FORBIDDEN");
    }
    return await sql<ExhibitionChangeRequest[]>`
      SELECT * FROM exhibition_change_requests
      WHERE company_id = ${data.company_id} AND status IN ('pending', 'rejected')
      ORDER BY submitted_at DESC
    `;
  });

/* ============ UPLOADS (local disk storage — see src/lib/storage) ============ */

export const uploadExhibitionAssetFn = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((raw) => {
    if (!(raw instanceof FormData)) throw new Error("INVALID_UPLOAD");
    const file = raw.get("file");
    const company_id = raw.get("company_id");
    if (!(file instanceof File) || typeof company_id !== "string" || !company_id) {
      throw new Error("INVALID_UPLOAD");
    }
    return { file, company_id };
  })
  .handler(async ({ data, context }) => {
    const sql = getDb();
    await assertCanEditCompany(sql, context, data.company_id);

    const { assertUploadAllowed } = await import("./storage/mime");
    const ext = assertUploadAllowed(data.file);
    const path = `exhibition/${data.company_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { saveLocalFile } = await import("./storage/local-storage.server");
    await saveLocalFile(path, Buffer.from(await data.file.arrayBuffer()));
    return { path };
  });
