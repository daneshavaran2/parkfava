import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "../../db/connection";
import { requireMfaVerified } from "./auth/middleware";
import type { AboutSection } from "@/lib/exhibition-api";

function assertIsAdmin(context: { user: { roles: string[] } }) {
  if (!context.user.roles.includes("admin")) throw new Error("FORBIDDEN");
}

const nullableText = z.string().trim().max(20000).nullable().optional();
const nullableUrlText = z.string().trim().max(1000).nullable().optional();

const aboutSectionSchema = z.object({
  id: z.string().uuid().optional(),
  section_key: z.string().trim().min(1).max(120),
  title: nullableText,
  body: nullableText,
  image_url: nullableUrlText,
  video_url: nullableUrlText,
  video_url_2: nullableUrlText,
  sort_order: z.number().int().nullable().optional(),
  is_active: z.boolean().optional(),
});

export const getAboutSections = createServerFn({ method: "GET" }).handler(async () => {
  const sql = getDb();
  return await sql<AboutSection[]>`SELECT * FROM about_sections ORDER BY sort_order ASC`;
});

export const upsertAboutSectionAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => aboutSectionSchema.parse(i))
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const sql = getDb();
    const { id, ...rest } = data;
    const cols = Object.keys(rest);
    if (id) {
      await sql`UPDATE about_sections SET ${sql(rest as any, ...cols)} WHERE id = ${id}`;
    } else {
      await sql`INSERT INTO about_sections ${sql(rest as any, ...cols)}`;
    }
    return { ok: true };
  });

export const deleteAboutSectionAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const sql = getDb();
    await sql`DELETE FROM about_sections WHERE id = ${data.id}`;
    return { ok: true };
  });

export const uploadAboutAssetFn = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((raw) => {
    if (!(raw instanceof FormData)) throw new Error("INVALID_UPLOAD");
    const file = raw.get("file");
    if (!(file instanceof File)) throw new Error("INVALID_UPLOAD");
    return { file };
  })
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const { assertSafeUploadExtension } = await import("./storage/mime");
    const ext = assertSafeUploadExtension(data.file.name);
    const path = `about/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { saveLocalFile } = await import("./storage/local-storage.server");
    await saveLocalFile(path, Buffer.from(await data.file.arrayBuffer()));
    return { path };
  });
