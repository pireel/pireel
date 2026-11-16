'use client';

import { useSyncExternalStore } from 'react';

/**
 * Media on its way to this device, by signature: how much of each has arrived. Everything that is
 * streamed into the local cache reports here (a recording restored from its cloud copy, a stock
 * clip, generated media), so a card or a timeline strip can say "downloading" for as long as the
 * bytes are still coming instead of treating the media as gone.
 */
export interface MediaDownload {
  /** 0..1, or null when the size is not known in advance. */
  fraction: number | null;
}

const downloads = new Map<string, MediaDownload>();
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };

/** Report bytes arrived for `sig`. Listeners hear about it when the whole percent changes. */
export function noteMediaDownload(sig: string, received: number, total: number | null): void {
  const fraction = total && total > 0 ? Math.min(1, Math.round((received / total) * 100) / 100) : null;
  const current = downloads.get(sig);
  if (current && current.fraction === fraction) return;
  downloads.set(sig, { fraction });
  notify();
}

/** The download of `sig` is over, whether it arrived or failed. */
export function endMediaDownload(sig: string): void {
  if (downloads.delete(sig)) notify();
}

export const mediaDownloads = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  get: (sig: string): MediaDownload | undefined => downloads.get(sig),
  /** Changes whenever any download starts, advances or ends: for a view that shows several. */
  any: (): boolean => downloads.size > 0,
};

/** The download in progress for this signature, if there is one. */
export function useMediaDownload(sig: string | null | undefined): MediaDownload | undefined {
  const read = () => (sig ? downloads.get(sig) : undefined);
  return useSyncExternalStore(mediaDownloads.subscribe, read, () => undefined);
}
