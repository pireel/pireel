import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it('retains and reads the original transcript when migration cannot commit', async () => {
  vi.resetModules();
  const { __setKvBackendForTest } = await import('./idb-kv');
  __setKvBackendForTest({ get: async () => undefined, set: async () => { throw new Error('Quota exceeded'); }, delete: async () => {} });
  const text = [{ text: 'Already paid for', start: 0, end: 1 }];
  const entries = new Map([['pinshot:studio:asr:source', JSON.stringify(text)]]);
  vi.stubGlobal('localStorage', { length: 1, key: (index: number) => [...entries.keys()][index], getItem: (key: string) => entries.get(key) ?? null, removeItem: (key: string) => entries.delete(key) });
  const { getCachedAsr } = await import('./asr-cache');
  expect(await getCachedAsr('source')).toEqual(text);
  expect(entries.size).toBe(1);
});
