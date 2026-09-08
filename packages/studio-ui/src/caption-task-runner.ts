import { buildCaptionTaskDocument, captionTaskPreset, captionTaskStyle, fitCaptionTaskDocumentLayout } from '@pireel/studio-engine/caption-task';
import { projectDocumentToComposition } from '@pireel/studio-engine/composition';
import { studioProviders } from '@pireel/studio-engine/providers';
import { emphasizeCaptionDocument } from './caption-emphasis-operation';
import { captionProcessingStages } from './caption-task-progress';
import type { CaptionTaskRecord, CaptionTaskProgress, CaptionProcessingStage, CaptionStageProgress } from './caption-task-store';

/** Browser executor independent of the workbench. Progress comes from completed work, never timers. */
export async function runCaptionTask(task: CaptionTaskRecord, file: File, hooks: {
  signal: AbortSignal; checkpoint: (task: CaptionTaskRecord) => Promise<void>; progress: (fraction: number) => void;
  stageProgress?: (progress: CaptionTaskProgress) => void;
}): Promise<{ task: CaptionTaskRecord; video: Blob }> {
  let next = structuredClone(task);
  next.progress = Object.fromEntries(captionProcessingStages(next.options).map((stage) => [stage, { status: 'pending' }]));
  const check = () => { if (hooks.signal.aborted) throw new DOMException('Cancelled', 'AbortError'); };
  const report = (stage: CaptionProcessingStage, update: CaptionStageProgress) => {
    check(); next = { ...next, progress: { ...next.progress, [stage]: update } }; hooks.stageProgress?.(next.progress!);
  };
  const finish = (stage: CaptionProcessingStage) => report(stage, { status: 'completed', fraction: 1 });
  const count = (stage: CaptionProcessingStage, done: number, total: number, detail?: string) => report(stage, { status: 'running', fraction: total ? Math.min(1, done / total) : undefined, done, total, detail });
  const checkpoint = async (stage: CaptionProcessingStage) => {
    report(stage, { status: 'running' });
    next = { ...next, stage, updatedAt: Date.now(), error: undefined };
    await hooks.checkpoint(next); check();
  };
  check(); finish('preparing');
  if (!next.transcript?.length) {
    await checkpoint('transcribing');
    const { transcribeFile } = await import('./media');
    const transcript = await transcribeFile(file, { signal: hooks.signal, onPhase: (detail) => report('transcribing', { status: 'running', detail }) });
    check();
    if (!transcript.length) throw new Error('没有识别到讲话内容，请选择有声音的视频。');
    next = { ...next, transcript };
  }
  finish('transcribing');
  if (next.options.shortenPauses) {
    if (!next.cuts) {
      await checkpoint('cleaning');
      const { detectSpeechSilenceCuts } = await import('./speech-silence');
      const cuts = await detectSpeechSilenceCuts(file, { minimumPauseSec: 0.7, speechPaddingSec: 0.15, onProgress: (done, total) => count('cleaning', done, total) });
      next = { ...next, cuts };
    }
    finish('cleaning');
  }
  const url = URL.createObjectURL(file);
  try {
    next.document ??= buildCaptionTaskDocument({ ...next, projectId: next.projectId ?? next.id, sourceUrl: url, sourceName: next.name, sourceSig: next.sourceSig, options: next.options, transcript: next.transcript!, cuts: next.options.shortenPauses ? next.cuts : [] });
    if (next.options.translationLanguage) {
      await checkpoint('translating');
      const translate = studioProviders().translate;
      if (!translate) throw new Error('翻译服务尚未连接，请关闭双语字幕后重试。');
      const { translateCaptionTask } = await import('./caption-task-translation');
      const translated = await translateCaptionTask(next, next.document!, translate, check, (done, total) => count('translating', done, total));
      next = { ...next, ...translated }; finish('translating');
    }
    await checkpoint('styling');
    const { loadFont } = await import('./web-fonts');
    const font = captionTaskStyle(next.options).font;
    if (font) {
      const glyphs = [...new Set([...next.transcript!.map((segment) => segment.text).join('')])];
      const total = Math.ceil(glyphs.length / 1000);
      for (let offset = 0; offset < glyphs.length; offset += 1000) {
        count('styling', offset / 1000, total, 'fonts');
        await loadFont(font, glyphs.slice(offset, offset + 1000).join(''));
        count('styling', offset / 1000 + 1, total, 'fonts');
      }
    }
    await document.fonts.ready; check(); finish('styling');
    if (captionTaskPreset(next.options.presetId).style.preset === 'kw-yellow') {
      await checkpoint('emphasizing');
      const select = studioProviders().captionEmphasis;
      if (!select) throw new Error('重点词服务尚未连接，请选择其他字幕样式。');
      const document = await emphasizeCaptionDocument(next.document!, (rows) => { check(); return select(rows); }, (done, total) => count('emphasizing', done, total));
      next = { ...next, document }; finish('emphasizing');
    }
    next = { ...next, document: fitCaptionTaskDocumentLayout(next.document!, next.options) };
    await checkpoint('rendering');
    const { clientExportVideo } = await import('./client-export');
    const comp = projectDocumentToComposition(next.document!);
    if (comp.video) comp.video = { ...comp.video, url };
    const clipFiles = new Map((comp.shots ?? []).flatMap((shot) => shot.src ? [[shot.src, file] as const] : []));
    const video = await clientExportVideo({ comp, videoFile: file, clipFiles, render: { res: 1080, fps: 30, format: 'mp4' }, shouldCancel: () => hooks.signal.aborted, onProgress: (done, total) => {
      count('rendering', done, total, done === total ? 'finishing' : undefined); hooks.progress(total ? done / total : 0);
    } });
    check(); finish('rendering');
    return { task: { ...next, stage: 'completed', updatedAt: Date.now() }, video };
  } finally { URL.revokeObjectURL(url); }
}
