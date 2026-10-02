import { pipRenderModel } from './pip-render-model';
import { resolveBrollEdits } from '@pireel/studio-engine/broll-task';
import { captionTaskStyle, type CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { loadCaptionMedia, type CaptionTaskRecord } from './caption-task-store';
import { brollRenderComposition } from './broll-render-model';
import { loadFont } from './web-fonts';

/** Export the existing edit without transcription, matching, emphasis selection or version creation. */
export async function exportBrollEdit(task: CaptionTaskRecord, options: CaptionTaskOptions, source: File, hooks: {
  signal: AbortSignal; onProgress: (fraction: number) => void;
}): Promise<Blob> {
  if (!options.broll || !task.broll?.planKey) throw new Error('请先生成视频，再导出剪辑。');
  const check = () => hooks.signal.throwIfAborted();
  check();
  const clips = resolveBrollEdits(task.broll.placements ?? [], task.broll.candidates, options.broll, task.durationSec);
  const owned: string[] = [];
  const makeUrl = (file: File) => { const url = URL.createObjectURL(file); owned.push(url); return url; };
  const sourceUrl = makeUrl(source);
  try {
    const files = new Map<string, File>([[sourceUrl, source]]);
    const urls = new Map<string, string>();
    // Load only assets actually used in the edit; deleting a clip must not require its source.
    for (const clip of clips) {
      if (urls.has(clip.asset.id)) continue;
      const file = await loadCaptionMedia(task.scope, clip.asset.sig, clip.asset.name); check();
      if (!file) throw new Error(`无法读取素材：${clip.asset.name}`);
      const url = makeUrl(file); files.set(url, file); urls.set(clip.asset.id, url);
    }
    const font = options.broll.captions && captionTaskStyle(options, task).font;
    if (font) await loadFont(font, (task.transcript ?? []).map(row => row.text).join(''));
    check();
    const pip = options.broll.pip ? pipRenderModel(task, options, sourceUrl, new Map(clips.map(clip => [clip.asset.sig, urls.get(clip.asset.id)!]))) : undefined;
    const comp = pip?.composition ?? brollRenderComposition(task, options, sourceUrl);
    for (const shot of comp.shots ?? []) if (shot.src) files.set(shot.src, source);
    const { clientExportVideo } = await import('./client-export'); check();
    const video = await clientExportVideo({ comp, videoFile: source, clipFiles: files,
      visualMediaClips: pip?.visuals ?? clips.map(clip => ({ clipId: clip.id, trackId: 'broll', stackOrder: 1,
        kind: clip.asset.kind, source: urls.get(clip.asset.id)!, startSec: clip.start, endSec: clip.start + clip.duration,
        sourceInSec: clip.sourceIn, sourceOutSec: clip.sourceIn + clip.duration, fit: 'cover', muted: true, audioMuted: true })),
      render: { res: 1080, fps: 30, format: 'mp4' }, shouldCancel: () => hooks.signal.aborted,
      onProgress: (done, total) => hooks.onProgress(total ? Math.min(1, done / total) : 0) });
    check(); return video;
  } finally { owned.forEach(url => URL.revokeObjectURL(url)); }
}
