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
export class FrameCatalogRequestCache {
  private source: () => Promise<FrameCatalogItem[]>;
  private generation = 0;
  private readonly completed = new Map<string, FrameCatalogItem[]>();
  private readonly pending = new Map<string, Promise<FrameCatalogItem[]>>();

  constructor(source: () => Promise<FrameCatalogItem[]>) {
    this.source = source;
  }

  get(locale: string): FrameCatalogItem[] | undefined {
    return this.completed.get(locale);
  }

  setSource(source: () => Promise<FrameCatalogItem[]>): void {
    this.source = source;
    this.generation += 1;
    this.completed.clear();
    this.pending.clear();
  }

  load(locale: string): Promise<FrameCatalogItem[]> {
    const completed = this.completed.get(locale);
    if (completed) return Promise.resolve(completed);
    const pending = this.pending.get(locale);
    if (pending) return pending;

    const generation = this.generation;
    const request = this.source()
      .then((frames) => {
        if (generation === this.generation && frames.length)
          this.completed.set(locale, frames);
        return frames;
      })
      .finally(() => {
        if (this.pending.get(locale) === request) this.pending.delete(locale);
      });
    this.pending.set(locale, request);
    return request;
  }
}

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
const defaultSource = () =>
  fetch('/api/studio/frames')
    .then((r) => (r.ok ? r.json() : { frames: [] }))
    .then((d: { frames?: FrameCatalogItem[] }) => d.frames ?? []);
const requests = new FrameCatalogRequestCache(defaultSource);

export function setFrameCatalogSource(fn: () => Promise<FrameCatalogItem[]>): void {
  requests.setSource(fn);
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
    items: requests.get(locale) ?? readStoredCatalog(locale) ?? [],
  }));
  const visibleItems =
    state.locale === locale
      ? state.items
      : requests.get(locale) ?? readStoredCatalog(locale) ?? [];
  useEffect(() => {
    const cached = requests.get(locale);
    if (cached) {
      setState({ locale, items: cached });
      return;
    }
    setState({ locale, items: readStoredCatalog(locale) ?? [] });
    let alive = true;
    requests.load(locale)
      .then((frames) => {
        if (!frames.length) return; // fetch failed — don't clobber the mirror with empty
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
