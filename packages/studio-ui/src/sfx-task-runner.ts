import { sfxWorkflowNodes } from './sfx-workflow-nodes';
import { sfxWorkflowDefinition } from '@pireel/studio-engine/workflow-sfx-template';
import { validSfxOptions } from '@pireel/studio-engine/sfx-task';
import { sceneLiteral, sceneStep } from '@pireel/studio-engine/workflow-caption-template';
import { studioProviders } from '@pireel/studio-engine/providers';
import { SceneWorkflowHost, type SceneWorkflowHooks } from './scene-workflow-runtime';
import { captionWorkflowNodes } from './caption-workflow-nodes';
import { editingWorkflowNodes } from './editing-workflow-nodes';
import type { CaptionTaskRecord } from './caption-task-store';

export async function runSfxTask(task: CaptionTaskRecord, source: File, hooks: SceneWorkflowHooks) {
  if (!validSfxOptions(task.options.sfx)) throw new Error('音效配置无效，请重新选择。');
  const host = new SceneWorkflowHost(task, source, hooks);
  try {
    const media = await host.store.put('media', task.sourceSig, { sig: task.sourceSig, name: task.name, width: task.width, height: task.height, durationSec: task.durationSec });
    const raw = task.workflowData && Object.values(task.workflowData.artifacts).find(entry => entry.ref.kind === 'transcript' && entry.ref.id === task.sourceSig);
    const transcript = raw?.ref ?? (task.transcript?.length ? await host.store.put('transcript', task.sourceSig, task.transcript) : null);
    const effects = 'density' in task.options.sfx ? sfxWorkflowNodes(host) : editingWorkflowNodes(host).filter(node => node.capability.id === 'audio.effects').map(node => ({ ...node, stage: 'styling' as const }));
    const result = await host.run(sfxWorkflowDefinition(task.options, media, transcript, task.id), [...captionWorkflowNodes(host), ...effects]);
    // Versions carry durable audio identities, so the editable result also works on another device.
    if (studioProviders().sceneProjects) {
      if (await studioProviders().sceneProjects!.owner() !== task.scope) throw new Error('登录账号已变化。');
      for (const asset of Object.values(result.task.document?.assets ?? {})) if (asset.kind === 'audio' && asset.locator.localSig) {
        const file = await host.media({ sig: asset.locator.localSig, name: asset.label ?? 'sound.wav', width: 0, height: 0, durationSec: asset.metadata.durationSec ?? 1 });
        if (!await studioProviders().vault.backup(file, asset.locator.localSig)) throw new Error('音效备份未完成，请重试。');
        host.check();
      }
    }
    return result;
  } finally { host.dispose(); }
}

/** Render a saved version's native audio/video document without ASR, SFX planning or a new version. */
export async function exportSfxEdit(task: CaptionTaskRecord, source: File, hooks: Pick<SceneWorkflowHooks, 'signal' | 'progress'>) {
  if (!task.document) throw new Error('请先生成带音效的视频。');
  const host = new SceneWorkflowHost({ ...task, workflow: undefined, workflowDefinition: undefined }, source, { ...hooks, checkpoint: async () => {} });
  try {
    const document = await host.store.put('document', 'sfx-export', task.document);
    const media = await host.store.put('media', task.sourceSig, { sig: task.sourceSig, name: task.name, width: task.width, height: task.height, durationSec: task.durationSec });
    const result = await host.run({ schemaVersion: 1, id: 'sfx-export', templateId: 'sfx', version: 2, title: 'Export', parameters: {}, trigger: { kind: 'manual' }, steps: [sceneStep('render', 'video.render', { document: sceneLiteral(document), media: sceneLiteral(media) })] }, captionWorkflowNodes(host));
    return result.video;
  } finally { host.dispose(); }
}
