import { brollWorkflowDefinition } from '@pireel/studio-engine/workflow-broll-template';
import type { CaptionTaskRecord } from './caption-task-store';
import { SceneWorkflowHost, type SceneWorkflowHooks } from './scene-workflow-runtime';
import { captionWorkflowNodes } from './caption-workflow-nodes';
import { brollWorkflowNodes } from './broll-workflow-nodes';
import { saveLocalVideo } from './local-media';

export async function runBrollTask(task: CaptionTaskRecord, source: File, hooks: SceneWorkflowHooks): Promise<{ task: CaptionTaskRecord; video: Blob }> {
  if (!task.options.broll?.assets.length || task.options.broll.assets.length > 20) throw new Error('请添加 1–20 个素材。');
  const host = new SceneWorkflowHost(task, source, hooks);
  try {
    const media = await host.store.put('media', task.sourceSig, { sig: task.sourceSig, name: task.name, width: task.width, height: task.height, durationSec: task.durationSec });
    const raw = task.workflowData && Object.values(task.workflowData.artifacts).find(entry => entry.ref.kind === 'transcript' && entry.ref.id === task.sourceSig);
    const transcript = raw?.ref ?? (task.transcript?.length ? await host.store.put('transcript', task.sourceSig, task.transcript) : null);
    const definition = brollWorkflowDefinition(task.options, media, transcript, task.id, task.durationSec, task.broll ?? null);
    const result = await host.run(definition, [...captionWorkflowNodes(host), ...brollWorkflowNodes(host)]);
    const output = new File([result.video], `${task.name}-broll.mp4`, { type: 'video/mp4' }); const sig = host.store.read<{ sig: string }>(result.task.workflow!.steps.find(step => step.id === 'render')!.artifact!.data.media, 'media').sig;
    await saveLocalVideo(output, sig); host.check();
    result.task.broll = { ...result.task.broll!, outputSig: sig };
    return result;
  } finally { host.dispose(); }
}
