// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// The current deploy target (Liara) runs the app as a plain Node process, and
// its buildpack does not forward app environment variables into the build
// step (only into the runtime start step) — so gating the preset behind an
// env var silently falls back to the `cloudflare-module` default and ships a
// Workers-format build that never opens a port under plain Node. Default to
// `node-server` unconditionally; pass NITRO_PRESET=cloudflare-module
// explicitly (see `build:cloudflare`) when actually deploying to Cloudflare.
const nitroPreset = process.env.NITRO_PRESET || "node-server";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Nitro never compresses build output unless told to — without this, prod
  // serves the JS/CSS bundles uncompressed (confirmed via curl against
  // favapark.liara.run: no Content-Encoding despite a Vary: Accept-Encoding
  // header). gzip+brotli sidecars are written at build time and served
  // automatically by Nitro's static handler when the client accepts them.
  //
  // `compressPublicAssets` isn't in this wrapper's declared `nitro` type —
  // its .d.ts only types preset/output/cloudflare "on purpose" (its own
  // comment) — but the wrapper spreads this whole object straight through
  // to nitro/vite's real nitro() call at runtime with no filtering
  // (verified by reading node_modules/@lovable.dev/vite-tanstack-config/dist/index.js),
  // and compressPublicAssets is a real, documented Nitro option
  // (node_modules/nitro/dist/types/index.d.mts). Cast past the narrow type
  // rather than lose the setting.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above, the wrapper's type is narrower than what it actually forwards
  nitro: { preset: nitroPreset, compressPublicAssets: { gzip: true, brotli: true } } as any,
});
