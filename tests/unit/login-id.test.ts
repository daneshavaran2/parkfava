import { describe, expect, it } from "vitest";
import { isValidNationalId, parseLoginId, toAsciiDigits } from "../../src/lib/auth/login-id";

describe("toAsciiDigits", () => {
  it("folds Persian and Arabic-Indic digits", () => {
    expect(toAsciiDigits("۰۹۱۲")).toBe("0912");
    expect(toAsciiDigits("٠٩")).toBe("09");
    expect(toAsciiDigits("Pass-12")).toBe("Pass-12");
  });
});

describe("isValidNationalId", () => {
  it("accepts real legal-entity national IDs", () => {
    expect(isValidNationalId("10320506910")).toBe(true);
    expect(isValidNationalId("14003829844")).toBe(true);
  });
  it("rejects a wrong check digit or length", () => {
    expect(isValidNationalId("10320506911")).toBe(false);
    expect(isValidNationalId("1032050691")).toBe(false);
    expect(isValidNationalId("abcdefghijk")).toBe(false);
  });
});

describe("parseLoginId", () => {
  it("treats anything with @ as an email, lower-cased", () => {
    expect(parseLoginId("  Admin@Example.COM ")).toEqual({ kind: "email", value: "admin@example.com" });
  });
  it("treats digits (any script, with separators) as a national ID", () => {
    expect(parseLoginId("۱۰۳۲۰۵۰۶۹۱۰")).toEqual({
      kind: "national_id",
      value: "10320506910",
    });
    expect(parseLoginId("103 2050 6910")).toEqual({ kind: "national_id", value: "10320506910" });
  });
  it("rejects input that is neither", () => {
    expect(parseLoginId("")).toBeNull();
    expect(parseLoginId("company-name")).toBeNull();
  });
});
