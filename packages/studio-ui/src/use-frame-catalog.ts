'use client';

import { useEffect, useState } from 'react';

/** Frame catalog entry (the manifest returned by GET /api/studio/frames, no body). */
export interface FrameCatalogItem {
  id: string;
  title: string;
  summary: string;
  icon: string;
  /** Cover R2 raw key; null → fall back to emoji. */
  iconKey?: string | null;
  /** Open-vocabulary visual-language sample names shown on the Frame detail page. */
  showcase: string[];
  /** Theme design tokens (keys match theme vars); the preview card renders the theme's real tones from it. null → use the current project theme. */
  palette?: Record<string, string> | null;
  /** Recommended portrait sticker outline (see Frame.personFx); applied to comp.personFx on mount. null → theme ignores the portrait. */
  personFx?: Record<string, string> | null;
}

// In-process cache — the catalog is essentially static, so fetching once per app lifetime is enough.
let cache: FrameCatalogItem[] | null = null;

// localStorage mirror: the catalog is present on the first frame after refresh/new tab (boot theme wall isn't empty), then overwritten once the background fetch lands.
const LS_KEY = 'studio:frame-catalog:v1';
function readStoredCatalog(): FrameCatalogItem[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length ? (parsed as FrameCatalogItem[]) : null;
  } catch {
    return null;
  }
}
function storeCatalog(frames: FrameCatalogItem[]): void {
  if (!frames.length) return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(frames));
  } catch {
    /* If it won't fit, ignore — next time we fetch again */
  }
}

// The catalog source is injectable (same approach as setStudioProviders): the hosted shell
// defaults to the API (clients can't reach the server-only registry); the OSS shell feeds in
// @pireel/studio-frames/vite's client registry directly, no backend.
let source: () => Promise<FrameCatalogItem[]> = () =>
  fetch('/api/studio/frames')
    .then((r) => (r.ok ? r.json() : { frames: [] }))
    .then((d: { frames?: FrameCatalogItem[] }) => d.frames ?? []);

export function setFrameCatalogSource(fn: () => Promise<FrameCatalogItem[]>): void {
  source = fn;
  cache = null;
}

/** Theme catalog shared by the frame panel + chat `/` menu + boot card wall.
 *  First frame: in-memory cache → localStorage mirror; a real-source fetch still runs in the background to refresh (the mirror may be stale). */
export function useFrameCatalog(): FrameCatalogItem[] {
  const [items, setItems] = useState<FrameCatalogItem[]>(() => cache ?? readStoredCatalog() ?? []);
  useEffect(() => {
    if (cache) return;
    let alive = true;
    source()
      .then((frames) => {
        if (!frames.length) return; // fetch failed — don't clobber the mirror with empty
        cache = frames;
        storeCatalog(frames);
        if (alive) setItems(frames);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return items;
}
