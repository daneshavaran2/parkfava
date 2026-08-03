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
  nitro: { preset: nitroPreset },
});
