/**
 * OPFS local video library: the persistence layer for the "keep local, don't upload" mode of the
 * main video / insert clips — recover by fileSig after refresh, so draft restore no longer asks the
 * user to re-pick the file. best-effort: unsupported / evicted / any failure silently degrades back
 * to the "re-import" prompt, never worse than not having it.
 *
 * Storage key = a hash of the durable media signature (new browser imports add a bounded content
 * fingerprint; legacy name:size:lastModified locators remain readable). The File metadata in OPFS is what
 * was written to disk, not the original file's — on retrieval the File is rebuilt from the sidecar meta
 * so that fileSig(retrieved) === original sig (draft reconnect validation, ASR/visual-analysis cache,
 * and autosave sig all depend on this identity).
 */

import { fileMatchesSig, fileNameFromSig, fileSig, rememberDurableFileSig } from './media';

const DIR = 'local-videos';
const MAX_FILES = 12; // Videos are large — keep only the most recent N (LRU by write time); beyond that, purge with their meta

/* ---------- Native file handles (File System Access API, Chromium) ----------
 * Preferred backend: persist the picked file's HANDLE in IndexedDB and read straight from the
 * user's disk — zero-copy, no LRU cap, no eviction. Individual file imports additionally keep an
 * ordinary OPFS fallback because embedded browsers may not retain handle permission across reloads. The
 * cost: after a restart the browser may ask to re-grant read access, which only works from a
 * user gesture — non-gesture loads (draft restore) just fall through to the OPFS copy / cloud /
 * re-import lanes. OPFS stays as the fallback backend (non-Chromium, handle-less files). */

interface PermHandle extends FileSystemFileHandle {
  queryPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
}

interface PermDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
}

const HANDLE_DB = 'studio-local-handles';
const HANDLE_STORE = 'handles';
const folderHandleKey = (folderId: string) => `folder:${folderId}`;

function handleDb(): Promise<IDBDatabase | null> {
  return new Promise((res) => {
    try {
      if (typeof indexedDB === 'undefined') return res(null);
      const req = indexedDB.open(HANDLE_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(HANDLE_STORE);
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(null);
    } catch {
      res(null);
    }
  });
}

async function handleOp<T>(mode: IDBTransactionMode, op: (st: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await handleDb();
  if (!db) return null;
  return new Promise((res) => {
    try {
      const tx = db.transaction(HANDLE_STORE, mode);
      const req = op(tx.objectStore(HANDLE_STORE));
      tx.oncomplete = () => {
        db.close();
        res((req.result as T) ?? null);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        res(null);
      };
    } catch {
      db.close();
      res(null);
    }
  });
}

/** Register a picked file's native handle for this sig (the zero-copy backend). */
export async function saveLocalHandle(sig: string, handle: FileSystemFileHandle): Promise<boolean> {
  return (await handleOp('readwrite', (st) => st.put(handle, sig))) != null;
}

/** Persist one folder authorization separately from its files. Structured-cloned handles stay on
 *  this browser only; the cloud index carries just folder id/name/path metadata. */
export async function saveLocalFolderHandle(folderId: string, handle: FileSystemDirectoryHandle): Promise<void> {
  await handleOp('readwrite', (st) => st.put(handle, folderHandleKey(folderId)));
}

/** Read the last directory handle without requesting permission. It can still be passed as the
 * picker's `startIn`, or explicitly re-authorized from a later user gesture. */
export async function getLocalFolderHandle(folderId: string): Promise<FileSystemDirectoryHandle | null> {
  return (await handleOp('readonly', (st) => st.get(folderHandleKey(folderId)))) as FileSystemDirectoryHandle | null;
}

/** Permission prompts are only useful from a click. Keeping this separate lets the folder restore
 * card re-authorize the saved root once, before resolving every indexed child beneath it. */
export async function requestLocalFolderAccess(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const dir = handle as PermDirectoryHandle;
    let permission = (await dir.queryPermission?.({ mode: 'read' })) ?? 'granted';
    if (permission === 'prompt') permission = (await dir.requestPermission?.({ mode: 'read' })) ?? 'denied';
    return permission === 'granted';
  } catch {
    return false;
  }
}

export async function deleteLocalFolderHandle(folderId: string): Promise<void> {
  await handleOp('readwrite', (st) => st.delete(folderHandleKey(folderId)));
}

/** Resolve one indexed file beneath an authorized root without copying bytes. Supplying `root`
 *  is the explicit user-gesture restore path; otherwise the locally persisted root is tried. */
export async function loadLocalFolderFile(
  folderId: string,
  relativePath: string,
  sig: string,
  root?: FileSystemDirectoryHandle,
): Promise<{ file: File; handle: FileSystemFileHandle } | null> {
  const parts = relativePath.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) return null;
  const stored = root ?? (await getLocalFolderHandle(folderId));
  if (!stored) return null;
  try {
    if (!(await requestLocalFolderAccess(stored))) return null;
    let cursor: FileSystemDirectoryHandle = stored;
    for (const segment of parts.slice(0, -1)) cursor = await cursor.getDirectoryHandle(segment);
    const handle = await cursor.getFileHandle(parts[parts.length - 1]!);
    const file = await handle.getFile();
    if (!(await fileMatchesSig(file, sig))) return null;
    await saveLocalHandle(sig, handle);
    return { file, handle };
  } catch {
    return null;
  }
}

async function loadFromHandle(sig: string): Promise<File | null> {
  const h = (await handleOp('readonly', (st) => st.get(sig))) as PermHandle | null;
  if (!h) return null;
  try {
    let perm = (await h.queryPermission?.({ mode: 'read' })) ?? 'granted';
    if (perm === 'prompt') {
      // Re-grant needs a user gesture; elsewhere this rejects/denies and we fall through to OPFS.
      perm = (await h.requestPermission?.({ mode: 'read' })) ?? 'denied';
    }
    if (perm !== 'granted') return null;
    const f = await h.getFile();
    if (!(await fileMatchesSig(f, sig))) return null; // moved/renamed/edited on disk: identity broken → treat as a miss (reconnect flow takes over)
    return f;
  } catch {
    return null;
  }
}

interface StoredMeta {
  name: string;
  type: string;
  lastModified: number;
  /** Folder-input imports have no reusable native handle, so their OPFS copy is the source of truth. */
  pinned?: boolean;
}

/** OPFS names must not be derived by replacing unsupported characters: two different CJK names can
 * collapse to the same underscore-only key. Hash the complete durable locator instead. */
async function sigKey(sig: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sig));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const legacySigKey = (sig: string): string => sig.replace(/[^a-zA-Z0-9._-]/g, '_');

async function readStoredMeta(dir: FileSystemDirectoryHandle, key: string): Promise<StoredMeta | null> {
  try {
    const mh = await dir.getFileHandle(`${key}.meta.json`);
    return JSON.parse(await (await mh.getFile()).text()) as StoredMeta;
  } catch {
    return null;
  }
}

async function writeStoredMeta(dir: FileSystemDirectoryHandle, key: string, meta: StoredMeta): Promise<void> {
  const mh = await dir.getFileHandle(`${key}.meta.json`, { create: true });
  const mw = await mh.createWritable();
  await mw.write(JSON.stringify(meta));
  await mw.close();
}

async function dirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null;
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(DIR, { create: true });
  } catch {
    return null;
  }
}

export async function saveLocalVideo(
  file: File,
  sig: string,
  handle?: FileSystemFileHandle,
  options?: { pinned?: boolean; fallbackCopy?: boolean },
): Promise<boolean> {
  file = alignFileToSig(file, sig); // stored meta must match the sig key, or later loads mint a different identity
  if (handle) {
    // A folder authorization can resolve every child zero-copy. Individual file handles also get
    // a bounded OPFS fallback so a reload stays seamless when an embedded browser drops permission.
    const handleSaved = await saveLocalHandle(sig, handle);
    if (handleSaved && !options?.fallbackCopy) return true;
  }
  // A registered handle already covers this sig — bytes are reachable from disk, don't duplicate into OPFS.
  // Pinned folder-input and requested fallback copies must survive even if a stale handle exists.
  if (!options?.pinned && !options?.fallbackCopy && (await handleOp('readonly', (st) => st.get(sig))) != null) return true;
  const dir = await dirHandle();
  if (!dir) return false;
  try {
    // Request persistence (best-effort): if denied, accept the risk of eviction
    void navigator.storage.persist?.().catch(() => {});
    const key = await sigKey(sig);
    try {
      const existing = await (await dir.getFileHandle(key)).getFile();
      if (existing.size === file.size) {
        if (options?.pinned) {
          await writeStoredMeta(dir, key, {
            name: file.name,
            type: file.type,
            lastModified: file.lastModified,
            pinned: true,
          });
        }
        return true; // Same sig fully on disk (content pinned by size+mtime): skip byte rewrite
      }
      // Size mismatch = an interrupted earlier write; fall through and rewrite so the entry heals
    } catch {
      /* Not present → write it */
    }
    const meta: StoredMeta = {
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
      ...(options?.pinned ? { pinned: true } : {}),
    };
    const fh = await dir.getFileHandle(key, { create: true });
    const w = await fh.createWritable();
    await w.write(file);
    await w.close();
    await writeStoredMeta(dir, key, meta);
    await prune(dir);
    return true;
  } catch (e) {
    console.warn('[studio] save local video failed', e);
    return false;
  }
}

interface SaveLocalStreamOptions {
  name: string;
  type?: string;
  expectedSize?: number | null;
  pinned?: boolean;
}

async function consumeLocalStream(
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
  expectedSize: number | null,
  write?: (chunk: Uint8Array<ArrayBuffer>) => Promise<void>,
): Promise<number> {
  const reader = stream.getReader();
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (expectedSize != null && received > expectedSize) {
        throw new Error(
          `local fetch size mismatch: expected ${expectedSize}, received more than ${expectedSize}`,
        );
      }
      await write?.(value);
    }
    if (expectedSize != null && received !== expectedSize) {
      throw new Error(`local fetch size mismatch: expected ${expectedSize}, received ${received}`);
    }
    return received;
  } catch (error) {
    try {
      await reader.cancel(error);
    } catch {
      /* the source may already be closed */
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

/** Stream a loopback helper response straight into OPFS. This deliberately accepts a stream rather
 * than a Blob/File so multi-GB local imports never need a second full-size browser memory buffer. */
export async function saveLocalStream(
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
  sig: string,
  options: SaveLocalStreamOptions,
): Promise<File> {
  const dir = await dirHandle();
  if (!dir) throw new Error('local media storage is unavailable for streamed import');

  void navigator.storage.persist?.().catch(() => {});
  const key = await sigKey(sig);
  const expectedSize = options.expectedSize ?? null;
  const sigParts = sig.split(':');
  const sigMtime = Number(sigParts[sigParts.length - 1]);
  const meta: StoredMeta = {
    name: options.name || 'import',
    type: options.type || 'application/octet-stream',
    lastModified: Number.isSafeInteger(sigMtime) && sigMtime >= 0 ? sigMtime : Date.now(),
    ...(options.pinned ? { pinned: true } : {}),
  };

  // The same helper request may be retried. Consume and validate it, but keep an already-complete
  // OPFS entry untouched so a broken retry cannot destroy the good local copy.
  if (expectedSize != null) {
    let existing: File | null = null;
    try {
      existing = await (await dir.getFileHandle(key)).getFile();
    } catch {
      /* missing entry */
    }
    if (existing?.size === expectedSize) {
      await consumeLocalStream(stream, expectedSize);
      const existingMeta = await readStoredMeta(dir, key);
      const retainedMeta: StoredMeta = {
        ...meta,
        ...(meta.pinned || existingMeta?.pinned ? { pinned: true } : {}),
      };
      await writeStoredMeta(dir, key, retainedMeta);
      return alignFileToSig(
        new File([existing], retainedMeta.name, {
          type: retainedMeta.type,
          lastModified: retainedMeta.lastModified,
        }),
        sig,
      );
    }
  }

  const fh = await dir.getFileHandle(key, { create: true });
  const writable = await fh.createWritable();
  let closed = false;
  try {
    await consumeLocalStream(stream, expectedSize, async (chunk) => {
      await writable.write(chunk);
    });
    await writable.close();
    closed = true;
    await writeStoredMeta(dir, key, meta);
    await prune(dir);
    const stored = await fh.getFile();
    return alignFileToSig(
      new File([stored], meta.name, {
        type: meta.type,
        lastModified: meta.lastModified,
      }),
      sig,
    );
  } catch (error) {
    if (!closed) {
      try {
        await writable.abort(error);
      } catch {
        /* writable may already be aborted by the browser */
      }
    }
    try {
      await dir.removeEntry(key);
    } catch {
      /* no committed partial file */
    }
    try {
      await dir.removeEntry(`${key}.meta.json`);
    } catch {
      /* no metadata sidecar */
    }
    throw error;
  }
}

export async function loadLocalVideo(sig: string): Promise<File | null> {
  const fromHandle = await loadFromHandle(sig);
  if (fromHandle) return fromHandle;
  const dir = await dirHandle();
  if (!dir) return null;
  try {
    const key = await sigKey(sig);
    try {
      const fh = await dir.getFileHandle(key);
      const stored = await fh.getFile();
      if (!stored.size) return null;
      const meta = await readStoredMeta(dir, key);
      return alignFileToSig(meta ? new File([stored], meta.name, { type: meta.type, lastModified: meta.lastModified }) : stored, sig);
    } catch {
      // One-time compatibility read for files written before keys became collision-safe hashes.
      // Validate metadata before migrating because the old sanitizer could collapse two CJK names.
      const oldKey = legacySigKey(sig);
      const oldHandle = await dir.getFileHandle(oldKey);
      const stored = await oldHandle.getFile();
      const meta = await readStoredMeta(dir, oldKey);
      const candidate = meta
        ? new File([stored], meta.name, { type: meta.type, lastModified: meta.lastModified })
        : stored;
      if (!stored.size || !(await fileMatchesSig(candidate, sig))) return null;
      const aligned = alignFileToSig(candidate, sig);
      const migrated = await saveLocalVideo(aligned, sig, undefined, { pinned: meta?.pinned });
      if (migrated) {
        try { await dir.removeEntry(oldKey); } catch { /* already absent */ }
        try { await dir.removeEntry(`${oldKey}.meta.json`); } catch { /* already absent */ }
      }
      return aligned;
    }
  } catch {
    return null;
  }
}

/** Rebuild a File so its identity (fileSig) MATCHES the sig it is stored/addressed under. Cloud-vault
 *  fetches and stale OPFS meta otherwise carry their own name/mtime — downstream that mints a NEW
 *  srcSig for the same bytes, which is exactly the "same asset shows twice" bug. Size mismatch =
 *  genuinely different bytes: returned as-is (callers' checks handle it). */
export function alignFileToSig(f: File, sig: string): File {
  const p = sig.split(':');
  const mt = Number(p[p.length - 1]);
  const size = Number(p[p.length - 2]);
  if (p.length < 3 || !Number.isFinite(mt) || f.size !== size) return f;
  if (fileSig(f) === sig) return rememberDurableFileSig(f, sig);
  return rememberDurableFileSig(
    new File([f], fileNameFromSig(sig), { type: f.type, lastModified: mt }),
    sig,
  );
}

/** Forced eviction (user deleted the asset): drop the bytes + meta sidecar. Same contract as LRU
 *  eviction — other projects referencing the sig degrade to the re-import prompt / cloud fallback. */
export async function deleteLocalVideo(sig: string): Promise<void> {
  await handleOp('readwrite', (st) => st.delete(sig)); // drop the native handle too (only our reference — the file on disk is untouched)
  const dir = await dirHandle();
  if (!dir) return;
  const key = await sigKey(sig);
  try {
    await dir.removeEntry(key);
  } catch {
    /* already gone */
  }
  try {
    await dir.removeEntry(`${key}.meta.json`);
  } catch {
    /* already gone */
  }
  const oldKey = legacySigKey(sig);
  if (oldKey !== key) {
    try { await dir.removeEntry(oldKey); } catch { /* already gone */ }
    try { await dir.removeEntry(`${oldKey}.meta.json`); } catch { /* already gone */ }
  }
}

/** LRU cleanup: keep the most recent ordinary files plus every pinned folder-input copy. */
async function prune(dir: FileSystemDirectoryHandle): Promise<void> {
  try {
    const files: { name: string; mtime: number; pinned: boolean }[] = [];
    const iter = (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values();
    for await (const h of iter) {
      if (h.kind !== 'file' || h.name.endsWith('.meta.json')) continue;
      const f = await (h as FileSystemFileHandle).getFile();
      const meta = await readStoredMeta(dir, h.name);
      files.push({ name: h.name, mtime: f.lastModified, pinned: meta?.pinned === true });
    }
    const ordinary = files.filter((file) => !file.pinned).sort((a, b) => b.mtime - a.mtime);
    for (const f of ordinary.slice(MAX_FILES)) {
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
