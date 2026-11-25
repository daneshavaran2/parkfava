# Builds the app as a plain Node.js server (Nitro's node-server preset),
# for hosts like Liara that run containers rather than Cloudflare Workers.
FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
ENV NITRO_PRESET=node-server
RUN bun run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.output ./.output
COPY --from=build /app/server ./server
# Read-only fallback for images whose only route to the uploads disk was a
# one-off script pasted into a shell. Shipping the bytes with the code means a
# fresh container serves them whether or not that script ever ran again.
COPY --from=build /app/scripts/atlas-images ./seed-assets

# Run as the image's unprivileged `node` user (uid 1000), not root. The
# uploads directory is the only path the app writes to; a volume mounted there
# must be writable by uid 1000 (e.g. `chown -R 1000:1000` on the volume once).
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data

# The base image ships npm, npx, corepack and yarn; the app runs only `node`.
# Their bundled packages carried 23 known advisories in an image scan
# (docs/Security Report.md, SEC-058), so they are removed from the runtime.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/yarn /usr/local/bin/yarnpkg
USER node

EXPOSE 3000

# Reports unhealthy once the process can no longer reach Postgres, not merely
# when the port stops accepting — see src/routes/api/public/health.ts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/public/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Spreads requests across CPU cores instead of pinning the app to one; set
# WEB_CONCURRENCY=1 to fall back to a single process.
CMD ["node", "server/cluster.mjs"]
