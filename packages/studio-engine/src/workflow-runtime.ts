import { validateWorkflow, type WorkflowArtifact, type WorkflowCapability, type WorkflowInputs, type WorkflowRun, type WorkflowStep, type WorkflowStepRun } from './workflow';
import { assertWorkflowValue } from './workflow-schema';

export type WorkflowExecutionResult =
  | { status: 'completed'; artifact: WorkflowArtifact; summary: string; audit?: Pick<WorkflowStepRun, 'cacheHit' | 'inputKey' | 'billing' | 'usage'> }
  | { status: 'waiting'; jobId: string; summary: string; approval?: import('./workflow').WorkflowApproval };
export interface WorkflowExecutor {
  /** Re-check access, input readiness and capability requirements before *each* step. */
  preflight(step: WorkflowStep, run: WorkflowRun): Promise<void>;
  execute(step: WorkflowStep, args: WorkflowInputs, context: { run: WorkflowRun; idempotencyKey: string }): Promise<WorkflowExecutionResult>;
  poll?(step: WorkflowStep, jobId: string, run: WorkflowRun): Promise<WorkflowExecutionResult>;
}
export interface WorkflowRunStore {
  /** A failed checkpoint prevents executing further side effects. */
  save(run: WorkflowRun): Promise<void>;
}

export function argumentsFor(step: WorkflowStep, run: WorkflowRun, bindings = step.arguments): WorkflowInputs {
  return Object.fromEntries(Object.entries(bindings).map(([key, binding]) => {
    if (binding.kind === 'literal') return [key, structuredClone(binding.value)];
    if (binding.kind === 'input') return [key, run.inputs[binding.key]];
    const parent = run.steps.find((item) => item.id === binding.stepId);
    if (!parent || !['completed','skipped'].includes(parent.status) || !parent.artifact || !Object.hasOwn(parent.artifact.data, binding.key)) throw new Error('Missing step artifact: ' + binding.stepId + '.' + binding.key);
    return [key, structuredClone(parent.artifact.data[binding.key])];
  }));
}

/**
 * Serial DAG executor. A host can rehydrate a waiting run after a durable callback.
 * Running/failed/interrupted writes are never blindly replayed: reconciliation is a host concern.
 * Cancellation stops after the in-flight operation settles, retaining its real outcome.
 */
export async function executeWorkflow(run: WorkflowRun, catalog: readonly WorkflowCapability[], executor: WorkflowExecutor, store: WorkflowRunStore, options: {
  signal?: AbortSignal;
  onChange?: (run: WorkflowRun) => void;
  now?: () => number;
} = {}): Promise<WorkflowRun> {
  const ordered = validateWorkflow(run.definition, catalog);
  if (run.definition.publication) throw new Error('Publication adapter is not installed');
  if (run.status !== 'ready' && run.status !== 'waiting') throw new Error('Run cannot be replayed without reconciliation');
  const state = structuredClone(run);
  const now = options.now ?? Date.now;
  const checkpoint = async () => {
    state.updatedAt = now();
    await store.save(structuredClone(state));
    options.onChange?.(structuredClone(state));
  };
  // Resolve unavailable capability versions before any edit, including a source duplication.
  for (const step of ordered) {
    if (step.enabledBy && state.inputs[step.enabledBy] !== true) continue;
    if (!catalog.find((item) => item.id === step.capability && item.version === step.version)?.available) throw new Error('Capability is not installed: ' + step.capability);
  }
  state.status = 'running';
  await checkpoint();
  for (const step of ordered) {
    const record = state.steps.find((item) => item.id === step.id);
    if (!record) throw new Error('Missing step checkpoint');
    if (record.status === 'completed' || record.status === 'skipped') continue;
    if (options.signal?.aborted) { state.status = 'cancelled'; await checkpoint(); return state; }
    if (step.enabledBy && state.inputs[step.enabledBy] !== true) {
      if (step.bypass) record.artifact = { kind: 'value', data: argumentsFor(step, state, step.bypass) };
      record.status = 'skipped'; await checkpoint(); continue;
    }
    if (step.dependsOn.some((id) => !['completed', 'skipped'].includes(state.steps.find((item) => item.id === id)?.status ?? 'pending'))) throw new Error('Dependency has not completed');
    if (record.status !== 'pending' && record.status !== 'waiting') throw new Error('Step needs reconciliation: ' + step.id);
    if (record.approval?.status === 'pending') { state.status = 'waiting'; await checkpoint(); return state; }
    let outcome: WorkflowExecutionResult;
    try {
      await executor.preflight(step, structuredClone(state));
      if (record.status === 'waiting') {
        if (!record.jobId || !executor.poll) throw new Error('This executor cannot resume the pending job');
        outcome = await executor.poll(step, record.jobId, structuredClone(state));
      } else {
        const args = argumentsFor(step, state);
        const capability = catalog.find(item => item.id === step.capability && item.version === step.version)!;
        for (const [key, port] of Object.entries(capability.inputs ?? {})) if (!Object.hasOwn(args, key) && port.default !== undefined) args[key] = structuredClone(port.default);
        for (const [key, port] of Object.entries(capability.inputs ?? {})) if (port.schema && Object.hasOwn(args, key)) assertWorkflowValue(args[key], port.schema, step.id + '.' + key);
        record.inputs = structuredClone(args);
        record.status = 'running'; record.attempt += 1; record.startedAt = now();
        // Save BEFORE executing, so a crash never looks like a safe-to-replay pending edit.
        await checkpoint();
        outcome = await executor.execute(step, args, { run: structuredClone(state), idempotencyKey: record.idempotencyKey });
      }
      applyOutcome(record, outcome);
      if (outcome.status === 'completed') record.finishedAt = now();
      const capability = catalog.find(item => item.id === step.capability && item.version === step.version)!;
      if (outcome.status === 'completed' && capability.outputs) {
        for (const [key, port] of Object.entries(capability.outputs)) {
          if (!Object.hasOwn(outcome.artifact.data, key)) throw new Error('Missing node output: ' + step.id + '.' + key);
          if (port.schema) assertWorkflowValue(outcome.artifact.data[key], port.schema, step.id + '.' + key);
        }
      }
      if (record.approval && step.arguments.notify) {
        const args = argumentsFor(step, state);
        if (args.notify === true) (state.notices ??= []).push({ id: record.approval.id, nodeId: step.id, title: record.approval.title, message: '请确认后继续', approvalId: record.approval.id, createdAt: now() });
      }
      if (step.capability === 'notification.send' && outcome.status === 'completed') {
        const args = argumentsFor(step, state);
        (state.notices ??= []).push({ id: record.idempotencyKey, nodeId: step.id, title: String(args.title), message: String(args.message), createdAt: now() });
      }
    } catch (error) {
      record.status = 'failed'; record.finishedAt = now();
      record.error = error instanceof Error ? error.message : String(error);
      state.status = 'failed'; state.error = record.error;
      await checkpoint();
      return state;
    }
    if (outcome.status === 'waiting') {
      state.status = 'waiting'; await checkpoint(); return state;
    }
    await checkpoint();
  }
  state.status = options.signal?.aborted ? 'cancelled' : 'completed';
  await checkpoint();
  return state;
}

function applyOutcome(record: WorkflowStepRun, outcome: WorkflowExecutionResult) {
  if (outcome.status !== 'completed' && outcome.status !== 'waiting') throw new Error('Invalid execution receipt');
  if (outcome.status === 'completed' && (!outcome.artifact || !outcome.artifact.kind || !outcome.artifact.data)) throw new Error('Completed operation did not return an artifact');
  if (outcome.status === 'waiting' && !outcome.jobId) throw new Error('Async operation did not return a job id');
  record.status = outcome.status; record.summary = outcome.summary;
  if (outcome.status === 'waiting') {
    record.jobId = outcome.jobId;
    if (outcome.approval) record.approval = structuredClone(outcome.approval);
  } else {
    record.artifact = structuredClone(outcome.artifact);
    if (outcome.audit) Object.assign(record, outcome.audit);
    delete record.jobId;
  }
}

/** Browser reloads are interruptions, never evidence that a mutating step failed safely. */
export function recoverWorkflowRun(run: WorkflowRun): WorkflowRun {
  const restored = structuredClone(run);
  if (restored.status === 'running') {
    restored.status = 'interrupted';
    restored.error = 'Execution was interrupted. Check the output before starting a new run.';
  }
  return restored;
}
