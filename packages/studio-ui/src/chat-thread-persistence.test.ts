import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatThreadPersistence } from '@pireel/studio-ui/chat-thread-persistence';
import { cachedChatThread } from '@pireel/studio-ui/chat-thread-cache';
import type { StoredThread } from '@pireel/studio-ui/chat-thread-store';

const thread = (updatedAt: number): StoredThread => ({ id: 't', title: 'Edit', updatedAt, messages: [] });
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const fillStorage = () => vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });

describe('chat persistence', () => {
  it('does not warn repeatedly about local quota when cloud saves succeed', async () => {
    fillStorage();
    const save = vi.fn().mockResolvedValue(undefined); const onFailure = vi.fn();
    const persist = createChatThreadPersistence({ getStore: () => ({ save }), onFailure });
    for (let version = 1; version <= 5; version++) await persist('cloud-ok', thread(version));
    expect(save).toHaveBeenCalledTimes(5);
    expect(onFailure).not.toHaveBeenCalled();
    expect(cachedChatThread('cloud-ok', 't')).toEqual(thread(5));
  });
  it('warns once during an outage and allows a new warning after recovery', async () => {
    fillStorage();
    const save = vi.fn().mockRejectedValue(new Error('Offline')); const onFailure = vi.fn();
    const persist = createChatThreadPersistence({ getStore: () => ({ save }), onFailure });
    for (let version = 1; version <= 5; version++) await persist('offline', thread(version));
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0][0]).toBe(false);
    save.mockResolvedValueOnce(undefined);
    await persist('offline', thread(6));
    await persist('offline', thread(7));
    expect(onFailure).toHaveBeenCalledTimes(2);
  });
  it('keeps only the latest waiting snapshot while preserving in-flight ordering', async () => {
    let finish!: () => void;
    const save = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined);
    const persist = createChatThreadPersistence({ getStore: () => ({ save }), onFailure: vi.fn() });
    const first = persist('coalesce', thread(1));
    await Promise.resolve();
    const second = persist('coalesce', thread(2));
    const last = persist('coalesce', thread(3));
    expect(save).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all([first, second, last]);
    expect(save.mock.calls.map(call => call[1].updatedAt)).toEqual([1, 3]);
    expect(localStorage.getItem('studio:chat-checkpoints:coalesce')).toBeNull();
  });
  it('warns once when neither cloud storage nor device storage is available', async () => {
    fillStorage(); const onFailure = vi.fn();
    const persist = createChatThreadPersistence({ getStore: () => undefined, onFailure });
    await persist('local-only', thread(1));
    await persist('local-only', thread(2));
    expect(onFailure).toHaveBeenCalledTimes(1);
  });
});
