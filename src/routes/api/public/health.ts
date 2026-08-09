// Liveness/readiness probe for the container platform (see the Dockerfile's
// HEALTHCHECK). Checks that this process can actually reach Postgres, since a
// process that's listening but can't serve a single page is not "healthy" —
// that's the state worth restarting or pulling out of rotation.
import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "../../../../db/connection";

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const sql = getDb();
          await sql`SELECT 1`;
          return Response.json({ status: "ok", db: "up" });
        } catch {
          // Deliberately opaque: this endpoint is public, and the connection
          // error text can name the database host and user.
          return Response.json({ status: "degraded", db: "down" }, { status: 503 });
        }
      },
    },
  },
});
