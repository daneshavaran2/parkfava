/**
 * Pages and static files are read-only: only server functions and the API
 * routes accept writes, and only with POST. Without this guard the framework
 * renders the page for any method (PUT /, DELETE /, TRACE /…), which changes
 * nothing but is reported by every scanner as an unexpected-method finding
 * (docs/Security Report.md, SEC-037).
 */
const READ_METHODS = new Set(["GET", "HEAD"]);
const WRITE_PREFIXES = ["/_serverFn/", "/api/"];

export function rejectUnexpectedMethod(request: Request): Response | null {
  if (READ_METHODS.has(request.method)) return null;
  const { pathname } = new URL(request.url);
  const writable = WRITE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (writable && (request.method === "POST" || request.method === "OPTIONS")) return null;
  return new Response("Method Not Allowed", {
    status: 405,
    headers: {
      allow: writable ? "GET, HEAD, POST, OPTIONS" : "GET, HEAD",
      "content-type": "text/plain",
    },
  });
}
