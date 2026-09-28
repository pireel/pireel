import { readyUgcAdOptions } from '@pireel/studio-engine/ugc-ad';
import { ugcAdWorkflowDefinition } from '@pireel/studio-engine/workflow-ugc-ad-template';
import type { CaptionTaskRecord } from './caption-task-store';
import { SceneWorkflowHost, type SceneWorkflowHooks } from './scene-workflow-runtime';
import { captionWorkflowNodes } from './caption-workflow-nodes';
import { brollWorkflowNodes } from './broll-workflow-nodes';
import { ugcAdWorkflowNodes } from './ugc-ad-workflow-nodes';
import { saveLocalVideo } from './local-media';

export async function runUgcAdTask(task: CaptionTaskRecord, source: File, hooks: SceneWorkflowHooks): Promise<{ task: CaptionTaskRecord; video: Blob }> {
  readyUgcAdOptions(task.options.ugcAd);
  if ((task.options.broll?.assets.length ?? 0) > 20) throw new Error('最多添加 20 个商品素材。');
  const host = new SceneWorkflowHost(task, source, hooks);
  try {
    const media = await host.store.put('media', task.sourceSig, { sig: task.sourceSig, name: task.name, width: task.width, height: task.height, durationSec: task.durationSec });
    const raw = task.workflowData && Object.values(task.workflowData.artifacts).find(entry => entry.ref.kind === 'transcript' && entry.ref.id === task.sourceSig);
    const transcript = raw?.ref ?? (task.transcript?.length ? await host.store.put('transcript', task.sourceSig, task.transcript) : null);
    const definition = ugcAdWorkflowDefinition(task.options, media, transcript, task.id, task.durationSec, task.broll ?? null);
    const result = await host.run(definition, [...captionWorkflowNodes(host), ...brollWorkflowNodes(host), ...ugcAdWorkflowNodes(host)]);
    const output = new File([result.video], `${task.name}-ugc-ad.mp4`, { type: 'video/mp4' });
    const sig = host.store.read<{ sig: string }>(result.task.workflow!.steps.find(step => step.id === 'render')!.artifact!.data.media, 'media').sig;
    await saveLocalVideo(output, sig); host.check();
    if (task.options.broll?.assets.length) result.task.broll = { ...result.task.broll!, outputSig: sig };
    return result;
  } finally { host.dispose(); }
}

/** Pure export of the saved native document; no ASR, matching or copy planning. */
export async function exportUgcAdEdit(task: CaptionTaskRecord, source: File, hooks: Pick<SceneWorkflowHooks, 'signal' | 'progress'>) {
  if (!task.document) throw new Error('请先生成 UGC 广告。');
  const host = new SceneWorkflowHost({ ...task, workflow: undefined, workflowDefinition: undefined }, source, { ...hooks, checkpoint: async () => {} });
  try {
    const document = await host.store.put('document', 'ugc-export', task.document);
    const media = await host.store.put('media', task.sourceSig, { sig: task.sourceSig, name: task.name, width: task.width, height: task.height, durationSec: task.durationSec });
    const { sceneStep, sceneLiteral } = await import('@pireel/studio-engine/workflow-caption-template');
    const result = await host.run({ schemaVersion: 1, id: 'ugc-ad-export', templateId: 'ugc-ad', version: 2, title: 'Export', parameters: {}, trigger: { kind: 'manual' }, steps: [sceneStep('render', 'video.render', { document: sceneLiteral(document), media: sceneLiteral(media) })] }, captionWorkflowNodes(host));
    return result.video;
  } finally { host.dispose(); }
}
