import { taskOf } from './chat-task';
import type { StoredThread } from './chat-thread-store';

const key = (projectId: string) => `studio:chat-checkpoints:${projectId}`;
type Entry = { thread: StoredThread; pending: boolean };
function read(projectId: string): Entry[] {
  try {
    const value = JSON.parse(localStorage.getItem(key(projectId)) ?? '[]');
    return Array.isArray(value) ? value.filter(item => item?.thread?.id && Array.isArray(item.thread.messages)) : [];
  } catch { return []; }
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
  const entries = [{ thread, pending: true }, ...read(projectId).filter(item => item.thread.id !== thread.id)].slice(0, 30);
  for (;;) {
    try { localStorage.setItem(key(projectId), JSON.stringify(entries)); return true; }
    catch (error) {
      // Only evict history already confirmed on the server; never drop an unsent checkpoint.
      const disposable = entries.findLastIndex((item, index) => index > 0 && !item.pending);
      if (disposable >= 0) { entries.splice(disposable, 1); continue; }
      console.error('[studio] local chat checkpoint failed', error);
      return false;
    }
  }
}
export function acknowledgeChatThread(projectId: string, thread: StoredThread): void {
  const entries = read(projectId).map(item => item.thread.id === thread.id && item.thread.updatedAt === thread.updatedAt ? { ...item, pending: false } : item);
  try { localStorage.setItem(key(projectId), JSON.stringify(entries)); } catch { /* Keep pending until the next successful save. */ }
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
