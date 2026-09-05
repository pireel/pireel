import { describe, expect, it, vi } from 'vitest';
import { STUDIO_WORKFLOW_CAPABILITIES as catalog, STUDIO_WORKFLOW_TEMPLATES, workflowTemplate } from './workflow-catalog';
import { automationReadiness, createWorkflowRun, resolveWorkflowInputs, validateWorkflow, workflowLiteral, type WorkflowDefinition } from './workflow';
import { executeWorkflow, recoverWorkflowRun, type WorkflowExecutor } from './workflow-runtime';
import { prepareWorkflowPublications, workflowTriggerKey } from './workflow-publication';

const source = { projectId: 'project-a', outputId: 'source-a', revision: 'r1' };
const def = () => structuredClone(workflowTemplate('frame-video')!.definition);
const run = (definition = def()) => createWorkflowRun(definition, {}, source, catalog, 'run-1', 100);
const result = () => ({ status: 'completed' as const, artifact: { kind: 'edit-receipt' as const, data: { outputId: 'copy-a' } }, summary: 'done' });
const executor = (): WorkflowExecutor => ({ preflight: vi.fn(async () => {}), execute: vi.fn(async () => result()) });
const store = () => ({ save: vi.fn(async () => {}) });

describe('Studio workflow definitions', () => {
  it('validates every official template against the capability registry', () => {
    for (const template of STUDIO_WORKFLOW_TEMPLATES) expect(validateWorkflow(template.definition, catalog)).toHaveLength(template.definition.steps.length);
  });
  it('rejects invalid parameters before creating a run', () => {
    expect(() => createWorkflowRun(def(), { ratio: 'banana' }, source, catalog, 'a')).toThrow('Invalid parameter');
    expect(() => resolveWorkflowInputs(def(), { other: true })).toThrow('Unknown parameter');
    const pauses = workflowTemplate('pause-cleanup')!.definition;
    expect(() => resolveWorkflowInputs(pauses, { minimumPauseSec: NaN })).toThrow();
    expect(() => resolveWorkflowInputs(pauses, { minimumPauseSec: 0.01 })).toThrow();
  });
  it('locks a run to a definition version, parameters, and source snapshot', () => {
    const original = def(); const inputs = { ratio: 'square' };
    const snapshot = createWorkflowRun(original, inputs, source, catalog, 'x');
    original.steps[0].capability = 'unknown'; inputs.ratio = 'portrait';
    expect(snapshot.definition.steps[0].capability).toBe('output.duplicate');
    expect(snapshot.inputs.ratio).toBe('square'); expect(snapshot.source).toEqual(source);
  });
  it('rejects cycles, missing dependencies, duplicate IDs and unknown capability versions', () => {
    const cyclic = def(); cyclic.steps[0].dependsOn = ['format'];
    expect(() => validateWorkflow(cyclic, catalog)).toThrow('cycle');
    const missing = def(); missing.steps[1].dependsOn = ['absent'];
    expect(() => validateWorkflow(missing, catalog)).toThrow('Unknown dependency');
    const duplicate = def(); duplicate.steps[1].id = duplicate.steps[0].id;
    expect(() => validateWorkflow(duplicate, catalog)).toThrow('Duplicate');
    const future = def(); future.steps[0].version = 90;
    expect(() => validateWorkflow(future, catalog)).toThrow('Unknown capability version');
  });
  it('requires explicit data dependencies', () => {
    const definition = def(); definition.steps[0].arguments.x = { kind: 'step', stepId: 'format', key: 'outputId' };
    expect(() => validateWorkflow(definition, catalog)).toThrow('explicit dependency');
  });
  it('rejects invalid schedule timezones and weekdays', () => {
    const definition = def();
    definition.trigger = { kind: 'schedule', cadence: 'weekly', weekdays: [9], timezone: 'Asia/Singapore', localTime: '08:00', missed: 'skip', noNewAssets: 'skip' };
    expect(() => validateWorkflow(definition, catalog)).toThrow('weekdays');
    definition.trigger.weekdays = [1]; definition.trigger.timezone = 'invalid-zone';
    expect(() => validateWorkflow(definition, catalog)).toThrow('timezone');
  });
});

describe('checkpointed workflow execution', () => {
  it('runs dependency order and checkpoints before each edit', async () => {
    const definition = def(); definition.steps.reverse();
    const target = run(definition); const calls: string[] = [];
    const output = await executeWorkflow(target, catalog, {
      preflight: async () => {},
      execute: async (step) => { calls.push(step.id); return result(); },
    }, { save: async (state) => { if (state.steps.some((step) => step.status === 'running')) calls.push('checkpoint'); } });
    expect(calls.indexOf('version')).toBeLessThan(calls.indexOf('format'));
    expect(calls[0]).toBe('checkpoint'); expect(output.status).toBe('completed');
  });
  it('does not mutate if storage fails before execution', async () => {
    const exec = executor();
    await expect(executeWorkflow(run(), catalog, exec, { save: async () => { throw new Error('disk full'); } })).rejects.toThrow('disk full');
    expect(exec.execute).not.toHaveBeenCalled();
  });
  it('skips disabled steps without attempting transcription', async () => {
    const exec = executor();
    const output = await executeWorkflow(run(workflowTemplate('pause-cleanup')!.definition), catalog, exec, store());
    expect(output.steps.filter((step) => step.status === 'skipped').map((step) => step.id)).toEqual(['transcript', 'captions']);
    expect(exec.execute).toHaveBeenCalledTimes(2);
  });
  it('retains successful edits and stops on a failed step', async () => {
    const exec = executor();
    exec.execute = vi.fn().mockResolvedValueOnce(result()).mockRejectedValueOnce(new Error('source missing'));
    const output = await executeWorkflow(run(), catalog, exec, store());
    expect(output.status).toBe('failed'); expect(output.steps[0].status).toBe('completed');
    expect(output.steps[1].error).toBe('source missing');
    await expect(executeWorkflow(output, catalog, exec, store())).rejects.toThrow('reconciliation');
  });
  it('never marks a submitted async job as completed and resumes without resubmission', async () => {
    const exec = executor();
    exec.execute = vi.fn().mockResolvedValueOnce({ status: 'waiting', jobId: 'remote-1', summary: 'queued' }).mockResolvedValue(result());
    exec.poll = vi.fn(async () => result());
    const waiting = await executeWorkflow(run(), catalog, exec, store());
    expect(waiting.status).toBe('waiting'); expect(waiting.steps[1].status).toBe('pending');
    const completed = await executeWorkflow(waiting, catalog, exec, store());
    expect(completed.status).toBe('completed'); expect(exec.execute).toHaveBeenCalledTimes(2); expect(exec.poll).toHaveBeenCalledOnce();
    expect(completed.steps[0].idempotencyKey).toBe(waiting.steps[0].idempotencyKey);
  });
  it('cancels only subsequent work and preserves the actual in-flight outcome', async () => {
    const abort = new AbortController(); const exec = executor();
    exec.execute = vi.fn(async () => { abort.abort(); return result(); });
    const output = await executeWorkflow(run(), catalog, exec, store(), { signal: abort.signal });
    expect(output.status).toBe('cancelled'); expect(output.steps[0].status).toBe('completed');
    expect(output.steps[1].status).toBe('pending'); expect(exec.execute).toHaveBeenCalledOnce();
  });
  it('does not run even the first edit if a later capability is unavailable', async () => {
    const definition = def(); definition.steps[1].capability = 'video.render';
    const exec = executor();
    await expect(executeWorkflow(run(definition), catalog, exec, store())).rejects.toThrow('not installed');
    expect(exec.execute).not.toHaveBeenCalled();
  });
  it('treats reload during execution as interruption, never safe automatic replay', () => {
    const active = run(); active.status = 'running'; active.steps[0].status = 'running';
    const recovered = recoverWorkflowRun(active);
    expect(recovered.status).toBe('interrupted'); expect(recovered.steps[0].status).toBe('running');
    expect(active.status).toBe('running');
  });
  it('fails closed when publishing has not been connected', async () => {
    const definition = withPublication(def()); const exec = executor();
    await expect(executeWorkflow(run(definition), catalog, exec, store())).rejects.toThrow('Publication adapter');
    expect(exec.execute).not.toHaveBeenCalled();
  });
});

function withPublication(definition: WorkflowDefinition): WorkflowDefinition {
  definition.publication = {
    artifactStepId: 'format', connections: [{ connectionId: 'account-1', platform: 'youtube' }],
    caption: workflowLiteral('A new video'), approval: 'review-required', timing: { kind: 'after-approval' },
  };
  return definition;
}
describe('automation and publication contracts', () => {
  it('blocks activation without a durable host and required publisher', () => {
    const problems = automationReadiness(withPublication(def()), catalog, { environment: 'browser', durable: false, triggers: [], publication: false });
    expect(problems).toContain('durable-executor-required');
    expect(problems).toContain('publication-adapter-required');
    expect(problems).toContain('trigger-adapter-required');
  });
  it('deduplicates trigger events by scope, workflow version and asset version', () => {
    const definition = def(); definition.trigger = { kind: 'asset-ready', collectionId: 'folder', dedupe: 'asset-version' };
    const event = { kind: 'asset-ready' as const, assetId: 'asset', assetVersion: 'v1' };
    expect(workflowTriggerKey('a', definition, event)).toBe(workflowTriggerKey('a', definition, event));
    expect(workflowTriggerKey('b', definition, event)).not.toBe(workflowTriggerKey('a', definition, event));
    expect(workflowTriggerKey('a', definition, { ...event, assetVersion: 'v2' })).not.toBe(workflowTriggerKey('a', definition, event));
  });
  it('requires a completed durable rendered artifact for a publication', () => {
    const target = run(withPublication(def()));
    expect(() => prepareWorkflowPublications('owner', target)).toThrow('completed');
    target.status = 'completed'; target.steps[1].status = 'completed'; target.steps[1].artifact = result().artifact;
    expect(() => prepareWorkflowPublications('owner', target)).toThrow('durable rendered video');
    target.steps[1].artifact = { kind: 'rendered-video', data: { assetId: 'movie', assetVersion: 'v1' } };
    const requests = prepareWorkflowPublications('owner', target);
    expect(requests[0].status).toBe('awaiting-review');
    expect(requests[0].artifact).toEqual({ assetId: 'movie', assetVersion: 'v1' });
    expect(prepareWorkflowPublications('owner', target)[0].idempotencyKey).toBe(requests[0].idempotencyKey);
  });
});
