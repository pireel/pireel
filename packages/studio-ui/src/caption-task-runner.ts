import { captionWorkflowDefinition, sceneLiteral, sceneStep } from '@pireel/studio-engine/workflow-caption-template';
import { SceneWorkflowHost, type SceneWorkflowHooks } from './scene-workflow-runtime';
import { captionWorkflowNodes } from './caption-workflow-nodes';
import type { CaptionTaskRecord } from './caption-task-store';

/** Scene adapter seeds immutable inputs; the definition and installed nodes own execution. */
/** Generation stops at the edited caption document; the video is rendered when the user downloads
 *  it (`exportCaptionEdit`). A saved custom definition that renders still returns its video. */
export async function runCaptionTask(task: CaptionTaskRecord, file: File, hooks: SceneWorkflowHooks): Promise<{ task: CaptionTaskRecord; video?: Blob }> {
  const host = new SceneWorkflowHost(task, file, hooks);
  try {
    const media = await host.store.put('media', task.sourceSig, { sig: task.sourceSig, name: task.name, width: task.width, height: task.height, durationSec: task.durationSec });
    // Once migrated, raw ASR comes from its artifact, never the assembled bilingual projection.
    const raw = task.workflowData && Object.values(task.workflowData.artifacts).find(entry => entry.ref.kind === 'transcript' && entry.ref.id === task.sourceSig);
    const transcript = raw?.ref ?? (task.transcript?.length ? await host.store.put('transcript', task.sourceSig, task.transcript) : null);
    return await host.compose(captionWorkflowDefinition(task.options, media, transcript, task.cuts ?? null, task.projectId ?? task.id, false), captionWorkflowNodes(host));
  } finally { host.dispose(); }
}

/** Render a generated caption or dubbing document to a video: no transcription, planning, voicing or new generation. */
export async function exportCaptionEdit(task: CaptionTaskRecord, file: File, hooks: Pick<SceneWorkflowHooks, 'signal' | 'progress'>): Promise<Blob> {
  if (!task.document) throw new Error('请先生成字幕。');
  // Only the render runs: a generation's custom definition or inserted nodes must not ride along.
  const { signal, progress, stageProgress } = hooks as SceneWorkflowHooks;
  const host = new SceneWorkflowHost({ ...task, workflow: undefined, workflowDefinition: undefined }, file, { signal, progress, stageProgress, checkpoint: async () => {} });
  try {
    const document = await host.store.put('document', 'caption-export', task.document);
    // The document is composed on the lip-synced picture when dubbing produced one, else on the source.
    const lipSynced = task.workflow?.steps.find(step => step.id === 'lipsync' && step.status === 'completed')?.artifact?.data.media;
    const media = lipSynced ?? await host.store.put('media', task.sourceSig, { sig: task.sourceSig, name: task.name, width: task.width, height: task.height, durationSec: task.durationSec });
    const result = await host.run({ schemaVersion: 1, id: 'caption-export', templateId: 'ai-captions', version: 2, title: 'Export', parameters: {}, trigger: { kind: 'manual' }, steps: [sceneStep('render', 'video.render', { document: sceneLiteral(document), media: sceneLiteral(media) })] }, captionWorkflowNodes(host));
    return result.video;
  } finally { host.dispose(); }
}
