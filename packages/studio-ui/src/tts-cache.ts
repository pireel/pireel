/**
 * Persistent cache of generated-speech results (IndexedDB, keyed by the acoustic request).
 * Re-running a workflow re-synthesizes the same script with the same voice again and again;
 * content-addressing the request lets every rerun reuse the already-uploaded audio instead of
 * paying the TTS provider once per debugging round. The stored value is the provider's asset
 * receipt (CDN url + measured duration), so a hit is byte-identical to a fresh generation.
 */

import { kvDelete, kvGet, kvSet } from './idb-kv';
import { remoteDerivedGet, remoteDerivedPut } from './derived-cache-remote';

const PREFIX = 'tts:';
const LEGACY_LOCALSTORAGE_PREFIX = 'pinshot:studio:tts:';

/** One-time reclaim of the earlier localStorage revision (shared quota overflowed in practice). */
let legacySwept = false;
function sweepLegacyLocalStorage(): void {
  if (legacySwept || typeof localStorage === 'undefined') return;
  legacySwept = true;
  try {
    const doomed: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(LEGACY_LOCALSTORAGE_PREFIX)) doomed.push(key);
    }
    doomed.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* storage unavailable */
  }
}

/** Fields that do not change the synthesized audio and must not break the cache key. */
const NON_ACOUSTIC_FIELDS = new Set(['name', 'label']);

export interface CachedTtsAsset {
  id: string;
  kind: 'audio';
  key?: string;
  url: string;
  mime: string;
  label?: string | null;
  model: string;
  voiceId: string;
  voiceLabel: string;
  transcriptText: string;
  charCount: number;
  durationSec: number;
  estimatedDurationSec: number;
}

/** Canonical, order-insensitive key over every acoustic-relevant request field. */
export function ttsCacheKey(request: Record<string, unknown>): string {
  const entries = Object.entries(request)
    .filter(([key, value]) => value != null && !NON_ACOUSTIC_FIELDS.has(key))
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const canonical = JSON.stringify(entries);
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash = Math.imul(hash ^ canonical.charCodeAt(index), 0x01000193);
  }
  // Two hash passes over the same bytes (second with a different seed) keep the key short while
  // making accidental collisions across different scripts vanishingly unlikely for a local cache.
  let hash2 = 0x9747b28c;
  for (let index = canonical.length - 1; index >= 0; index -= 1) {
    hash2 = Math.imul(hash2 ^ canonical.charCodeAt(index), 0x01000193);
  }
  return `${(hash >>> 0).toString(36)}_${(hash2 >>> 0).toString(36)}_${canonical.length.toString(36)}`;
}

const validTtsAsset = (value: unknown): value is CachedTtsAsset => {
  const asset = value as CachedTtsAsset | undefined;
  return !!asset && typeof asset.url === 'string' && Number.isFinite(asset.durationSec);
};

export async function getCachedTts(key: string): Promise<CachedTtsAsset | null> {
  if (!key) return null;
  sweepLegacyLocalStorage();
  const value = await kvGet(PREFIX + key);
  if (validTtsAsset(value)) return value;
  // L1 miss → server L2 (survives device switches and cleared browser data); hydrate L1 on hit.
  const remote = await remoteDerivedGet('tts', key);
  if (!validTtsAsset(remote)) return null;
  void kvSet(PREFIX + key, remote);
  return remote;
}

export function setCachedTts(key: string, asset: CachedTtsAsset): void {
  if (!key) return;
  sweepLegacyLocalStorage();
  remoteDerivedPut('tts', key, asset);
  void kvSet(PREFIX + key, asset);
}

export function deleteCachedTts(key: string): void {
  if (!key) return;
  void kvDelete(PREFIX + key);
}
