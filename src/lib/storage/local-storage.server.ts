// Server-only. Disk-backed replacement for the "park-assets" Supabase
// Storage bucket. Files live under UPLOAD_DIR (default ./data/uploads) —
// on Liara this must be a mounted persistent disk, or uploads vanish on
// every redeploy/restart since the container filesystem is otherwise
// ephemeral.
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { Readable } from "node:stream";

function uploadRoot(): string {
  return process.env.UPLOAD_DIR || "./data/uploads";
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
  try {
    const full = resolveSafePath(relPath);
    return await readFile(full);
  } catch {
    return null;
  }
}

export type LocalFileStat = { size: number; mtimeMs: number };

/** Size + mtime for a stored file, or null if it isn't there. */
export async function statLocalFile(relPath: string): Promise<LocalFileStat | null> {
  try {
    const full = resolveSafePath(relPath);
    const s = await stat(full);
    if (!s.isFile()) return null;
    return { size: s.size, mtimeMs: s.mtimeMs };
  } catch {
    return null;
  }
}

/**
 * Streams a stored file (optionally a byte range) as a web ReadableStream,
 * so serving a large catalog or video doesn't pull the whole thing into
 * memory the way readLocalFile does.
 */
export function streamLocalFile(
  relPath: string,
  range?: { start: number; end: number },
): ReadableStream<Uint8Array> {
  const full = resolveSafePath(relPath);
  const nodeStream = createReadStream(full, range);
  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
}
