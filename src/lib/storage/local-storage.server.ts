// Server-only. Disk-backed replacement for the "park-assets" Supabase
// Storage bucket. Files live under UPLOAD_DIR (default ./data/uploads) —
// on Liara this must be a mounted persistent disk, or uploads vanish on
// every redeploy/restart since the container filesystem is otherwise
// ephemeral.
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { Readable } from "node:stream";
import { SEED_ASSETS } from "./seed-assets";

function uploadRoot(): string {
  return process.env.UPLOAD_DIR || "./data/uploads";
}

/**
 * Read-only fallback store, baked into the container image.
 *
 * The uploads disk is the only writable, persistent place, and everything on
 * it got there either through the admin panel or through a one-off script
 * pasted into a shell. The second kind does not survive anything — a new disk,
 * a migration, a redeploy where nobody remembered to re-run it — and when it
 * does not survive, every row pointing at those paths renders a broken image.
 * Shipping the bytes with the code removes that failure mode entirely.
 *
 * Two candidates so neither environment needs configuring: the Dockerfile
 * copies the images to ./seed-assets, and a dev checkout already has them at
 * scripts/atlas-images.
 */
function seedRoot(): string | null {
  const configured = process.env.SEED_ASSET_DIR;
  if (configured) return existsSync(configured) ? configured : null;
  for (const dir of ["./seed-assets", "./scripts/atlas-images"]) {
    if (existsSync(dir)) return dir;
  }
  return null;
}

/**
 * Where a path's bytes actually live: the uploads disk if the file is there,
 * the baked-in copy otherwise. An upload always wins — the fallback is only
 * ever consulted for a path that is missing — so replacing one of these images
 * through the admin panel keeps working.
 */
function seedPathFor(relPath: string): string | null {
  const file = SEED_ASSETS[relPath];
  if (!file) return null;
  const root = seedRoot();
  return root ? join(root, file) : null;
}

// Every stored path is built server-side from a fixed prefix plus a
// timestamp+random suffix (see the upload handlers), never from a raw
// user-supplied filename — this check is defense-in-depth against a
// crafted relative path (e.g. containing "..") escaping the upload root.
function resolveSafePath(relPath: string): string {
  const root = normalize(uploadRoot());
  const full = normalize(join(root, relPath));
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error("INVALID_STORAGE_PATH");
  }
  return full;
}

export async function saveLocalFile(relPath: string, data: Buffer): Promise<void> {
  const full = resolveSafePath(relPath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, data);
}

export async function deleteLocalFile(relPath: string): Promise<void> {
  try {
    const full = resolveSafePath(relPath);
    await unlink(full);
  } catch {
    // Best-effort — matches the old Supabase Storage .remove().catch(() => {}) behavior.
  }
}

export async function readLocalFile(relPath: string): Promise<Buffer | null> {
  const full = await resolveExistingPath(relPath);
  if (!full) return null;
  try {
    return await readFile(full);
  } catch {
    return null;
  }
}

export type LocalFileStat = { size: number; mtimeMs: number };

/** Size + mtime for a stored file, or null if it isn't there. */
export async function statLocalFile(relPath: string): Promise<LocalFileStat | null> {
  const full = await resolveExistingPath(relPath);
  if (!full) return null;
  try {
    const s = await stat(full);
    if (!s.isFile()) return null;
    return { size: s.size, mtimeMs: s.mtimeMs };
  } catch {
    return null;
  }
}

/** The upload path if it exists, else the baked-in copy, else null. */
async function resolveExistingPath(relPath: string): Promise<string | null> {
  let full: string;
  try {
    full = resolveSafePath(relPath);
  } catch {
    return null;
  }
  try {
    if ((await stat(full)).isFile()) return full;
  } catch {
    // Fall through to the seed copy.
  }
  const seed = seedPathFor(relPath);
  return seed && existsSync(seed) ? seed : null;
}

/** Whether a stored path resolves to bytes anywhere — used by the asset audit. */
export async function locateStoredFile(
  relPath: string,
): Promise<"upload" | "seed" | "missing"> {
  try {
    if ((await stat(resolveSafePath(relPath))).isFile()) return "upload";
  } catch {
    // not on the uploads disk
  }
  const seed = seedPathFor(relPath);
  return seed && existsSync(seed) ? "seed" : "missing";
}

/**
 * Streams a stored file (optionally a byte range) as a web ReadableStream,
 * so serving a large catalog or video doesn't pull the whole thing into
 * memory the way readLocalFile does.
 */
export async function streamLocalFile(
  relPath: string,
  range?: { start: number; end: number },
): Promise<ReadableStream<Uint8Array> | null> {
  const full = await resolveExistingPath(relPath);
  if (!full) return null;
  const nodeStream = createReadStream(full, range);
  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
}
