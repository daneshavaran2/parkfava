/**
 * Request body size limits, applied to every request before any handler
 * parses it (src/server.ts). Without them a single request body of any size
 * is read and parsed (`request.json()`, `request.formData()`), so one large
 * request can exhaust a worker's memory (security-audit SEC-035).
 *
 * Multipart covers file uploads, whose own per-type caps (src/lib/storage/
 * mime.ts, up to 100 MB for video) are checked later; this outer limit only
 * has to sit above the largest of them. Everything else is JSON-sized RPC.
 */
export const MAX_RPC_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_BODY_BYTES = 110 * 1024 * 1024;

export class PayloadTooLargeError extends Error {
  constructor() {
    super("PAYLOAD_TOO_LARGE");
    this.name = "PayloadTooLargeError";
  }
}

export function bodyLimitFor(contentType: string | null): number {
  return contentType?.toLowerCase().includes("multipart/form-data")
    ? MAX_UPLOAD_BODY_BYTES
    : MAX_RPC_BODY_BYTES;
}

/**
 * True when the request is a multipart body that may be larger than the RPC
 * limit (declared above it, or not declared at all). Such bodies are accepted
 * only from a signed-in caller (src/server.ts): every upload function requires
 * a session (`requireMfaVerified`), so an anonymous caller has no reason to send
 * one, and the framework buffers the whole form before any function middleware
 * runs — without this check anyone could make the server buffer the upload
 * limit per request.
 */
export function needsSessionForBody(request: Request): boolean {
  if (request.method === "GET" || request.method === "HEAD") return false;
  if (bodyLimitFor(request.headers.get("content-type")) === MAX_RPC_BODY_BYTES) return false;
  const declared = request.headers.get("content-length");
  return declared === null || Number(declared) > MAX_RPC_BODY_BYTES;
}

/**
 * Returns a 413 response when the declared Content-Length is over the limit.
 * A request that declares an acceptable length — every browser `fetch`,
 * uploads included — is returned untouched, so the server adapter's own
 * request object (with its client IP and runtime handles) reaches the app as
 * before. Only a body that declares no length (chunked, non-browser clients)
 * is re-wrapped, with a stream that errors once the limit is passed.
 */
export function limitRequestBody(request: Request): Request | Response {
  if (request.method === "GET" || request.method === "HEAD") return request;
  const limit = bodyLimitFor(request.headers.get("content-type"));
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader !== null) {
    const declared = Number(lengthHeader);
    if (!Number.isFinite(declared) || declared > limit) {
      return new Response("Payload Too Large", {
        status: 413,
        headers: { "content-type": "text/plain" },
      });
    }
    return request;
  }
  if (!request.body) return request;
  let received = 0;
  const counted = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > limit) controller.error(new PayloadTooLargeError());
        else controller.enqueue(chunk);
      },
    }),
  );
  // Built from the URL, not from `request`: the adapter's request class is
  // not a native Request and cannot be passed as one. Its extras are carried
  // over so nothing downstream loses them. `duplex` is required by Node's
  // fetch for a streamed request body.
  const copy = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: counted,
    signal: request.signal,
    duplex: "half",
  } as RequestInit);
  const source = request as Request & { runtime?: unknown; ip?: string; waitUntil?: unknown };
  for (const key of ["runtime", "waitUntil"] as const) {
    if (source[key] !== undefined)
      Object.defineProperty(copy, key, { value: source[key], configurable: true });
  }
  Object.defineProperty(copy, "ip", { get: () => source.ip, configurable: true });
  return copy;
}
