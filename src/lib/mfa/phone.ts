// Framework-agnostic — safe to import from both client and server code.
const IRAN_MOBILE_RE = /^09\d{9}$/;

export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim().replace(/[\s-]/g, "");
  const local = trimmed.startsWith("+98") ? "0" + trimmed.slice(3)
    : trimmed.startsWith("0098") ? "0" + trimmed.slice(4)
    : trimmed;
  return IRAN_MOBILE_RE.test(local) ? local : null;
}

export function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  return phone.slice(0, 4) + "***" + phone.slice(-2);
}
