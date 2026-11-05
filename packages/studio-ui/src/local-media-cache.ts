/**
 * Device cache policy. Editing in the browser reads its media from this device, so:
 * - whatever an open page has read stays cached while it is open;
 * - when a page closes, media no open page uses and nobody opened for a week is cleared;
 * - when new media does not fit, the media used longest ago (and not open) makes room.
 * Media the cloud does not hold yet is the only copy and is never cleared.
 */
export const MEDIA_CACHE_MAX_BYTES = 2 * 1024 ** 3;
/** Media not opened for this long is cleared when a page closes. */
export const MEDIA_CACHE_IDLE_MS = 7 * 24 * 60 * 60_000;
export interface MediaCacheEntry {
  key: string;
  bytes: number;
  lastAccess: number;
  cloudConfirmed: boolean;
}
export interface AdditionalMediaCacheEntry extends MediaCacheEntry {
  /** Must recheck durable confirmation before deleting. */
  remove(): Promise<number>;
}
const additionalStores = new Map<string, () => Promise<AdditionalMediaCacheEntry[]>>();
export function registerMediaCacheStore(id: string, list: () => Promise<AdditionalMediaCacheEntry[]>): void { additionalStores.set(id, list); }
export async function additionalMediaCacheEntries(): Promise<AdditionalMediaCacheEntry[]> {
  return (await Promise.all([...additionalStores.values()].map(list => list().catch(() => [])))).flat();
}

/** How much to clear for new media to fit, and what may go, used longest ago first. */
export function mediaCacheEvictionPlan(entries: MediaCacheEntry[], estimate: StorageEstimate, incomingBytes = 0, force = false) {
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
  const candidates = entries.filter(entry => entry.cloudConfirmed).sort((a, b) => a.lastAccess - b.lastAccess || b.bytes - a.bytes);
  return { reclaimBytes, candidates };
}

/** Media nobody has opened for a week, cleared when a page closes. */
export function idleMediaCacheEntries<T extends MediaCacheEntry>(entries: T[], now = Date.now()): T[] {
  return entries.filter(entry => entry.cloudConfirmed && entry.lastAccess < now - MEDIA_CACHE_IDLE_MS);
}

type Held = Map<string, () => void>;
/** The pages open in this tab, each with the media it has read. */
const pages = new Set<Held>();
/** Media read while no page is open stays for the life of the tab. */
const tab: Held = new Map();
const inUseLockName = (key: string) => `studio:media-cache:use:${key}`;

/** A page opens: what it reads stays cached until it closes (`close` lets it go). Web Locks hold it
 *  against clearing from other tabs too, and the browser lets go if the tab closes or crashes. */
export function openMediaCachePage(): () => void {
  const held: Held = new Map();
  pages.add(held);
  return () => { pages.delete(held); for (const release of held.values()) release(); held.clear(); };
}

/** Keep this media for every open page, or for the tab when no page is open. */
export function protectMediaCacheEntry(key: string): void {
  if (typeof navigator === 'undefined' || !navigator.locks) return;
  for (const held of pages.size ? pages : [tab]) {
    if (held.has(key)) continue;
    let release!: () => void;
    const untilClosed = new Promise<void>(resolve => { release = resolve; });
    held.set(key, release);
    void navigator.locks.request(inUseLockName(key), { mode: 'shared' }, () => untilClosed).catch(() => {});
  }
}

/** Read or write media without it being cleared meanwhile. */
export async function withMediaCacheRead<T>(key: string, work: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) return work();
  return navigator.locks.request(inUseLockName(key), { mode: 'shared' }, work);
}

/** Clear media only when no page in any tab holds it; without cross-tab coordination, never. */
export async function evictUnusedMediaEntry(key: string, remove: () => Promise<number>): Promise<number> {
  if (typeof navigator === 'undefined' || !navigator.locks) return 0;
  return navigator.locks.request(inUseLockName(key), { mode: 'exclusive', ifAvailable: true }, lock => lock ? remove() : Promise.resolve(0));
}
