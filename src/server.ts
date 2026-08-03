// Loads .env into process.env at Node startup. Vite's build only inlines
// VITE_-prefixed vars into the client bundle via import.meta.env; plain vars
// like DATABASE_URL (read by server-only code such as the DB connection and
// auth middleware) are otherwise never populated on a plain Node host.
import "dotenv/config";

import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { CSP_POLICY, shouldEnforceCsp } from "./lib/csp";
import { getOrCreateRequestId, REQUEST_ID_HEADER } from "./lib/request-id";
import { runWithRequestContext } from "./lib/request-context";
import { logError } from "./lib/log-envelope";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  const captured = consumeLastCapturedError();
  logError({
    event: "ssr_unhandled",
    message: "h3 swallowed SSR error into generic 500",
    meta: { body, captured: captured instanceof Error ? captured.message : String(captured ?? "") },
  });
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function withStandardHeaders(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set(REQUEST_ID_HEADER, requestId);

  const ct = headers.get("content-type") ?? "";
  if (ct.includes("text/html")) {
    const cspHeader = shouldEnforceCsp()
      ? "content-security-policy"
      : "content-security-policy-report-only";
    if (!headers.has(cspHeader)) headers.set(cspHeader, CSP_POLICY);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const requestId = getOrCreateRequestId(request);
    return runWithRequestContext({ requestId }, async () => {
      try {
        const handler = await getServerEntry();
        const response = await handler.fetch(request, env, ctx);
        const normalized = await normalizeCatastrophicSsrResponse(response);
        return withStandardHeaders(normalized, requestId);
      } catch (error) {
        logError({
          event: "worker_fetch_crashed",
          message: error instanceof Error ? error.message : String(error),
          meta: { stack: error instanceof Error ? error.stack : undefined },
        });
        return withStandardHeaders(
          new Response(renderErrorPage(), {
            status: 500,
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
          requestId,
        );
      }
    });
  },
};
