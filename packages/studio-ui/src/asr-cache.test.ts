import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteCachedAsr, getCachedAsr, setCachedAsr } from './asr-cache';

describe('ASR cache invalidation', () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('removes only the rejected source transcript', () => {
    setCachedAsr('current', [{ start: 0, end: 1, text: 'current' }]);
    setCachedAsr('other', [{ start: 0, end: 1, text: 'other' }]);

    deleteCachedAsr('current');

    expect(getCachedAsr('current')).toBeNull();
    expect(getCachedAsr('other')).toEqual([{ start: 0, end: 1, text: 'other' }]);
  });
});
