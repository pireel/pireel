/**
 * Persistent cache of ASR results (localStorage, keyed by video URL).
 * The same narration gets reused repeatedly — transcribe once, then import/refresh/return all hit instantly, no repeat ASR spend.
 */

import type { AsrSegment } from '@pireel/studio-engine/build-blocks';

const PREFIX = 'pinshot:studio:asr:';

export function getCachedAsr(url: string): AsrSegment[] | null {
  if (!url || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PREFIX + url);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as AsrSegment[]) : null;
  } catch {
    return null;
  }
}

export function setCachedAsr(url: string, segs: AsrSegment[]): void {
  if (!url || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PREFIX + url, JSON.stringify(segs));
  } catch {
    // Quota full / private mode: degrade silently (still in memory)
  }
}

/** Explicit invalidation for a source whose cached transcript failed native timeline relay. */
export function deleteCachedAsr(url: string): void {
  if (!url || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(PREFIX + url);
  } catch {
    // Storage unavailable: the next provider call still remains safe; it simply cannot invalidate.
  }
}
