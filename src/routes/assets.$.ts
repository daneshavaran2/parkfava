// Serves uploaded files (company logos, gallery images, park images,
// attachments) from local disk storage — the self-hosted replacement for
// the public "park-assets" Supabase Storage bucket. Public/unauthenticated
// by design: every asset behind this route was already meant to be
// publicly readable (Storage RLS granted SELECT to anon+authenticated on
// this bucket) — only writes were ever gated.
//
// Files are streamed rather than buffered: a 50MB catalog PDF used to mean a
// 50MB allocation per concurrent request. Conditional requests (ETag) and
// byte ranges are honoured too — the latter is what lets a browser seek
// inside an uploaded video instead of refetching it from the start.
import { createFileRoute } from "@tanstack/react-router";
import { statLocalFile, streamLocalFile } from "@/lib/storage/local-storage.server";
import { mimeFromPath } from "@/lib/storage/mime";

const CACHE_CONTROL = "public, max-age=31536000, immutable";

export const Route = createFileRoute("/assets/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const path = params._splat;
        if (!path) return new Response("Not found", { status: 404 });

        const info = await statLocalFile(path);
        if (!info) return new Response("Not found", { status: 404 });

        const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
        const contentType = mimeFromPath(path);
        const baseHeaders = {
          "content-type": contentType,
          "cache-control": CACHE_CONTROL,
          etag,
          "accept-ranges": "bytes",
        };

        // The asset URLs carry a timestamp+random suffix, so content at a
        // given path never changes — but a revalidating client (or one whose
        // heuristic cache expired) still gets a cheap 304 instead of a
        // re-download.
        if (request.headers.get("if-none-match") === etag) {
          return new Response(null, { status: 304, headers: baseHeaders });
        }

        const range = parseRange(request.headers.get("range"), info.size);
        if (range === "unsatisfiable") {
          return new Response("Range Not Satisfiable", {
            status: 416,
            headers: { ...baseHeaders, "content-range": `bytes */${info.size}` },
          });
        }
        if (range) {
          const body = await streamLocalFile(path, range);
          if (!body) return new Response("Not found", { status: 404 });
          return new Response(body, {
            status: 206,
            headers: {
              ...baseHeaders,
              "content-range": `bytes ${range.start}-${range.end}/${info.size}`,
              "content-length": String(range.end - range.start + 1),
            },
          });
        }

        const body = await streamLocalFile(path);
        if (!body) return new Response("Not found", { status: 404 });
        return new Response(body, {
          headers: { ...baseHeaders, "content-length": String(info.size) },
        });
      },
    },
  },
});

/**
 * Handles the single-range form browsers actually send (`bytes=start-end`,
 * with either end open). Multi-range requests are ignored — returning the
 * whole body is a valid response to a Range header we choose not to honour.
 */
function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  let start: number;
  let end: number;

  if (rawStart === "") {
    // Suffix form: `bytes=-500` means the last 500 bytes.
    const suffixLength = Number(rawEnd);
    if (!rawEnd || Number.isNaN(suffixLength) || suffixLength <= 0) return "unsatisfiable";
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
    if (Number.isNaN(start) || Number.isNaN(end)) return null;
    end = Math.min(end, size - 1);
  }

  if (size === 0 || start >= size || start > end) return "unsatisfiable";
  return { start, end };
}
