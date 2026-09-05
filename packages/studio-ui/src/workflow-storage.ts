import { validateWorkflow, type WorkflowDefinition, type WorkflowRun } from '@pireel/studio-engine/workflow';
import { STUDIO_WORKFLOW_CAPABILITIES } from '@pireel/studio-engine/workflow-catalog';
import { recoverWorkflowRun } from '@pireel/studio-engine/workflow-runtime';

export interface WorkflowBrowserState {
  schemaVersion: 1;
  definitions: WorkflowDefinition[];
  runs: WorkflowRun[];
}
/** Account+project-scoped device storage. No promise of cloud sync or background execution. */
export function workflowStorageKey(scope: string, projectId: string): string {
  return 'studio.workflows.v1:' + encodeURIComponent(scope) + ':' + encodeURIComponent(projectId);
}
export function parseWorkflowBrowserState(raw: string | null): WorkflowBrowserState {
  if (!raw) return { schemaVersion: 1, definitions: [], runs: [] };
  const data = JSON.parse(raw) as WorkflowBrowserState;
  if (data.schemaVersion !== 1 || !Array.isArray(data.definitions) || !Array.isArray(data.runs) || data.definitions.length > 50 || data.runs.length > 20) throw new Error('Invalid workflow storage');
  for (const definition of data.definitions) validateWorkflow(definition, STUDIO_WORKFLOW_CAPABILITIES);
  for (const run of data.runs) {
    validateWorkflow(run.definition, STUDIO_WORKFLOW_CAPABILITIES);
    if (run.schemaVersion !== 1 || !run.id || !Array.isArray(run.steps) || !run.source?.outputId) throw new Error('Invalid workflow run');
  }
  return { ...data, runs: data.runs.map(recoverWorkflowRun) };
}
export function storeWorkflowRun(state: WorkflowBrowserState, run: WorkflowRun): WorkflowBrowserState {
  return { ...state, runs: [structuredClone(run), ...state.runs.filter((item) => item.id !== run.id)].slice(0, 20) };
}
