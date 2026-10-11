import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acknowledgeChatThread, cacheChatThread, restoreChatThreads } from './chat-thread-cache';
import { recordTaskUsage, subscribeTaskUsage } from './chat-task-usage';
import { taskOf } from './chat-task';
import type { StoredThread } from './chat-thread-store';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());
const thread = (updatedAt: number): StoredThread => ({ id: 't1', title: 'Edit', updatedAt, messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: String(updatedAt) }] }] });

describe('chat checkpoints', () => {
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
