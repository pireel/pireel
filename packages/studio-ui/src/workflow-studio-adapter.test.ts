import { describe, expect, it, vi } from 'vitest';
import { createWorkflowRun } from '@pireel/studio-engine/workflow';
import { executeWorkflow } from '@pireel/studio-engine/workflow-runtime';
import { workflowTemplate, STUDIO_WORKFLOW_CAPABILITIES as catalog } from '@pireel/studio-engine/workflow-catalog';
import { createStudioWorkflowExecutor, type WorkflowStudioContext, type WorkflowStudioHost } from './workflow-studio-adapter';
import { parseWorkflowBrowserState, storeWorkflowRun, workflowStorageKey } from './workflow-storage';

function fixture(templateId: string) {
  let current: WorkflowStudioContext = {
    source: { projectId: 'p', outputId: 'original', revision: 'r1' },
    title: 'Original', hasContent: true, hasNarration: true, hasTranscript: true,
  };
  const host: WorkflowStudioHost = {
    context: () => structuredClone(current),
    assertWritable: vi.fn(),
    prepareMedia: vi.fn(async () => {}),
    call: vi.fn(async (name) => {
      if (name === 'manage_project') current = { ...current, source: { ...current.source, outputId: 'copy' }, title: 'Copy' };
      if (name === 'set_canvas') current = { ...current, source: { ...current.source, revision: 'r2' } };
      return { ok: true, summary: 'ok', data: {} };
    }),
  };
  const run = createWorkflowRun(workflowTemplate(templateId)!.definition, templateId === 'search' ? { query: 'hello' } : {}, current.source, catalog, 'run');
  return { host, run, change: (patch: Partial<WorkflowStudioContext>) => { current = { ...current, ...patch }; } };
}
const store = { save: async () => {} };

describe('workflow Studio adapter', () => {
  it('duplicates before editing and carries the new output identity into later steps', async () => {
    const { host, run } = fixture('frame-video');
    const result = await executeWorkflow(run, catalog, createStudioWorkflowExecutor(host, true), store);
    expect(result.status).toBe('completed');
    expect(host.call).toHaveBeenNthCalledWith(1, 'manage_project', { scope: 'output', action: 'duplicate', id: 'original', title: 'Fit another format' });
    expect(host.call).toHaveBeenNthCalledWith(2, 'set_canvas', { preset: 'portrait' });
    expect(result.steps[1].artifact?.data.outputId).toBe('copy');
    expect(result.source.outputId).toBe('original');
  });
  it('runs the talking-head scene through the same pause and caption operations', async () => {
    const { host, run } = fixture('talking-head');
    host.emphasizeCaptions = vi.fn(async () => {});
    run.inputs.highlightKeywords = true;
    const result = await executeWorkflow(run, catalog, createStudioWorkflowExecutor(host, true), store);
    expect(result.status).toBe('completed');
    expect(host.call).toHaveBeenNthCalledWith(2, 'remove_silence', { minimumPauseSec: 0.7, speechPaddingSec: 0.15 });
    expect(host.call).toHaveBeenNthCalledWith(3, 'set_captions', expect.objectContaining({ on: true }));
    expect(host.emphasizeCaptions).toHaveBeenCalledOnce();
  });
  it('refuses to edit a different output or revision', async () => {
    const { host, run, change } = fixture('frame-video');
    change({ source: { ...run.source, revision: 'changed' } });
    const result = await executeWorkflow(run, catalog, createStudioWorkflowExecutor(host, true), store);
    expect(result.status).toBe('failed'); expect(host.call).not.toHaveBeenCalled();
  });
  it('reuses a transcript without a potentially paid transcription call', async () => {
    const { host, run } = fixture('captions');
    const result = await executeWorkflow(run, catalog, createStudioWorkflowExecutor(host, true), store);
    expect(result.status).toBe('completed');
    expect(host.call).not.toHaveBeenCalledWith('get_transcript', expect.anything());
    expect(host.prepareMedia).not.toHaveBeenCalled();
  });
  it('adds captions without editing timing unless the pause option is explicitly selected', async () => {
    const { host, run } = fixture('captions');
    expect(run.inputs.shortenPauses).toBe(false);
    const result = await executeWorkflow(run, catalog, createStudioWorkflowExecutor(host, true), store);
    expect(result.steps.find((step) => step.id === 'pauses')?.status).toBe('skipped');
    expect(host.call).not.toHaveBeenCalledWith('remove_silence', expect.anything());
    expect(host.call).toHaveBeenCalledWith('set_captions', expect.objectContaining({ on: true }));
  });
  it('shortens pauses before applying captions when the user opts in', async () => {
    const { host, run } = fixture('captions');
    run.inputs.shortenPauses = true;
    const result = await executeWorkflow(run, catalog, createStudioWorkflowExecutor(host, true), store);
    expect(result.status).toBe('completed');
    expect(host.call).toHaveBeenNthCalledWith(2, 'remove_silence', { minimumPauseSec: 0.7, speechPaddingSec: 0.15 });
    expect(host.call).toHaveBeenNthCalledWith(3, 'set_captions', expect.objectContaining({ on: true }));
    expect(host.prepareMedia).toHaveBeenCalledOnce();
  });
  it('requires readable source media before a pause edit', async () => {
    const { host, run } = fixture('pause-cleanup');
    host.prepareMedia = vi.fn(async () => { throw new Error('file missing'); });
    const result = await executeWorkflow(run, catalog, createStudioWorkflowExecutor(host, true), store);
    expect(result.status).toBe('failed');
    expect(host.call).toHaveBeenCalledTimes(1); // only the independent output copy
    expect(result.steps[0].status).toBe('completed');
  });
  it('does not promise a search of unindexed sources or modify the project', async () => {
    const { host, run, change } = fixture('search');
    change({ hasTranscript: false });
    const result = await executeWorkflow(run, catalog, createStudioWorkflowExecutor(host, true), store);
    expect(result.status).toBe('failed'); expect(host.call).not.toHaveBeenCalled();
  });
  it('blocks changes when the host loses its writer lease', async () => {
    const { host, run } = fixture('frame-video');
    host.assertWritable = () => { throw new Error('not the writer'); };
    const result = await executeWorkflow(run, catalog, createStudioWorkflowExecutor(host, false), store);
    expect(result.status).toBe('failed'); expect(host.call).not.toHaveBeenCalled();
  });
});

describe('browser workflow persistence', () => {
  it('separates users and projects', () => {
    expect(workflowStorageKey('alice', 'p')).not.toBe(workflowStorageKey('bob', 'p'));
    expect(workflowStorageKey('alice', 'p')).not.toBe(workflowStorageKey('alice', 'other'));
    expect(workflowStorageKey('a:b', 'c')).not.toBe(workflowStorageKey('a', 'b:c'));
  });
  it('restores interrupted runs conservatively and keeps immutable definition versions', () => {
    const { run } = fixture('frame-video'); run.status = 'running'; run.steps[0].status = 'running';
    const state = storeWorkflowRun(parseWorkflowBrowserState(null), run);
    run.definition.version = 2;
    const restored = parseWorkflowBrowserState(JSON.stringify(state));
    expect(restored.runs[0].status).toBe('interrupted');
    expect(restored.runs[0].definition.version).toBe(1);
  });
  it('rejects malformed stored workflows instead of presenting them as runnable', () => {
    expect(() => parseWorkflowBrowserState('{"schemaVersion":2,"definitions":[],"runs":[]}')).toThrow();
    expect(() => parseWorkflowBrowserState('broken')).toThrow();
    expect(() => parseWorkflowBrowserState('{"schemaVersion":1,"definitions":[{}],"runs":[]}')).toThrow();
  });
});
