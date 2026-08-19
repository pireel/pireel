export type CloudProjectSaveResult = 'ok' | 'conflict' | 'migration-required' | 'skip';

export interface CloudProjectSaveQueueOptions<Payload> {
  getPayload: () => Payload | null;
  save: (payload: Payload) => Promise<CloudProjectSaveResult>;
  canWrite: () => boolean;
  onConflict?: () => void;
  onMigrationRequired?: () => void;
}

const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
const CONFLICT_RETRY_MS = 250;

/** Defers effect cleanup by one microtask so React Strict Mode's setup-cleanup-setup probe
 * can retain the same resource. With no subsequent setup, the latest cleanup still runs. */
export class DeferredEffectDisposer {
  private readonly generations = new WeakMap<object, number>();

  retain(resource: object): number {
    const generation = (this.generations.get(resource) ?? 0) + 1;
    this.generations.set(resource, generation);
    return generation;
  }

  release(resource: object, generation: number, dispose: () => void): void {
    queueMicrotask(() => {
      if (this.generations.get(resource) !== generation) return;
      this.generations.delete(resource);
      dispose();
    });
  }
}

/**
 * Keeps the latest cloud-save revision dirty until the provider acknowledges it.
 * Calls are serialized, transient failures retry with backoff, and a newer edit
 * made during an in-flight request is flushed immediately after that request.
 */
export class CloudProjectSaveQueue<Payload> {
  private options: CloudProjectSaveQueueOptions<Payload>;
  private revision = 0;
  private savedRevision = 0;
  private queued = false;
  private blocked = false;
  private disposed = false;
  private retryMs = INITIAL_RETRY_MS;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<void> = Promise.resolve();

  constructor(options: CloudProjectSaveQueueOptions<Payload>) {
    this.options = options;
  }

  configure(options: CloudProjectSaveQueueOptions<Payload>) {
    this.options = options;
  }

  get hasPendingSave() {
    return this.savedRevision < this.revision;
  }

  markDirty() {
    if (!this.disposed && !this.blocked) this.revision += 1;
  }

  flush(): Promise<void> {
    if (
      this.disposed
      || this.blocked
      || this.queued
      || !this.hasPendingSave
      || !this.options.canWrite()
    ) {
      return this.chain;
    }

    this.clearRetryTimer();
    this.queued = true;
    const attempt = this.chain.then(() => this.runAttempt());
    this.chain = attempt
      .catch(() => {
        this.scheduleRetry();
      })
      .then(() => {
        this.queued = false;
        if (
          !this.disposed
          && !this.blocked
          && !this.retryTimer
          && this.hasPendingSave
          && this.options.canWrite()
        ) {
          void this.flush();
        }
      });
    return this.chain;
  }

  async whenIdle(): Promise<void> {
    for (;;) {
      const active = this.chain;
      await active;
      if (active === this.chain) return;
    }
  }

  dispose() {
    this.disposed = true;
    this.clearRetryTimer();
  }

  private async runAttempt() {
    if (!this.options.canWrite()) return;
    const savingRevision = this.revision;
    const payload = this.options.getPayload();
    if (!payload) {
      this.savedRevision = Math.max(this.savedRevision, savingRevision);
      this.resetBackoff();
      return;
    }

    let result = await this.safeSave(payload);
    // An in-flight request cannot be cancelled, but disposing the queue (project
    // navigation/unmount) must prevent every follow-up action for the old project.
    if (this.disposed) return;
    if (result === 'conflict' && !this.blocked && this.options.canWrite()) {
      this.options.onConflict?.();
      // The provider rebases its diff baseline while returning `conflict`; the
      // second call must stay in this queue and its result must be observed.
      result = await this.safeSave(payload);
      if (this.disposed) return;
    }

    if (result === 'migration-required') {
      this.blocked = true;
      this.clearRetryTimer();
      this.options.onMigrationRequired?.();
      return;
    }

    if (result === 'ok') {
      this.savedRevision = Math.max(this.savedRevision, savingRevision);
      this.resetBackoff();
      return;
    }

    this.scheduleRetry(result === 'conflict' ? CONFLICT_RETRY_MS : undefined);
  }

  private async safeSave(payload: Payload): Promise<CloudProjectSaveResult> {
    try {
      return await this.options.save(payload);
    } catch {
      return 'skip';
    }
  }

  private scheduleRetry(delayMs = this.retryMs) {
    if (
      this.retryTimer
      || this.disposed
      || this.blocked
      || !this.hasPendingSave
      || !this.options.canWrite()
    ) return;

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delayMs);
    if (delayMs !== CONFLICT_RETRY_MS) {
      this.retryMs = Math.min(MAX_RETRY_MS, Math.max(INITIAL_RETRY_MS, delayMs * 2));
    }
  }

  private resetBackoff() {
    this.retryMs = INITIAL_RETRY_MS;
    this.clearRetryTimer();
  }

  private clearRetryTimer() {
    if (!this.retryTimer) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}
