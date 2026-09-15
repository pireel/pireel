/**
 * The one place an editor document changes.
 *
 * Every edit — a drag, an inspector field, a keyboard action, an agent tool, a derived relay — is a
 * transaction of named operations. Committing one applies the operations to the live document,
 * publishes the result, records the undo boundary, and hands the transaction to whoever syncs it.
 * The document is never handed around as a value to be "set": callers say what they did.
 *
 * Undo is a snapshot stack, but the snapshot is taken here, once per transaction, not at every
 * call site. Hydration and sync replace the document without becoming a transaction (they are not
 * something the user did); undo, redo and restore replace it as a `document.replace` transaction,
 * because the server has to end up where the user landed.
 */

import type { Composition, EditorDocumentV2 } from '@pireel/studio-engine/composition';
import {
  applyDocumentOp,
  applyDocumentTransaction,
  createDocumentTransactionId,
  encodeOpInput,
  isMissingTargetError,
  normalizeCommittedDocument,
  type DocumentOp,
  type DocumentOpName,
  type DocumentOpOutcome,
  type DocumentTransaction,
  type DocumentTransactionOrigin,
} from '@pireel/studio-engine/document-transaction';

export type CommitUndo = 'step' | 'none';

export interface CommitOptions {
  origin?: DocumentTransactionOrigin;
  /** `step` (default) takes one undo snapshot before applying; `none` for live drags, derived
   *  relays and anything the user would not expect ⌘Z to reverse on its own. */
  undo?: CommitUndo;
  /** Runtime projection to publish alongside (session-only media URLs); never persisted. */
  runtimeComposition?: Composition;
}

export interface ReplaceOptions {
  /** `hydrate`: boot, sync adoption, runtime refresh — publish only. `restore`: undo, redo, output
   *  switch, cloud history — publish and record a `document.replace` transaction. */
  origin: 'hydrate' | 'restore';
  undo?: CommitUndo;
  runtimeComposition?: Composition;
}

export interface DocumentCommitterDeps {
  projectId: string;
  getDocument: () => EditorDocumentV2;
  /** Publish a new authority document to the live session (which projects and normalizes). */
  publish: (document: EditorDocumentV2, runtimeComposition?: Composition) => void;
  undoStack: { current: EditorDocumentV2[] };
  redoStack: { current: EditorDocumentV2[] };
  undoCap: number;
  /** Runs before any user or agent mutation lands: the single-writer handover hook. */
  onBeforeMutation?: () => void;
  /** Receives every recorded transaction, in order, for sync. */
  onTransaction: (transaction: DocumentTransaction) => void;
}

/** A group of commits that should be kept or discarded together (one agent tool call). */
export interface TransactionScope {
  commit: DocumentCommitter['commit'];
  /** `keep` hands the staged transactions to sync; `discard` drops them (the caller restored the document). */
  end: (outcome: 'keep' | 'discard') => void;
}

export class DocumentCommitter {
  private readonly deps: DocumentCommitterDeps;
  private staging: DocumentTransaction[] | null = null;

  constructor(deps: DocumentCommitterDeps) {
    this.deps = deps;
  }

  get projectId(): string {
    return this.deps.projectId;
  }

  get document(): EditorDocumentV2 {
    return this.deps.getDocument();
  }

  /** Snapshot the current document as an undo step and void the redo line. */
  pushUndoSnapshot(): void {
    const { undoStack, redoStack, undoCap } = this.deps;
    undoStack.current.push(this.deps.getDocument());
    if (undoStack.current.length > undoCap) undoStack.current.shift();
    redoStack.current = [];
  }

  /**
   * Apply one operation, or several in order, as one transaction. A failure anywhere leaves the
   * document untouched and reports the failing operation's error; success publishes once and
   * returns the last operation's result (with `document` = what was published). A transaction
   * whose operations change nothing is not recorded.
   */
  commit<N extends DocumentOpName>(op: DocumentOp<N>, options?: CommitOptions): DocumentOpOutcome<N>;
  commit(ops: DocumentOp[], options?: CommitOptions): DocumentOpOutcome;
  commit(input: DocumentOp | DocumentOp[], options: CommitOptions = {}): DocumentOpOutcome {
    // Encoded first so the recorded transaction is exactly what was applied here (clearing
    // `undefined` values survive the wire as a sentinel; see encodeOpInput).
    const ops = (Array.isArray(input) ? input : [input]).map((op) => encodeOpInput(op));
    const before = this.deps.getDocument();
    const ctx = { projectId: this.deps.projectId };
    // Apply raw and normalize once: intermediate results stay visible to later ops in the same commit.
    let current = before;
    let last: DocumentOpOutcome | null = null;
    for (const op of ops) {
      const outcome = applyDocumentOp(current, op, ctx);
      if (!outcome.ok) return { ...outcome, document: before };
      current = outcome.document;
      last = outcome;
    }
    if (!last) return { ok: true, document: before };
    const next = current === before ? before : normalizeCommittedDocument(current);
    if (next === before && !options.runtimeComposition) return { ...last, document: before };
    const origin = options.origin ?? (this.staging ? 'agent' : 'user');
    if (origin === 'user' || origin === 'agent') this.deps.onBeforeMutation?.();
    if ((options.undo ?? 'step') === 'step' && !this.staging) this.pushUndoSnapshot();
    this.deps.publish(next, options.runtimeComposition);
    const published = this.deps.getDocument();
    if (next !== before) this.record({ id: createDocumentTransactionId(), origin, ops });
    return { ...last, document: published };
  }

  /** Replace the whole document. See ReplaceOptions for which callers record a transaction. */
  replace(document: EditorDocumentV2, options: ReplaceOptions): void {
    const before = this.deps.getDocument();
    if (options.origin === 'restore' && (options.undo ?? 'none') === 'step') this.pushUndoSnapshot();
    this.deps.publish(document, options.runtimeComposition);
    if (options.origin !== 'restore') return;
    const published = this.deps.getDocument();
    if (published === before) return;
    this.record({ id: createDocumentTransactionId(), origin: 'restore', ops: [{ op: 'document.replace', input: { document: published } }] });
  }

  /** Re-publish the current document with a fresh runtime projection (media bytes arrived). */
  republish(runtimeComposition?: Composition): void {
    this.deps.publish(this.deps.getDocument(), runtimeComposition);
  }

  /**
   * Rebase: the server's document has moved under us. Adopt it, then re-apply the transactions
   * that are still unacknowledged so nothing the user did here disappears. Missing targets are
   * skipped (an edit that raced a deletion), a transaction that cannot apply at all is dropped and
   * reported. Nothing here is a new transaction — these are already pending.
   */
  rebase(document: EditorDocumentV2, pending: readonly DocumentTransaction[]): { dropped: DocumentTransaction[] } {
    const ctx = { projectId: this.deps.projectId };
    let current = document;
    const dropped: DocumentTransaction[] = [];
    for (const transaction of pending) {
      const result = applyDocumentTransaction(current, transaction, ctx, { skipMissing: true });
      if (!result.ok) {
        dropped.push(transaction);
        continue;
      }
      current = result.document;
    }
    this.deps.publish(current);
    return { dropped };
  }

  /** Open a scope: commits made through it stage their transactions until `end`. A scope opened
   *  while another is active joins it — the outermost decides, so nested tool calls cannot leak. */
  scope(): TransactionScope {
    if (this.staging) return { commit: this.commit.bind(this) as DocumentCommitter['commit'], end: () => {} };
    const staged: DocumentTransaction[] = [];
    this.staging = staged;
    return {
      commit: this.commit.bind(this) as DocumentCommitter['commit'],
      end: (outcome) => {
        if (this.staging !== staged) return;
        this.staging = null;
        if (outcome === 'keep') for (const transaction of staged) this.deps.onTransaction(transaction);
      },
    };
  }

  get scoped(): boolean {
    return this.staging !== null;
  }

  private record(transaction: DocumentTransaction): void {
    if (this.staging) this.staging.push(transaction);
    else this.deps.onTransaction(transaction);
  }
}

/** True when an operation failed only because its target is gone (safe to ignore on replay). */
export const failedOnMissingTarget = (outcome: DocumentOpOutcome): boolean => !outcome.ok && isMissingTargetError(outcome.error);
