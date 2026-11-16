// Debug endpoint for x-request-id propagation e2e testing.
// Guarded: returns 404 unless NODE_ENV is explicitly development or test.
// Never rely on this in real clients.
import { createFileRoute } from "@tanstack/react-router";
import { getRequestId } from "@/lib/request-context";
import { _drainLogs, logError, logInfo } from "@/lib/log-envelope";

// Opt-in, not opt-out: a server started without NODE_ENV (a bare `node
// .output/server/index.mjs`, the offline desktop build) must not expose the
// in-memory log buffer, which holds other requests' log lines. CI starts the
// e2e server with NODE_ENV=development.
function isEnabled(): boolean {
  return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
}

// Simulate a nested serverFn stack: outer -> inner -> PostgREST 42501.
// Emits two envelopes that MUST share the same request_id.
async function runNestedRls(): Promise<void> {
  logInfo({ event: "outer_call", message: "outer serverFn entered" });
  await Promise.resolve();
  logError({
    event: "rls_denied",
    message: "row-level security policy blocked write",
    meta: { pg_code: "42501", table: "companies", op: "insert", depth: 2 },
  });
}

async function runRlsSuccess(): Promise<void> {
  const start = performance.now();
  await Promise.resolve();
  logInfo({
    event: "rls_query",
    message: "PostgREST query succeeded",
    meta: { pg_code: null, table: "parks", op: "select", duration_ms: Math.round(performance.now() - start) },
  });
}

export const Route = createFileRoute("/api/public/debug-echo")({
  server: {
    handlers: {
      GET: async () => {
        if (!isEnabled()) return new Response("not found", { status: 404 });
        const requestId = getRequestId() ?? "unknown";
        return Response.json({ request_id: requestId });
      },
      POST: async ({ request }) => {
        if (!isEnabled()) return new Response("not found", { status: 404 });
        const requestId = getRequestId() ?? "unknown";
        let body: { scenario?: string } = {};
        try {
          body = (await request.json()) as { scenario?: string };
        } catch {
          // fallthrough: default scenario
        }
        if (body.scenario === "rls_42501") {
          logError({
            event: "rls_denied",
            message: "row-level security policy blocked write",
            meta: { pg_code: "42501", table: "companies", op: "insert" },
          });
          return new Response(
            JSON.stringify({ request_id: requestId, logs: _drainLogs() }),
            { status: 403, headers: { "content-type": "application/json" } },
          );
        }
        if (body.scenario === "nested_rls_42501") {
          await runNestedRls();
          return new Response(
            JSON.stringify({ request_id: requestId, logs: _drainLogs() }),
            { status: 403, headers: { "content-type": "application/json" } },
          );
        }
        if (body.scenario === "rls_success") {
          await runRlsSuccess();
          return Response.json({ request_id: requestId, logs: _drainLogs() });
        }
        return Response.json({ request_id: requestId, logs: _drainLogs() });
      },
    },
  },
});

