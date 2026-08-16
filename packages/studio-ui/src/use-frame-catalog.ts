'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'use-intl';
import type { CustomVisualStyle } from '@pireel/studio-engine/visual-style';

/** Frame catalog entry (the manifest returned by GET /api/studio/frames, no body). */
export interface FrameCatalogItem {
  id: string;
  title: string;
  summary: string;
  icon: string;
  /** Square icon R2 raw key; null → fall back to emoji. */
  iconKey?: string | null;
  /** Landscape catalog cover; null → render the code-native dialect cover. */
  coverKey?: string | null;
  /** Open-vocabulary visual-language sample names shown on the Frame detail page. */
  showcase: string[];
  /** Theme design tokens (keys match theme vars); the preview card renders the theme's real tones from it. null → use the current project theme. */
  palette?: Record<string, string> | null;
  /** Recommended portrait sticker outline (see Frame.personFx); applied to comp.personFx on mount. null → theme ignores the portrait. */
  personFx?: Record<string, string> | null;
  /** Independent user controls layered over this visual direction. Official catalog responses omit it. */
  customVisualStyle?: CustomVisualStyle;
}

// Catalog metadata is localized by the hosted endpoint. Keep both memory and localStorage
// scoped by locale so changing language never reuses another locale's Frame titles.
const cache = new Map<string, FrameCatalogItem[]>();

// localStorage mirror: the catalog is present on the first frame after refresh/new tab
// (boot theme wall isn't empty), then overwritten once the background fetch lands.
// v5 adds locale scoping plus hosted visual-direction covers.
const LS_KEY = (locale: string) => `studio:frame-catalog:v5:${locale}`;
function readStoredCatalog(locale: string): FrameCatalogItem[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY(locale));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length ? (parsed as FrameCatalogItem[]) : null;
  } catch {
    return null;
  }
}
function storeCatalog(locale: string, frames: FrameCatalogItem[]): void {
  if (!frames.length) return;
  try {
    window.localStorage.setItem(LS_KEY(locale), JSON.stringify(frames));
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
  cache.clear();
}

/** Theme catalog shared by the frame panel + chat `/` menu + boot card wall.
 *  First frame: in-memory cache → localStorage mirror; a real-source fetch still runs in the background to refresh (the mirror may be stale). */
export function useFrameCatalog(): FrameCatalogItem[] {
  const locale = useLocale();
  const [state, setState] = useState<{
    locale: string;
    items: FrameCatalogItem[];
  }>(() => ({
    locale,
    items: cache.get(locale) ?? readStoredCatalog(locale) ?? [],
  }));
  const visibleItems =
    state.locale === locale
      ? state.items
      : cache.get(locale) ?? readStoredCatalog(locale) ?? [];
  useEffect(() => {
    const cached = cache.get(locale);
    if (cached) {
      setState({ locale, items: cached });
      return;
    }
    setState({ locale, items: readStoredCatalog(locale) ?? [] });
    let alive = true;
    source()
      .then((frames) => {
        if (!frames.length) return; // fetch failed — don't clobber the mirror with empty
        cache.set(locale, frames);
        storeCatalog(locale, frames);
        if (alive) setState({ locale, items: frames });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [locale]);
  return visibleItems;
}
