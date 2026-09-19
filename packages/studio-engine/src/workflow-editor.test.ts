import { expect, it } from 'vitest';
import { WORKFLOW_NODE_CATALOG, addWorkflowNode, bindWorkflowPort, insertWorkflowTransform, removeWorkflowNode, workflowDiagnostics, workflowToTarget } from './workflow-editor';
import { validateWorkflow, type WorkflowDefinition } from './workflow';
import { artifactVersion } from './workflow-artifacts';
import { validateWorkflowSchema } from './workflow-schema';
const fixture = (): WorkflowDefinition => ({ schemaVersion: 1, id: 'test', version: 1, title: 'Test', templateId: 'test', parameters: {}, trigger: { kind: 'manual' }, steps: [{ id: 'source', capability: 'data.value', version: 1, dependsOn: [], arguments: { value: { kind: 'literal', value: { text: 'hello' } } } }] });
it('publishes valid schemas on every media input and output', () => {
  for (const cap of WORKFLOW_NODE_CATALOG.filter(cap => !['llm.transform', 'human.approval', 'notification.send'].includes(cap.id))) {
    expect(cap.label.zh).not.toBe(cap.id);
    for (const port of [...Object.values(cap.inputs!), ...Object.values(cap.outputs!)]) { expect(port.schema).toBeDefined(); validateWorkflowSchema(port.schema!); }
  }
});
it('adds and binds nodes, tests only ancestors, and protects dependent connections on deletion', () => {
  let { definition, stepId } = addWorkflowNode(fixture(), WORKFLOW_NODE_CATALOG.find(cap => cap.id === 'data.value')!);
  definition = bindWorkflowPort(definition, stepId, 'value', { kind: 'step', stepId: 'source', key: 'value' });
  expect(workflowDiagnostics(definition)).toEqual([]);
  expect(workflowToTarget(definition, 'source').steps).toHaveLength(1);
  expect(workflowToTarget(definition, stepId).steps).toHaveLength(2);
  expect(() => removeWorkflowNode(definition, 'source')).toThrow('下游');
  expect(removeWorkflowNode(definition, stepId).steps).toHaveLength(1);
  definition = bindWorkflowPort(definition, 'source', 'value', { kind: 'step', stepId, key: 'value' });
  expect(workflowDiagnostics(definition)[0]).toContain('cycle');
});
it('inserts approval with a real output schema and rewires the downstream port', () => {
  const added = addWorkflowNode(fixture(), WORKFLOW_NODE_CATALOG.find(cap => cap.id === 'data.value')!);
  const linked = bindWorkflowPort(added.definition, added.stepId, 'value', { kind: 'step', stepId: 'source', key: 'value' });
  const result = insertWorkflowTransform(linked, added.stepId, 'value', 'human.approval');
  expect(workflowDiagnostics(result.definition)).toEqual([]);
  expect(result.definition.steps.find(step => step.id === added.stepId)?.dependsOn).toEqual([result.stepId]);
  expect(result.definition.steps.find(step => step.id === result.stepId)?.arguments.notify).toEqual({ kind: 'literal', value: true });
});
it('rejects wrong artifact kinds and invalid literals before any node runs', async () => {
  const media = { kind: 'media', id: 'm', version: await artifactVersion('m') };
  const definition = fixture(); definition.steps = [{ id: 'render', capability: 'video.render', version: 2, dependsOn: [], arguments: { document: { kind: 'literal', value: media }, media: { kind: 'literal', value: media } } }];
  expect(() => validateWorkflow(definition, WORKFLOW_NODE_CATALOG)).toThrow('kind');
});
it('rejects missing voices and empty footage before upstream paid work can start', () => {
  const definition = fixture(); definition.steps.push({ id: 'plan', capability: 'speech.plan', version: 1, dependsOn: [], arguments: { source: { kind: 'literal', value: {} }, units: { kind: 'literal', value: [] }, translation: { kind: 'literal', value: {} }, config: { kind: 'literal', value: { voiceId: '' } } } });
  expect(workflowDiagnostics(definition)).not.toEqual([]);
  const analysis = addWorkflowNode(fixture(), WORKFLOW_NODE_CATALOG.find(cap => cap.id === 'media.analyze')!);
  expect(workflowDiagnostics(analysis.definition)[0]).toContain('assets');
});
