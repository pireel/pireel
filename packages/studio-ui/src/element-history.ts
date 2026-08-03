'use client';

/**
 * Project element history/library (generated overlay HTML blocks) — **cloud is source of truth +
 * project-scoped localStorage cache**. A project's entries recover across devices but never leak
 * into another project's generation history.
 * Read = sync read from cache (panel opens instantly), syncElementEntries pulls the cloud and
 * merges back; write = cache + fire-and-forget push to cloud (providers.elements; OSS shell
 * defaults to local-only, same behavior as before cloud).
 * Each innerHtml is a few KB; the cache cap avoids blowing the quota (cloud limit of 200 is server-side).
 */

import { studioProviders, type StoredElement } from '@pireel/studio-engine/providers';

export interface GenElementResult {
  /** Seed block id at generation time (selector scope); on insert it's re-scoped to a new id */
  seedId: string;
  innerHtml: string;
  timelineBody: string;
  label: string;
  /** Presets carry a source id (stored in block slots): "sync content" uses it to rebuild the beat-timed timeline. */
  presetId?: string;
  /** Design reference size (theme elements = 1920×1080): on insert, cq-ify against this and pick an in-canvas fit window rather than filling the screen. */
  designW?: number;
  designH?: number;
  /** Present = the element IS a kit component (themeless generation): insertion creates a
   *  props-driven kit block directly — no offscreen measurement, no cq-ization; innerHtml/
   *  timelineBody above are only the derived preview for the library card. */
  kit?: { component: string; props: Record<string, unknown> };
}

export interface ElementEntry {
  id: string;
  prompt: string;
  createdAt: number;
  element: GenElementResult;
}

const ELS_KEY_PREFIX = 'studio:gen-elements:v2:';
const ELS_CAP = 60;

const cacheKey = (projectId: string) => `${ELS_KEY_PREFIX}${projectId}`;

interface RawEntry {
  id?: string;
  type?: string;
  status?: string;
  prompt?: string;
  createdAt?: number;
  element?: GenElementResult;
}

export function loadElementEntries(projectId: string): ElementEntry[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(cacheKey(projectId)) ?? '[]') as RawEntry[];
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e) => e.element && (e.type === undefined || e.type === 'element') && (e.status === undefined || e.status === 'succeeded'))
      .map((e) => ({ id: e.id ?? '', prompt: e.prompt ?? '', createdAt: e.createdAt ?? 0, element: e.element! }))
      .filter((e) => e.id);
  } catch {
    return [];
  }
}

export function saveElementEntries(projectId: string, entries: ElementEntry[]): void {
  try {
    // Store in the same shape as gen-panel history (with type/status, so old readers stay compatible)
    const done = entries.slice(-ELS_CAP).map((e) => ({ ...e, type: 'element', status: 'succeeded' }));
    window.localStorage.setItem(cacheKey(projectId), JSON.stringify(done));
  } catch {
    /* Ignore quota / private mode */
  }
}

const toWire = (e: ElementEntry): StoredElement => ({ id: e.id, prompt: e.prompt, label: e.element.label, createdAt: e.createdAt, element: e.element });

/** Push a single entry to cloud (fire-and-forget; OSS shell has no provider = no-op). */
export function pushElementToCloud(projectId: string, e: ElementEntry): void {
  void studioProviders().elements?.save(projectId, toWire(e)).catch(() => {});
}

/** Cloud sync: cloud is source of truth; local-only entries (added offline / history from before
 *  cloud) are backfilled up; the merged result is written back to cache and returned (ascending by
 *  time, matching cache order). Returns null if no provider / fetch fails (use the cache). */
export async function syncElementEntries(projectId: string): Promise<ElementEntry[] | null> {
  const store = studioProviders().elements;
  if (!store) return null;
  const cloud = await store.list(projectId).catch(() => null);
  if (!cloud) return null;
  const cloudEntries: ElementEntry[] = cloud
    .filter((c) => c.element && typeof c.element.innerHtml === 'string')
    .map((c) => ({ id: c.id, prompt: c.prompt, createdAt: c.createdAt, element: c.element }));
  const cloudIds = new Set(cloudEntries.map((e) => e.id));
  const localOnly = loadElementEntries(projectId).filter((e) => !cloudIds.has(e.id));
  for (const e of localOnly) pushElementToCloud(projectId, e); // one-time backfill for this project's local cache
  const merged = [...cloudEntries, ...localOnly].sort((a, b) => a.createdAt - b.createdAt);
  saveElementEntries(projectId, merged);
  return merged.slice(-ELS_CAP);
}

/** Save a canvas element back to the library (floating toolbar "Save as element"): append one (same id overwrites), evict the oldest past cap. */
export function addElementEntry(projectId: string, entry: ElementEntry): void {
  saveElementEntries(projectId, [...loadElementEntries(projectId).filter((e) => e.id !== entry.id), entry]);
  pushElementToCloud(projectId, entry);
}

export function removeElementEntry(projectId: string, id: string): void {
  saveElementEntries(projectId, loadElementEntries(projectId).filter((e) => e.id !== id));
  void studioProviders().elements?.remove(projectId, id).catch(() => {});
}
