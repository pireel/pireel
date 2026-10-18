import type { WorkflowUsage } from '@pireel/studio-engine/usage';
import { cachedChatThread, cacheChatThread } from '@pireel/studio-ui/chat-thread-cache';
import { patchTask, withTaskUsage } from '@pireel/studio-ui/chat-task';
import type { StoredThread } from '@pireel/studio-ui/chat-thread-store';

export interface TaskUsageEvent { projectId: string; threadId: string; taskId: string; callId: string; usage: WorkflowUsage }
const listeners = new Set<(event: TaskUsageEvent) => void>();
export function subscribeTaskUsage(listener: (event: TaskUsageEvent) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
/** Cache before notifying: a closed chat still keeps the charge, keyed by its billing reference. */
export function recordTaskUsage(event: TaskUsageEvent): StoredThread | undefined {
  const previous = cachedChatThread(event.projectId, event.threadId);
  let next: StoredThread | undefined;
  if (previous) {
    next = { ...previous, updatedAt: Math.max(Date.now(), previous.updatedAt + 1), messages: patchTask(previous.messages, event.taskId, task => withTaskUsage(task, event.callId, event.usage)) };
    cacheChatThread(event.projectId, next);
  }
  for (const listener of listeners) listener(event);
  return cachedChatThread(event.projectId, event.threadId);
}
