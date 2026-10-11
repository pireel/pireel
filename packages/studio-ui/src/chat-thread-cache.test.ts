import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acknowledgeChatThread, cachedChatThread, cacheChatThread, restoreChatThreads } from './chat-thread-cache';
import { recordTaskUsage, subscribeTaskUsage } from './chat-task-usage';
import { taskOf } from './chat-task';
import type { StoredThread } from './chat-thread-store';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const thread = (updatedAt: number): StoredThread => ({ id: 't1', title: 'Edit', updatedAt, messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: String(updatedAt) }] }] });

describe('chat checkpoints', () => {
  it('retains the latest in-memory checkpoint when device storage is full', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    expect(cacheChatThread('quota-test', thread(1))).toBe(false);
    expect(cacheChatThread('quota-test', thread(2))).toBe(false);
    expect(cachedChatThread('quota-test', 't1')).toEqual(thread(2));
    acknowledgeChatThread('quota-test', thread(1));
    expect(cachedChatThread('quota-test', 't1')).toEqual(thread(2));
    acknowledgeChatThread('quota-test', thread(2));
    log.mockRestore();
  });
  it('releases device storage after the matching cloud save succeeds', () => {
    cacheChatThread('ack-test', thread(1));
    acknowledgeChatThread('ack-test', thread(1));
    expect(localStorage.getItem('studio:chat-checkpoints:ack-test')).toBeNull();
  });
  it('reclaims synced history across projects without discarding another pending checkpoint', () => {
    const historyKey = 'studio:chat-checkpoints:old-project';
    localStorage.setItem(historyKey, JSON.stringify([{ thread: thread(1), pending: false }, { thread: { ...thread(2), id: 'pending' }, pending: true }]));
    const write = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key.endsWith(':new-project') && localStorage.getItem(historyKey)?.includes('"pending":false')) throw new DOMException('Full', 'QuotaExceededError');
      write(key, value);
    });
    expect(cacheChatThread('new-project', thread(3))).toBe(true);
    expect(JSON.parse(localStorage.getItem(historyKey)!)).toEqual([{ thread: { ...thread(2), id: 'pending' }, pending: true }]);
  });
  it('restores unsent work after a refresh even if the server timestamp is newer', () => {
    cacheChatThread('p1', thread(2));
    expect(restoreChatThreads('p1', [thread(100)])[0]).toEqual(thread(2));
    expect(restoreChatThreads('other-project', [])).toEqual([]);
  });
  it('keeps a late charge after navigation and after a stale streaming snapshot', () => {
    const original: StoredThread = { ...thread(1), messages: [{ id: 'u1', role: 'user', parts: [], metadata: { task: { id: 'task1', goal: 'Edit', skills: [], mode: 'one-click', state: 'paused' } } }] };
    cacheChatThread('p1', original);
    const seen: string[] = [];
    const unsubscribe = subscribeTaskUsage(event => { if (event.threadId === 'other') seen.push(event.taskId); });
    const event = { projectId: 'p1', threadId: 't1', taskId: 'task1', callId: 'call1', usage: { source: 'server' as const, reference: 'asr1', credits: 3 } };
    recordTaskUsage(event);
    recordTaskUsage(event);
    cacheChatThread('p1', { ...original, updatedAt: 2 });
    expect(taskOf(restoreChatThreads('p1', [])[0]!.messages[0])?.lateUsage).toEqual({ asr1: 3 });
    expect(seen).toEqual([]);
    unsubscribe();
  });
  it('does not acknowledge a newer checkpoint when an older save finishes', () => {
    cacheChatThread('p1', thread(1));
    cacheChatThread('p1', thread(2));
    acknowledgeChatThread('p1', thread(1));
    expect(restoreChatThreads('p1', [thread(100)])[0]).toEqual(thread(2));
    acknowledgeChatThread('p1', thread(2));
    expect(restoreChatThreads('p1', [thread(100)])[0]).toEqual(thread(100));
  });
});
