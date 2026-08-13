/**
 * Server-only. Removes the files and attachment rows an owner leaves behind.
 *
 * `company_attachments` is polymorphic — `owner_type` + `owner_id`, guarded by
 * a CHECK on the enum and by no foreign key at all — so nothing cascades when
 * the company or park it points at is deleted. The rows survive their owner,
 * and because `/assets/$` is public, the files stay downloadable by anyone who
 * still has the URL. An admin deleting a company reasonably believes its
 * documents went with it.
 *
 * Rows that *do* cascade (exhibition_images, exhibition_products) still leave
 * their bytes on disk, so their paths are collected here too — before the
 * delete, while the rows can still be read.
 */
import type { Sql } from "postgres";
import { deleteLocalFile } from "./local-storage.server";

/** Stored paths only — an external URL is not ours to delete. */
function localPathsOf(values: (string | null | undefined)[]): string[] {
  return values.filter(
    (v): v is string => !!v && !v.startsWith("http") && !v.startsWith("data:"),
  );
}

async function removeFiles(paths: string[]): Promise<void> {
  // deleteLocalFile already swallows its own errors, so a file that was never
  // on this disk (an atlas image served from the container copy, say) is a
  // no-op rather than a failure.
  await Promise.all(paths.map((p) => deleteLocalFile(p)));
}

/**
 * Deletes a park's attachments. Call before deleting the park itself, so a
 * failure here cannot leave the rows pointing at something already gone.
 */
export async function purgeParkAssets(sql: Sql, parkId: string): Promise<void> {
  const rows = await sql<{ file_url: string | null }[]>`
    DELETE FROM company_attachments
    WHERE owner_type = 'park' AND owner_id = ${parkId}
    RETURNING file_url
  `;
  const images = await sql<{ image_url: string | null }[]>`
    SELECT image_url FROM park_images WHERE park_id = ${parkId}
  `;
  await removeFiles(localPathsOf([
    ...rows.map((r) => r.file_url),
    ...images.map((r) => r.image_url),
  ]));
}

/**
 * Deletes an exhibition company's attachments and every file its gallery and
 * products referenced.
 */
export async function purgeCompanyAssets(sql: Sql, companyId: string): Promise<void> {
  const attachments = await sql<{ file_url: string | null }[]>`
    DELETE FROM company_attachments
    WHERE owner_type = 'exhibition' AND owner_id = ${companyId}
    RETURNING file_url
  `;
  // Read while the rows still exist — the caller's DELETE cascades them away.
  const [company] = await sql<{ logo_url: string | null }[]>`
    SELECT logo_url FROM exhibition_companies WHERE company_id = ${companyId}
  `;
  const images = await sql<{ image_url: string | null }[]>`
    SELECT image_url FROM exhibition_images WHERE company_id = ${companyId}
  `;
  const products = await sql<{ image_url: string | null; video_url: string | null }[]>`
    SELECT image_url, video_url FROM exhibition_products WHERE company_id = ${companyId}
  `;

  await removeFiles(localPathsOf([
    ...attachments.map((r) => r.file_url),
    company?.logo_url,
    ...images.map((r) => r.image_url),
    ...products.flatMap((r) => [r.image_url, r.video_url]),
  ]));
}
