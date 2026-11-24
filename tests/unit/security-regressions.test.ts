/**
 * Regression tests for the security audit fixes (docs/Security Report.md).
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
      ["1.1.1.1", "2.2.2.2, 3.3.3.3", "x"].map((spoof) =>
        clientIpFromForwardedFor(`${spoof}, 198.51.100.7`, 1),
      ),
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

describe("SEC-035: request body size limits", async () => {
  const { limitRequestBody, MAX_RPC_BODY_BYTES, MAX_UPLOAD_BODY_BYTES, bodyLimitFor } =
    await import("../../src/lib/body-limit");
  const url = "http://localhost/_serverFn/x";

  it("rejects an oversized declared Content-Length with 413", () => {
    const req = new Request(url, {
      method: "POST",
      body: "x",
      headers: {
        "content-length": String(MAX_RPC_BODY_BYTES + 1),
        "content-type": "application/json",
      },
    });
    const out = limitRequestBody(req);
    expect(out).toBeInstanceOf(Response);
    expect((out as Response).status).toBe(413);
  });

  it("errors a streamed body that exceeds the limit without declaring a length", async () => {
    const big = new Uint8Array(MAX_RPC_BODY_BYTES + 10);
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(big);
        c.close();
      },
    });
    const req = new Request(url, {
      method: "POST",
      body: stream,
      duplex: "half",
      headers: { "content-type": "application/json" },
    } as RequestInit);
    const out = limitRequestBody(req) as Request;
    expect(out).toBeInstanceOf(Request);
    await expect(out.text()).rejects.toThrow();
  });

  it("returns a request with an acceptable declared length untouched", () => {
    const body = JSON.stringify({ a: 1 });
    const req = new Request(url, {
      method: "POST",
      body,
      headers: { "content-type": "application/json", "content-length": String(body.length) },
    });
    expect(limitRequestBody(req)).toBe(req);
  });

  it("rejects a malformed Content-Length", () => {
    const req = new Request(url, {
      method: "POST",
      body: "x",
      headers: { "content-length": "abc", "content-type": "application/json" },
    });
    expect((limitRequestBody(req) as Response).status).toBe(413);
  });

  it("passes a normal streamed JSON body through intact", async () => {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(JSON.stringify({ a: 1 })));
        c.close();
      },
    });
    const req = new Request(url, {
      method: "POST",
      body: stream,
      duplex: "half",
      headers: { "content-type": "application/json" },
    } as RequestInit);
    const out = limitRequestBody(req) as Request;
    expect(await out.json()).toEqual({ a: 1 });
  });

  it("allows uploads up to the larger multipart limit", () => {
    expect(bodyLimitFor("multipart/form-data; boundary=x")).toBe(MAX_UPLOAD_BODY_BYTES);
    expect(bodyLimitFor("application/json")).toBe(MAX_RPC_BODY_BYTES);
    const req = new Request(url, {
      method: "POST",
      body: "x",
      headers: {
        "content-length": String(50 * 1024 * 1024),
        "content-type": "multipart/form-data; boundary=x",
      },
    });
    expect(limitRequestBody(req)).toBe(req);
  });

  it("leaves GET requests alone", () => {
    const req = new Request(url, { method: "GET" });
    expect(limitRequestBody(req)).toBe(req);
  });
});

describe("SEC-035: large multipart bodies need a session", async () => {
  const { needsSessionForBody, MAX_RPC_BODY_BYTES } = await import("../../src/lib/body-limit");
  const url = "http://localhost/_serverFn/x";
  const multipart = "multipart/form-data; boundary=x";
  const req = (headers: Record<string, string>, method = "POST") =>
    new Request(url, { method, body: method === "GET" ? undefined : "x", headers });

  it("requires a session for a multipart body declared above the RPC limit", () => {
    expect(
      needsSessionForBody(
        req({ "content-type": multipart, "content-length": String(MAX_RPC_BODY_BYTES + 1) }),
      ),
    ).toBe(true);
  });
  it("requires a session for a multipart body with no declared length", () => {
    expect(needsSessionForBody(req({ "content-type": multipart }))).toBe(true);
  });
  it("lets small multipart bodies and all JSON bodies through without one", () => {
    expect(needsSessionForBody(req({ "content-type": multipart, "content-length": "1024" }))).toBe(
      false,
    );
    expect(needsSessionForBody(req({ "content-type": "application/json" }))).toBe(false);
    expect(needsSessionForBody(req({ "content-type": multipart }, "GET"))).toBe(false);
  });
});

describe("SEC-037: only the methods each path uses", async () => {
  const { rejectUnexpectedMethod } = await import("../../src/lib/method-guard");
  const req = (method: string, path: string) => new Request(`http://localhost${path}`, { method });

  it.each([
    ["GET", "/"],
    ["HEAD", "/about"],
    ["POST", "/_serverFn/abc"],
    ["GET", "/_serverFn/abc"],
    ["POST", "/api/public/csp-report"],
    ["OPTIONS", "/api/public/export"],
  ])("allows %s %s", (method, path) => {
    expect(rejectUnexpectedMethod(req(method, path))).toBeNull();
  });

  it.each([
    ["PUT", "/"],
    ["DELETE", "/"],
    ["PATCH", "/about"],
    ["POST", "/about"],
    ["OPTIONS", "/"],
    ["PUT", "/_serverFn/abc"],
    ["DELETE", "/api/public/health"],
    ["POST", "/assets/exhibition/a.png"],
  ])("refuses %s %s with 405", (method, path) => {
    const res = rejectUnexpectedMethod(req(method, path));
    expect(res?.status).toBe(405);
    expect(res?.headers.get("allow")).toBeTruthy();
  });
});

describe("SEC-038: upload content must match its extension", async () => {
  const { contentMatchesExtension, assertUploadContent } =
    await import("../../src/lib/storage/mime");
  const bytes = (...b: number[]) => new Uint8Array(b);
  const text = (s: string) => new TextEncoder().encode(s);
  const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
  const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0);
  const WEBP = text("RIFF\0\0\0\0WEBPVP8 ");
  const MP4 = text("\0\0\0 ftypisom");
  const WEBM = bytes(0x1a, 0x45, 0xdf, 0xa3, 0, 0);
  const DOC = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0, 0);
  const HTML = text("<html><script>alert(1)</script></html>");

  it("accepts genuine files", () => {
    expect(contentMatchesExtension("png", PNG)).toBe(true);
    expect(contentMatchesExtension("jpg", JPEG)).toBe(true);
    expect(contentMatchesExtension("jpg", PNG)).toBe(true); // renamed photo
    expect(contentMatchesExtension("webp", WEBP)).toBe(true);
    expect(contentMatchesExtension("gif", text("GIF89a...."))).toBe(true);
    expect(contentMatchesExtension("pdf", text("%PDF-1.7\n"))).toBe(true);
    expect(contentMatchesExtension("doc", DOC)).toBe(true);
    expect(contentMatchesExtension("docx", ZIP)).toBe(true);
    expect(contentMatchesExtension("mp4", MP4)).toBe(true);
    expect(contentMatchesExtension("mov", MP4)).toBe(true);
    expect(contentMatchesExtension("webm", WEBM)).toBe(true);
  });

  it("refuses markup or scripts behind an allowed extension", () => {
    for (const ext of ["png", "jpg", "gif", "webp", "pdf", "doc", "docx", "mp4", "webm"]) {
      expect(contentMatchesExtension(ext, HTML)).toBe(false);
    }
    expect(contentMatchesExtension("png", ZIP)).toBe(false);
    expect(contentMatchesExtension("pdf", PNG)).toBe(false);
    expect(contentMatchesExtension("png", new Uint8Array())).toBe(false);
  });

  it("throws FILE_CONTENT_MISMATCH for a disguised upload", async () => {
    await expect(assertUploadContent(new Blob([HTML]), "png")).rejects.toThrow(
      "FILE_CONTENT_MISMATCH",
    );
    await expect(assertUploadContent(new Blob([PNG]), "png")).resolves.toBeUndefined();
  });
});

describe("SEC-039: upload path segments", async () => {
  const { assertSafePathSegment } = await import("../../src/lib/storage/mime");
  it.each(["paya-brilliant-vision", "fava", "شرکت-نمونه", "3f2a1c9e-0000-4000-8000-000000000000"])(
    "accepts %j",
    (id) => expect(assertSafePathSegment(id)).toBe(id),
  );
  it.each(["..", ".", "../about", "..\\about", "a/b", ".hidden", "", "a\u0000b", "x".repeat(121)])(
    "refuses %j",
    (id) => expect(() => assertSafePathSegment(id)).toThrow("INVALID_UPLOAD"),
  );
});
