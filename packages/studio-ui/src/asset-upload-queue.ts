/**
 * Background upload queue: every imported asset reaches the cloud rendezvous without the user
 * waiting for it. One queue per tab; jobs are keyed by content sig (duplicates collapse), run with
 * bounded concurrency, retry with backoff, and publish progress for the asset cards.
 *
 * The queue is the ONLY writer of "this sig is now in the cloud": subscribers (the workbench) fold
 * the returned key into the project index / document locators, which autosave then syncs.
 */

import { studioProviders } from '@pireel/studio-engine/providers';

export type AssetUploadStatus = 'queued' | 'uploading' | 'done' | 'failed';

export interface AssetUploadState {
  status: AssetUploadStatus;
  /** 0..1 while uploading; 1 when done. */
  fraction: number;
  key?: string;
  attempts: number;
}

export interface AssetUploadJob {
  sig: string;
  file: File;
  label?: string;
}

type Listener = () => void;
type UploadedHandler = (result: { sig: string; key: string; file: File }) => void;

const CONCURRENCY = 2;
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [1_000, 4_000, 16_000];

export interface AssetUploadQueue {
  enqueue(job: AssetUploadJob): void;
  /** Current state for a sig (undefined = never seen by this tab). */
  state(sig: string): AssetUploadState | undefined;
  /** Snapshot for React (useSyncExternalStore): a new Map identity on every change. */
  snapshot(): ReadonlyMap<string, AssetUploadState>;
  subscribe(listener: Listener): () => void;
  onUploaded(handler: UploadedHandler): () => void;
  /** Forget a sig (e.g. the asset was deleted before its upload finished). */
  cancel(sig: string): void;
}

export function createAssetUploadQueue(deps?: {
  backup?: (file: File, sig: string, options: { onProgress: (fraction: number) => void; signal: AbortSignal }) => Promise<{ key: string } | null>;
  policy?: () => 'always' | 'lazy';
  delay?: (ms: number) => Promise<void>;
}): AssetUploadQueue {
  const backup = deps?.backup ?? ((file, sig, options) => studioProviders().vault.backup(file, sig, options));
  const policy = deps?.policy ?? (() => studioProviders().uploadPolicy ?? 'always');
  const delay = deps?.delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const states = new Map<string, AssetUploadState>();
  const pending: AssetUploadJob[] = [];
  const controllers = new Map<string, AbortController>();
  const listeners = new Set<Listener>();
  const uploadedHandlers = new Set<UploadedHandler>();
  let snapshotCache: ReadonlyMap<string, AssetUploadState> = new Map();
  let running = 0;

  const publish = () => {
    snapshotCache = new Map(states);
    for (const listener of listeners) listener();
  };
  const set = (sig: string, patch: Partial<AssetUploadState>) => {
    const previous = states.get(sig) ?? { status: 'queued' as const, fraction: 0, attempts: 0 };
    states.set(sig, { ...previous, ...patch });
    publish();
  };

  const pump = () => {
    while (running < CONCURRENCY && pending.length) {
      const job = pending.shift()!;
      if (!states.has(job.sig)) continue; // cancelled while queued
      running += 1;
      void run(job).finally(() => {
        running -= 1;
        pump();
      });
    }
  };

  const run = async (job: AssetUploadJob) => {
    const controller = new AbortController();
    controllers.set(job.sig, controller);
    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        if (controller.signal.aborted) return;
        set(job.sig, { status: 'uploading', attempts: attempt });
        const result = await backup(job.file, job.sig, {
          signal: controller.signal,
          onProgress: (fraction) => set(job.sig, { fraction }),
        });
        if (controller.signal.aborted) return;
        if (result) {
          set(job.sig, { status: 'done', fraction: 1, key: result.key });
          for (const handler of uploadedHandlers) handler({ sig: job.sig, key: result.key, file: job.file });
          return;
        }
        if (attempt < MAX_ATTEMPTS) await delay(BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)]!);
      }
      set(job.sig, { status: 'failed' });
    } finally {
      controllers.delete(job.sig);
    }
  };

  return {
    enqueue(job) {
      if (policy() === 'lazy') return;
      const current = states.get(job.sig);
      if (current && current.status !== 'failed') return; // queued/uploading/done: nothing to add
      states.set(job.sig, { status: 'queued', fraction: 0, attempts: current?.attempts ?? 0 });
      pending.push(job);
      publish();
      pump();
    },
    state: (sig) => states.get(sig),
    snapshot: () => snapshotCache,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onUploaded(handler) {
      uploadedHandlers.add(handler);
      return () => uploadedHandlers.delete(handler);
    },
    cancel(sig) {
      controllers.get(sig)?.abort();
      const index = pending.findIndex((job) => job.sig === sig);
      if (index >= 0) pending.splice(index, 1);
      if (states.delete(sig)) publish();
    },
  };
}

let shared: AssetUploadQueue | null = null;
/** The tab-wide queue (created lazily so tests can build isolated instances). */
export function assetUploadQueue(): AssetUploadQueue {
  shared ??= createAssetUploadQueue();
  return shared;
}
