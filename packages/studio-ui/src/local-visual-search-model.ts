'use client';

/**
 * Lazily loaded browser-side vision encoder used by local asset search.
 *
 * The model is deliberately not part of StudioBoot: metadata search, Cloud/Official search and
 * every editing capability keep working without it. Mounting the Local assets area downloads one
 * versioned model into Cache Storage in the background; later local indexing code reads that exact cached response through
 * getLocalVisualModelResponse(). The matching text encoder remains a server concern, so local
 * files never need to leave the browser.
 */

import { useEffect, useSyncExternalStore } from 'react';

export const LOCAL_VISUAL_MODEL = {
  id: 'clip-vit-base-patch32-vision-int8',
  revision: '6ef1ebc8b0766a7a8d11b146462c99cdf74dd22d',
  bytes: 89_117_001,
  hostedPath: '/models/clip-vit-base-patch32-vision-int8.onnx',
  upstreamUrl:
    'https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/6ef1ebc8b0766a7a8d11b146462c99cdf74dd22d/onnx/vision_model_quantized.onnx?download=true',
  sha256: '583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299',
} as const;

const CACHE_NAME = 'pireel-local-visual-models-v1';
const RECEIPT_KEY = 'studio.localVisualSearch.model.v1';
const CACHE_KEY_PATH = `/__pireel_local_models__/${LOCAL_VISUAL_MODEL.id}/${LOCAL_VISUAL_MODEL.revision}`;

let assetBase = '';

/** Hosted shells point this at their immutable static CDN. The pinned upstream remains a fallback
 * until the same file has been mirrored; OSS shells can use the upstream directly. */
export function setLocalVisualModelAssetBase(base: string): void {
  assetBase = base.replace(/\/+$/, '');
}

export function localVisualModelSources(): string[] {
  const hosted = assetBase ? `${assetBase}${LOCAL_VISUAL_MODEL.hostedPath}` : null;
  return hosted ? [hosted, LOCAL_VISUAL_MODEL.upstreamUrl] : [LOCAL_VISUAL_MODEL.upstreamUrl];
}

export type LocalVisualModelPhase = 'checking' | 'not-installed' | 'downloading' | 'ready' | 'error' | 'unsupported';

export interface LocalVisualModelSnapshot {
  phase: LocalVisualModelPhase;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
}

interface InstallReceipt {
  modelId: string;
  revision: string;
  bytes: number;
}

const hasBrowserStorage = () =>
  typeof window !== 'undefined' && typeof globalThis.caches !== 'undefined' && typeof globalThis.localStorage !== 'undefined';

function readReceipt(): InstallReceipt | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const value = JSON.parse(localStorage.getItem(RECEIPT_KEY) ?? 'null') as Partial<InstallReceipt> | null;
    if (
      value?.modelId === LOCAL_VISUAL_MODEL.id &&
      value.revision === LOCAL_VISUAL_MODEL.revision &&
      value.bytes === LOCAL_VISUAL_MODEL.bytes
    ) return value as InstallReceipt;
  } catch {
    // Corrupt or stale receipts are treated as not installed; the model cache is checked below.
  }
  return null;
}

function writeReceipt(): void {
  localStorage.setItem(
    RECEIPT_KEY,
    JSON.stringify({ modelId: LOCAL_VISUAL_MODEL.id, revision: LOCAL_VISUAL_MODEL.revision, bytes: LOCAL_VISUAL_MODEL.bytes }),
  );
}

function clearReceipt(): void {
  try {
    localStorage.removeItem(RECEIPT_KEY);
  } catch {
    // Storage can be denied in hardened/private contexts; the in-memory state still remains valid.
  }
}

const initialPhase = (): LocalVisualModelPhase => {
  if (typeof window === 'undefined') return 'not-installed';
  if (!hasBrowserStorage()) return 'unsupported';
  return readReceipt() ? 'ready' : 'checking';
};

let snapshot: LocalVisualModelSnapshot = {
  phase: initialPhase(),
  progress: readReceipt() ? 1 : 0,
  downloadedBytes: readReceipt() ? LOCAL_VISUAL_MODEL.bytes : 0,
  totalBytes: LOCAL_VISUAL_MODEL.bytes,
};
const listeners = new Set<() => void>();
let checkPromise: Promise<LocalVisualModelSnapshot> | null = null;
let downloadPromise: Promise<LocalVisualModelSnapshot> | null = null;

function publish(next: LocalVisualModelSnapshot): LocalVisualModelSnapshot {
  snapshot = next;
  listeners.forEach((listener) => listener());
  return snapshot;
}

export const getLocalVisualModelSnapshot = (): LocalVisualModelSnapshot => snapshot;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const serverSnapshot: LocalVisualModelSnapshot = {
  phase: 'not-installed',
  progress: 0,
  downloadedBytes: 0,
  totalBytes: LOCAL_VISUAL_MODEL.bytes,
};

export function useLocalVisualModel(): LocalVisualModelSnapshot {
  const value = useSyncExternalStore(subscribe, getLocalVisualModelSnapshot, () => serverSnapshot);
  useEffect(() => {
    void ensureLocalVisualModel();
  }, []);
  return value;
}

function cacheKey(): Request {
  const origin = typeof location !== 'undefined' ? location.origin : 'https://local.pireel.invalid';
  return new Request(`${origin}${CACHE_KEY_PATH}`);
}

export interface LocalVisualModelDownloadStore {
  put(response: Response): Promise<void>;
  delete(): Promise<void>;
}

export interface DownloadLocalVisualModelOptions {
  sources: readonly string[];
  expectedBytes: number;
  fetchImpl?: typeof fetch;
  store: LocalVisualModelDownloadStore;
  onProgress?: (downloadedBytes: number, totalBytes: number) => void;
}

/** Stream one of the ordered sources into persistent storage without buffering the 89 MB model in
 * JS memory. Exact byte validation catches CDN error pages and Git-LFS pointer responses. */
export async function downloadLocalVisualModel({
  sources,
  expectedBytes,
  fetchImpl = fetch,
  store,
  onProgress,
}: DownloadLocalVisualModelOptions): Promise<{ source: string; bytes: number }> {
  let lastError: unknown = new Error('No model download source configured');
  for (const source of sources) {
    try {
      const response = await fetchImpl(source, { credentials: 'omit', mode: 'cors', cache: 'no-store' });
      if (!response.ok || !response.body) throw new Error(`Model download failed (${response.status})`);

      const [progressBody, cacheBody] = response.body.tee();
      let cacheError: unknown = null;
      const storedResponse = new Response(cacheBody, {
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': String(expectedBytes),
          'x-pireel-model-source': source,
        },
      });
      const putPromise = store.put(storedResponse).catch((error) => {
        cacheError = error;
      });

      let downloadedBytes = 0;
      const reader = progressBody.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        downloadedBytes += value.byteLength;
        onProgress?.(downloadedBytes, expectedBytes);
      }
      await putPromise;
      if (cacheError) throw cacheError;
      if (downloadedBytes !== expectedBytes) {
        throw new Error(`Model size mismatch (${downloadedBytes}/${expectedBytes})`);
      }
      onProgress?.(expectedBytes, expectedBytes);
      return { source, bytes: downloadedBytes };
    } catch (error) {
      lastError = error;
      await store.delete().catch(() => {});
    }
  }
  throw lastError;
}

export async function checkLocalVisualModel(): Promise<LocalVisualModelSnapshot> {
  if (downloadPromise) return downloadPromise;
  if (checkPromise) return checkPromise;
  checkPromise = (async () => {
    if (!hasBrowserStorage()) {
      return publish({ ...serverSnapshot, phase: 'unsupported' });
    }
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(cacheKey());
    if (!response) {
      clearReceipt();
      return publish({ ...serverSnapshot, phase: 'not-installed' });
    }
    writeReceipt();
    return publish({
      phase: 'ready',
      progress: 1,
      downloadedBytes: LOCAL_VISUAL_MODEL.bytes,
      totalBytes: LOCAL_VISUAL_MODEL.bytes,
    });
  })()
    .catch((error) => publish({
      ...serverSnapshot,
      phase: 'error',
      error: error instanceof Error ? error.message : String(error),
    }))
    .finally(() => {
      checkPromise = null;
    });
  return checkPromise;
}

/** Starts the actual transfer. Kept separate from ensureLocalVisualModel so an existing cache is
 * always checked before any network request. */
async function downloadAndCacheLocalVisualModel(): Promise<LocalVisualModelSnapshot> {
  if (downloadPromise) return downloadPromise;
  if (!hasBrowserStorage()) return publish({ ...serverSnapshot, phase: 'unsupported' });

  downloadPromise = (async () => {
    const cache = await caches.open(CACHE_NAME);
    publish({ ...serverSnapshot, phase: 'downloading' });
    await downloadLocalVisualModel({
      sources: localVisualModelSources(),
      expectedBytes: LOCAL_VISUAL_MODEL.bytes,
      store: {
        put: (response) => cache.put(cacheKey(), response),
        delete: async () => {
          await cache.delete(cacheKey());
        },
      },
      onProgress: (downloadedBytes, totalBytes) => publish({
        phase: 'downloading',
        progress: Math.min(1, downloadedBytes / totalBytes),
        downloadedBytes,
        totalBytes,
      }),
    });
    writeReceipt();
    return publish({
      phase: 'ready',
      progress: 1,
      downloadedBytes: LOCAL_VISUAL_MODEL.bytes,
      totalBytes: LOCAL_VISUAL_MODEL.bytes,
    });
  })()
    .catch((error) => {
      clearReceipt();
      return publish({
        ...serverSnapshot,
        phase: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      downloadPromise = null;
    });
  return downloadPromise;
}

/** Mount-time entry point for Local assets. Chat only reads the snapshot and never awaits or starts
 * this work, so a slow/offline model download cannot block an agent tool result. */
export async function ensureLocalVisualModel(): Promise<LocalVisualModelSnapshot> {
  const checked = await checkLocalVisualModel();
  if (checked.phase === 'ready' || checked.phase === 'unsupported') return checked;
  return downloadAndCacheLocalVisualModel();
}

/** Inference/indexing code consumes the same versioned cache entry; it never refetches by URL. */
export async function getLocalVisualModelResponse(): Promise<Response | null> {
  if (!hasBrowserStorage()) return null;
  const cache = await caches.open(CACHE_NAME);
  return (await cache.match(cacheKey())) ?? null;
}
