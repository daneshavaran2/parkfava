// Loads .env into process.env at Node startup. Vite's build only inlines
// VITE_-prefixed vars into the client bundle via import.meta.env; plain vars
// like DATABASE_URL (read by server-only code such as the DB connection and
// auth middleware) are otherwise never populated on a plain Node host.
import "dotenv/config";

import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { CSP_POLICY, shouldEnforceCsp } from "./lib/csp";
import { limitRequestBody, needsSessionForBody } from "./lib/body-limit";
import { AsyncLocalStorage } from "node:async_hooks";

import { getOrCreateRequestId, REQUEST_ID_HEADER } from "./lib/request-id";
import {
  installRequestContextStorage,
  runWithRequestContext,
  type RequestContext,
} from "./lib/request-context";
import { logError } from "./lib/log-envelope";

// This module is the server entry and never reaches the browser, so it is the
// right place to own the Node built-in. Installed at import time, before any
// request is handled, so getRequestId() works from the first request onward.
installRequestContextStorage(new AsyncLocalStorage<RequestContext>());

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

const SERVER_FN_PATH = "/_serverFn/";

function withStandardHeaders(response: Response, requestId: string, request?: Request): Response {
  const headers = new Headers(response.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  // Every response, not just HTML: /assets serves user uploads, and without
  // nosniff a browser may second-guess their declared type.
  if (!headers.has("x-content-type-options")) headers.set("x-content-type-options", "nosniff");
  if (!headers.has("referrer-policy"))
    headers.set("referrer-policy", "strict-origin-when-cross-origin");
  // The app uses none of these browser features (only the clipboard, which
  // this does not restrict); denying them limits what injected script or a
  // compromised third-party script could ask the visitor for.
  if (!headers.has("permissions-policy")) {
    headers.set(
      "permissions-policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    );
  }
  // Server-function responses carry per-user data (session, roles, drafts);
  // no browser or intermediary cache may keep them.
  if (request && new URL(request.url).pathname.includes(SERVER_FN_PATH)) {
    headers.set("cache-control", "no-store");
  }
  // Production is HTTPS-only behind Liara; dev and the offline desktop build
  // run on plain http://127.0.0.1 and must not be pinned to HTTPS.
  if (process.env.NODE_ENV === "production" && !headers.has("strict-transport-security")) {
    headers.set("strict-transport-security", "max-age=31536000");
  }

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
        // Body size limits before anything parses the body (SEC-035).
        const limited = limitRequestBody(request);
        if (limited instanceof Response) return withStandardHeaders(limited, requestId, request);
        if (needsSessionForBody(request)) {
          const { isLiveSessionCookie } = await import("./lib/auth/session.server");
          if (!(await isLiveSessionCookie(request.headers.get("cookie")))) {
            return withStandardHeaders(
              new Response("Payload Too Large", {
                status: 413,
                headers: { "content-type": "text/plain" },
              }),
              requestId,
              request,
            );
          }
        }
        const response = await handler.fetch(limited, env, ctx);
        const normalized = await normalizeCatastrophicSsrResponse(response);
        return withStandardHeaders(normalized, requestId, request);
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
