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

EXPOSE 3000

# Reports unhealthy once the process can no longer reach Postgres, not merely
# when the port stops accepting — see src/routes/api/public/health.ts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/public/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Spreads requests across CPU cores instead of pinning the app to one; set
# WEB_CONCURRENCY=1 to fall back to a single process.
CMD ["node", "server/cluster.mjs"]
