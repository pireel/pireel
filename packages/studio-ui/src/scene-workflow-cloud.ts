import { GENERIC_WORKFLOW_CAPABILITIES } from '@pireel/studio-engine/workflow-generic';
import { artifactVersion } from '@pireel/studio-engine/workflow-artifacts';
import type { WorkflowDefinition, WorkflowRun } from '@pireel/studio-engine/workflow';
import type { WorkflowNodeImplementation } from '@pireel/studio-engine/workflow-registry';
import type { WorkflowExecutionResult } from '@pireel/studio-engine/workflow-runtime';

/** Browser media nodes delegate only generic JSON nodes to the authenticated, billed cloud host. */
export function sceneCloudNodes(signal: AbortSignal): WorkflowNodeImplementation[] {
  const request = async (body: unknown): Promise<{ run: WorkflowRun }> => {
    const response = await fetch('/api/studio/workflow-runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? '云端工作流暂时无法执行。');
    return value;
  };
  const outcome = async (run: WorkflowRun): Promise<WorkflowExecutionResult> => {
    if (run.status === 'ready') run = (await request({ action: 'execute', id: run.id })).run;
    const step = run.steps[0];
    if (step.status === 'completed' && step.artifact) return { status: 'completed', artifact: step.artifact, summary: step.summary ?? 'Cloud node completed', audit: { usage: step.usage, billing: { status: 'server-managed', requestId: run.id } } };
    if (run.status === 'waiting') return { status: 'waiting', jobId: run.id, summary: step.summary ?? '等待确认' };
    throw new Error(run.error ?? '云端操作结果尚未确认，请检查工作流待办。');
  };
  return GENERIC_WORKFLOW_CAPABILITIES.map(capability => ({
    capability: { ...capability, environments: ['browser'] },
    async execute(args, context) {
      const definition: WorkflowDefinition = { schemaVersion: 1, id: 'scene-node', version: 1, title: String(args.title ?? capability.label.zh), templateId: 'scene-node', parameters: {}, trigger: { kind: 'manual' }, steps: [{ id: 'operation', capability: capability.id, version: capability.version, dependsOn: [], arguments: Object.fromEntries(Object.entries(args).map(([key, value]) => [key, { kind: 'literal', value }])) }] };
      const creationKey = await artifactVersion([context.idempotencyKey, context.run.source.revision, args]);
      return outcome((await request({ action: 'create', creationKey, definition })).run);
    },
    async poll(jobId) { return outcome((await request({ action: 'get', id: jobId })).run); },
  }));
}
