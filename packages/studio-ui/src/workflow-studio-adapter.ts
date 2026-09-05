import type { WorkflowExecutor } from '@pireel/studio-engine/workflow-runtime';
import type { WorkflowInputs, WorkflowRun, WorkflowSource, WorkflowValue } from '@pireel/studio-engine/workflow';

export interface WorkflowStudioContext {
  source: WorkflowSource;
  title: string;
  sourceLabel?: string;
  hasContent: boolean;
  hasNarration: boolean;
  hasTranscript: boolean;
}
export interface WorkflowStudioHost {
  context(): WorkflowStudioContext;
  assertWritable(): void;
  prepareMedia(): Promise<void>;
  call(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; error?: string; summary?: string; data?: unknown }>;
}
const TOOLS: Record<string, string> = {
  'output.duplicate': 'manage_project', 'transcript.ensure': 'get_transcript',
  'speech.tighten-pauses': 'remove_silence', 'captions.style': 'set_captions',
  'canvas.resize': 'set_canvas', 'media.search-transcript': 'search_media',
};

/** A compact host document revision; used for optimistic conflict detection, not asset identity. */
export function workflowDocumentRevision(document: unknown): string {
  const serialized = JSON.stringify(document);
  let hash = 2166136261;
  for (let i = 0; i < serialized.length; i++) hash = Math.imul(hash ^ serialized.charCodeAt(i), 16777619);
  return serialized.length + ':' + (hash >>> 0).toString(16);
}

function expectedSource(run: WorkflowRun): WorkflowSource {
  const last = [...run.steps].reverse().find((step) => step.status === 'completed' && step.artifact?.data.outputId);
  return last ? {
    projectId: run.source.projectId,
    outputId: String(last.artifact!.data.outputId),
    revision: String(last.artifact!.data.revision),
  } : run.source;
}

export function createStudioWorkflowExecutor(host: WorkflowStudioHost, zh: boolean): WorkflowExecutor {
  const fail = (cn: string, en: string): never => { throw new Error(zh ? cn : en); };
  return {
    async preflight(step, run) {
      host.assertWritable();
      const current = host.context();
      const expected = expectedSource(run);
      if (current.source.projectId !== expected.projectId || current.source.outputId !== expected.outputId || current.source.revision !== expected.revision) fail('作品在运行期间发生变化。请检查结果后重新运行。', 'The output changed during this run. Review it before starting another run.');
      if (!current.hasContent) fail('先把素材添加到时间线，再运行此流程。', 'Add media to the timeline before running this workflow.');
      if (['transcript.ensure', 'speech.tighten-pauses', 'captions.style', 'media.search-transcript'].includes(step.capability) && !current.hasNarration) fail('此流程需要时间线中的口播素材。', 'This workflow needs narration on the timeline.');
      if (['captions.style', 'media.search-transcript'].includes(step.capability) && !current.hasTranscript) fail('这份素材还没有转写。请先在 Studio 中生成转写。', 'This source has no transcript yet. Transcribe it in Studio first.');
      if (step.capability === 'speech.tighten-pauses' || (step.capability === 'transcript.ensure' && !current.hasTranscript)) await host.prepareMedia();
      if (step.capability === 'media.search-transcript' && !String(run.inputs.query ?? '').trim()) fail('请输入要搜索的关键词。', 'Enter a keyword to search.');
    },
    async execute(step, args, { run }) {
      const name = TOOLS[step.capability];
      if (!name) fail('此能力尚未接入当前运行环境。', 'This capability is not connected to this executor.');
      let result: { ok: boolean; error?: string; summary?: string; data?: unknown };
      if (step.capability === 'transcript.ensure' && host.context().hasTranscript) {
        result = { ok: true, summary: zh ? '已复用现有转写' : 'Reused the existing transcript' };
      } else {
        const input = step.capability === 'output.duplicate'
          ? { scope: 'output', action: 'duplicate', id: run.source.outputId, title: run.definition.title }
          : step.capability === 'transcript.ensure' ? { granularity: 'segments' } : args;
        result = await host.call(name, input);
      }
      if (!result.ok) throw new Error(result.error || (zh ? '执行未完成' : 'The operation did not complete'));
      const current = host.context();
      const data: WorkflowInputs = { outputId: current.source.outputId, revision: current.source.revision };
      // Keep bounded receipts, not a copy of the entire source transcript or document.
      if (step.capability === 'media.search-transcript' && result.data && typeof result.data === 'object') {
        const results = (result.data as { results?: unknown }).results;
        if (Array.isArray(results)) data.segments = JSON.parse(JSON.stringify(results.filter((item) => item && typeof item === 'object' && Array.isArray(item.matchedSignals) && item.matchedSignals.some((signal: unknown) => signal === 'phrase' || signal === 'transcript')).slice(0, 20))) as WorkflowValue;
      }
      return {
        status: 'completed',
        summary: result.summary || (zh ? '步骤已完成' : 'Step completed'),
        artifact: {
          kind: step.capability === 'output.duplicate' ? 'project-output' : step.capability === 'media.search-transcript' ? 'segments' : step.capability === 'transcript.ensure' ? 'transcript' : 'edit-receipt',
          data,
        },
      };
    },
  };
}
