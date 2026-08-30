/**
 * Dev-console entry for the derived-media caches. Cached reviews are content-addressed and
 * normally never need touching, but policy changes in the CONSUMER of cached review data (e.g.
 * candidate-selection rules) can leave stale pruned results pinned; a full refresh forces the
 * next run to re-review. Both tiers must be wiped together — clearing only the browser tier
 * would let the server tier re-hydrate the stale entries on the next lookup.
 *
 * Registered on globalThis in dev builds only:
 *   pireelStudioDev.clearReviewCache()  — visual reviews (IndexedDB + server), next run re-reviews
 *   pireelStudioDev.clearTtsCache()     — TTS receipts, next run re-synthesizes
 */

import { kvDeleteByPrefix } from './idb-kv';
import { remoteDerivedClear, type DerivedCacheKind } from './derived-cache-remote';

const LOCAL_PREFIX: Record<DerivedCacheKind, string> = {
  'visual-review': 'review:',
  tts: 'tts:',
};

async function clearDerivedCache(kind: DerivedCacheKind): Promise<{ local: number; server: number }> {
  const [local, server] = await Promise.all([
    kvDeleteByPrefix(LOCAL_PREFIX[kind]),
    remoteDerivedClear(kind),
  ]);
  const summary = { local, server };
  console.info(`[studio] cleared ${kind} cache`, summary);
  return summary;
}

export function registerStudioDevCacheTools(): void {
  try {
    if (!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) return;
    (globalThis as Record<string, unknown>).pireelStudioDev = {
      clearReviewCache: () => clearDerivedCache('visual-review'),
      clearTtsCache: () => clearDerivedCache('tts'),
    };
  } catch {
    /* non-browser host */
  }
}
