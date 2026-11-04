/** Device cache policy. Unconfirmed files are working data, never eviction candidates. */
export const MEDIA_CACHE_MAX_BYTES = 2 * 1024 ** 3;
export const MEDIA_CACHE_RECENT_MS = 5 * 60_000;
export interface MediaCacheEntry {
  key: string;
  bytes: number;
  lastAccess: number;
  cloudConfirmed: boolean;
}
export interface AdditionalMediaCacheEntry extends MediaCacheEntry {
  /** Must recheck durable confirmation and last access before deleting. */
  remove(): Promise<number>;
}
const additionalStores = new Map<string, () => Promise<AdditionalMediaCacheEntry[]>>();
export function registerMediaCacheStore(id: string, list: () => Promise<AdditionalMediaCacheEntry[]>): void { additionalStores.set(id, list); }
export async function additionalMediaCacheEntries(): Promise<AdditionalMediaCacheEntry[]> {
  return (await Promise.all([...additionalStores.values()].map(list => list().catch(() => [])))).flat();
}

export function mediaCacheEvictionPlan(entries: MediaCacheEntry[], estimate: StorageEstimate, incomingBytes = 0, force = false, now = Date.now()) {
  const quota = estimate.quota && Number.isFinite(estimate.quota) ? estimate.quota : undefined;
  const budget = Math.min(MEDIA_CACHE_MAX_BYTES, quota ? quota * .1 : MEDIA_CACHE_MAX_BYTES);
  const bytes = entries.reduce((total, entry) => total + entry.bytes, 0);
  const usage = estimate.usage ?? bytes;
  const cachePressure = bytes + incomingBytes >= budget * .9;
  const originPressure = !!quota && usage + incomingBytes >= quota * .85;
  if (!force && !cachePressure && !originPressure) return { reclaimBytes: 0, candidates: [] as MediaCacheEntry[] };
  const reclaimBytes = Math.max(
    cachePressure ? bytes + incomingBytes - budget * .7 : 0,
    originPressure ? usage + incomingBytes - quota! * .7 : 0,
    force ? Math.max(incomingBytes, budget * .2) : 0,
  );
  const candidates = entries.filter(entry => entry.cloudConfirmed && entry.lastAccess < now - MEDIA_CACHE_RECENT_MS)
    .sort((a, b) => a.lastAccess - b.lastAccess || b.bytes - a.bytes);
  return { reclaimBytes, candidates };
}

const sessions = new Set<Map<string, () => void>>();
const inUseLockName = (key: string) => `studio:media-cache:use:${key}`;

/** Every file touched by an open editor stays pinned until that editor closes. Web Locks also
 * protect readers in other tabs, and the browser releases locks if a tab crashes. */
export function beginMediaCacheSession(): () => void {
  const held = new Map<string, () => void>();
  sessions.add(held);
  return () => { sessions.delete(held); for (const release of held.values()) release(); held.clear(); };
}

export function protectMediaCacheEntry(key: string): void {
  if (typeof navigator === 'undefined' || !navigator.locks) return;
  for (const held of sessions) {
    if (held.has(key)) continue;
    let release!: () => void;
    const untilClosed = new Promise<void>(resolve => { release = resolve; });
    held.set(key, release);
    void navigator.locks.request(inUseLockName(key), { mode: 'shared' }, () => untilClosed).catch(() => {});
  }
}

export async function withMediaCacheRead<T>(key: string, work: () => Promise<T>): Promise<T> {
  protectMediaCacheEntry(key);
  if (typeof navigator === 'undefined' || !navigator.locks) return work();
  return navigator.locks.request(inUseLockName(key), { mode: 'shared' }, work);
}

/** Without cross-tab coordination, do not automatically delete files. */
export async function evictUnusedMediaEntry(key: string, remove: () => Promise<number>): Promise<number> {
  if (typeof navigator === 'undefined' || !navigator.locks) return 0;
  return navigator.locks.request(inUseLockName(key), { mode: 'exclusive', ifAvailable: true }, lock => lock ? remove() : Promise.resolve(0));
}
