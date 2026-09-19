import { captionWorkflowDefinition } from '@pireel/studio-engine/workflow-caption-template';
import { SceneWorkflowHost, type SceneWorkflowHooks } from './scene-workflow-runtime';
import { captionWorkflowNodes } from './caption-workflow-nodes';
import type { CaptionTaskRecord } from './caption-task-store';

/** Scene adapter seeds immutable inputs; the definition and installed nodes own execution. */
export async function runCaptionTask(task: CaptionTaskRecord, file: File, hooks: SceneWorkflowHooks): Promise<{ task: CaptionTaskRecord; video: Blob }> {
  const host = new SceneWorkflowHost(task, file, hooks);
  try {
    const media = await host.store.put('media', task.sourceSig, { sig: task.sourceSig, name: task.name, width: task.width, height: task.height, durationSec: task.durationSec });
    // Once migrated, raw ASR comes from its artifact, never the assembled bilingual projection.
    const raw = task.workflowData && Object.values(task.workflowData.artifacts).find(entry => entry.ref.kind === 'transcript' && entry.ref.id === task.sourceSig);
    const transcript = raw?.ref ?? (task.transcript?.length ? await host.store.put('transcript', task.sourceSig, task.transcript) : null);
    return await host.run(captionWorkflowDefinition(task.options, media, transcript, task.cuts ?? null, task.projectId ?? task.id), captionWorkflowNodes(host));
  } finally { host.dispose(); }
}
