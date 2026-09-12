/**
 * Device byte cache for studio media (OPFS) + the ONE byte-resolution chain.
 *
 * The cloud rendezvous (content-addressed R2, see cloud-media) is the source of truth for bytes;
 * this module is the device-side cache so a project reopens instantly and offline. Everything is
 * best-effort: an unsupported/evicted/failed cache degrades to a cloud fetch, never worse.
 *
 * Storage key = a hash of the durable media signature (content fingerprint; legacy
 * name:size:lastModified locators remain readable). The File metadata in OPFS is what was written
 * to disk — on retrieval the File is rebuilt from the sidecar meta so fileSig(retrieved) === sig
 * (ASR/visual-analysis cache and autosave sig all depend on this identity).
 *
 * Native File System Access handles are NOT persisted anymore: re-granting read access after a
 * browser restart needs a user gesture, which is exactly the "authorize again" prompt this design
 * removes. Handles written by earlier versions are read only while the browser still reports the
 * permission as granted — silently, never prompting — and only as a byte cache.
 */

import { studioProviders } from '@pireel/studio-engine/providers';
import type { LocalAssetIndexEntry } from '@pireel/studio-engine/project-dto';
import { fileMatchesSig, fileNameFromSig, fileSig, isContentSig, rememberDurableFileSig, sigSize } from './media';

const DIR = 'local-videos';
// No count-based eviction: a project can legitimately hold a hundred local videos (a real 100-clip
// montage lost its 13th import to the old 12-file LRU). The browser's storage quota is the only cap;
// a failed write surfaces to the caller instead of silently evicting someone else's footage.

/* ---------- Legacy native handles (read-only, silent) ---------- */

interface PermHandle extends FileSystemFileHandle {
  queryPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
}

interface PermDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
}

const HANDLE_DB = 'studio-local-handles';
const HANDLE_STORE = 'handles';
const folderHandleKey = (folderId: string) => `folder:${folderId}`;
const legacyBindingKey = (projectId: string, assetId: string) => `asset:${projectId}:${assetId}`;

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

/** A handle counts only while the browser still reports read access as granted. No prompt, ever. */
async function grantedSilently(handle: PermHandle | PermDirectoryHandle): Promise<boolean> {
  try {
    return ((await handle.queryPermission?.({ mode: 'read' })) ?? 'granted') === 'granted';
  } catch {
    return false;
  }
}

async function loadFromLegacyHandle(sig: string, key = sig): Promise<File | null> {
  const h = (await handleOp('readonly', (st) => st.get(key))) as PermHandle | null;
  if (!h) return null;
  try {
    if (!(await grantedSilently(h))) return null;
    const f = await h.getFile();
    if (!(await fileMatchesSig(f, sig))) return null; // moved/renamed/edited on disk: identity broken → miss
    return f;
  } catch {
    return null;
  }
}

async function loadFromLegacyFolder(folderId: string, relativePath: string, sig: string): Promise<File | null> {
  const parts = relativePath.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) return null;
  const stored = (await handleOp('readonly', (st) => st.get(folderHandleKey(folderId)))) as PermDirectoryHandle | null;
  if (!stored) return null;
  try {
    if (!(await grantedSilently(stored))) return null;
    let cursor: FileSystemDirectoryHandle = stored;
    for (const segment of parts.slice(0, -1)) cursor = await cursor.getDirectoryHandle(segment);
    const handle = await cursor.getFileHandle(parts[parts.length - 1]!);
    const file = await handle.getFile();
    return (await fileMatchesSig(file, sig)) ? file : null;
  } catch {
    return null;
  }
}

/* ---------- OPFS cache ---------- */

interface StoredMeta {
  name: string;
  type: string;
  lastModified: number;
  /** Legacy flag from the handle era; ignored (every OPFS entry is a full copy now). */
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

export interface SaveLocalVideoOptions {
  /** @deprecated no-op since handles were retired; every entry is a full copy. */
  pinned?: boolean;
}

/** Cache a file's bytes on this device under its sig. Returns false when the cache is unavailable
 * or full — callers must treat that as "no local cache", not as a failed import. */
export async function saveLocalVideo(file: File, sig: string, _options?: SaveLocalVideoOptions): Promise<boolean> {
  file = alignFileToSig(file, sig); // stored meta must match the sig key, or later loads mint a different identity
  const dir = await dirHandle();
  if (!dir) return false;
  try {
    // Request persistence (best-effort): if denied, accept the risk of eviction
    void navigator.storage.persist?.().catch(() => {});
    const key = await sigKey(sig);
    try {
      const existing = await (await dir.getFileHandle(key)).getFile();
      if (existing.size === file.size) return true; // Same sig fully on disk: skip byte rewrite
      // Size mismatch = an interrupted earlier write; fall through and rewrite so the entry heals
    } catch {
      /* Not present → write it */
    }
    const meta: StoredMeta = { name: file.name, type: file.type, lastModified: file.lastModified };
    const fh = await dir.getFileHandle(key, { create: true });
    const w = await fh.createWritable();
    await w.write(file);
    await w.close();
    await writeStoredMeta(dir, key, meta);
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
  /** @deprecated no-op. */
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

/** Stream a response straight into OPFS. This deliberately accepts a stream rather than a Blob/File
 * so multi-GB cloud retrievals never need a second full-size browser memory buffer. */
export async function saveLocalStream(
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
  sig: string,
  options: SaveLocalStreamOptions,
): Promise<File> {
  const dir = await dirHandle();
  if (!dir) {
    // Private browsing/embedded webviews may expose no OPFS. Cloud bytes must still be usable;
    // the cache is optional, so retain this retrieval in a session File instead.
    const chunks: BlobPart[] = [];
    await consumeLocalStream(stream, options.expectedSize ?? null, async (chunk) => { chunks.push(chunk); });
    return alignFileToSig(new File(chunks, options.name || 'import', { type: options.type || 'application/octet-stream' }), sig);
  }

  void navigator.storage.persist?.().catch(() => {});
  const key = await sigKey(sig);
  const expectedSize = options.expectedSize ?? null;
  const sigParts = sig.split(':');
  const sigMtime = isContentSig(sig) ? Number.NaN : Number(sigParts[sigParts.length - 1]);
  const meta: StoredMeta = {
    name: options.name || 'import',
    type: options.type || 'application/octet-stream',
    lastModified: Number.isSafeInteger(sigMtime) && sigMtime >= 0 ? sigMtime : Date.now(),
  };

  // The same request may be retried. Consume and validate it, but keep an already-complete OPFS
  // entry untouched so a broken retry cannot destroy the good local copy.
  if (expectedSize != null) {
    let existing: File | null = null;
    try {
      existing = await (await dir.getFileHandle(key)).getFile();
    } catch {
      /* missing entry */
    }
    if (existing?.size === expectedSize) {
      await consumeLocalStream(stream, expectedSize);
      await writeStoredMeta(dir, key, meta);
      return alignFileToSig(new File([existing], meta.name, { type: meta.type, lastModified: meta.lastModified }), sig);
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
    const stored = await fh.getFile();
    return alignFileToSig(new File([stored], meta.name, { type: meta.type, lastModified: meta.lastModified }), sig);
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

async function loadFromOpfs(sig: string): Promise<File | null> {
  const dir = await dirHandle();
  if (!dir) return null;
  try {
    const key = await sigKey(sig);
    try {
      const fh = await dir.getFileHandle(key);
      const stored = await fh.getFile();
      const expectedSize = sigSize(sig);
      if (!stored.size || (expectedSize != null && stored.size !== expectedSize)) return null;
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
      const migrated = await saveLocalVideo(aligned, sig);
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

/** Is this sig cached on the device (OPFS)? Cheap existence check without materializing a File. */
export async function hasLocalVideo(sig: string): Promise<boolean> {
  const dir = await dirHandle();
  if (!dir) return false;
  try {
    const stored = await (await dir.getFileHandle(await sigKey(sig))).getFile();
    const expected = sigSize(sig);
    return stored.size > 0 && (expected == null || stored.size === expected);
  } catch {
    return false;
  }
}

async function loadFromDeviceProvider(sig: string): Promise<File | null> {
  const provider = studioProviders().localBytes;
  if (!provider) return null;
  try {
    const found = await provider.resolve(sig);
    if (!found) return null;
    if (found instanceof File) return alignFileToSig(found, sig);
    const response = await fetch(found.url);
    if (!response.ok) return null;
    return alignFileToSig(new File([await response.blob()], fileNameFromSig(sig) || 'media'), sig);
  } catch {
    return null;
  }
}

/** Device-only lanes: OPFS cache → desktop provider → legacy granted handle. Never prompts, never
 * touches the network. Use resolveAssetBytes when the cloud copy is an acceptable source. */
export async function loadLocalVideo(sig: string): Promise<File | null> {
  return (await loadFromOpfs(sig)) ?? (await loadFromDeviceProvider(sig)) ?? loadFromLegacyHandle(sig);
}

export interface ResolveAssetBytesOptions {
  /** Skip the cloud lane (cheap device-only probe). */
  deviceOnly?: boolean;
  /** Legacy project-scoped handle key from the handle era. */
  projectId?: string;
}

/** THE byte-resolution chain for one project asset: device cache → desktop provider → legacy
 * silent handle/folder → cloud rendezvous (by cloudKey, or by sig when a copy is known to exist).
 * Cloud retrievals are written back into the OPFS cache so the next open is instant. */
export async function resolveAssetBytes(
  entry: Pick<LocalAssetIndexEntry, 'assetId' | 'contentSig' | 'cloudKey' | 'folder' | 'label'>,
  options?: ResolveAssetBytesOptions,
): Promise<File | null> {
  const sig = entry.contentSig;
  const device = (await loadLocalVideo(sig))
    ?? (options?.projectId ? await loadFromLegacyHandle(sig, legacyBindingKey(options.projectId, entry.assetId)) : null)
    ?? (entry.folder ? await loadFromLegacyFolder(entry.folder.id, entry.folder.path, sig) : null);
  if (device) return device;
  if (options?.deviceOnly || !entry.cloudKey) return null;
  const cloud = await studioProviders().vault.fetch(sig, { cloudKey: entry.cloudKey, label: entry.label });
  if (!cloud) return null;
  const aligned = alignFileToSig(cloud, sig, entry.label);
  void saveLocalVideo(aligned, sig);
  return aligned;
}

/** Library cards need a URL, not a full media download. Hosts without a lightweight read-link
 * capability retain the existing byte-resolution fallback. */
export async function resolveAssetPreview(
  entry: Pick<LocalAssetIndexEntry, 'assetId' | 'contentSig' | 'cloudKey' | 'folder' | 'label'>,
  options?: ResolveAssetBytesOptions,
): Promise<{ file: File | null; url: string | null }> {
  const previewUrl = studioProviders().vault.previewUrl;
  const file = await resolveAssetBytes(entry, { ...options, deviceOnly: Boolean(previewUrl) });
  const url = !file && entry.cloudKey && previewUrl
    ? await previewUrl(entry.contentSig, { cloudKey: entry.cloudKey })
    : null;
  return { file, url };
}

/** @deprecated use resolveAssetBytes; kept for call sites that still pass a projectId first. */
export async function loadLocalAssetFile(
  projectId: string | undefined,
  entry: Pick<LocalAssetIndexEntry, 'assetId' | 'contentSig' | 'cloudKey' | 'folder' | 'label'>,
): Promise<File | null> {
  return resolveAssetBytes(entry, { projectId });
}

/** Rebuild a File so its identity (fileSig) MATCHES the sig it is stored/addressed under. Cloud
 *  fetches and stale OPFS meta otherwise carry their own name/mtime — downstream that mints a NEW
 *  srcSig for the same bytes, which is exactly the "same asset shows twice" bug. Size mismatch =
 *  genuinely different bytes: returned as-is (callers' checks handle it). For name-free content
 *  sigs the display name comes from `label` (or stays as is). */
export function alignFileToSig(f: File, sig: string, label?: string): File {
  const size = sigSize(sig);
  if (size != null && f.size !== size) return f;
  if (isContentSig(sig)) {
    if (label && f.name !== label) return rememberDurableFileSig(new File([f], label, { type: f.type, lastModified: f.lastModified }), sig);
    return rememberDurableFileSig(f, sig);
  }
  const p = sig.split(':');
  const mt = Number(p[p.length - 1]);
  if (p.length < 3 || !Number.isFinite(mt)) {
    // Opaque locator (e.g. `gen:<key>` for generated media): no name/mtime to restore, just bind.
    if (label && f.name !== label) return rememberDurableFileSig(new File([f], label, { type: f.type, lastModified: f.lastModified }), sig);
    return rememberDurableFileSig(f, sig);
  }
  if (fileSig(f) === sig) return rememberDurableFileSig(f, sig);
  return rememberDurableFileSig(
    new File([f], fileNameFromSig(sig), { type: f.type, lastModified: mt }),
    sig,
  );
}

/** Forced eviction (user deleted the asset): drop the bytes + meta sidecar and any legacy handle.
 *  Other projects referencing the sig fall back to the cloud copy. */
export async function deleteLocalVideo(sig: string): Promise<void> {
  await handleOp('readwrite', (st) => st.delete(sig)); // legacy handle reference only — the file on disk is untouched
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
