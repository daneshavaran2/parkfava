export type Axis = "lat" | "lng";

export type ParseResult =
  | { ok: true; value: number | null }
  | { ok: false; error: "invalid" | "out_of_range" };

export const COORDINATE_PRECISION = 5;

export function normaliseCoordinateText(input: string): string {
  return (input ?? "")
    .trim()
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

export function roundCoordinate(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Invalid coordinate");
  const factor = 10 ** COORDINATE_PRECISION;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function formatCoordinate(value: number): string {
  return String(roundCoordinate(value));
}

export function parseLatLng(input: string, axis: Axis): ParseResult {
  const s = (input ?? "").trim();
  if (s === "") return { ok: true, value: null };
  const normalised = normaliseCoordinateText(s);
  if (!/^-?\d+(\.\d+)?$/.test(normalised)) return { ok: false, error: "invalid" };
  const n = Number(normalised);
  if (!Number.isFinite(n)) return { ok: false, error: "invalid" };
  const max = axis === "lat" ? 90 : 180;
  if (n < -max || n > max) return { ok: false, error: "out_of_range" };
  return { ok: true, value: roundCoordinate(n) };
}

export function parseLatLngValue(input: unknown, axis: Axis): ParseResult {
  if (input === null || input === undefined || input === "") return { ok: true, value: null };
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return { ok: false, error: "invalid" };
    const max = axis === "lat" ? 90 : 180;
    if (input < -max || input > max) return { ok: false, error: "out_of_range" };
    return { ok: true, value: roundCoordinate(input) };
  }
  if (typeof input === "string") return parseLatLng(input, axis);
  return { ok: false, error: "invalid" };
}

export function assertLatLng(lat: number, lng: number): { lat: string; lng: string } {
  const parsedLat = parseLatLngValue(lat, "lat");
  const parsedLng = parseLatLngValue(lng, "lng");
  if (!parsedLat.ok || parsedLat.value == null || !parsedLng.ok || parsedLng.value == null) {
    throw new Error("Invalid coordinates");
  }
  return { lat: formatCoordinate(parsedLat.value), lng: formatCoordinate(parsedLng.value) };
}

export function buildNeshanUrl(lat: number, lng: number): string {
  const c = assertLatLng(lat, lng);
  return `https://nshn.ir/maps?lat=${c.lat}&lng=${c.lng}`;
}

export function buildGoogleMapsDirectionsUrl(lat: number, lng: number): string {
  const c = assertLatLng(lat, lng);
  return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`;
}

export function buildCompanyLocationUrl(baseUrl: string, lat: number, lng: number): string {
  const c = assertLatLng(lat, lng);
  const fallbackBase = "https://example.local";
  const isAbsolute = /^https?:\/\//i.test(baseUrl);
  const url = new URL(baseUrl || "/", fallbackBase);
  url.searchParams.set("lat", c.lat);
  url.searchParams.set("lng", c.lng);
  if (isAbsolute) return url.toString();
  return `${url.pathname}${url.search}${url.hash}`;
}

export function coordinatesMatch(aLat: number, aLng: number, bLat: number, bLng: number): boolean {
  return formatCoordinate(aLat) === formatCoordinate(bLat) && formatCoordinate(aLng) === formatCoordinate(bLng);
}
