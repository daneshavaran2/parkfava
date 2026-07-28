import { describe, expect, it } from "vitest";
import {
  buildCompanyLocationUrl,
  buildGoogleMapsDirectionsUrl,
  buildNeshanUrl,
  coordinatesMatch,
  parseLatLng,
  parseLatLngValue,
  roundCoordinate,
} from "@/lib/geo";

describe("parseLatLng", () => {
  it("accepts valid latitude and longitude boundaries", () => {
    expect(parseLatLng("-90", "lat")).toEqual({ ok: true, value: -90 });
    expect(parseLatLng("90", "lat")).toEqual({ ok: true, value: 90 });
    expect(parseLatLng("-180", "lng")).toEqual({ ok: true, value: -180 });
    expect(parseLatLng("180", "lng")).toEqual({ ok: true, value: 180 });
  });

  it("returns null for empty optional input", () => {
    expect(parseLatLng("", "lat")).toEqual({ ok: true, value: null });
    expect(parseLatLng("   ", "lng")).toEqual({ ok: true, value: null });
  });

  it("normalizes Persian and Arabic-Indic digits", () => {
    expect(parseLatLng("۳۵.۶۸۹۲", "lat")).toEqual({ ok: true, value: 35.6892 });
    expect(parseLatLng("٥١.٣٨٩٠", "lng")).toEqual({ ok: true, value: 51.389 });
  });

  it("rejects invalid and out-of-range values", () => {
    expect(parseLatLng("abc", "lat")).toEqual({ ok: false, error: "invalid" });
    expect(parseLatLng("35,689", "lat")).toEqual({ ok: false, error: "invalid" });
    expect(parseLatLng("90.00001", "lat")).toEqual({ ok: false, error: "out_of_range" });
    expect(parseLatLng("180.00001", "lng")).toEqual({ ok: false, error: "out_of_range" });
    expect(parseLatLngValue(Number.NaN, "lat")).toEqual({ ok: false, error: "invalid" });
  });
});

describe("coordinate rounding and URL builders", () => {
  it("rounds coordinates to five decimal places", () => {
    expect(roundCoordinate(35.689245)).toBe(35.68925);
    expect(roundCoordinate(51.389034)).toBe(51.38903);
  });

  it("builds rounded Neshan and Google Maps URLs", () => {
    expect(buildNeshanUrl(35.689245, 51.389034)).toBe("https://nshn.ir/maps?lat=35.68925&lng=51.38903");
    expect(buildGoogleMapsDirectionsUrl(35.689245, 51.389034)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=35.68925,51.38903",
    );
  });

  it("builds copied company location URLs with existing query values replaced", () => {
    expect(buildCompanyLocationUrl("https://example.com/company/acme?foo=1&lat=1", 35.689245, 51.389034)).toBe(
      "https://example.com/company/acme?foo=1&lat=35.68925&lng=51.38903",
    );
    expect(buildCompanyLocationUrl("/company/acme", 35.689245, 51.389034)).toBe(
      "/company/acme?lat=35.68925&lng=51.38903",
    );
  });

  it("uses rounded values when matching copied links", () => {
    expect(coordinatesMatch(35.689245, 51.389034, 35.68925, 51.38903)).toBe(true);
    expect(coordinatesMatch(35.68, 51.38, 35.69, 51.39)).toBe(false);
  });

  it("throws when URL builders receive invalid coordinates", () => {
    expect(() => buildNeshanUrl(91, 51)).toThrow(/Invalid coordinates/);
    expect(() => buildGoogleMapsDirectionsUrl(35, 181)).toThrow(/Invalid coordinates/);
  });
});