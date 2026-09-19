import { EDITING_WORKFLOW_CAPABILITIES, EDITING_NODE_CONTRACTS } from './editing-node-contracts';
import { validateWorkflow, type WorkflowDefinition, type WorkflowStep, type WorkflowBinding, type WorkflowCapability } from './workflow';
import { captionWorkflowDefinition, CAPTION_WORKFLOW_CAPABILITIES, sceneLiteral, stepOutput } from './workflow-caption-template';
import { DUBBING_WORKFLOW_CAPABILITIES, dubbingWorkflowDefinition } from './workflow-dubbing-template';
import { BROLL_WORKFLOW_CAPABILITIES, brollWorkflowDefinition } from './workflow-broll-template';
import { TEXT_WORKFLOW_CAPABILITIES, TEXT_NODE_CONTRACTS } from './workflow-text-contracts';
import { GENERIC_WORKFLOW_CAPABILITIES } from './workflow-generic';
import { SCENE_NODE_CONTRACTS, type NodeContract } from './workflow-node-contracts';
import type { CaptionTaskRecord } from './scene-project';
export const WORKFLOW_NODE_CATALOG = [...CAPTION_WORKFLOW_CAPABILITIES, ...DUBBING_WORKFLOW_CAPABILITIES, ...BROLL_WORKFLOW_CAPABILITIES, ...TEXT_WORKFLOW_CAPABILITIES, ...EDITING_WORKFLOW_CAPABILITIES, ...GENERIC_WORKFLOW_CAPABILITIES];
export const nodeContract = (capability: WorkflowCapability): NodeContract | undefined => TEXT_NODE_CONTRACTS[`${capability.id}@${capability.version}`] ?? TEXT_NODE_CONTRACTS[capability.id] ?? SCENE_NODE_CONTRACTS[capability.id] ?? EDITING_NODE_CONTRACTS[capability.id];
export function workflowToTarget(definition: WorkflowDefinition, targetId: string): WorkflowDefinition {
  const kept = new Set<string>(); const visiting = new Set<string>();
  const visit = (id: string) => {
    if (kept.has(id)) return;
    if (visiting.has(id)) throw new Error('工作流存在循环依赖。');
    const step = definition.steps.find(step => step.id === id); if (!step) throw new Error('找不到节点：' + id);
    visiting.add(id); step.dependsOn.forEach(visit); visiting.delete(id); kept.add(id);
  };
  visit(targetId);
  const next = structuredClone(definition); next.steps = next.steps.filter(step => kept.has(step.id)); delete next.publication;
  return next;
}
export function workflowBindingDependencies(step: WorkflowStep): WorkflowStep {
  return { ...step, dependsOn: [...new Set([...Object.values(step.arguments), ...Object.values(step.bypass ?? {})].flatMap(binding => binding.kind === 'step' ? [binding.stepId] : []))] };
}
export function bindWorkflowPort(definition: WorkflowDefinition, stepId: string, port: string, binding: WorkflowBinding): WorkflowDefinition {
  return { ...definition, steps: definition.steps.map(step => step.id === stepId ? workflowBindingDependencies({ ...step, arguments: { ...step.arguments, [port]: binding } }) : step) };
}
export function removeWorkflowNode(definition: WorkflowDefinition, stepId: string): WorkflowDefinition {
  const consumers = definition.steps.filter(step => step.dependsOn.includes(stepId));
  if (consumers.length) throw new Error('请先修改下游输入：' + consumers.map(step => step.id).join('、'));
  return { ...definition, steps: definition.steps.filter(step => step.id !== stepId) };
}
export function addWorkflowNode(definition: WorkflowDefinition, capability: WorkflowCapability): { definition: WorkflowDefinition; stepId: string } {
  const stem = capability.id.replaceAll('.', '-'); let id = stem; let count = 2;
  while (definition.steps.some(step => step.id === id)) id = stem + '-' + count++;
  const args: WorkflowStep['arguments'] = {};
  for (const [name, port] of Object.entries(capability.inputs ?? {})) {
    if (name === 'projectId' && definition.parameters.projectId) args[name] = { kind: 'input', key: 'projectId' };
    else if (name === 'media' && definition.parameters.source) args[name] = { kind: 'input', key: 'source' };
    else if (name === 'durationSec' && definition.parameters.duration) args[name] = { kind: 'input', key: 'duration' };
    else if (port.default !== undefined) args[name] = sceneLiteral(port.default);
    else if (name === 'schema') args[name] = sceneLiteral({ type: 'object', properties: {}, additionalProperties: true });
    else if (['instruction', 'title', 'message'].includes(name)) args[name] = sceneLiteral(name === 'instruction' ? '保留数据结构，润色文本。' : '检查当前结果');
    else if (name === 'value') args[name] = sceneLiteral({ text: '在这里输入测试内容' });
  }
  const step: WorkflowStep = { id, capability: capability.id, version: capability.version, dependsOn: [], arguments: args };
  return { definition: { ...definition, steps: [...definition.steps, step] }, stepId: id };
}
export function insertWorkflowTransform(definition: WorkflowDefinition, consumerId: string, input: string, capabilityId: 'llm.transform' | 'human.approval') {
  const consumer = definition.steps.find(step => step.id === consumerId); const binding = consumer?.arguments[input];
  if (!consumer || !binding) throw new Error('先给这个输入选择数据来源。');
  const cap = WORKFLOW_NODE_CATALOG.find(cap => cap.id === consumer.capability && cap.version === consumer.version)!;
  const schema = cap.inputs?.[input]?.schema;
  if (!schema) throw new Error('这个输入尚无输出契约，不能自动插入加工节点。');
  const added = addWorkflowNode(definition, GENERIC_WORKFLOW_CAPABILITIES.find(cap => cap.id === capabilityId)!);
  const inserted = added.definition.steps.at(-1)!;
  inserted.arguments.value = binding; inserted.arguments.schema = sceneLiteral(schema);
  if (capabilityId === 'human.approval') { inserted.arguments.editable = sceneLiteral(true); inserted.arguments.notify = sceneLiteral(true); }
  Object.assign(inserted, workflowBindingDependencies(inserted));
  added.definition.steps.pop(); added.definition.steps.splice(added.definition.steps.findIndex(step => step.id === consumerId), 0, inserted);
  return { definition: bindWorkflowPort(added.definition, consumerId, input, stepOutput(inserted.id, 'value')), stepId: inserted.id };
}
export function workflowPortChoices(definition: WorkflowDefinition, consumerId: string, portName: string) {
  const consumer = definition.steps.find(step => step.id === consumerId)!;
  const input = WORKFLOW_NODE_CATALOG.find(cap => cap.id === consumer.capability && cap.version === consumer.version)?.inputs?.[portName];
  const downstream = new Set([consumerId]);
  let changed = true; while (changed) { changed = false; for (const step of definition.steps) if (!downstream.has(step.id) && step.dependsOn.some(id => downstream.has(id))) { downstream.add(step.id); changed = true; } }
  return definition.steps.filter(step => !downstream.has(step.id)).flatMap(step => {
    const cap = WORKFLOW_NODE_CATALOG.find(cap => cap.id === step.capability && cap.version === step.version);
    return Object.entries(cap?.outputs ?? {}).filter(([, output]) => {
      if (input?.valueType && output.valueType && input.valueType !== 'json' && output.valueType !== 'json' && input.valueType !== output.valueType) return false;
      if (input?.schema?.type && output.schema?.type && input.schema.type !== output.schema.type) return false;
      return true;
    }).map(([key, output]) => ({ binding: stepOutput(step.id, key), label: `${step.id} · ${output.label ?? key}`, key: `step:${step.id}:${key}` }));
  });
}
export function workflowDiagnostics(definition: WorkflowDefinition): string[] {
  try { validateWorkflow(definition, WORKFLOW_NODE_CATALOG); return []; } catch (error) { return [error instanceof Error ? error.message : String(error)]; }
}
/** New compositions use separate translation and speech planning; v2 definitions remain readable. */
export function atomicDubbingDefinition(task: CaptionTaskRecord, media: unknown, transcript: unknown): WorkflowDefinition {
  const definition = dubbingWorkflowDefinition(task.options, media, transcript, task.id, task.name);
  definition.version = 3;
  const config = task.options.dubbing!;
  const translateIndex = definition.steps.findIndex(step => step.id === 'translate');
  const prepare = workflowBindingDependencies({ id: 'speechText', capability: 'speech.prepare', version: 1, dependsOn: [], arguments: { transcript: stepOutput('transcript', 'transcript'), media: sceneLiteral(media), script: sceneLiteral(config.script ?? '') } });
  const translate = workflowBindingDependencies({ id: 'translate', capability: 'text.translate', version: 3, dependsOn: [], arguments: { units: stepOutput('speechText', 'units'), language: sceneLiteral(config.language), enabled: stepOutput('speechText', 'translate') } });
  const plan = workflowBindingDependencies({ id: 'speechPlan', capability: 'speech.plan', version: 1, dependsOn: [], arguments: { source: stepOutput('speechText', 'source'), units: stepOutput('speechText', 'units'), translation: stepOutput('translate', 'value'), config: sceneLiteral(config) } });
  definition.steps.splice(translateIndex, 1, prepare, translate, plan);
  for (const step of definition.steps.filter(step => ['speech', 'align'].includes(step.id))) {
    step.arguments.plan = stepOutput('speechPlan', 'value'); Object.assign(step, workflowBindingDependencies(step));
  }
  return definition;
}
export function workflowLabPreset(kind: 'captions' | 'dubbing' | 'broll', task: CaptionTaskRecord, media: unknown, transcript: unknown): WorkflowDefinition {
  const definition = kind === 'dubbing' ? atomicDubbingDefinition(task, media, transcript) : kind === 'broll' ? brollWorkflowDefinition(task.options, media, transcript, task.id, task.durationSec, null) : captionWorkflowDefinition(task.options, media, transcript, null, task.id);
  definition.parameters.projectId = { type: 'string', label: { zh: '测试项目', en: 'Test project' }, default: task.id };
  definition.parameters.source = { type: 'object', label: { zh: '原媒体', en: 'Source media' }, default: media as never };
  definition.parameters.duration = { type: 'number', label: { zh: '时长', en: 'Duration' }, default: task.durationSec };
  for (const step of definition.steps) {
    for (const [port, binding] of Object.entries(step.arguments)) {
      if (binding.kind === 'literal' && JSON.stringify(binding.value) === JSON.stringify(media)) step.arguments[port] = { kind: 'input', key: 'source' };
      if (port === 'projectId') step.arguments[port] = { kind: 'input', key: 'projectId' };
      if (port === 'durationSec') step.arguments[port] = { kind: 'input', key: 'duration' };
    }
  }
  return definition;
}
/** An inspector must never present results from changed inputs as current. */
export function workflowNodeIsStale(definition: WorkflowDefinition, run: import('./workflow').WorkflowRun | undefined, id: string, seen = new Set<string>()): boolean {
  if (!run || seen.has(id)) return true;
  seen.add(id);
  const current = definition.steps.find(step => step.id === id); const previous = run.definition.steps.find(step => step.id === id);
  if (!current || !previous || JSON.stringify(current) !== JSON.stringify(previous)) return true;
  for (const binding of Object.values(current.arguments)) if (binding.kind === 'input' && JSON.stringify(definition.parameters[binding.key]?.default) !== JSON.stringify(run.inputs[binding.key])) return true;
  return current.dependsOn.some(parent => workflowNodeIsStale(definition, run, parent, new Set(seen)));
}
