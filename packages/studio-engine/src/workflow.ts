/**
 * Studio workflows. Pure data contracts shared by forms, agents and future schedulers.
 * No host SDK, transport, storage, media bytes or legacy business dependencies.
 */
import { assertWorkflowValue, validateWorkflowSchema, type WorkflowSchema } from './workflow-schema';
export type WorkflowValue = string | number | boolean | null | WorkflowValue[] | { [key: string]: WorkflowValue };
export type WorkflowInputs = Record<string, WorkflowValue>;
export type WorkflowEnvironment = 'browser' | 'desktop' | 'cloud';
export type WorkflowRequirement =
  | 'project-document' | 'media-bytes' | 'audio-decoder' | 'video-decoder'
  | 'language-model' | 'transcription-provider' | 'transcript-index' | 'visual-index'
  | 'local-vision-model' | 'render-engine' | 'folder-access' | 'social-connection';
export type WorkflowBinding =
  | { kind: 'literal'; value: WorkflowValue }
  | { kind: 'input'; key: string }
  | { kind: 'step'; stepId: string; key: string };
export interface WorkflowParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  label: { zh: string; en: string };
  default: WorkflowValue;
  schema?: WorkflowSchema;
  options?: { value: string; label: { zh: string; en: string } }[];
  min?: number;
  max?: number;
  maxLength?: number;
}
export interface WorkflowStep {
  id: string;
  capability: string;
  version: number;
  dependsOn: string[];
  arguments: Record<string, WorkflowBinding>;
  enabledBy?: string;
  /** Explicit pass-through outputs when an optional node is disabled. */
  bypass?: Record<string, WorkflowBinding>;
}
export type WorkflowTrigger =
  | { kind: 'manual' }
  | { kind: 'asset-ready'; collectionId: string; dedupe: 'asset-version' }
  | {
    kind: 'schedule'; timezone: string; localTime: string;
    cadence: 'daily' | 'weekly'; weekdays?: number[];
    missed: 'skip' | 'run-once'; noNewAssets: 'skip' | 'run';
  };
/** Posting a finished artifact is distinct from scheduling a workflow that produces one. */
export interface WorkflowPublication {
  artifactStepId: string;
  connections: { connectionId: string; platform: string }[];
  caption: WorkflowBinding;
  approval: 'review-required' | 'pre-authorized';
  timing: { kind: 'after-approval' } | { kind: 'at'; at: string; timezone: string };
}
export interface WorkflowDefinition {
  schemaVersion: 1;
  id: string;
  version: number;
  title: string;
  templateId: string;
  parameters: Record<string, WorkflowParameter>;
  steps: WorkflowStep[];
  trigger: WorkflowTrigger;
  publication?: WorkflowPublication;
}
export interface WorkflowSource {
  projectId: string;
  outputId: string;
  /** Host revision, not a temporary URL or an absolute local file path. */
  revision: string;
}
export interface WorkflowArtifact {
  kind: 'project-output' | 'transcript' | 'segments' | 'edit-receipt' | 'rendered-video' | 'publication' | 'value' | 'approval' | 'notification';
  data: WorkflowInputs;
}
export interface WorkflowCapability {
  id: string;
  version: number;
  label: { zh: string; en: string };
  requirements: WorkflowRequirement[];
  environments: WorkflowEnvironment[];
  effect: 'read' | 'edit' | 'generate' | 'publish';
  retry: 'safe' | 'reconcile-first';
  available: boolean;
  inputs?: Record<string, { schema?: WorkflowSchema; required?: boolean; default?: WorkflowValue; label?: string; valueType?: string; hidden?: boolean }>;
  outputs?: Record<string, { schema?: WorkflowSchema; label?: string; valueType?: string }>;
}
export interface WorkflowApproval {
  id: string; title: string; value: WorkflowValue; schema: WorkflowSchema;
  editable: boolean; status: 'pending' | 'approved' | 'rejected';
  decidedBy?: string; decidedAt?: number;
}
export interface WorkflowNotice {
  id: string; nodeId: string; title: string; message: string;
  approvalId?: string; createdAt: number;
}
export type WorkflowStepStatus = 'pending' | 'running' | 'waiting' | 'completed' | 'skipped' | 'failed';
export interface WorkflowUsage { source: 'server'; reference: string; inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; credits?: number; audioSeconds?: number }
export interface WorkflowStepRun {
  id: string;
  status: WorkflowStepStatus;
  attempt: number;
  idempotencyKey: string;
  jobId?: string;
  artifact?: WorkflowArtifact;
  summary?: string;
  error?: string;
  approval?: WorkflowApproval;
  usage?: WorkflowUsage[];
  inputs?: WorkflowInputs;
  startedAt?: number; finishedAt?: number; cacheHit?: boolean; inputKey?: string;
  billing?: { status: 'local' | 'cached' | 'server-managed'; requestId?: string };
}
export interface WorkflowRun {
  schemaVersion: 1;
  id: string;
  definition: WorkflowDefinition;
  inputs: WorkflowInputs;
  source: WorkflowSource;
  status: 'ready' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  steps: WorkflowStepRun[];
  createdAt: number;
  updatedAt: number;
  error?: string;
  notices?: WorkflowNotice[];
}
export const workflowInput = (key: string): WorkflowBinding => ({ kind: 'input', key });
export const workflowLiteral = (value: WorkflowValue): WorkflowBinding => ({ kind: 'literal', value });

export function resolveWorkflowInputs(definition: WorkflowDefinition, overrides: WorkflowInputs): WorkflowInputs {
  for (const key of Object.keys(overrides)) if (!Object.hasOwn(definition.parameters, key)) throw new Error('Unknown parameter: ' + key);
  const result: WorkflowInputs = {};
  for (const [key, spec] of Object.entries(definition.parameters)) {
    if (!['string', 'number', 'boolean', 'object', 'array'].includes(spec.type)) throw new Error('Unsupported parameter type: ' + key);
    const value = Object.hasOwn(overrides, key) ? overrides[key] : spec.default;
    if (spec.type === 'array' ? !Array.isArray(value) : typeof value !== spec.type || (spec.type === 'object' && (!value || Array.isArray(value)))) throw new Error('Invalid parameter type: ' + key);
    if (spec.schema) { validateWorkflowSchema(spec.schema); assertWorkflowValue(value, spec.schema, key); }
    if (typeof value === 'number' && (!Number.isFinite(value) || (spec.min !== undefined && value < spec.min) || (spec.max !== undefined && value > spec.max))) throw new Error('Parameter out of range: ' + key);
    if (typeof value === 'string' && ((spec.maxLength !== undefined && value.length > spec.maxLength) || (spec.options && !spec.options.some((option) => option.value === value)))) throw new Error('Invalid parameter value: ' + key);
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Invalid parameter name');
    result[key] = value;
  }
  return result;
}

/** Validate everything before the first side effect. Returns dependency order, not UI order. */
export function validateWorkflow(definition: WorkflowDefinition, catalog: readonly WorkflowCapability[]): WorkflowStep[] {
  if (definition.schemaVersion !== 1 || !definition.id || !Number.isInteger(definition.version) || definition.version < 1 || !definition.title.trim()) throw new Error('Invalid workflow identity');
  if (!definition.steps.length || definition.steps.length > 64) throw new Error('A workflow needs 1–64 steps');
  resolveWorkflowInputs(definition, {});
  const nodes = new Map(definition.steps.map((step) => [step.id, step]));
  if (nodes.size !== definition.steps.length) throw new Error('Duplicate step id');
  const visited = new Set<string>();
  const active = new Set<string>();
  const ordered: WorkflowStep[] = [];
  const visit = (step: WorkflowStep) => {
    if (visited.has(step.id)) return;
    if (active.has(step.id)) throw new Error('Workflow contains a cycle');
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(step.id)) throw new Error('Invalid step id');
    const capability = catalog.find((item) => item.id === step.capability && item.version === step.version);
    if (!capability) throw new Error('Unknown capability version: ' + step.capability);
    if (step.enabledBy && definition.parameters[step.enabledBy]?.type !== 'boolean') throw new Error('Step toggle must reference a boolean parameter');
    active.add(step.id);
    for (const id of step.dependsOn) {
      const dependency = nodes.get(id);
      if (!dependency) throw new Error('Unknown dependency: ' + id);
      visit(dependency);
    }
    for (const [key, port] of Object.entries(capability.inputs ?? {})) {
      if (port.required && port.default === undefined && !Object.hasOwn(step.arguments, key)) throw new Error('Missing node input: ' + step.id + '.' + key);
      if (port.schema) validateWorkflowSchema(port.schema);
    }
    if (capability.inputs && Object.keys(step.arguments).some(key => !Object.hasOwn(capability.inputs!, key))) throw new Error('Unknown node input: ' + step.id);
    for (const port of Object.values(capability.outputs ?? {})) if (port.schema) validateWorkflowSchema(port.schema);
    if (step.bypass && capability.outputs && Object.keys(step.bypass).some(key => !Object.hasOwn(capability.outputs!, key))) throw new Error('Unknown bypass output: ' + step.id);
    for (const [key, binding] of Object.entries(step.arguments)) {
      if (binding.kind === 'input' && capability.inputs?.[key]?.schema && definition.parameters[binding.key]) assertWorkflowValue(definition.parameters[binding.key].default, capability.inputs[key].schema!, step.id + '.' + key);
      if (binding.kind === 'literal' && capability.inputs?.[key]?.schema) assertWorkflowValue(binding.value, capability.inputs[key].schema!, step.id + '.' + key);
      if (binding.kind === 'step' && capability.inputs?.[key]?.schema) {
        const parent = nodes.get(binding.stepId);
        const output = parent && catalog.find(item => item.id === parent.capability && item.version === parent.version)?.outputs?.[binding.key]?.schema;
        const explicit = parent && ['llm.transform','human.approval'].includes(parent.capability) && binding.key === 'value' && parent.arguments.schema?.kind === 'literal' ? parent.arguments.schema.value as unknown as WorkflowSchema : undefined;
        const producer = parent && catalog.find(item => item.id === parent.capability && item.version === parent.version)?.outputs?.[binding.key];
        const consumer = capability.inputs[key];
        if (producer?.valueType && consumer.valueType && producer.valueType !== 'json' && consumer.valueType !== 'json' && producer.valueType !== consumer.valueType) throw new Error('Incompatible node ports: ' + step.id + '.' + key);
        if ((output ?? explicit)?.type && (output ?? explicit)!.type !== capability.inputs[key].schema!.type) throw new Error('Incompatible node ports: ' + step.id + '.' + key);
      }
    }
    for (const binding of [...Object.values(step.arguments), ...Object.values(step.bypass ?? {})]) {
      if (binding.kind === 'input' && !Object.hasOwn(definition.parameters, binding.key)) throw new Error('Unknown input binding');
      if (binding.kind === 'step' && (!step.dependsOn.includes(binding.stepId) || !nodes.has(binding.stepId))) throw new Error('Step binding requires an explicit dependency');
      if (binding.kind === 'step') {
        const parent = nodes.get(binding.stepId)!;
        const outputs = catalog.find(item => item.id === parent.capability && item.version === parent.version)?.outputs;
        if (outputs && !Object.hasOwn(outputs, binding.key)) throw new Error('Unknown output port: ' + binding.stepId + '.' + binding.key);
        if (parent.enabledBy && (!parent.bypass || !Object.hasOwn(parent.bypass, binding.key)) && parent.enabledBy !== step.enabledBy) throw new Error('Optional producer requires bypass output: ' + parent.id);
      }
      if (!['input', 'step', 'literal'].includes(binding.kind)) throw new Error('Unknown binding kind');
    }
    active.delete(step.id); visited.add(step.id); ordered.push(step);
  };
  definition.steps.forEach(visit);
  if (definition.trigger.kind === 'schedule') {
    const schedule = definition.trigger;
    if (!['daily', 'weekly'].includes(schedule.cadence) || !['skip', 'run-once'].includes(schedule.missed) || !['skip', 'run'].includes(schedule.noNewAssets)) throw new Error('Unsupported schedule policy');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.localTime)) throw new Error('Invalid local schedule time');
    try { new Intl.DateTimeFormat('en', { timeZone: schedule.timezone }).format(); } catch { throw new Error('Invalid schedule timezone'); }
    if (schedule.cadence === 'weekly' && (!schedule.weekdays?.length || schedule.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6))) throw new Error('Weekly schedule needs weekdays');
  } else if (definition.trigger.kind === 'asset-ready') {
    if (!definition.trigger.collectionId.trim()) throw new Error('Asset trigger needs a collection');
  } else if (definition.trigger.kind !== 'manual') throw new Error('Unsupported trigger');
  if (definition.publication) {
    const publication = definition.publication;
    if (!['review-required', 'pre-authorized'].includes(publication.approval) || !['after-approval', 'at'].includes(publication.timing.kind)) throw new Error('Unsupported publication policy');
    if (!nodes.has(publication.artifactStepId) || !publication.connections.length || publication.connections.some((connection) => !connection.connectionId || !connection.platform)) throw new Error('Publication requires an artifact and connected destinations');
    if (publication.timing.kind === 'at' && (!/Z$|[+-]\d{2}:\d{2}$/.test(publication.timing.at) || !Number.isFinite(Date.parse(publication.timing.at)))) throw new Error('Publication time requires an absolute instant');
  }
  return ordered;
}

export function createWorkflowRun(definition: WorkflowDefinition, overrides: WorkflowInputs, source: WorkflowSource, catalog: readonly WorkflowCapability[], id: string, now = Date.now()): WorkflowRun {
  const ordered = validateWorkflow(definition, catalog);
  if (!id || !source.projectId || !source.outputId || !source.revision) throw new Error('Run requires a source snapshot and identity');
  const inputs = resolveWorkflowInputs(definition, overrides);
  return structuredClone({
    schemaVersion: 1, id, definition, inputs, source, status: 'ready', createdAt: now, updatedAt: now,
    steps: ordered.map((step) => ({
      id: step.id, status: 'pending', attempt: 0,
      idempotencyKey: id + ':' + step.id,
    })),
  });
}

export function workflowRequirements(definition: WorkflowDefinition, inputs: WorkflowInputs, catalog: readonly WorkflowCapability[]): WorkflowRequirement[] {
  return [...new Set(definition.steps.filter((step) => !step.enabledBy || inputs[step.enabledBy] === true).flatMap((step) => catalog.find((item) => item.id === step.capability)?.requirements ?? []))];
}

export function automationReadiness(definition: WorkflowDefinition, catalog: readonly WorkflowCapability[], host: {
  environment: WorkflowEnvironment; durable: boolean; triggers: WorkflowTrigger['kind'][]; publication: boolean;
}): string[] {
  validateWorkflow(definition, catalog);
  const reasons: string[] = [];
  if (!host.durable) reasons.push('durable-executor-required');
  if (!host.triggers.includes(definition.trigger.kind)) reasons.push('trigger-adapter-required');
  if (definition.publication && !host.publication) reasons.push('publication-adapter-required');
  for (const step of definition.steps) {
    const capability = catalog.find((item) => item.id === step.capability && item.version === step.version)!;
    if (!capability.available || !capability.environments.includes(host.environment)) reasons.push('capability-unavailable:' + step.capability);
  }
  return [...new Set(reasons)];
}
