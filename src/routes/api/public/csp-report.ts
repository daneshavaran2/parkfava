// CSP violation collector. Browsers POST here with no auth.
// Payload contains only URLs and directive names — no PII.
//
// Rate-limited in-memory: max 100 reports/minute per Worker instance.
// Anything beyond is silently dropped to prevent log flooding.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { logWarn } from "@/lib/log-envelope";

const ReportSchema = z
  .object({
    "document-uri": z.string().optional(),
    "violated-directive": z.string().optional(),
    "effective-directive": z.string().optional(),
    "blocked-uri": z.string().optional(),
    "source-file": z.string().optional(),
    "line-number": z.number().optional(),
    "status-code": z.number().optional(),
    disposition: z.string().optional(),
  })
  .passthrough();

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 100;
let windowStart = Date.now();
let count = 0;

function allow(): boolean {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    count = 0;
  }
  if (count >= MAX_PER_WINDOW) return false;
  count += 1;
  return true;
}

export const Route = createFileRoute("/api/public/csp-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!allow()) return new Response(null, { status: 204 });
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("invalid json", { status: 400 });
        }
        const raw =
          (body as { "csp-report"?: unknown })?.["csp-report"] ??
          (body as { body?: unknown })?.body ??
          body;
        const parsed = ReportSchema.safeParse(raw);
        if (!parsed.success) {
          return new Response("invalid report", { status: 400 });
        }
        logWarn({
          event: "csp_violation",
          message: "CSP violation reported",
          meta: {
            document_uri: parsed.data["document-uri"],
            violated_directive:
              parsed.data["violated-directive"] ?? parsed.data["effective-directive"],
            blocked_uri: parsed.data["blocked-uri"],
            source_file: parsed.data["source-file"],
            line: parsed.data["line-number"],
            disposition: parsed.data.disposition,
          },
        });
        return new Response(null, { status: 204 });
      },
    },
  },
});
