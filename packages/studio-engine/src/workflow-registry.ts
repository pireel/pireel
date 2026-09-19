import type { WorkflowCapability, WorkflowEnvironment, WorkflowInputs, WorkflowRun, WorkflowStep } from './workflow';
import type { WorkflowExecutionResult, WorkflowExecutor } from './workflow-runtime';

export interface WorkflowNodeImplementation {
  capability: WorkflowCapability;
  execute(args: WorkflowInputs, context: { step: WorkflowStep; run: WorkflowRun; idempotencyKey: string }): Promise<WorkflowExecutionResult>;
  preflight?(step: WorkflowStep, run: WorkflowRun): Promise<void>;
  poll?(jobId: string, context: { step: WorkflowStep; run: WorkflowRun }): Promise<WorkflowExecutionResult>;
}

/** A host advertises only installed implementations, not every theoretical capability. */
export function createWorkflowRegistry(environment: WorkflowEnvironment, implementations: WorkflowNodeImplementation[]): { catalog: WorkflowCapability[]; executor: WorkflowExecutor } {
  const nodes = new Map<string, WorkflowNodeImplementation>();
  const key = (id: string, version: number) => `${id}@${version}`;
  for (const node of implementations) {
    if (!node.capability.environments.includes(environment)) throw new Error('Unsupported node environment: ' + node.capability.id);
    const id = key(node.capability.id, node.capability.version);
    if (nodes.has(id)) throw new Error('Duplicate node implementation: ' + id);
    nodes.set(id, node);
  }
  const get = (step: WorkflowStep) => { const node = nodes.get(key(step.capability, step.version)); if (!node) throw new Error('Node implementation unavailable: ' + step.capability); return node; };
  return { catalog: implementations.map(node => ({ ...node.capability, available: true })), executor: {
    async preflight(step, run) { await get(step).preflight?.(step, run); },
    execute(step, args, context) { return get(step).execute(args, { ...context, step }); },
    poll(step, jobId, run) { const node = get(step); if (!node.poll) throw new Error('Node cannot resume remote jobs'); return node.poll(jobId, { step, run }); },
  } };
}
