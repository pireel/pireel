import { acknowledgeChatThread, cachedChatThread, cacheChatThread } from '@pireel/studio-ui/chat-thread-cache';
import type { StoredThread } from '@pireel/studio-ui/chat-thread-store';

/** One in-flight save per thread; streaming updates replace the waiting snapshot, not queue it.
 * Local failure is silent when the cloud succeeds. A continuous sync outage warns only once. */
export function createChatThreadPersistence({ getStore, onFailure }: {
  getStore(): { save(projectId: string, thread: StoredThread): Promise<unknown> } | undefined;
  onFailure(localSaved: boolean, error?: unknown): void;
}) {
  type Snapshot = { thread: StoredThread; localSaved: boolean };
  type Queue = { pending?: Snapshot; running?: Promise<void>; warned: boolean };
  const queues = new Map<string, Queue>();
  return (projectId: string, incoming: StoredThread): Promise<void> => {
    const localSaved = cacheChatThread(projectId, incoming);
    const thread = cachedChatThread(projectId, incoming.id) ?? incoming;
    const key = `${projectId}:${thread.id}`;
    const queue = queues.get(key) ?? { warned: false };
    queues.set(key, queue);
    queue.pending = { thread, localSaved };
    const run = (): Promise<void> => queue.running = Promise.resolve().then(async () => {
      while (queue.pending) {
        const snapshot = queue.pending;
        queue.pending = undefined;
        try {
          const store = getStore();
          if (store) {
            await store.save(projectId, snapshot.thread);
            acknowledgeChatThread(projectId, snapshot.thread);
          } else if (!snapshot.localSaved) throw new Error('No durable chat storage available');
          queue.warned = false;
        } catch (error) {
          if (!queue.warned) { queue.warned = true; onFailure(snapshot.localSaved, error); }
        }
      }
    }).finally(() => {
      queue.running = undefined;
      if (queue.pending) return run();
      if (!queue.warned) queues.delete(key);
    });
    return queue.running ?? run();
  };
}
