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
