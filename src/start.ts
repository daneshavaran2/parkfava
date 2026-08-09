import { createStart, createMiddleware } from "@tanstack/react-start";

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
      ? document
          .querySelector('meta[name="x-request-id"]')
          ?.getAttribute("content") ?? undefined
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

export const startInstance = createStart(() => ({
  functionMiddleware: [attachRequestId, i18nGuardMiddleware],
  requestMiddleware: [requestContextMiddleware, errorMiddleware],
}));
