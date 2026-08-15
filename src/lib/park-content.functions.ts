import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "../../db/connection";
import { requireMfaVerified } from "./auth/middleware";
import type { ParkContent, ParkImage, ParkNews } from "@/lib/park-content-api";

function assertIsAdmin(context: { user: { roles: string[] } }) {
  if (!context.user.roles.includes("admin")) throw new Error("FORBIDDEN");
}

export const getParkContent = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ parkId: z.string().trim().min(1).max(120) }).parse(i))
  .handler(async ({ data }) => {
    const sql = getDb();
    const [[content], images, news] = await Promise.all([
      sql<ParkContent[]>`SELECT * FROM park_content WHERE park_id = ${data.parkId}`,
      sql<
        ParkImage[]
      >`SELECT * FROM park_images WHERE park_id = ${data.parkId} ORDER BY sort_order ASC`,
      sql<
        ParkNews[]
      >`SELECT * FROM park_news WHERE park_id = ${data.parkId} ORDER BY published_at DESC`,
    ]);
    return { content: content ?? null, images, news };
  });

export const upsertParkContentAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) =>
    z
      .object({
        park_id: z.string().trim().min(1).max(120),
        display_name: z.string().trim().max(255).nullable().optional(),
        description: z.string().trim().max(20000).nullable().optional(),
        logo_url: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const sql = getDb();
    const cols = Object.keys(data);
    const updateCols = cols.filter((c) => c !== "park_id");
    await sql`
      INSERT INTO park_content ${sql(data as any, ...cols)}
      ON CONFLICT (park_id) DO UPDATE SET ${sql(data as any, ...updateCols)}
    `;
    return { ok: true };
  });

export const addParkImageAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) =>
    z
      .object({
        park_id: z.string().trim().min(1).max(120),
        image_url: z.string().trim().min(1).max(1000),
        caption: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const sql = getDb();
    await sql`
      INSERT INTO park_images (park_id, image_url, caption, sort_order)
      VALUES (${data.park_id}, ${data.image_url}, ${data.caption ?? null}, 0)
    `;
    return { ok: true };
  });

export const deleteParkImageAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const sql = getDb();
    await sql`DELETE FROM park_images WHERE id = ${data.id}`;
    return { ok: true };
  });

export const upsertParkNewsAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid().optional(),
        park_id: z.string().trim().min(1).max(120),
        title: z.string().trim().min(1).max(255),
        body: z.string().trim().max(20000).nullable().optional(),
        video_url: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const sql = getDb();
    if (data.id) {
      await sql`
        UPDATE park_news
        SET title = ${data.title}, body = ${data.body ?? null},
            video_url = ${data.video_url ?? null}
        WHERE id = ${data.id}
      `;
    } else {
      await sql`
        INSERT INTO park_news (park_id, title, body, video_url)
        VALUES (${data.park_id}, ${data.title}, ${data.body ?? null}, ${data.video_url ?? null})
      `;
    }
    return { ok: true };
  });

export const deleteParkNewsAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const sql = getDb();
    await sql`DELETE FROM park_news WHERE id = ${data.id}`;
    return { ok: true };
  });

export const uploadParkAssetFn = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((raw) => {
    if (!(raw instanceof FormData)) throw new Error("INVALID_UPLOAD");
    const file = raw.get("file");
    const park_id = raw.get("park_id");
    if (!(file instanceof File) || typeof park_id !== "string" || !park_id) {
      throw new Error("INVALID_UPLOAD");
    }
    return { file, park_id };
  })
  .handler(async ({ data, context }) => {
    assertIsAdmin(context);
    const { assertUploadAllowed } = await import("./storage/mime");
    const ext = assertUploadAllowed(data.file);
    const path = `${data.park_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { saveLocalFile } = await import("./storage/local-storage.server");
    await saveLocalFile(path, Buffer.from(await data.file.arrayBuffer()));
    return { path };
  });
