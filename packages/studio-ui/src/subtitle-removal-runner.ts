import { validSubtitleRemoval, erasureKind } from '@pireel/studio-engine/subtitle-removal';
import { artifactVersion, workflowJson } from '@pireel/studio-engine/workflow-artifacts';
import { sceneCapability, sceneLiteral, sceneStep, stepOutput } from '@pireel/studio-engine/workflow-caption-template';
import { studioProviders } from '@pireel/studio-engine/providers';
import { SceneWorkflowHost, type SceneWorkflowHooks, type SceneMedia } from './scene-workflow-runtime';
import { captionWorkflowNodes } from './caption-workflow-nodes';
import { materializeRemoteMedia } from './remote-media';
import { durableFileSig, probeVideoFile } from './media';
import { saveLocalVideo } from './local-media';
import type { CaptionTaskRecord } from './caption-task-store';
const endpoint = '/api/studio/subtitle-removal';
async function json(response: Response) { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? '字幕擦除未完成，请稍后继续。'); return body; }
const pause = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  signal.throwIfAborted();
  const abort = () => { clearTimeout(timer); reject(signal.reason); };
  const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 2000);
  signal.addEventListener('abort', abort, { once: true });
});
export async function runSubtitleRemovalTask(task: CaptionTaskRecord, source: File, hooks: SceneWorkflowHooks) {
  if (!validSubtitleRemoval(task.options.subtitleRemoval)) throw new Error('字幕擦除设置无效。');
  const capability = task.options.subtitleRemoval.tier ? 'video.erase-pro' : erasureKind(task.options.subtitleRemoval) === 'subtitles' ? 'video.remove-subtitles' : 'video.erase';
  const sourceProbe = await probeVideoFile(source); hooks.signal.throwIfAborted();
  const host = new SceneWorkflowHost(task, source, hooks);
  try {
    const media = await host.store.put('media', task.sourceSig, { sig: task.sourceSig, name: task.name, width: task.width, height: task.height, durationSec: task.durationSec });
    const result = await host.run({ schemaVersion: 1, id: 'official-subtitle-removal', title: 'Remove subtitles', templateId: 'subtitle-removal', version: 1, parameters: {}, trigger: { kind: 'manual' }, steps: [
      sceneStep('remove', capability, { media: sceneLiteral(media), projectId: sceneLiteral(task.id), options: sceneLiteral(task.options.subtitleRemoval) }),
      sceneStep('compose', 'edit.compose', { media: stepOutput('remove', 'media'), cuts: sceneLiteral([]), aspect: sceneLiteral('original'), projectId: sceneLiteral(task.id) }),
      sceneStep('result', 'video.removal-result', { media: stepOutput('remove', 'media'), document: stepOutput('compose', 'document') }),
    ] }, [...captionWorkflowNodes(host), {
      capability: sceneCapability(capability, ['media', 'projectId', 'options'], ['media'], true), stage: 'rendering', reconcile: true,
      async execute(args, context) {
        const requestId = await artifactVersion(context.idempotencyKey);
        const body = { projectId: args.projectId, requestId, options: args.options };
        let status = await json(await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: hooks.signal }));
        while (status.status === 'running') {
          if (status.usage) context.recordUsage(status.usage);
          await context.savePartial({ requestId });
          host.report('rendering', { status: 'running', detail: 'subtitle-erasing' });
          await pause(hooks.signal);
          status = await json(await fetch(`${endpoint}?projectId=${encodeURIComponent(String(args.projectId))}&requestId=${requestId}`, { signal: hooks.signal }));
        }
        if (status.usage) context.recordUsage(status.usage);
        if (!['saving', 'completed'].includes(status.status) || typeof status.url !== 'string') throw new Error('字幕擦除结果无效。');
        host.report('rendering', { status: 'running', detail: 'saving-video' });
        const file = (await materializeRemoteMedia(status.url, { name: task.name.replace(/\.[^.]+$/, '') + '-clean.mp4', type: 'video/mp4', signal: hooks.signal })).file;
        const probe = await probeVideoFile(file); host.check();
        if (sourceProbe.hasAudio && !probe.hasAudio) throw new Error('处理结果缺少原声音轨，已保留原片。');
        if (Math.abs(probe.durationSec - task.durationSec) > 1) throw new Error('擦除后的视频时长不完整，已保留原片。');
        const sig = await durableFileSig(file);
        if (!await saveLocalVideo(file, sig)) throw new Error('处理结果未保存到本机，请检查存储空间。');
        host.files.set(sig, file);
        if (await studioProviders().sceneProjects?.owner() !== task.scope) throw new Error('登录账号已变化。');
        if (!await studioProviders().vault.backup(file, sig)) throw new Error('处理结果备份未完成，请稍后继续。');
        const settled = await json(await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, action: 'finish', mediaSig: sig }), signal: hooks.signal }));
        if (settled.usage) context.recordUsage(settled.usage);
        return { media: workflowJson(await host.store.put('media', 'subtitle-removal-output', { sig, name: file.name, ...probe, kind: 'video' })) };
      },
    }, {
      capability: sceneCapability('video.removal-result', ['media', 'document'], ['document']), cache: false, stage: 'rendering',
      async execute(args) { host.video = await host.media(host.store.read<SceneMedia>(args.media, 'media')); return { document: args.document }; },
      project: outputs => ({ document: host.store.read(outputs.document, 'document') }),
    }]);
    return result;
  } finally { host.dispose(); }
}
