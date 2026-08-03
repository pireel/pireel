/**
 * Long-running analysis + reviewable edit-proposal contract.
 *
 * This module is deliberately pure: the browser, MCP route, and a future queue worker share the
 * same state machine without importing React, a database, or a provider. Analysis produces a
 * proposal; only an explicit apply evaluates its operations against a cloned Composition.
 */

import type { Composition } from './composition-core';
import { validateStudioProposalBudget } from './agent-execution-budget';
import { validateComposition } from './editing-primitives';
import { compReceiptDelta, type ReceiptDelta } from './receipt-delta';
import { canonicalJson, hashSection } from './stable-json';

export type AnalysisJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type EditProposalStatus = 'ready' | 'applied' | 'discarded';

export interface CompositionRevision {
  /** Cloud project version is provenance/concurrency context. It is not the staleness decision:
   * chat/context-only saves also increment it, while leaving the editable composition unchanged. */
  projectVersion: number | null;
  /** Hash of persistent editing state plus the caller-provided main-source fingerprint. */
  compositionHash: string;
}

export interface AnalysisJobError {
  code: string;
  message: string;
  retryable: boolean;
  detail?: unknown;
}

export interface ProposalOperation {
  /** Existing mutation-tool id. The execution surface remains responsible for its allowlist. */
  tool: string;
  input: Record<string, unknown>;
}

export interface EditProposal {
  id: string;
  jobId: string;
  projectId: string;
  analysisType: string;
  status: EditProposalStatus;
  baseRevision: CompositionRevision;
  operations: ProposalOperation[];
  warnings: string[];
  confidence?: number;
  summary?: string;
  createdAt: number;
  appliedAt?: number;
  discardedAt?: number;
}

export interface AnalysisJob {
  id: string;
  projectId: string;
  type: string;
  input: Record<string, unknown>;
  status: AnalysisJobStatus;
  progress: number;
  attempt: number;
  baseRevision: CompositionRevision;
  idempotencyKey?: string;
  progressMessage?: string;
  cancelRequested?: boolean;
  result?: unknown;
  proposal?: EditProposal;
  error?: AnalysisJobError;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface ProposalDraft {
  operations: ProposalOperation[];
  warnings?: string[];
  confidence?: number;
  summary?: string;
  result?: unknown;
}

export interface ProposalExecutionResult {
  ok: boolean;
  comp?: Composition;
  error?: string;
  data?: unknown;
}

export type ProposalOperationExecutor = (operation: ProposalOperation, comp: Composition) => ProposalExecutionResult;

export interface ProposalEvaluation {
  ok: boolean;
  error?: string;
  code?: 'proposal_not_ready' | 'proposal_stale' | 'operation_failed' | 'composition_invalid';
  operationIndex?: number;
  operation?: ProposalOperation;
  data?: unknown;
  candidate?: Composition;
  delta?: ReceiptDelta;
}

export interface ProposalApplyResult extends ProposalEvaluation {
  proposal: EditProposal;
  alreadyApplied?: boolean;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const defaultId = (prefix: 'ajob' | 'prop') =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

/** Blob URLs are session-local and the main video's URL is absent from cloud snapshots. Normalize
 * those transport details out while retaining source sigs/remote URLs and every editable field. */
function revisionPayload(comp: Composition, sourceFingerprint?: string | null): unknown {
  return {
    sourceFingerprint: sourceFingerprint ?? null,
    composition: {
      ...comp,
      video: null,
      shots: (comp.shots ?? []).map((shot) => {
        const source = shot.srcSig ? `sig:${shot.srcSig}` : shot.src?.startsWith('blob:') ? 'blob:unresolved' : shot.src;
        return { ...shot, ...(source ? { src: source } : { src: undefined }) };
      }),
    },
  };
}

export function compositionRevision(
  comp: Composition,
  options: { projectVersion?: number | null; sourceFingerprint?: string | null } = {},
): CompositionRevision {
  const canonical = canonicalJson(revisionPayload(comp, options.sourceFingerprint));
  return {
    projectVersion: options.projectVersion ?? null,
    compositionHash: hashSection(canonical),
  };
}

export function createAnalysisJob(args: {
  projectId: string;
  type: string;
  input?: Record<string, unknown>;
  baseRevision: CompositionRevision;
  idempotencyKey?: string;
  id?: string;
  now?: number;
}): AnalysisJob {
  const now = args.now ?? Date.now();
  return {
    id: args.id ?? defaultId('ajob'),
    projectId: args.projectId,
    type: args.type,
    input: clone(args.input ?? {}),
    status: 'queued',
    progress: 0,
    attempt: 1,
    baseRevision: clone(args.baseRevision),
    ...(args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

function requireStatus(job: AnalysisJob, allowed: AnalysisJobStatus[], action: string): void {
  if (!allowed.includes(job.status)) throw new Error(`${action} requires ${allowed.join('|')}; job is ${job.status}`);
}

export function startAnalysisJob(job: AnalysisJob, now = Date.now()): AnalysisJob {
  requireStatus(job, ['queued'], 'start');
  return { ...job, status: 'running', progress: 0, cancelRequested: undefined, startedAt: now, updatedAt: now };
}

export function reportAnalysisProgress(job: AnalysisJob, progress: number, message?: string, now = Date.now()): AnalysisJob {
  requireStatus(job, ['running'], 'progress');
  const next = Math.max(job.progress, Math.min(0.99, clamp01(progress)));
  return { ...job, progress: next, ...(message ? { progressMessage: message } : {}), updatedAt: now };
}

/** Queued work cancels immediately. Running work records a cooperative request; the worker calls
 * cancelAnalysisJob at its next safe boundary so no half-result is published. */
export function requestAnalysisCancellation(job: AnalysisJob, now = Date.now()): AnalysisJob {
  if (job.status === 'cancelled') return job;
  requireStatus(job, ['queued', 'running'], 'cancel');
  if (job.status === 'queued') return cancelAnalysisJob(job, now);
  return { ...job, cancelRequested: true, updatedAt: now };
}

export function cancelAnalysisJob(job: AnalysisJob, now = Date.now()): AnalysisJob {
  if (job.status === 'cancelled') return job;
  requireStatus(job, ['queued', 'running'], 'cancel');
  return {
    ...job,
    status: 'cancelled',
    cancelRequested: undefined,
    progressMessage: undefined,
    finishedAt: now,
    updatedAt: now,
  };
}

export function failAnalysisJob(job: AnalysisJob, error: AnalysisJobError, now = Date.now()): AnalysisJob {
  requireStatus(job, ['running'], 'fail');
  return {
    ...job,
    status: 'failed',
    error: clone(error),
    cancelRequested: undefined,
    progressMessage: undefined,
    finishedAt: now,
    updatedAt: now,
  };
}

export function completeAnalysisJob(
  job: AnalysisJob,
  draft: ProposalDraft,
  options: { proposalId?: string; now?: number } = {},
): AnalysisJob {
  requireStatus(job, ['running'], 'complete');
  if (job.cancelRequested) throw new Error('complete rejected: cancellation requested');
  if (!draft.operations.length) throw new Error('complete requires at least one proposal operation');
  const budget = validateStudioProposalBudget(draft.operations);
  if (!budget.ok) throw new Error(`proposal budget exceeded: ${budget.error}`);
  const now = options.now ?? Date.now();
  const proposal: EditProposal = {
    id: options.proposalId ?? defaultId('prop'),
    jobId: job.id,
    projectId: job.projectId,
    analysisType: job.type,
    status: 'ready',
    baseRevision: clone(job.baseRevision),
    operations: clone(draft.operations),
    warnings: [...(draft.warnings ?? [])],
    ...(draft.confidence != null ? { confidence: clamp01(draft.confidence) } : {}),
    ...(draft.summary ? { summary: draft.summary } : {}),
    createdAt: now,
  };
  return {
    ...job,
    status: 'succeeded',
    progress: 1,
    progressMessage: undefined,
    proposal,
    ...(draft.result !== undefined ? { result: clone(draft.result) } : {}),
    finishedAt: now,
    updatedAt: now,
  };
}

export function retryAnalysisJob(
  job: AnalysisJob,
  baseRevision: CompositionRevision,
  options: { now?: number; input?: Record<string, unknown> } = {},
): AnalysisJob {
  requireStatus(job, ['failed', 'cancelled'], 'retry');
  const now = options.now ?? Date.now();
  return {
    ...job,
    input: clone(options.input ?? job.input),
    status: 'queued',
    progress: 0,
    attempt: job.attempt + 1,
    baseRevision: clone(baseRevision),
    progressMessage: undefined,
    cancelRequested: undefined,
    result: undefined,
    proposal: undefined,
    error: undefined,
    startedAt: undefined,
    finishedAt: undefined,
    updatedAt: now,
  };
}

export function isProposalStale(proposal: EditProposal, currentRevision: CompositionRevision): boolean {
  return proposal.baseRevision.compositionHash !== currentRevision.compositionHash;
}

/** Evaluate every operation on a private clone. The caller's Composition is never mutated, so a
 * failed later operation cannot leave an earlier operation partially applied. */
export function evaluateEditProposal(
  proposal: EditProposal,
  current: Composition,
  currentRevision: CompositionRevision,
  execute: ProposalOperationExecutor,
): ProposalEvaluation {
  if (proposal.status !== 'ready') return { ok: false, code: 'proposal_not_ready', error: `proposal is ${proposal.status}` };
  if (isProposalStale(proposal, currentRevision)) {
    return {
      ok: false,
      code: 'proposal_stale',
      error: 'proposal base composition no longer matches the project',
      data: { baseRevision: proposal.baseRevision, currentRevision },
    };
  }

  let candidate = clone(current);
  for (let index = 0; index < proposal.operations.length; index += 1) {
    const operation = proposal.operations[index]!;
    const result = execute(operation, candidate);
    if (!result.ok || !result.comp) {
      return {
        ok: false,
        code: 'operation_failed',
        error: result.error ?? `proposal operation ${index + 1} failed`,
        data: result.data,
        operationIndex: index,
        operation,
      };
    }
    candidate = clone(result.comp);
  }

  const issues = validateComposition(candidate);
  if (issues.length) {
    return { ok: false, code: 'composition_invalid', error: 'proposal result violates composition invariants', data: { issues } };
  }
  const delta = compReceiptDelta(current, candidate);
  return { ok: true, candidate, ...(delta ? { delta } : {}) };
}

export function applyEditProposal(
  proposal: EditProposal,
  current: Composition,
  currentRevision: CompositionRevision,
  execute: ProposalOperationExecutor,
  now = Date.now(),
): ProposalApplyResult {
  if (proposal.status === 'applied') return { ok: true, proposal, alreadyApplied: true };
  const evaluated = evaluateEditProposal(proposal, current, currentRevision, execute);
  if (!evaluated.ok) return { ...evaluated, proposal };
  return {
    ...evaluated,
    proposal: { ...proposal, status: 'applied', appliedAt: now },
  };
}

export function discardEditProposal(proposal: EditProposal, now = Date.now()): EditProposal {
  if (proposal.status === 'discarded') return proposal;
  if (proposal.status !== 'ready') throw new Error(`discard requires ready; proposal is ${proposal.status}`);
  return { ...proposal, status: 'discarded', discardedAt: now };
}
