// Content Security Policy value. Emitted as `Content-Security-Policy-Report-Only`
// in dev/preview so violations surface via /api/public/csp-report without
// breaking the page. In production it's enforced.
export const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.gpteng.co https://maps.googleapis.com https://maps.gstatic.com",
  "script-src-elem 'self' 'unsafe-inline' https://cdn.gpteng.co https://maps.googleapis.com https://maps.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
  "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https://storage.googleapis.com https://*.lovableproject.com https://*.lovable.app https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://*.ggpht.com https://*.tile.openstreetmap.org https://tile.openstreetmap.org",
  "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
  "connect-src 'self' https://maps.googleapis.com https://*.googleapis.com https://cdn.gpteng.co https://raw.githack.com https://raw.githubusercontent.com https://*.lovableproject.com wss://*.lovableproject.com https://*.lovable.app wss://*.lovable.app ws://localhost:* wss://localhost:*",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "report-uri /api/public/csp-report",
].join("; ");

export function shouldEnforceCsp(): boolean {
  // Explicit overrides win in both directions.
  if (process.env.CSP_ENFORCE === "0") return false;
  if (process.env.CSP_ENFORCE === "1") return true;
  // Default: enforce in production, report-only elsewhere.
  return process.env.NODE_ENV === "production";
}
