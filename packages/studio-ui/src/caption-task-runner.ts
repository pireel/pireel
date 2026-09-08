import { buildCaptionTaskDocument, captionTaskPreset, captionTaskStyle } from '@pireel/studio-engine/caption-task';
import { projectDocumentToComposition } from '@pireel/studio-engine/composition';
import { studioProviders } from '@pireel/studio-engine/providers';
import { emphasizeCaptionDocument } from './caption-emphasis-operation';
import type { CaptionTaskRecord } from './caption-task-store';

/** Browser executor independent of the workbench. Documents and rendering are shared with Studio. */
export async function runCaptionTask(task: CaptionTaskRecord, file: File, hooks: {
  signal: AbortSignal; checkpoint: (task: CaptionTaskRecord) => Promise<void>; progress: (fraction: number) => void;
}): Promise<{ task: CaptionTaskRecord; video: Blob }> {
  let next = structuredClone(task);
  const check = () => { if (hooks.signal.aborted) throw new DOMException('Cancelled', 'AbortError'); };
  const checkpoint = async (stage: CaptionTaskRecord['stage']) => { check(); next = { ...next, stage, updatedAt: Date.now(), error: undefined }; await hooks.checkpoint(next); check(); };
  if (!next.transcript?.length) {
    await checkpoint('transcribing');
    const { transcribeFile } = await import('./media');
    next.transcript = await transcribeFile(file);
    check();
    if (!next.transcript.length) throw new Error('没有识别到讲话内容，请选择有声音的视频。');
  }
  if (next.options.shortenPauses && !next.cuts) {
    await checkpoint('cleaning');
    const { detectSpeechSilenceCuts } = await import('./speech-silence');
    next.cuts = await detectSpeechSilenceCuts(file, { minimumPauseSec: 0.7, speechPaddingSec: 0.15 });
  }
  const url = URL.createObjectURL(file);
  try {
    next.document ??= buildCaptionTaskDocument({ ...next, projectId: next.projectId ?? next.id, sourceUrl: url, sourceName: next.name, sourceSig: next.sourceSig, options: next.options, transcript: next.transcript!, cuts: next.options.shortenPauses ? next.cuts : [] });
    if (next.options.translationLanguage) {
      await checkpoint('translating');
      const translate = studioProviders().translate;
      if (!translate) throw new Error('翻译服务尚未连接，请关闭双语字幕后重试。');
      const { translateCaptionTask } = await import('./caption-task-translation');
      Object.assign(next, await translateCaptionTask(next, next.document!, translate, check));
    }
    await checkpoint('styling');
    const { loadFont } = await import('./web-fonts');
    const font = captionTaskStyle(next.options).font;
    if (font) {
      const glyphs = [...new Set([...next.transcript!.map((segment) => segment.text).join('')])];
      for (let offset = 0; offset < glyphs.length; offset += 1000) {
        check();
        await Promise.race([loadFont(font, glyphs.slice(offset, offset + 1000).join('')), new Promise<void>((resolve) => setTimeout(resolve, 15_000))]);
      }
    }
    await document.fonts.ready;
    check();
    if (captionTaskPreset(next.options.presetId).style.preset === 'kw-yellow') {
      const select = studioProviders().captionEmphasis;
      if (!select) throw new Error('重点词服务尚未连接，请选择其他字幕样式。');
      next.document = await emphasizeCaptionDocument(next.document, (rows) => { check(); return select(rows); });
    }
    await checkpoint('rendering');
    const { clientExportVideo } = await import('./client-export');
    const comp = projectDocumentToComposition(next.document);
    if (comp.video) comp.video = { ...comp.video, url };
    const video = await clientExportVideo({ comp, videoFile: file, clipFiles: new Map(), render: { res: 1080, fps: 30, format: 'mp4' }, shouldCancel: () => hooks.signal.aborted, onProgress: (done, total) => hooks.progress(total ? done / total : 0) });
    check();
    return { task: { ...next, stage: 'completed', updatedAt: Date.now() }, video };
  } finally { URL.revokeObjectURL(url); }
}
