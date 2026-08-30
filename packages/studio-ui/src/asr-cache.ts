/**
 * Persistent cache of ASR results (IndexedDB, keyed by file identity).
 * The same narration gets reused repeatedly — transcribe once, then import/refresh/return all hit
 * instantly, no repeat ASR spend. Formerly localStorage: multi-video projects filled the shared
 * ~5MB origin quota (drafts + transcripts) and writes started failing silently, so every reopen
 * paid for ASR again. The one-time sweep below also reclaims that space for project drafts.
 */

import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { kvDelete, kvGet, kvSet } from './idb-kv';

const PREFIX = 'asr:';
const LEGACY_LOCALSTORAGE_PREFIX = 'pinshot:studio:asr:';

/** One-time storage move: copy every legacy entry into IndexedDB, then delete it. Migrating
 * before deleting keeps every already-transcribed source free through the move, and the deletes
 * hand the reclaimed localStorage quota back to project drafts. */
let sweepPromise: Promise<void> | null = null;
function sweepLegacyLocalStorage(): Promise<void> {
  if (sweepPromise) return sweepPromise;
  sweepPromise = (async () => {
    if (typeof localStorage === 'undefined') return;
    try {
      const doomed: string[] = [];
      const migrations: Promise<void>[] = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith(LEGACY_LOCALSTORAGE_PREFIX)) continue;
        doomed.push(key);
        try {
          const value = JSON.parse(localStorage.getItem(key) ?? 'null');
          if (Array.isArray(value)) migrations.push(kvSet(PREFIX + key.slice(LEGACY_LOCALSTORAGE_PREFIX.length), value));
        } catch {
          /* corrupt entry: drop it */
        }
      }
      await Promise.all(migrations);
      doomed.forEach((key) => localStorage.removeItem(key));
    } catch {
      /* storage unavailable */
    }
  })();
  return sweepPromise;
}

export async function getCachedAsr(url: string): Promise<AsrSegment[] | null> {
  if (!url) return null;
  await sweepLegacyLocalStorage();
  const value = await kvGet(PREFIX + url);
  return Array.isArray(value) ? (value as AsrSegment[]) : null;
}

export function setCachedAsr(url: string, segs: AsrSegment[]): void {
  if (!url) return;
  void sweepLegacyLocalStorage();
  void kvSet(PREFIX + url, segs);
}

/** Explicit invalidation for a source whose cached transcript failed native timeline relay. */
export function deleteCachedAsr(url: string): void {
  if (!url) return;
  void kvDelete(PREFIX + url);
}
