/**
 * Downscales/re-compresses an image client-side, in the browser, before it
 * ever leaves the device — no server-side dependency (no `sharp`/native
 * addon, which the Docker build here can't be verified to support without
 * an actual deploy) and no change to already-uploaded files.
 *
 * Motivation, measured directly against production: a company profile page
 * was transferring images 3-5x larger than their displayed size — a photo
 * shown at 330×206 uploaded at 1595×680, a logo shown at 40×40 uploaded at
 * 640×640. Every visitor to that page pays for the difference on every
 * load. This fixes it at the source, for every future upload, across every
 * upload entry point (company assets, about-page images, attachments).
 *
 * No-op for non-image files, already-small images, and anything the
 * browser can't decode (falls back to uploading the original untouched —
 * never blocks an upload on a resize failure).
 */

const MAX_DIMENSION = 1400;
// Below this, a resize/re-encode pass isn't worth it — small uploads are
// usually already reasonably sized, and re-encoding can occasionally make
// a small file *larger* (JPEG overhead on an already-compressed PNG icon).
const SKIP_BELOW_BYTES = 200_000;
const JPEG_QUALITY = 0.82;

/** Cheap approximate alpha check — samples pixels rather than reading every one. */
function hasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const { data } = ctx.getImageData(0, 0, width, height);
    for (let i = 3; i < data.length; i += 4 * 37) {
      if (data[i] < 255) return true;
    }
    return false;
  } catch {
    // getImageData can throw on a tainted canvas — be conservative and
    // assume transparency matters, so the PNG path is kept.
    return true;
  }
}

export async function shrinkImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < SKIP_BELOW_BYTES) return file;
  // SVGs are vector/tiny already and canvas-rasterizing one would be a
  // regression, not an optimization.
  if (file.type === "image/svg+xml") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // format the browser can't decode (some GIFs, HEIC, …) — upload as-is
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (scale === 1) {
    bitmap.close();
    return file; // already within bounds
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // Opaque PNGs (screenshots, exported graphics with no alpha) compress far
  // better as JPEG; PNGs that actually use transparency stay PNG.
  const keepPng = file.type === "image/png" && hasTransparency(ctx, canvas.width, canvas.height);
  const outType = keepPng ? "image/png" : "image/jpeg";

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, outType, outType === "image/jpeg" ? JPEG_QUALITY : undefined),
  );
  if (!blob || blob.size >= file.size) return file; // re-encode didn't actually help

  const ext = outType === "image/png" ? "png" : "jpg";
  const name = file.name.replace(/\.[^./\\]+$/, "") + "." + ext;
  return new File([blob], name, { type: outType, lastModified: file.lastModified });
}
