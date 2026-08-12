// Answers one question that is otherwise unanswerable from outside the
// container: of every image path recorded in the database, how many actually
// have bytes behind them?
//
// It exists because "the images do not load" has two very different causes —
// the files are gone from the uploads disk, or the app is failing to serve
// files that are there — and from a browser they look identical. This reports
// counts, not a diagnosis, so the next step is decided by a number.
//
// Admin-only: the counts themselves are harmless, but the scan does one stat()
// per referenced row, and that is not something an anonymous caller should be
// able to trigger at will.
import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "../../../../db/connection";
import { getSessionUser } from "@/lib/auth/session.server";
import { locateStoredFile } from "@/lib/storage/local-storage.server";

type Bucket = { referenced: number; onDisk: number; bakedIn: number; missing: number };

const empty = (): Bucket => ({ referenced: 0, onDisk: 0, bakedIn: 0, missing: 0 });

export const Route = createFileRoute("/api/public/asset-audit")({
  server: {
    handlers: {
      GET: async () => {
        const user = await getSessionUser();
        if (!user?.roles.includes("admin")) {
          return Response.json({ error: "forbidden" }, { status: 403 });
        }

        const sql = getDb();
        const sources: Array<[string, string[]]> = [
          ["company_logos", (await sql<{ p: string }[]>`
            SELECT logo_url AS p FROM exhibition_companies
            WHERE logo_url IS NOT NULL AND logo_url NOT LIKE 'http%'`).map((r) => r.p)],
          ["product_images", (await sql<{ p: string }[]>`
            SELECT image_url AS p FROM exhibition_products
            WHERE image_url IS NOT NULL AND image_url NOT LIKE 'http%'`).map((r) => r.p)],
        ];

        const report: Record<string, Bucket> = {};
        const examples: string[] = [];
        for (const [name, paths] of sources) {
          const bucket = empty();
          for (const p of paths) {
            bucket.referenced++;
            const where = await locateStoredFile(p);
            if (where === "upload") bucket.onDisk++;
            else if (where === "seed") bucket.bakedIn++;
            else {
              bucket.missing++;
              if (examples.length < 5) examples.push(p);
            }
          }
          report[name] = bucket;
        }

        const totalMissing = Object.values(report).reduce((n, b) => n + b.missing, 0);
        return Response.json({
          status: totalMissing === 0 ? "ok" : "missing-files",
          uploadDir: process.env.UPLOAD_DIR || "./data/uploads",
          ...report,
          missingExamples: examples,
        });
      },
    },
  },
});
