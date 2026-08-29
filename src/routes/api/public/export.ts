// Public, read-only, unauthenticated export of everything the offline
// Windows app (see electron/) needs to seed or refresh its local database
// from the live site. Deliberately excludes anything sensitive: no `users`,
// no sessions, no MFA state, no API keys/settings — only the same public
// content that getExhibitionCompanies/getParks/getAboutSections/
// getParkContent already expose piecemeal, bundled into one response so a
// build-time script (scripts/build-offline-seed.ts) and the in-app
// "به‌روزرسانی از سایت اصلی" admin action can both fetch it in one round trip
// instead of replicating every query shape over HTTP.
import { createFileRoute } from "@tanstack/react-router";
import { getDb, hasDb } from "../../../../db/connection";

export const Route = createFileRoute("/api/public/export")({
  server: {
    handlers: {
      GET: async () => {
        if (!hasDb()) {
          return Response.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
        }
        try {
          const sql = getDb();
          const [
            parks,
            companies,
            products,
            attachments,
            aboutSections,
            parkContent,
            parkImages,
            parkNews,
          ] = await Promise.all([
            sql`SELECT * FROM parks ORDER BY sort_order ASC`,
            sql<
              { company_id: string }[]
            >`SELECT * FROM exhibition_companies WHERE status = 'approved' AND is_active = true ORDER BY sort_order ASC`,
            sql<
              { company_id: string }[]
            >`SELECT * FROM exhibition_products ORDER BY created_at ASC`,
            sql`SELECT * FROM company_attachments WHERE is_active = true ORDER BY kind ASC, sort_order ASC`,
            sql`SELECT * FROM about_sections ORDER BY sort_order ASC`,
            sql`SELECT * FROM park_content`,
            sql`SELECT * FROM park_images ORDER BY sort_order ASC`,
            sql`SELECT * FROM park_news ORDER BY published_at DESC`,
          ]);

          // Products belong to companies that may since have gone
          // unapproved/inactive — keep the export self-consistent by only
          // shipping products whose company is actually in the export.
          const companyIds = new Set(companies.map((c) => c.company_id));
          const scopedProducts = products.filter((p) => companyIds.has(p.company_id));

          return Response.json({
            exportedAt: new Date().toISOString(),
            parks,
            companies,
            products: scopedProducts,
            attachments,
            aboutSections,
            parkContent,
            parkImages,
            parkNews,
          });
        } catch {
          // Same reasoning as /api/public/health: don't leak connection
          // details from a public, unauthenticated endpoint.
          return Response.json({ error: "EXPORT_FAILED" }, { status: 503 });
        }
      },
    },
  },
});
