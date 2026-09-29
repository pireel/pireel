import { DUBBING_MAX_DURATION_SEC, DUBBING_MAX_VIDEO_BYTES, DUBBING_LANGUAGES } from '@pireel/studio-engine/dubbing-task';
import { dubbingWorkflowDefinition } from '@pireel/studio-engine/workflow-dubbing-template';
import type { CaptionTaskRecord } from './caption-task-store';
import { SceneWorkflowHost, type SceneWorkflowHooks } from './scene-workflow-runtime';
import { captionWorkflowNodes } from './caption-workflow-nodes';
import { dubbingWorkflowNodes } from './dubbing-workflow-nodes';
import { probeVideoFile } from './media';
import { saveLocalVideo } from './local-media';

/** Generation stops at the dubbed document (voice track, captions, lip-synced picture); the video is
 *  rendered on download (`exportCaptionEdit`). A saved custom definition that renders still returns it. */
export async function runDubbingTask(task: CaptionTaskRecord, file: File, hooks: SceneWorkflowHooks): Promise<{ task: CaptionTaskRecord; video?: Blob }> {
  const config = task.options.dubbing!;
  if (!DUBBING_LANGUAGES.some(language => language.id === config.language) || !config.voiceId) throw new Error('请选择目标语言和声音。');
  if (config.script !== undefined && !config.script.trim()) throw new Error('配音文案不能为空。');
  if (!Number.isFinite(task.durationSec) || task.durationSec <= 0 || task.durationSec > DUBBING_MAX_DURATION_SEC) throw new Error('支持 30 分钟以内的视频。');
  if (file.size > DUBBING_MAX_VIDEO_BYTES) throw new Error('请选择 1GB 以下的视频。');
  const host = new SceneWorkflowHost(task, file, hooks);
  try {
    const media = await host.store.put('media', task.sourceSig, { sig: task.sourceSig, name: task.name, width: task.width, height: task.height, durationSec: task.durationSec });
    const raw = task.workflowData && Object.values(task.workflowData.artifacts).find(entry => entry.ref.kind === 'transcript' && entry.ref.id === task.sourceSig);
    const transcript = raw?.ref ?? (task.transcript?.length ? await host.store.put('transcript', task.sourceSig, task.transcript) : null);
    const result = await host.compose(dubbingWorkflowDefinition(task.options, media, transcript, task.id, task.name, task.dubbing, task.workflowData ? undefined : task.generationId, false), [...captionWorkflowNodes(host), ...dubbingWorkflowNodes(host)]);
    // Original ASR stays the source for speaker setup and future translation; captions use the audio artifact.
    result.task.transcript = host.task.workflowData ? host.store.read(result.task.workflow!.steps.find(step => step.id === 'transcript')!.artifact!.data.transcript, 'transcript') : task.transcript;
    if (!result.video) return result;
    const output = new File([result.video], `${task.name.replace(/\.[^.]+$/, '')}-${config.language}.mp4`, { type: 'video/mp4' });
    const sig = host.store.read<{ sig: string }>(result.task.workflow!.steps.find(step => step.id === 'render')!.artifact!.data.media, 'media').sig; const outputCached = await saveLocalVideo(output, sig).catch(() => false);
    const metadata = await probeVideoFile(output); host.check();
    result.task.dubbing = { ...result.task.dubbing, outputSig: sig, outputCached, outputWidth: metadata.width, outputHeight: metadata.height };
    return { task: result.task, video: result.video };
  } finally { host.dispose(); }
}
