import { createStart, createMiddleware, createCsrfMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { i18nGuardMiddleware } from "@/lib/i18n-guard";
import { logError } from "@/lib/log-envelope";
import { getOrCreateRequestId, REQUEST_ID_HEADER } from "@/lib/request-id";
import { getRequestId, runWithRequestContext } from "@/lib/request-context";

// Client-side middleware: forward the current request id (if any) to server fns.
// Server fns don't get a Request object client-side, so we mint/read here.
const attachRequestId = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const existing =
    typeof document !== "undefined"
      ? (document.querySelector('meta[name="x-request-id"]')?.getAttribute("content") ?? undefined)
      : undefined;
  const id = existing ?? (typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}`);
  return next({ headers: { [REQUEST_ID_HEADER]: id } });
});

// Request middleware: bind an AsyncLocalStorage-backed request id for every
// server request (SSR, server routes, server fns) and log unhandled throws
// with the envelope.
const requestContextMiddleware = createMiddleware().server(async ({ next, request }) => {
  // The server entry (src/server.ts) already opens a context for anything it
  // handles, and stamps that same id onto the response header. Minting a
  // second one here would replace it for the inner handlers only, so the id a
  // caller reads from the header and the id that reaches the code and its log
  // envelopes would disagree — invisible whenever the client supplies
  // x-request-id, because then both call sites derive the same value.
  // Only establish a context when there genuinely isn't one.
  if (getRequestId()) return next();
  return runWithRequestContext({ requestId: getOrCreateRequestId(request) }, () => next());
});

/**
 * Database errors carry table, column and constraint names; they are logged
 * and the client gets a generic code instead (SEC-044). Application errors
 * (the codes the UI translates) pass through unchanged.
 */
function isDatabaseError(error: unknown): error is Error & { code?: string } {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  return (
    error.name === "PostgresError" ||
    (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) && "severity" in error)
  );
}

const dbErrorGuard = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (!isDatabaseError(error)) throw error;
    logError({
      event: "db_error",
      message: error.message,
      meta: { code: error.code, stack: error.stack },
    });
    throw new Error("INTERNAL_ERROR");
  }
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    logError({
      event: "unhandled",
      message: error instanceof Error ? error.message : String(error),
      meta: { stack: error instanceof Error ? error.stack : undefined },
    });
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/**
 * True when `url`'s host is the host this request was addressed to. Behind
 * Liara's proxy `request.url` carries the internal scheme and address, so the
 * forwarded/public Host is the only reliable thing to compare against.
 * Browsers cannot set Host or X-Forwarded-Host on a cross-origin request
 * without a CORS preflight this app never approves.
 */
function isSameHost(url: string, request: Request): boolean {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(",")[0]!
    .trim();
  try {
    return host !== "" && new URL(url).host === host;
  } catch {
    return false;
  }
}

// Server functions are same-origin RPC endpoints; refuse calls a browser
// makes on behalf of another site (security-audit SEC-033). Modern browsers
// send Sec-Fetch-Site, which decides alone; Origin and then Referer are the
// fallbacks. Requests carrying none of the three come from non-browser
// clients (scripts, the test suites) which hold no victim's cookies, so they
// are allowed.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
  origin: (origin, ctx) => isSameHost(origin, ctx.request),
  referer: (referer, ctx) => isSameHost(referer, ctx.request),
  allowRequestsWithoutOriginCheck: true,
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachRequestId, i18nGuardMiddleware, dbErrorGuard],
  requestMiddleware: [requestContextMiddleware, csrfMiddleware, errorMiddleware],
}));
