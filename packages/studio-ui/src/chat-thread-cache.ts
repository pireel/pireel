import { taskOf } from './chat-task';
import type { StoredThread } from './chat-thread-store';

const PREFIX = 'studio:chat-checkpoints:';
const key = (projectId: string) => `${PREFIX}${projectId}`;
type Entry = { thread: StoredThread; pending: boolean };
// Also keep synced threads in memory for late usage receipts, without occupying device storage.
const memory = new Map<string, Entry[]>();
const warned = new Set<string>();
function readStored(storageKey: string): Entry[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(value) ? value.filter(item => item?.thread?.id && Array.isArray(item.thread.messages)) : [];
  } catch { return []; }
}
function read(projectId: string): Entry[] {
  const entries = new Map(readStored(key(projectId)).map(entry => [entry.thread.id, entry]));
  for (const entry of memory.get(projectId) ?? []) {
    const saved = entries.get(entry.thread.id);
    if (!saved || entry.thread.updatedAt >= saved.thread.updatedAt) entries.set(entry.thread.id, entry);
  }
  return [...entries.values()];
}
function writePending(projectId: string, entries: Entry[]): void {
  const pending = entries.filter(entry => entry.pending);
  if (pending.length) localStorage.setItem(key(projectId), JSON.stringify(pending));
  else localStorage.removeItem(key(projectId));
}
/** Reclaim only older-format history already acknowledged by the server, across projects. */
function evictSyncedHistory(): void {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((value): value is string => !!value?.startsWith(PREFIX));
    for (const storageKey of keys) {
      const entries = readStored(storageKey);
      if (!entries.some(entry => entry.pending === false)) continue;
      try { writePending(storageKey.slice(PREFIX.length), entries); } catch { /* Never remove pending work. */ }
    }
  } catch { /* Storage may be disabled entirely. */ }
}
export function cacheChatThread(projectId: string, thread: StoredThread): boolean {
  const previous = read(projectId).find(entry => entry.thread.id === thread.id)?.thread;
  if (previous) {
    const usage = new Map(previous.messages.map(message => { const task = taskOf(message); return [task?.id, task?.lateUsage]; }));
    thread = { ...thread, messages: thread.messages.map(message => {
      const task = taskOf(message);
      return task && usage.get(task.id) ? { ...message, metadata: { ...(message.metadata as object), task: { ...task, lateUsage: { ...task.lateUsage, ...usage.get(task.id) } } } } : message;
    }) };
  }
  const entries = [{ thread, pending: true }, ...read(projectId).filter(item => item.thread.id !== thread.id)];
  // Never truncate pending checkpoints, including when more than 30 threads are awaiting sync.
  memory.set(projectId, [...entries.filter(entry => entry.pending), ...entries.filter(entry => !entry.pending).slice(0, 30)]);
  try { writePending(projectId, entries); warned.delete(projectId); return true; }
  catch { evictSyncedHistory(); }
  try { writePending(projectId, entries); warned.delete(projectId); return true; }
  catch (error) {
    if (!warned.has(projectId)) console.error('[studio] local chat checkpoint failed', error);
    warned.add(projectId);
    return false;
  }
}
export function acknowledgeChatThread(projectId: string, thread: StoredThread): void {
  const entries = read(projectId).map(item => item.thread.id === thread.id && item.thread.updatedAt === thread.updatedAt ? { ...item, pending: false } : item);
  memory.set(projectId, entries);
  try { writePending(projectId, entries); } catch { /* The cloud has this version; never discard newer pending work. */ }
}
/** Unsent checkpoints win over the server snapshot; synced history uses the newer version. */
export function restoreChatThreads(projectId: string, remote: StoredThread[]): StoredThread[] {
  const merged = new Map(remote.map(thread => [thread.id, thread]));
  for (const { thread, pending } of read(projectId)) {
    const server = merged.get(thread.id);
    if (pending || !server || thread.updatedAt > server.updatedAt) merged.set(thread.id, thread);
  }
  return [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);
}

export function cachedChatThread(projectId: string, threadId: string): StoredThread | undefined {
  return read(projectId).find(entry => entry.thread.id === threadId)?.thread;
}
