// Resolve a stable request id from incoming headers, or mint one.
// Order: explicit x-request-id > Cloudflare cf-ray > randomUUID.
export const REQUEST_ID_HEADER = "x-request-id";

export function getOrCreateRequestId(request: Request): string {
  const explicit = request.headers.get(REQUEST_ID_HEADER);
  if (explicit && /^[\w.-]{6,128}$/.test(explicit)) return explicit;
  const cfRay = request.headers.get("cf-ray");
  if (cfRay) return cfRay;
  return crypto.randomUUID();
}
