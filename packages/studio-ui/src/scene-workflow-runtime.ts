import { EDITING_NODE_CONTRACTS } from '@pireel/studio-engine/editing-node-contracts';
import { studioProviders } from '@pireel/studio-engine/providers';
import { assertWorkflowValue } from '@pireel/studio-engine/workflow-schema';
import { SCENE_NODE_CONTRACTS } from '@pireel/studio-engine/workflow-node-contracts';
import { TEXT_NODE_CONTRACTS } from '@pireel/studio-engine/workflow-text-contracts';
import { workflowToTarget } from '@pireel/studio-engine/workflow-editor';
import { createWorkflowRun, type WorkflowCapability, type WorkflowDefinition, type WorkflowInputs, type WorkflowValue } from '@pireel/studio-engine/workflow';
import { executeWorkflow } from '@pireel/studio-engine/workflow-runtime';
import { createWorkflowRegistry, type WorkflowNodeImplementation } from '@pireel/studio-engine/workflow-registry';
import { artifactVersion, emptySceneWorkflowData, workflowJson, WorkflowArtifactStore } from '@pireel/studio-engine/workflow-artifacts';
import type { CaptionTaskRecord, CaptionTaskProgress, CaptionProcessingStage, CaptionStageProgress } from './caption-task-store';
import { loadCaptionMedia } from './caption-task-store';
import { captionProcessingStages } from './caption-task-progress';

export interface SceneMedia { sig: string; name: string; width: number; height: number; durationSec: number; url?: string; kind?: 'video' | 'audio' | 'image' }
export interface SceneWorkflowHooks {
  signal: AbortSignal; checkpoint: (task: CaptionTaskRecord) => Promise<void>; progress: (fraction: number) => void;
  stageProgress?: (progress: CaptionTaskProgress) => void;
  definition?: WorkflowDefinition;
  /** Host extension point used by installed node adapters, not scene-specific runners. */
  nodes?: WorkflowNodeImplementation[];
}
export interface SceneNodeContext {
  idempotencyKey: string;
  recordUsage(usage: import('@pireel/studio-engine/workflow').WorkflowUsage): void;
  partial<T>(): T | undefined;
  savePartial(value: unknown, projection?: Partial<CaptionTaskRecord>): Promise<void>;
}
export interface SceneNode {
  capability: WorkflowCapability;
  cache?: boolean;
  cacheInputs?(args: WorkflowInputs): WorkflowInputs;
  cacheValid?(outputs: WorkflowInputs): Promise<boolean>;
  /** Only operations with a server idempotency contract may reconcile an uncertain attempt. */
  reconcile?: boolean;
  execute(args: WorkflowInputs, context: SceneNodeContext): Promise<WorkflowInputs>;
  project?(outputs: WorkflowInputs): Partial<CaptionTaskRecord>;
  stage?: CaptionProcessingStage;
}
export class SceneWorkflowHost {
  task: CaptionTaskRecord;
  readonly store: WorkflowArtifactStore;
  readonly data: NonNullable<CaptionTaskRecord['workflowData']>;
  readonly files = new Map<string, File>();
  private readonly urls = new Map<string, string>();
  video?: Blob;
  constructor(task: CaptionTaskRecord, file: File | null, readonly hooks: SceneWorkflowHooks) {
    this.task = structuredClone(task);
    this.task.generationId ??= task.workflow?.id ?? crypto.randomUUID();
    this.data = this.task.workflowData ?? emptySceneWorkflowData();
    this.store = new WorkflowArtifactStore(this.data.artifacts);
    if (file) this.files.set(task.sourceSig, file);
    this.task.progress = Object.fromEntries(captionProcessingStages(task.options).map(stage => [stage, { status: 'pending' }]));
  }
  check = () => this.hooks.signal.throwIfAborted();
  report(stage: CaptionProcessingStage, value: CaptionStageProgress) {
    this.check(); this.task.progress = { ...this.task.progress, [stage]: value }; this.hooks.stageProgress?.(this.task.progress);
  }
  async checkpoint(patch: Partial<CaptionTaskRecord> = {}) {
    this.task = { ...this.task, ...patch, workflowData: this.data, updatedAt: Date.now() };
    await this.hooks.checkpoint(structuredClone(this.task)); this.check();
  }
  async media(media: SceneMedia): Promise<File> {
    this.check(); const cached = this.files.get(media.sig); if (cached) return cached;
    let file = await (await import('./local-media')).loadLocalVideo(media.sig);
    file ??= await loadCaptionMedia(this.task.scope, media.sig, media.name);
    if (!file && media.url) file = (await (await import('./remote-media')).materializeRemoteMedia(media.url, { name: media.name, signal: this.hooks.signal })).file;
    this.check(); if (!file) throw new Error('无法读取素材：' + media.name);
    this.files.set(media.sig, file); return file;
  }
  async url(media: SceneMedia): Promise<string> {
    if (!this.urls.has(media.sig)) this.urls.set(media.sig, URL.createObjectURL(await this.media(media)));
    return this.urls.get(media.sig)!;
  }
  dispose() { for (const url of this.urls.values()) URL.revokeObjectURL(url); }
  async executeGraph(definition: WorkflowDefinition, nodes: SceneNode[], targetStepId?: string) {
    this.check();
    const allowLegacyReceipts = !this.task.workflowEnvironmentRevision;
    const environment = studioProviders().workflowEnvironment;
    if (environment) {
      const current = await environment(); this.check();
      if (current.scope !== this.task.scope) throw new Error('登录账号已变化，请重新打开工作流。');
      if (this.task.workflowEnvironmentRevision && current.revision !== this.task.workflowEnvironmentRevision && this.task.workflow && this.task.workflow.id === this.task.generationId && this.task.workflow.steps.some(step => ['running', 'waiting', 'failed'].includes(step.status))) throw new Error('执行环境已变化，上次请求需先确认；新测试请开始新一轮。');
      this.task.workflowEnvironmentRevision = current.revision;
    }
    this.report('preparing', { status: 'completed', fraction: 1 });
    let failure: unknown;
    const nodeKeys = new Map<string, string>();
    const implementations: WorkflowNodeImplementation[] = nodes.map(node => ({
      capability: node.capability,
      execute: async (args, context) => {
        try {
          this.check();
          // Migration seeds are fallback receipts, not semantic inputs.
          const { cached: _seed, ...semanticInputs } = args;
          const contract = TEXT_NODE_CONTRACTS[node.capability.id + '@' + node.capability.version] ?? TEXT_NODE_CONTRACTS[node.capability.id] ?? SCENE_NODE_CONTRACTS[node.capability.id] ?? EDITING_NODE_CONTRACTS[node.capability.id];
          const key = await artifactVersion([this.task.scope, this.task.workflowEnvironmentRevision ?? 'local', contract?.implementationRevision ?? 'custom', node.capability.id, node.capability.version, node.cacheInputs ? node.cacheInputs(args) : semanticInputs]);
          nodeKeys.set(context.step.id, key);
          const legacyKey = await artifactVersion([node.capability.id, node.capability.version, node.cacheInputs ? node.cacheInputs(args) : semanticInputs]);
          const receipt = this.data.receipts[key] ?? (allowLegacyReceipts ? this.data.receipts[legacyKey] : undefined);
          if (receipt && !this.data.receipts[key]) this.data.receipts[key] = structuredClone(receipt);
          let outputs: WorkflowInputs; let cacheHit = false;
          if (node.cache !== false && receipt?.status === 'completed' && receipt.outputs && (!node.cacheValid || await node.cacheValid(receipt.outputs))) { outputs = structuredClone(receipt.outputs); cacheHit = true; this.data.receipts[key] = receipt; }
          else {
            if (receipt?.status === 'running' && receipt.runId === this.task.generationId && node.capability.retry === 'reconcile-first' && !node.reconcile) throw new Error('上次操作结果尚未确认，已停止自动重试以避免重复计费。');
            const idempotencyKey = receipt?.status === 'running' && receipt.runId === this.task.generationId ? receipt.idempotencyKey : context.idempotencyKey + ':' + key;
            if (node.stage) {
              this.report(node.stage, { status: 'running' });
              this.task.stage = node.stage;
            }
            this.data.receipts[key] = { status: 'running', runId: this.task.generationId!, idempotencyKey, usage: receipt?.runId === this.task.generationId ? receipt.usage : undefined };
            await this.checkpoint({ error: undefined });
            outputs = await node.execute(structuredClone(args), {
              idempotencyKey,
              recordUsage: usage => { if (usage.source !== 'server' || !usage.reference) return; const record = this.data.receipts[key]; record.usage = [...(record.usage ?? []).filter(item => item.reference !== usage.reference), structuredClone(usage)]; },
              partial: <T>() => structuredClone(this.data.partials[idempotencyKey]) as T | undefined,
              savePartial: async (value, projection) => { this.data.partials[idempotencyKey] = workflowJson(value); await this.checkpoint(projection); },
            });
            for (const [name, port] of Object.entries(node.capability.outputs ?? {})) {
              if (!Object.hasOwn(outputs, name)) throw new Error('Missing node output: ' + name);
              if (port.schema) assertWorkflowValue(outputs[name], port.schema, name);
            }
            // Commit output before checking cancellation: a completed paid call must remain reusable.
            this.data.receipts[key] = { status: 'completed', runId: this.task.generationId!, idempotencyKey, outputs: workflowJson(outputs) as WorkflowInputs, usage: this.data.receipts[key].usage };
          }
          if (node.project) Object.assign(this.task, node.project(outputs));
          if (node.stage) this.report(node.stage, { status: 'completed', fraction: 1 });
          return { status: 'completed', summary: node.capability.id, audit: { cacheHit, inputKey: key, usage: this.data.receipts[key]?.usage, billing: { status: cacheHit ? 'cached' : contract?.billing === 'server' ? 'server-managed' : 'local', ...(this.data.receipts[key]?.idempotencyKey ? { requestId: this.data.receipts[key].idempotencyKey } : {}) } }, artifact: { kind: 'value', data: workflowJson(outputs) as WorkflowInputs } };
        } catch (error) { failure = error; throw error; }
      },
    }));
    const { sceneCloudNodes } = await import('./scene-workflow-cloud');
    const supplied = this.hooks.nodes ?? [];
    const extra = sceneCloudNodes(this.hooks.signal).filter(node => !supplied.some(other => other.capability.id === node.capability.id));
    const registry = createWorkflowRegistry('browser', [...implementations, ...extra, ...supplied]);
    const selected = this.hooks.definition ?? this.task.workflowDefinition ?? definition;
    if (this.hooks.definition) this.task.workflowDefinition = structuredClone(selected);
    const executable = targetStepId ? workflowToTarget(selected, targetStepId) : selected;
    const run = createWorkflowRun(executable, {}, { projectId: this.task.id, outputId: this.task.id, revision: this.task.sourceSig + ':' + (this.task.workflowEnvironmentRevision ?? 'local') }, registry.catalog, this.task.generationId!);
    // A waiting remote node preserves its cloud job. Completed media nodes reuse versioned receipts.
    const previous = this.task.workflow;
    if (previous?.id === run.id && JSON.stringify(previous.definition) === JSON.stringify(executable)) {
      for (const step of run.steps) {
        const saved = previous.steps.find(old => old.id === step.id);
        if (saved?.status === 'waiting') Object.assign(step, saved);
      }
    }
    const completed = await executeWorkflow(run, registry.catalog, registry.executor, { save: state => { for (const step of state.steps) { const key = nodeKeys.get(step.id); if (key) { step.inputKey = key; step.usage = this.data.receipts[key]?.usage; } } return this.checkpoint({ workflow: state }); } }, { signal: this.hooks.signal });
    this.check();
    if (failure) throw failure;
    if (completed.status === 'failed') throw new Error(completed.error ?? '工作流执行失败。');
    return { task: { ...this.task, workflow: completed, workflowData: this.data, updatedAt: Date.now() }, run: completed, video: this.video };
  }
  async run(definition: WorkflowDefinition, nodes: SceneNode[]) {
    const result = await this.executeGraph(definition, nodes);
    if (result.run.status === 'waiting') throw Object.assign(new Error('工作流等待确认，请在工作流待办中处理后继续。'), { code: 'workflow_waiting' });
    if (result.run.status !== 'completed' || !result.video) throw new Error(result.run.error ?? '工作流未完成。');
    return { task: { ...result.task, stage: 'completed' as const }, video: result.video };
  }
}
export const sceneValue = (value: unknown): WorkflowValue => workflowJson(value);
