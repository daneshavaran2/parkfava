import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "../../db/connection";
import { requireMfaVerified } from "./auth/middleware";
import type { AttachmentKind, CompanyAttachment } from "@/lib/attachments-api";

function assertIsAdmin(context: { user: { roles: string[] } }) {
  if (!context.user.roles.includes("admin")) throw new Error("FORBIDDEN");
}

const ownerTypeSchema = z.enum(["exhibition", "park"]);
const kindSchema = z.enum(["logo", "gallery_image", "catalog", "form_fa", "form_en", "document", "other"]);

/** Public-facing: only rows marked active — mirrors the old "attachments public read" RLS policy. */
export const getAttachments = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ ownerType: ownerTypeSchema, ownerId: z.string().min(1) }).parse(i))
  .handler(async ({ data }) => {
    const sql = getDb();
    return await sql<CompanyAttachment[]>`
      SELECT * FROM company_attachments
      WHERE owner_type = ${data.ownerType} AND owner_id = ${data.ownerId} AND is_active = true
      ORDER BY kind ASC, sort_order ASC
    `;
  });

/** Admin-facing: every row for one owner, active or not. */
export const getAttachmentsAdmin = createServerFn({ method: "GET" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ ownerType: ownerTypeSchema, ownerId: z.string().min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const sql = getDb();
    return await sql<CompanyAttachment[]>`
      SELECT * FROM company_attachments
      WHERE owner_type = ${data.ownerType} AND owner_id = ${data.ownerId}
      ORDER BY kind ASC, sort_order ASC
    `;
  });

export const getAllAttachmentsAdmin = createServerFn({ method: "GET" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({
    ownerType: ownerTypeSchema.optional(),
    kind: kindSchema.optional(),
    isActive: z.boolean().optional(),
    search: z.string().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const sql = getDb();
    return await sql<CompanyAttachment[]>`
      SELECT * FROM company_attachments
      WHERE (${data.ownerType ?? null}::text IS NULL OR owner_type = ${data.ownerType ?? null})
        AND (${data.kind ?? null}::text IS NULL OR kind = ${data.kind ?? null})
        AND (${data.isActive ?? null}::boolean IS NULL OR is_active = ${data.isActive ?? null})
        AND (${data.search ?? null}::text IS NULL OR title ILIKE ${data.search ? `%${data.search}%` : null})
      ORDER BY created_at DESC
    `;
  });

export const updateAttachmentAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({
    id: z.string().uuid(),
    title: z.string().trim().max(255).nullable().optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    kind: kindSchema.optional(),
    sort_order: z.number().int().optional(),
    is_active: z.boolean().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const { id, ...patch } = data;
    const cols = Object.keys(patch);
    if (cols.length === 0) return { ok: true };
    const sql = getDb();
    await sql`UPDATE company_attachments SET ${sql(patch as any, ...cols)} WHERE id = ${id}`;
    return { ok: true };
  });

export const deleteAttachmentAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const sql = getDb();
    const [att] = await sql<{ file_url: string }[]>`SELECT file_url FROM company_attachments WHERE id = ${data.id}`;
    if (att?.file_url && !att.file_url.startsWith("http")) {
      const { deleteLocalFile } = await import("./storage/local-storage.server");
      await deleteLocalFile(att.file_url);
    }
    await sql`DELETE FROM company_attachments WHERE id = ${data.id}`;
    return { ok: true };
  });

export const reorderAttachmentsAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ ids: z.array(z.string().uuid()) }).parse(i))
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const sql = getDb();
    await sql.begin((tx) =>
      data.ids.map((id, i) => tx`UPDATE company_attachments SET sort_order = ${i} WHERE id = ${id}`),
    );
    return { ok: true };
  });

export const uploadAttachmentFn = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((raw) => {
    if (!(raw instanceof FormData)) throw new Error("INVALID_UPLOAD");
    const file = raw.get("file");
    const ownerType = raw.get("ownerType");
    const ownerId = raw.get("ownerId");
    const kind = raw.get("kind");
    const title = raw.get("title");
    const description = raw.get("description");
    if (!(file instanceof File) || typeof ownerType !== "string" || typeof ownerId !== "string" || typeof kind !== "string") {
      throw new Error("INVALID_UPLOAD");
    }
    return {
      file,
      ownerType: ownerTypeSchema.parse(ownerType),
      ownerId,
      kind: kindSchema.parse(kind),
      title: typeof title === "string" ? title : null,
      description: typeof description === "string" ? description : null,
    };
  })
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const { file, ownerType, ownerId, kind, title, description } = data;
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `attachments/${ownerType}/${ownerId}/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
    const { saveLocalFile } = await import("./storage/local-storage.server");
    await saveLocalFile(path, Buffer.from(await file.arrayBuffer()));

    const sql = getDb();
    const [row] = await sql<CompanyAttachment[]>`
      INSERT INTO company_attachments (owner_type, owner_id, kind, file_url, title, description, mime_type, size_bytes, sort_order, is_active)
      VALUES (${ownerType}, ${ownerId}, ${kind}, ${path}, ${title ?? file.name}, ${description}, ${file.type || null}, ${file.size}, 0, true)
      RETURNING *
    `;
    return row;
  });
