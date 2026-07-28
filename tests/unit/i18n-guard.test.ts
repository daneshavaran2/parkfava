import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  containsPersian,
  assertEnglishOnly,
  wrapErrorIfPersian,
} from "@/lib/i18n-guard";

describe("containsPersian", () => {
  it("returns false for pure ASCII", () => {
    expect(containsPersian("hello world")).toBe(false);
  });
  it("returns true for Persian text", () => {
    expect(containsPersian("سلام")).toBe(true);
  });
  it("returns true for mixed strings", () => {
    expect(containsPersian("order 42 سفارش")).toBe(true);
  });
  it("returns false for non-strings", () => {
    expect(containsPersian(123 as unknown)).toBe(false);
    expect(containsPersian(null)).toBe(false);
  });
});

describe("assertEnglishOnly", () => {
  it("does not throw for English", () => {
    expect(() => assertEnglishOnly("hello", "ctx")).not.toThrow();
  });
  it("throws with context for Persian", () => {
    expect(() => assertEnglishOnly("سلام", "user_input")).toThrow(
      /i18n violation.*user_input/,
    );
  });
});

describe("wrapErrorIfPersian", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errSpy.mockRestore());

  it("passes English errors through unchanged", () => {
    const e = new Error("company not found");
    expect(wrapErrorIfPersian(e)).toBe(e);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("replaces Persian error message with English sanitized message", () => {
    const original = new Error("شرکت یافت نشد");
    const wrapped = wrapErrorIfPersian(original);
    expect(wrapped).toBeInstanceOf(Error);
    expect(wrapped).not.toBe(original);
    expect((wrapped as Error).message).toMatch(/Internal server error/);
    expect((wrapped as Error).message).not.toMatch(/[\u0600-\u06FF]/);
  });

  it("preserves original stack on the replacement error", () => {
    const original = new Error("خطای داخلی");
    original.stack = "STACK_MARKER";
    const wrapped = wrapErrorIfPersian(original) as Error;
    expect(wrapped.stack).toBe("STACK_MARKER");
  });

  it("logs an envelope with event=i18n_violation and the original message", () => {
    const original = new Error("خطای پایگاه داده");
    wrapErrorIfPersian(original);
    expect(errSpy).toHaveBeenCalledTimes(1);
    const line = errSpy.mock.calls[0][0] as string;
    const env = JSON.parse(line);
    expect(env.event).toBe("i18n_violation");
    expect(env.level).toBe("error");
    expect(env.meta.original).toBe("خطای پایگاه داده");
  });

  it("passes non-Error values through", () => {
    expect(wrapErrorIfPersian("سلام")).toBe("سلام");
    expect(wrapErrorIfPersian(null)).toBe(null);
  });
});
