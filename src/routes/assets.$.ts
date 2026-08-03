// Serves uploaded files (company logos, gallery images, park images,
// attachments) from local disk storage — the self-hosted replacement for
// the public "park-assets" Supabase Storage bucket. Public/unauthenticated
// by design: every asset behind this route was already meant to be
// publicly readable (Storage RLS granted SELECT to anon+authenticated on
// this bucket) — only writes were ever gated.
import { createFileRoute } from "@tanstack/react-router";
import { readLocalFile } from "@/lib/storage/local-storage.server";
import { mimeFromPath } from "@/lib/storage/mime";

export const Route = createFileRoute("/assets/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = params._splat;
        if (!path) return new Response("Not found", { status: 404 });
        const data = await readLocalFile(path);
        if (!data) return new Response("Not found", { status: 404 });
        return new Response(new Uint8Array(data), {
          headers: {
            "content-type": mimeFromPath(path),
            "cache-control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
