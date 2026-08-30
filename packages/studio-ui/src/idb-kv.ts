/**
 * Minimal promise KV over IndexedDB for content-addressed generation caches (editorial reviews,
 * TTS receipts). These entries are 1–20KB each; localStorage shares a ~5MB origin quota with
 * project drafts and transcript caches and overflows in practice, so caches that grow with the
 * media library live here instead. Absence of IndexedDB (tests, exotic embeds) degrades to a
 * process-local map — same semantics, no persistence.
 */

const DB_NAME = 'pinshot-studio-cache';
const STORE = 'kv';

export interface KvBackend {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys?(): Promise<string[]>;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexeddb open failed'));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbPromise ??= openDb().catch((error) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

function request<T>(build: (store: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode): Promise<T> {
  return db().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const req = build(transaction.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexeddb request failed'));
  }));
}

function makeIdbBackend(): KvBackend {
  return {
    get: (key) => request((store) => store.get(key), 'readonly'),
    set: (key, value) => request((store) => store.put(value, key), 'readwrite').then(() => undefined),
    delete: (key) => request((store) => store.delete(key), 'readwrite').then(() => undefined),
    keys: () => request((store) => store.getAllKeys(), 'readonly').then((keys) => keys.map(String)),
  };
}

function makeMemoryBackend(): KvBackend {
  const values = new Map<string, unknown>();
  return {
    get: async (key) => values.get(key),
    set: async (key, value) => void values.set(key, value),
    delete: async (key) => void values.delete(key),
    keys: async () => [...values.keys()],
  };
}

let backend: KvBackend | null = null;
function resolveBackend(): KvBackend {
  if (backend) return backend;
  backend = typeof indexedDB === 'undefined' ? makeMemoryBackend() : makeIdbBackend();
  return backend;
}

export async function kvGet(key: string): Promise<unknown> {
  try {
    return await resolveBackend().get(key);
  } catch {
    return undefined;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    await resolveBackend().set(key, value);
  } catch {
    // Storage unavailable: the cache degrades to paying for the generation again.
  }
}

export async function kvDelete(key: string): Promise<void> {
  try {
    await resolveBackend().delete(key);
  } catch {
    /* nothing to invalidate */
  }
}

/** Delete every entry under a key prefix; returns how many were removed. */
export async function kvDeleteByPrefix(prefix: string): Promise<number> {
  try {
    const store = resolveBackend();
    const keys = (await store.keys?.()) ?? [];
    const doomed = keys.filter((key) => key.startsWith(prefix));
    await Promise.all(doomed.map((key) => store.delete(key)));
    return doomed.length;
  } catch {
    return 0;
  }
}

/** Tests only: swap in a deterministic in-memory backend. */
export function __setKvBackendForTest(next: KvBackend | null): void {
  backend = next;
}
