/**
 * Persistent cache of paid editorial source reviews (IndexedDB, keyed by file identity).
 *
 * A workflow rerun re-reviews the same source files with a freshly worded brief every time —
 * the single largest token spend per debugging round. The review INPUT that matters is the file
 * plus its deterministic local quality windows; the brief is model-authored prose whose wording
 * drifts between runs even when its intent is identical.
 *
 * Policy: an entry stores the brief hash and the reviewed interval signature alongside the
 * result. An exact match (same brief, same intervals) is always reusable. In dev builds (or with
 * the explicit flag below) a same-file entry is reused even when the brief wording or window
 * boundaries drifted — correct for debugging reruns, never enabled for production users.
 *
 * Storage is IndexedDB via idb-kv: entries run 10–20KB each and localStorage's shared origin
 * quota overflows in practice (a real incident while seeding).
 */

import type { EditorialCandidateReview } from '@pireel/studio-engine/editorial-candidates';
import { kvDelete, kvGet, kvSet } from './idb-kv';
import { remoteDerivedGet, remoteDerivedPut } from './derived-cache-remote';
import type { VisualQuestionAnswer } from '@pireel/studio-engine/visual-question';

const PREFIX = 'review:';
const INDEX_KEY = 'review-index';
/** '1' forces cross-brief reuse on, '0' forces it off; unset falls back to the dev build flag. */
export const EDITORIAL_REVIEW_DEV_REUSE_FLAG = 'pinshot:studio:dev:reuseEditorialReview';
const MAX_ENTRIES = 64;
const LEGACY_LOCALSTORAGE_PREFIXES = ['pinshot:studio:review:', 'pinshot:studio:review-index'];

export interface CachedEditorialReviewResult {
  brief: string;
  comparisonSummary: string;
  candidates: EditorialCandidateReview[];
}

export interface CachedEditorialReviewEntry {
  briefHash: string;
  specsSig: string;
  savedAt: number;
  result: CachedEditorialReviewResult;
}

function fnv(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function editorialReviewCacheKey(fileSigValue: string, maxCandidates: number): string {
  return `${fnv(fileSigValue)}_${maxCandidates}_${fileSigValue.length.toString(36)}`;
}

export function editorialBriefHash(brief: string): string {
  return fnv(brief.trim());
}

/** Signature over the reviewed source intervals (rounded to 10ms). */
export function editorialSpecsSig(intervals: ReadonlyArray<{ startSec: number; endSec: number }>): string {
  return fnv([...intervals]
    .map((interval) => `${Math.round(interval.startSec * 100)}-${Math.round(interval.endSec * 100)}`)
    .sort()
    .join('|'));
}

function crossBriefReuseEnabled(): boolean {
  try {
    const flag = localStorage.getItem(EDITORIAL_REVIEW_DEV_REUSE_FLAG);
    if (flag === '1') return true;
    if (flag === '0') return false;
  } catch {
    /* storage unavailable → fall through to the build flag */
  }
  try {
    return Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
}

/** One-time reclaim: an earlier revision kept these entries in localStorage and overflowed the
 * shared origin quota. Sweep them so project drafts get the space back. */
let legacySwept = false;
function sweepLegacyLocalStorage(): void {
  if (legacySwept || typeof localStorage === 'undefined') return;
  legacySwept = true;
  try {
    const doomed: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && LEGACY_LOCALSTORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) doomed.push(key);
    }
    doomed.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* storage unavailable */
  }
}

export async function getCachedEditorialReview(
  key: string,
  briefHash: string,
  specsSig: string,
): Promise<{ result: CachedEditorialReviewResult; exact: boolean } | null> {
  if (!key) return null;
  sweepLegacyLocalStorage();
  let entry = await kvGet(PREFIX + key) as CachedEditorialReviewEntry | undefined;
  if (!entry?.result) {
    // L1 miss → server L2 (survives device switches and cleared browser data); hydrate L1 on hit.
    const remote = await remoteDerivedGet('visual-review', key) as CachedEditorialReviewEntry | null;
    if (remote?.result && Array.isArray(remote.result.candidates)) {
      entry = remote;
      void kvSet(PREFIX + key, remote);
    }
  }
  if (!entry?.result || !Array.isArray(entry.result.candidates)) return null;
  const exact = entry.briefHash === briefHash && entry.specsSig === specsSig;
  if (!exact && !crossBriefReuseEnabled()) return null;
  return { result: entry.result, exact };
}

export async function setCachedEditorialReview(key: string, entry: CachedEditorialReviewEntry): Promise<void> {
  if (!key) return;
  sweepLegacyLocalStorage();
  remoteDerivedPut('visual-review', key, entry);
  await kvSet(PREFIX + key, entry);
  const raw = await kvGet(INDEX_KEY);
  const index = (Array.isArray(raw) ? raw as Array<{ k: string; at: number }> : [])
    .filter((row) => row && row.k !== key);
  index.push({ k: key, at: entry.savedAt });
  index.sort((left, right) => left.at - right.at);
  while (index.length > MAX_ENTRIES) {
    const evicted = index.shift();
    if (evicted) await kvDelete(PREFIX + evicted.k);
  }
  await kvSet(INDEX_KEY, index);
}

/* ---------- targeted visual questions (same store, own key space) ---------- */

export interface CachedVisualQuestionEntry {
  question: string;
  specsSig: string;
  savedAt: number;
  answers: VisualQuestionAnswer[];
}

/** Key = file identity + question hash + the asked ranges: re-asking the same thing over the same
 * ranges is free; a new question or new ranges is a new (cheap) call. */
export function visualQuestionCacheKey(fileSigValue: string, question: string, specsSig: string): string {
  return `q_${fnv(fileSigValue)}_${fnv(question.trim().toLowerCase())}_${specsSig}`;
}

export async function getCachedVisualQuestion(key: string): Promise<VisualQuestionAnswer[] | null> {
  if (!key) return null;
  let entry = await kvGet(PREFIX + key) as CachedVisualQuestionEntry | undefined;
  if (!entry?.answers) {
    const remote = await remoteDerivedGet('visual-review', key) as CachedVisualQuestionEntry | null;
    if (remote?.answers && Array.isArray(remote.answers)) {
      entry = remote;
      void kvSet(PREFIX + key, remote);
    }
  }
  return entry?.answers && Array.isArray(entry.answers) ? entry.answers : null;
}

export async function setCachedVisualQuestion(key: string, entry: CachedVisualQuestionEntry): Promise<void> {
  if (!key) return;
  remoteDerivedPut('visual-review', key, entry);
  await kvSet(PREFIX + key, entry);
}
