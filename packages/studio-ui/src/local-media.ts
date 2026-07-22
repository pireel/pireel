/**
 * OPFS local video library: the persistence layer for the "keep local, don't upload" mode of the
 * main video / insert clips — recover by fileSig after refresh, so draft restore no longer asks the
 * user to re-pick the file. best-effort: unsupported / evicted / any failure silently degrades back
 * to the "re-import" prompt, never worse than not having it.
 *
 * Storage key = fileSig (name:size:lastModified). The File metadata in OPFS (name/mtime/type) is what
 * was written to disk, not the original file's — on retrieval the File is rebuilt from the sidecar meta
 * so that fileSig(retrieved) === original sig (draft reconnect validation, ASR/visual-analysis cache,
 * and autosave sig all depend on this identity).
 */

const DIR = 'local-videos';
const MAX_FILES = 12; // Videos are large — keep only the most recent N (LRU by write time); beyond that, purge with their meta

interface StoredMeta {
  name: string;
  type: string;
  lastModified: number;
}

/** The sig contains the filename (which may have CJK/spaces/colons); normalize to an OPFS-safe name; size:mtime guarantees uniqueness. */
const sigKey = (sig: string) => sig.replace(/[^a-zA-Z0-9._-]/g, '_');

async function dirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null;
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(DIR, { create: true });
  } catch {
    return null;
  }
}

export async function saveLocalVideo(file: File, sig: string): Promise<void> {
  const dir = await dirHandle();
  if (!dir) return;
  try {
    // Request persistence (best-effort): if denied, accept the risk of eviction
    void navigator.storage.persist?.().catch(() => {});
    const key = sigKey(sig);
    try {
      await dir.getFileHandle(key);
      return; // Same sig already on disk (content pinned by size+mtime) — skip rewrite
    } catch {
      /* Not present → write it */
    }
    const meta: StoredMeta = { name: file.name, type: file.type, lastModified: file.lastModified };
    const fh = await dir.getFileHandle(key, { create: true });
    const w = await fh.createWritable();
    await w.write(file);
    await w.close();
    const mh = await dir.getFileHandle(`${key}.meta.json`, { create: true });
    const mw = await mh.createWritable();
    await mw.write(JSON.stringify(meta));
    await mw.close();
    await prune(dir);
  } catch (e) {
    console.warn('[studio] save local video failed', e);
  }
}

export async function loadLocalVideo(sig: string): Promise<File | null> {
  const dir = await dirHandle();
  if (!dir) return null;
  try {
    const key = sigKey(sig);
    const fh = await dir.getFileHandle(key);
    const stored = await fh.getFile();
    if (!stored.size) return null;
    let meta: StoredMeta | null = null;
    try {
      const mh = await dir.getFileHandle(`${key}.meta.json`);
      meta = JSON.parse(await (await mh.getFile()).text()) as StoredMeta;
    } catch {
      /* meta missing: fall back to on-disk metadata (sig won't match, only affects reconnect validation) */
    }
    return meta ? new File([stored], meta.name, { type: meta.type, lastModified: meta.lastModified }) : stored;
  } catch {
    return null;
  }
}

/** LRU cleanup: keep only the most recent MAX_FILES by write time (the meta sidecar follows its data file). */
async function prune(dir: FileSystemDirectoryHandle): Promise<void> {
  try {
    const files: { name: string; mtime: number }[] = [];
    const iter = (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values();
    for await (const h of iter) {
      if (h.kind !== 'file' || h.name.endsWith('.meta.json')) continue;
      const f = await (h as FileSystemFileHandle).getFile();
      files.push({ name: h.name, mtime: f.lastModified });
    }
    files.sort((a, b) => b.mtime - a.mtime);
    for (const f of files.slice(MAX_FILES)) {
      try {
        await dir.removeEntry(f.name);
        await dir.removeEntry(`${f.name}.meta.json`);
      } catch {
        /* If it can't be removed, leave it — try again next time */
      }
    }
  } catch {
    /* best-effort */
  }
}
