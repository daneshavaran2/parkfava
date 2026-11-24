// Server-only. A park an admin deactivated is hidden from the public site
// together with everything on it: its content, images, news and attachments
// (docs/Security Report.md, SEC-054). Admins still see it, to edit it.
import type { getDb } from "../../db/connection";

/**
 * True when `parkId` was deactivated and the current request is not an
 * admin's. A park id with no row in `parks` (bundled data only) is not
 * hidden: only an explicit deactivation hides anything.
 */
export async function isParkHiddenFromViewer(
  sql: ReturnType<typeof getDb>,
  parkId: string,
): Promise<boolean> {
  const [park] = await sql<{ is_active: boolean }[]>`
    SELECT is_active FROM parks WHERE park_id = ${parkId}
  `;
  if (!park || park.is_active) return false;
  const { getSessionUser } = await import("./auth/session.server");
  const user = await getSessionUser();
  return !user?.roles.includes("admin");
}
