import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteCachedAsr, getCachedAsr, setCachedAsr } from './asr-cache';
import { __setKvBackendForTest } from './idb-kv';

describe('ASR cache invalidation', () => {
  const values = new Map<string, string>();

  const kv = new Map<string, unknown>();
  beforeEach(() => {
    values.clear();
    kv.clear();
    __setKvBackendForTest({
      get: async (key) => kv.get(key),
      set: async (key, value) => void kv.set(key, value),
      delete: async (key) => void kv.delete(key),
    });
    vi.stubGlobal('localStorage', {
      length: 0,
      key: () => null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
  });

  afterEach(() => {
    __setKvBackendForTest(null);
    vi.unstubAllGlobals();
  });

  it('removes only the rejected source transcript', async () => {
    setCachedAsr('current', [{ start: 0, end: 1, text: 'current' }]);
    setCachedAsr('other', [{ start: 0, end: 1, text: 'other' }]);

    deleteCachedAsr('current');

    await expect(getCachedAsr('current')).resolves.toBeNull();
    await expect(getCachedAsr('other')).resolves.toEqual([{ start: 0, end: 1, text: 'other' }]);
  });
});
