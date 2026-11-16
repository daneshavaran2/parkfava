/**
 * Regression tests for the security audit fixes (security-audit/findings.md).
 * Each block names the finding it pins down.
 */
import { describe, expect, it } from "vitest";
import { clientIpFromForwardedFor } from "../../src/lib/client-ip";
import { hasBlockedScheme, safeUrlString } from "../../src/lib/safe-url";

describe("SEC-003: rate-limit client key ignores attacker-chosen X-Forwarded-For entries", () => {
  it("takes the entry appended by the single trusted proxy, not the leftmost", () => {
    // Client sent "203.0.113.9"; Liara appended the real address.
    expect(clientIpFromForwardedFor("203.0.113.9, 198.51.100.7", 1)).toBe("198.51.100.7");
  });
  it("gives every spoofed variant the same bucket", () => {
    const keys = new Set(
      ["1.1.1.1", "2.2.2.2, 3.3.3.3", "x"].map((spoof) => clientIpFromForwardedFor(`${spoof}, 198.51.100.7`, 1)),
    );
    expect([...keys]).toEqual(["198.51.100.7"]);
  });
  it("honours more than one trusted hop", () => {
    expect(clientIpFromForwardedFor("203.0.113.9, 198.51.100.7, 10.0.0.2", 2)).toBe("198.51.100.7");
  });
  it("falls back to the only entry when the chain is shorter than the hop count", () => {
    expect(clientIpFromForwardedFor("198.51.100.7", 3)).toBe("198.51.100.7");
  });
  it("returns null for a missing or empty header", () => {
    expect(clientIpFromForwardedFor(undefined, 1)).toBeNull();
    expect(clientIpFromForwardedFor(" , ", 1)).toBeNull();
  });
});

describe("SEC-008: URL fields reject script-capable schemes", () => {
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    "  javascript:alert(1)",
    "\u0000javascript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
  ])("blocks %j", (value) => {
    expect(hasBlockedScheme(value)).toBe(true);
    expect(safeUrlString().safeParse(value).success).toBe(false);
  });
  it.each([
    "https://example.com/catalog.pdf",
    "http://example.com",
    "www.example.com",
    "exhibition/acme/1700000000-ab12cd.png",
    "/assets/exhibition/acme/logo.png",
    "mailto:info@example.com",
  ])("allows %j", (value) => {
    expect(hasBlockedScheme(value)).toBe(false);
    expect(safeUrlString().safeParse(value).success).toBe(true);
  });
});
