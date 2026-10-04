import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { applyPlaybookMedia, playbookHasMedia } from '@pireel/studio-engine/brand-media';
import { buildCaptionBaseDocument, captionTaskStyle, type CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { applyDocumentTransaction } from '@pireel/studio-engine/document-transaction';
import { studioProviders } from '@pireel/studio-engine/providers';
import { captionLayoutOptions } from '@pireel/studio-engine/workflow-caption-template';
import type { CaptionTaskRecord } from './caption-task-store';
import { loadCaptionMedia, syncCaptionProject } from './caption-task-store';
import { assembleCaptionDocument, planCaptionDocument } from './caption-workflow-artifacts';
import { prepareSpeechAudio } from './media';
import type { SceneWorkflowHooks } from './scene-workflow-runtime';

/**
 * Video dubbing run by the server (docs/server-scene-runs.md). The browser hands over what only it
 * can do — the speech extracted from the local video — and then just follows the run; closing the
 * page does not stop it. Once the server is done, the edit is assembled here (caption layout uses
 * the browser's font metrics), which calls no third party.
 */
export async function runDubbingOnServer(task: CaptionTaskRecord, file: File, hooks: SceneWorkflowHooks): Promise<{ task: CaptionTaskRecord }> {
  const runs = studioProviders().serverRuns!;
  const report = (progress: CaptionTaskRecord['progress']) => hooks.stageProgress?.(progress ?? {});
  let cloud = await runs.project(task.id, hooks.signal);
  // A new generation is handed over; one already on the server is only followed.
  if (cloud.task.serverRun?.id !== task.generationId) {
    report({ preparing: { status: 'running', detail: 'uploading' } });
    await hooks.checkpoint(task); await syncCaptionProject(task.scope, task.id);
    const audio = await prepareSpeechAudio(file, { signal: hooks.signal });
    if (!audio) throw new Error('视频没有声音，无法译制。');
    await runs.start({ projectId: task.id, generationId: task.generationId!, audioKey: audio.key, audioOffset: audio.offset }, hooks.signal);
  }
  for (;;) {
    cloud = await runs.project(task.id, hooks.signal);
    const run = cloud.task.serverRun;
    report(cloud.task.progress);
    if (run && run.id === task.generationId && run.status === 'completed') break;
    if (run && run.id === task.generationId && run.status === 'failed') throw new Error(run.error ?? '译制失败，请重试。');
    await new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, 3000); hooks.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); }, { once: true }); });
  }
  const finished = { ...cloud.task, cloudRevision: cloud.revision };
  return { task: { ...finished, document: await composeDubbingDocument(finished), stage: 'completed' } };
}

/** The dubbed edit from a finished server run: picture (lip-synced when asked), the dubbed voice, captions, brand. */
export async function composeDubbingDocument(task: CaptionTaskRecord): Promise<EditorDocumentV2> {
  const config = task.options.dubbing!; const dubbing = task.dubbing ?? {};
  if (!dubbing.alignedAudioSig) throw new Error('配音音轨缺失，请重新生成。');
  const pictureSig = config.lipSync && dubbing.lipVideoSig ? dubbing.lipVideoSig : task.sourceSig;
  const audio = await loadCaptionMedia(task.scope, dubbing.alignedAudioSig, 'dubbing.wav');
  if (!audio) throw new Error('配音音轨暂时无法读取，请稍后重试。');
  let document = buildCaptionBaseDocument({ projectId: task.id, sourceUrl: '', sourceName: task.name, sourceSig: pictureSig, width: task.width, height: task.height, durationSec: task.durationSec, transcript: [], options: { caption: {}, aspect: 'original', shortenPauses: false } });
  const composed = applyDocumentTransaction(document, { ops: [
    { op: 'narrative.patch', input: { updates: document.timeline.tracks.flatMap(track => track.clips.flatMap(clip => clip.kind === 'narrative' ? [{ clipId: clip.id, patch: { audio: { mute: true } } }] : [])) } },
    { op: 'command', input: { command: { type: 'track.insert', track: { id: 'dubbing-narration', type: 'audio', role: 'narration', name: 'Dubbing', syncLocked: true } } } },
    { op: 'audio.add', input: { toTrackId: 'dubbing-narration', clip: { id: 'dub-audio', sig: dubbing.alignedAudioSig, src: URL.createObjectURL(audio), role: 'narration', durationSec: task.durationSec, startSec: 0, volumeDb: 0, fadeInSec: 0, fadeOutSec: 0 } } },
  ] }, { projectId: task.id });
  if (!composed.ok) throw new Error(composed.error.message);
  document = composed.document;
  const options: CaptionTaskOptions = { ...task.options, translationLanguage: undefined, shortenPauses: false, aspect: 'original', broll: config.captions ? undefined : { assets: [], captions: false }, highlights: undefined };
  if (config.captions && dubbing.captionTranscript?.length) {
    const font = captionTaskStyle(options, document.canvas).font;
    if (font) {
      const { loadFont } = await import('./web-fonts');
      const glyphs = [...new Set([...dubbing.captionTranscript.map((segment: AsrSegment) => segment.text).join('')])];
      for (let offset = 0; offset < glyphs.length; offset += 1000) await loadFont(font, glyphs.slice(offset, offset + 1000).join(''));
    }
    if (typeof globalThis.document !== 'undefined') await globalThis.document.fonts?.ready;
    const plan = planCaptionDocument(document, dubbing.captionTranscript, captionLayoutOptions(options));
    document = assembleCaptionDocument(document, plan, null, options);
  }
  if (playbookHasMedia(task.options.brand)) document = applyPlaybookMedia(document, task.options.brand!);
  return document;
}
