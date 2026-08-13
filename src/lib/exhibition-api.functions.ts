import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "../../db/connection";
import { requireAuth, requireMfaVerified } from "./auth/middleware";
import { parseLatLngValue } from "@/lib/geo";
import type { ExhibitionCompany, ExhibitionImage, ExhibitionProduct } from "@/lib/exhibition-api";

const nullableText = z.string().trim().max(4000).nullable().optional();
const nullableUrlText = z.string().trim().max(1000).nullable().optional();

const companyPatchSchema = z.object({
  company_id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(255).optional(),
  tagline: nullableText,
  category: z.string().trim().max(120).nullable().optional(),
  park_id: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  description: nullableText,
  logo_url: nullableUrlText,
  website: nullableUrlText,
  phone: z.string().trim().max(80).nullable().optional(),
  email: z.string().trim().max(255).nullable().optional(),
  address: nullableText,
  sort_order: z.number().int().nullable().optional(),
  is_active: z.boolean().optional(),
  catalog_url: nullableUrlText,
  video_url: nullableUrlText,
  founded_at: z.string().trim().max(80).nullable().optional(),
  intro: nullableText,
  founders: nullableText,
  export_potential: nullableText,
  headcount: z.number().int().min(0).nullable().optional(),
  headcount_full_time: z.number().int().min(0).nullable().optional(),
  headcount_part_time: z.number().int().min(0).nullable().optional(),
  knowledge_products_intro: nullableText,
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

// Shared by every mutation below: admins can edit any company, owners only
// their own.
async function assertCanEditCompany(
  sql: ReturnType<typeof getDb>,
  context: AuthedContext,
  company_id: string,
) {
  if (isAdmin(context)) return;
  const [company] = await sql<{ owner_user_id: string | null }[]>`
    SELECT owner_user_id FROM exhibition_companies WHERE company_id = ${company_id}
  `;
  if (company?.owner_user_id === context.user.id) return;
  throw new Error("FORBIDDEN");
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
      company_id: _ignored,
      ...safe
    } = data.patch as any;
    const patch: Record<string, unknown> = { ...(safe as Record<string, unknown>) };
    normalizeLatLng(patch);

    const cols = Object.keys(patch);
    if (cols.length === 0) return { ok: true };

    const sql = getDb();
    // Ownership is enforced via the WHERE clause itself (matches the
    // pre-migration RLS behavior): a non-owner's update simply matches zero
    // rows instead of throwing.
    await sql`
      UPDATE exhibition_companies SET ${sql(patch as any, ...cols)}
      WHERE company_id = ${data.company_id} AND owner_user_id = ${context.user.id}
    `;
    return { ok: true };
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
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const sql = getDb();
    await assertCanEditCompany(sql, context, data.company_id);
    await sql`
      INSERT INTO exhibition_images (company_id, image_url, caption, sort_order)
      VALUES (${data.company_id}, ${data.image_url}, ${data.caption ?? null}, 0)
    `;
    return { ok: true };
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
    await assertCanEditCompany(sql, context, img.company_id);
    await sql`DELETE FROM exhibition_images WHERE id = ${data.id}`;
    return { ok: true };
  });

const productWriteSchema = z.object({
  id: z.string().uuid().optional(),
  company_id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(255),
  description: nullableText,
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
    await assertCanEditCompany(sql, context, data.company_id);
    const { id, ...rest } = data;
    const cols = Object.keys(rest);
    if (id) {
      await sql`UPDATE exhibition_products SET ${sql(rest as any, ...cols)} WHERE id = ${id}`;
    } else {
      await sql`INSERT INTO exhibition_products ${sql(rest as any, ...cols)}`;
    }
    return { ok: true };
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
    await assertCanEditCompany(sql, context, prod.company_id);
    await sql`DELETE FROM exhibition_products WHERE id = ${data.id}`;
    return { ok: true };
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
    await sql`
      UPDATE exhibition_companies SET
        status = 'rejected',
        reviewed_at = now(), reviewed_by = ${context.user.id}, rejection_note = ${data.note}
      WHERE company_id = ${data.company_id}
    `;
    return { ok: true };
  });

export const updateExhibitionImage = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ id: z.string().uuid(), caption: nullableText }).parse(i))
  .handler(async ({ data, context }) => {
    const sql = getDb();
    const [img] = await sql<
      { company_id: string }[]
    >`SELECT company_id FROM exhibition_images WHERE id = ${data.id}`;
    if (!img) throw new Error("NOT_FOUND");
    await assertCanEditCompany(sql, context, img.company_id);
    await sql`UPDATE exhibition_images SET caption = ${data.caption ?? null} WHERE id = ${data.id}`;
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
  const sql = getDb();
  return await sql<ExhibitionCompany[]>`
    SELECT * FROM exhibition_companies
    WHERE status = 'approved' AND is_active = true
    ORDER BY sort_order ASC
  `;
});

export const getPublicExhibitionProducts = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ companyIds: z.array(z.string()) }).parse(i))
  .handler(async ({ data }) => {
    if (!data.companyIds.length) return [] as ExhibitionProduct[];
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
