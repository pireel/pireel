/**
 * Cloud sync for one open project: a queue of document transactions plus the small project
 * sections, pushed as one request, acknowledged by id.
 *
 * The queue is the writer's memory. A transaction stays here until the server says it applied
 * (or could not); a lost response is answered by resending, which the server recognizes by id.
 * The pending list is mirrored to local storage, so a reload during a bad connection replays it
 * onto the cloud document instead of losing it. There is no conflict state: when the server was
 * written by someone else in between, the acknowledgement says so and the caller rebases —
 * adopts the server document and replays whatever is still pending on top.
 */

import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';
import type { DocumentTransaction } from '@pireel/studio-engine/document-transaction';
import {
  ackedFromDto,
  buildSaveWire,
  canonicalJson,
  hashSection,
  type AckedSections,
  type ProjectCommitAck,
  type ProjectSavePayload,
  type ProjectSaveResult,
  type ProjectSaveWire,
} from '@pireel/studio-engine/project-dto';

export type ProjectSyncSections = Omit<ProjectSavePayload, 'transactions'>;

export type ProjectSyncSendResult = ProjectSaveResult | 'need-full';

export interface ProjectSyncDeps {
  projectId: string;
  /** Transport only: the wire goes out, the acknowledgement comes back. */
  send: (wire: ProjectSaveWire) => Promise<ProjectSyncSendResult>;
  /** The small sections as the editor sees them right now; null when nothing may be written yet. */
  sections: () => ProjectSyncSections | null;
  canWrite: () => boolean;
  /** The live document, hashed at send time to detect a server document that drifted. */
  getDocument: () => EditorDocumentV2;
  /** Acknowledged. `diverged` means the caller must adopt `ack.project.document` and replay `pending`. */
  onAck: (ack: ProjectCommitAck, info: { diverged: boolean; pending: DocumentTransaction[] }) => void;
  onMigrationRequired?: () => void;
  /** Where unacknowledged transactions survive a reload. */
  store?: PendingTransactionStore;
  debounceMs?: number;
}

export interface PendingTransactionStore {
  load: () => DocumentTransaction[];
  save: (transactions: readonly DocumentTransaction[]) => void;
}

const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
const DEFAULT_DEBOUNCE_MS = 1_200;

export class ProjectSync {
  private deps: ProjectSyncDeps;
  private pending: DocumentTransaction[];
  private knownVersion: number | null = null;
  private acked: AckedSections | null = null;
  private sectionsRevision = 0;
  private sectionsSavedRevision = 0;
  private blocked = false;
  private disposed = false;
  private inflight: Promise<void> | null = null;
  private again = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryMs = INITIAL_RETRY_MS;

  constructor(deps: ProjectSyncDeps) {
    this.deps = deps;
    this.pending = deps.store?.load() ?? [];
  }

  configure(deps: ProjectSyncDeps): void {
    this.deps = deps;
  }

  /** The server snapshot this session opened from, so the first push carries the right version hint. */
  seed(project: { version: number; context: ProjectCommitAck['project']['context']; coverThumb: string | null; title: string; videoSig: string | null; videoDurationSec: number | null }): void {
    this.knownVersion = project.version;
    this.acked = ackedFromDto(project);
    this.sectionsSavedRevision = this.sectionsRevision;
  }

  get version(): number | null {
    return this.knownVersion;
  }

  get pendingTransactions(): readonly DocumentTransaction[] {
    return this.pending;
  }

  get hasPending(): boolean {
    return this.pending.length > 0 || this.sectionsSavedRevision < this.sectionsRevision;
  }

  /** Queue a transaction. Pushed after the debounce unless something flushes sooner. */
  record(transaction: DocumentTransaction): void {
    if (this.disposed) return;
    this.pending.push(transaction);
    this.persist();
    this.schedule();
  }

  /** The small sections changed (context, cover, meta); push them with the next batch. */
  markDirty(): void {
    if (this.disposed) return;
    this.sectionsRevision += 1;
    this.schedule();
  }

  /** Push now (agent receipts, tab hide, reclaim). Serialized; returns when this push settles. */
  flush(): Promise<void> {
    this.clearDebounce();
    if (this.inflight) {
      this.again = true;
      return this.inflight;
    }
    if (this.disposed || this.blocked || !this.hasPending || !this.deps.canWrite()) return Promise.resolve();
    this.clearRetry();
    const run = this.push().finally(() => {
      this.inflight = null;
      const more = this.again;
      this.again = false;
      if (more && !this.disposed && !this.blocked && this.hasPending && !this.retryTimer && this.deps.canWrite()) void this.flush();
    });
    this.inflight = run;
    return run;
  }

  async whenIdle(): Promise<void> {
    while (this.inflight) await this.inflight;
  }

  dispose(): void {
    this.disposed = true;
    this.clearDebounce();
    this.clearRetry();
  }

  private async push(): Promise<void> {
    const batch = [...this.pending];
    const sectionsRevision = this.sectionsRevision;
    const sections = this.deps.sections() ?? { videoSig: null, videoDurationSec: null };
    const built = buildSaveWire({ ...sections, ...(batch.length ? { transactions: batch } : {}) }, this.knownVersion, this.acked);
    if (!built) {
      this.sectionsSavedRevision = Math.max(this.sectionsSavedRevision, sectionsRevision);
      this.retryMs = INITIAL_RETRY_MS;
      return;
    }
    const versionAtSend = this.knownVersion;
    const hashAtSend = hashSection(canonicalJson(this.deps.getDocument()));
    const pendingAtSend = this.pending.length;

    let result: ProjectSyncSendResult;
    try {
      result = await this.deps.send(built.wire);
      if (result === 'need-full') {
        // The section baseline drifted from the row; resend the sections whole, once.
        this.acked = null;
        const whole = buildSaveWire({ ...sections, ...(batch.length ? { transactions: batch } : {}) }, this.knownVersion, null);
        result = whole ? await this.deps.send(whole.wire) : 'ok';
      }
    } catch {
      result = 'skip';
    }
    if (this.disposed) return;

    if (result === 'migration-required') {
      this.blocked = true;
      this.deps.onMigrationRequired?.();
      return;
    }
    if (result === 'skip' || result === 'need-full') {
      this.scheduleRetry();
      return;
    }
    this.retryMs = INITIAL_RETRY_MS;
    this.sectionsSavedRevision = Math.max(this.sectionsSavedRevision, sectionsRevision);
    if (result === 'ok') return;

    const settled = new Set([...result.applied, ...result.rejected.map((entry) => entry.id)]);
    this.pending = this.pending.filter((transaction) => !settled.has(transaction.id));
    this.persist();
    this.knownVersion = result.project.version;
    this.acked = ackedFromDto(result.project);
    // Someone else wrote in between, or something we sent did not land, or the stored document is
    // not what we computed: the only honest move is to adopt the server's copy and replay what is
    // still pending. When edits arrived while the request was out, the local hash cannot be
    // compared (it includes them); the version and the rejections still decide.
    const editedMeanwhile = this.pending.length !== pendingAtSend - batch.length;
    const diverged = (versionAtSend ?? 0) !== result.baseVersion
      || result.rejected.length > 0
      || (!editedMeanwhile && result.documentHash !== hashAtSend);
    this.deps.onAck(result, { diverged, pending: [...this.pending] });
  }

  private schedule(): void {
    if (this.debounceTimer || this.disposed) return;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flush();
    }, this.deps.debounceMs ?? DEFAULT_DEBOUNCE_MS);
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.disposed || this.blocked) return;
    const delay = this.retryMs;
    this.retryMs = Math.min(MAX_RETRY_MS, delay * 2);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
  }

  private clearDebounce(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private persist(): void {
    try {
      this.deps.store?.save(this.pending);
    } catch {
      /* quota / private mode: the in-memory queue still drives this session */
    }
  }
}

/* ============================ pending transaction storage ============================ */

const PENDING_PREFIX = 'studio:pending-tx:';

/** localStorage-backed pending list. Missing storage degrades to an in-memory queue. */
export function localPendingTransactionStore(projectId: string): PendingTransactionStore {
  const key = `${PENDING_PREFIX}${projectId}`;
  return {
    load: () => {
      try {
        const raw = window.localStorage.getItem(key);
        const parsed = raw ? (JSON.parse(raw) as unknown) : null;
        return Array.isArray(parsed) ? (parsed as DocumentTransaction[]) : [];
      } catch {
        return [];
      }
    },
    save: (transactions) => {
      try {
        if (transactions.length) window.localStorage.setItem(key, JSON.stringify(transactions));
        else window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export function clearPendingTransactions(projectId: string): void {
  try {
    window.localStorage.removeItem(`${PENDING_PREFIX}${projectId}`);
  } catch {
    /* ignore */
  }
}
