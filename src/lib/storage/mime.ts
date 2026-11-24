const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

export function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}

// Deliberately excludes svg/html/xml and any other script-executable type —
// those get served back with their own content-type by the public /assets
// route with no CSP, so accepting them would let an uploader's file execute
// script in this origin when an admin (or anyone) opens it directly.
const SAFE_UPLOAD_EXTENSIONS = new Set(Object.keys(EXT_TO_MIME));

export function assertSafeUploadExtension(filename: string): string {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (!ext || !SAFE_UPLOAD_EXTENSIONS.has(ext)) {
    throw new Error("UNSUPPORTED_FILE_TYPE");
  }
  return ext;
}

// Video is the only thing here that legitimately runs large; everything else
// is a logo, a photo, or a form. Generous enough not to reject a real catalog
// or a phone-shot clip, small enough that it is not a way to fill the uploads
// disk or the process's memory.
const MAX_UPLOAD_BYTES: Record<string, number> = {
  mp4: 100 * 1024 * 1024,
  webm: 100 * 1024 * 1024,
  mov: 100 * 1024 * 1024,
};
const DEFAULT_MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export function maxUploadBytes(ext: string): number {
  return MAX_UPLOAD_BYTES[ext] ?? DEFAULT_MAX_UPLOAD_BYTES;
}

/**
 * Extension and size in one call, so a handler cannot check one and forget the
 * other.
 *
 * Size has to be rejected from `file.size` *before* `arrayBuffer()`, because
 * that call is what pulls the whole upload into the process's memory — reading
 * it first and measuring afterwards would already have done the damage.
 */
export function assertUploadAllowed(file: { name: string; size: number }): string {
  const ext = assertSafeUploadExtension(file.name);
  if (file.size > maxUploadBytes(ext)) throw new Error("FILE_TOO_LARGE");
  return ext;
}

// File signatures ("magic bytes") per upload family. The extension decides the
// content-type the file is later served with, so the bytes must actually be
// that kind of file: an HTML page renamed to logo.png is refused here instead
// of being stored (docs/Security Report.md, SEC-038). Any image signature is
// accepted for any image extension, since photos are often renamed between
// .jpg and .png and browsers render either way.
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov"]);

function startsWith(head: Uint8Array, bytes: number[], offset = 0): boolean {
  return bytes.every((b, i) => head[offset + i] === b);
}

function ascii(head: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...head.slice(offset, offset + length));
}

function isImage(head: Uint8Array): boolean {
  return (
    startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) || // PNG
    startsWith(head, [0xff, 0xd8, 0xff]) || // JPEG
    ascii(head, 0, 6) === "GIF87a" ||
    ascii(head, 0, 6) === "GIF89a" ||
    (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WEBP")
  );
}

function isVideo(head: Uint8Array): boolean {
  const box = ascii(head, 4, 4); // ISO base media (mp4, mov)
  return (
    ["ftyp", "moov", "mdat", "wide", "free", "skip"].includes(box) ||
    startsWith(head, [0x1a, 0x45, 0xdf, 0xa3]) // WebM / Matroska
  );
}

export function contentMatchesExtension(ext: string, head: Uint8Array): boolean {
  if (IMAGE_EXTS.has(ext)) return isImage(head);
  if (VIDEO_EXTS.has(ext)) return isVideo(head);
  if (ext === "pdf") return ascii(head, 0, head.length).includes("%PDF-");
  if (ext === "doc") return startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (ext === "docx") return startsWith(head, [0x50, 0x4b, 0x03, 0x04]);
  return false;
}

/** Reads only the first KiB, so it is safe to call before the full read. */
export async function assertUploadContent(file: Blob, ext: string): Promise<void> {
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  if (!contentMatchesExtension(ext, head)) throw new Error("FILE_CONTENT_MISMATCH");
}

/**
 * An id that becomes one folder name in an upload path (company, park or
 * attachment owner). The storage layer already refuses anything that would
 * leave the uploads directory; this also stops "../other" from moving a file
 * into a different folder inside it (docs/Security Report.md, SEC-039).
 */
// eslint-disable-next-line no-control-regex -- control characters are exactly what this rejects
const SAFE_PATH_SEGMENT = /^(?!\.)[^/\\\u0000-\u001f]{1,120}$/u;

export function assertSafePathSegment(value: string): string {
  if (!SAFE_PATH_SEGMENT.test(value)) throw new Error("INVALID_UPLOAD");
  return value;
}
