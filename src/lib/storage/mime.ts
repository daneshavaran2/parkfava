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
