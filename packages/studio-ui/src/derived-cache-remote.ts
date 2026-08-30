/**
 * Server-side L2 for content-addressed media derivations. IndexedDB stays the L1; on an L1 miss
 * the caches consult the server row (same key), hydrate L1 with the hit, and only then pay the
 * provider. Fresh results write through to both. Every failure degrades to "miss" — the remote
 * layer must never break local editing.
 */

export type DerivedCacheKind = 'visual-review' | 'tts';

export async function remoteDerivedGet(kind: DerivedCacheKind, key: string): Promise<unknown | null> {
  if (!key || typeof fetch !== 'function') return null;
  try {
    const response = await fetch(
      `/api/studio/derived-cache?kind=${encodeURIComponent(kind)}&key=${encodeURIComponent(key)}`,
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { payload?: unknown };
    return body.payload ?? null;
  } catch {
    return null;
  }
}

/** Wipe every server-side row of one kind for this user (debugging full refresh). */
export async function remoteDerivedClear(kind: DerivedCacheKind): Promise<number> {
  if (typeof fetch !== 'function') return 0;
  try {
    const response = await fetch(`/api/studio/derived-cache?kind=${encodeURIComponent(kind)}`, { method: 'DELETE' });
    if (!response.ok) return 0;
    const body = (await response.json()) as { deleted?: unknown };
    return typeof body.deleted === 'number' ? body.deleted : 0;
  } catch {
    return 0;
  }
}

export function remoteDerivedPut(kind: DerivedCacheKind, key: string, payload: unknown): void {
  if (!key || typeof fetch !== 'function') return;
  try {
    void Promise.resolve(fetch('/api/studio/derived-cache', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, key, payload }),
    })).catch(() => undefined);
  } catch {
    /* stubbed fetch in tests / storage-less hosts: the remote layer silently stands down */
  }
}
