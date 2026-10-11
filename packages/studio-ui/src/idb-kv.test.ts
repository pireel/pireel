import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { __setKvBackendForTest, kvGet, kvSetConfirmed } from './idb-kv';
beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); __setKvBackendForTest(null); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); __setKvBackendForTest(null); });
it('does not acknowledge a request whose transaction aborts after request success', async () => {
  const put = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
    const request = put.apply(this, args);
    request.addEventListener('success', () => this.transaction.abort());
    return request;
  });
  expect(await kvSetConfirmed('pending', 'data')).toBe(false);
  expect(await kvGet('pending')).toBeUndefined();
});
it('acknowledges committed writes', async () => {
  expect(await kvSetConfirmed('saved', { data: 1 })).toBe(true);
  expect(await kvGet('saved')).toEqual({ data: 1 });
});
