import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStudioSpaceId, listStudioGens, resolveStudioSpaceId } from './gen-api';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

describe('generation space resolution', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('reads history without creating a space, and stays quiet when there is none', async () => {
    // A project that was never saved to the cloud has no space and no history. Three panels ask
    // on every open, so asking must not POST (which answers 404 for that project) to find out.
    const fetchMock = vi.fn(async () => Response.json({ ok: true, space: null }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await resolveStudioSpaceId('p1')).toBeNull();
    expect(await listStudioGens('p1', 'image')).toEqual([]);

    for (const [, init] of fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>) {
      expect(init?.method ?? 'GET').toBe('GET');
    }
  });

  it('creates the space only on the path that is about to write one, then caches it', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true, space: { id: 'studio_u1_p1' } }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await getStudioSpaceId('p1')).toBe('studio_u1_p1');
    expect(fetchMock.mock.calls[0]).toEqual(['/api/studio/projects/p1/gen-space', { method: 'POST' }]);
    // The cached id serves both paths; neither asks the server again.
    expect(await resolveStudioSpaceId('p1')).toBe('studio_u1_p1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
