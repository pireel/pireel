import type { WorkflowCapability, WorkflowInputs, WorkflowRun, WorkflowValue } from './workflow';
import type { WorkflowExecutor, WorkflowExecutionResult } from './workflow-runtime';
import { assertWorkflowValue, validateWorkflowSchema, type WorkflowSchema } from './workflow-schema';

const string = (maxLength: number) => ({ schema: { type: 'string' as const, minLength: 1, maxLength }, required: true });
export const GENERIC_WORKFLOW_CAPABILITIES: WorkflowCapability[] = [
  { id: 'llm.transform', version: 1, label: { zh: 'LLM 加工', en: 'LLM transform' }, requirements: ['language-model'], environments: ['cloud'], effect: 'generate', retry: 'reconcile-first', available: true,
    inputs: { instruction: string(12000), value: { required: true }, schema: { required: true } }, outputs: { value: {} } },
  { id: 'human.approval', version: 1, label: { zh: '人工确认', en: 'Approval' }, requirements: [], environments: ['cloud'], effect: 'read', retry: 'safe', available: true,
    inputs: { title: string(200), value: { required: true }, schema: { required: true }, editable: { schema: { type: 'boolean' } }, notify: { schema: { type: 'boolean' } } }, outputs: { value: {} } },
  { id: 'notification.send', version: 1, label: { zh: '站内通知', en: 'Notification' }, requirements: [], environments: ['cloud'], effect: 'publish', retry: 'safe', available: true,
    inputs: { title: string(200), message: string(2000) }, outputs: { receiptId: { schema: { type: 'string' } } } },
];

export function genericWorkflowExecutor(host: {
  transform(args: { instruction: string; value: WorkflowValue; schema: WorkflowSchema; idempotencyKey: string }): Promise<WorkflowValue>;
}): WorkflowExecutor {
  return {
    async preflight() {},
    async execute(step, args, { idempotencyKey }): Promise<WorkflowExecutionResult> {
      if (step.capability === 'notification.send') return { status: 'completed', summary: 'Notification recorded', artifact: { kind: 'notification', data: { receiptId: idempotencyKey } } };
      const schema = args.schema as unknown as WorkflowSchema;
      validateWorkflowSchema(schema);
      if (step.capability === 'human.approval') {
        assertWorkflowValue(args.value, schema);
        return { status: 'waiting', jobId: idempotencyKey, summary: String(args.title), approval: {
          id: idempotencyKey, title: String(args.title), value: args.value, schema,
          editable: args.editable === true, status: 'pending',
        } };
      }
      if (step.capability !== 'llm.transform') throw new Error('Unsupported generic capability');
      const value = await host.transform({ instruction: String(args.instruction), value: args.value, schema, idempotencyKey });
      assertWorkflowValue(value, schema);
      return { status: 'completed', summary: 'LLM transform completed', artifact: { kind: 'value', data: { value } } };
    },
  };
}

/** Caller must authenticate the actor and CAS-save this decision before resuming execution. */
export function decideWorkflowApproval(run: WorkflowRun, requestId: string, decision: 'approve' | 'reject', actor: string, value?: WorkflowValue, now = Date.now()): WorkflowRun {
  if (!actor || run.status !== 'waiting') throw new Error('Run is not awaiting approval');
  const next = structuredClone(run);
  const step = next.steps.find(step => step.approval?.id === requestId && step.status === 'waiting');
  const approval = step?.approval;
  if (!step || !approval || approval.status !== 'pending') throw new Error('Approval is no longer pending');
  if (decision !== 'approve' && decision !== 'reject') throw new Error('Invalid approval decision');
  if (decision === 'reject') {
    approval.status = 'rejected'; step.status = 'failed'; next.status = 'cancelled';
  } else {
    const confirmed = value === undefined ? approval.value : value;
    if (!approval.editable && JSON.stringify(confirmed) !== JSON.stringify(approval.value)) throw new Error('Approval is read-only');
    assertWorkflowValue(confirmed, approval.schema);
    approval.value = confirmed; approval.status = 'approved'; step.status = 'completed';
    step.artifact = { kind: 'approval', data: { value: confirmed } }; delete step.jobId;
    next.status = 'ready';
  }
  approval.decidedBy = actor; approval.decidedAt = now; next.updatedAt = now;
  return next;
}
