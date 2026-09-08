import { extractFirstThumbnail, extractThumbnails } from '@pireel/studio-engine/video-edit/thumbnails';
import type { Thumbnail } from '@pireel/studio-engine/video-edit/types';
import { loadLocalVideo } from './local-media';
import { loadCaptionTask, patchCaptionProjectMetadata } from './caption-task-store';

/** A durable JPEG data URL, never an object URL that breaks after a refresh. */
export async function captureCaptionCover(file: File, durationSec: number): Promise<string | undefined> {
  const frames = await extractThumbnails(file, [Math.min(1, Math.max(0, durationSec / 10))], { width: 480, quality: 0.78 });
  return thumbnailDataUrl(frames);
}

/** Full preview reads the source's first frame independently of its small list cover. */
export async function captureCaptionFirstFrame(file: File): Promise<string | undefined> {
  return thumbnailDataUrl(await extractFirstThumbnail(file, { width: 1280, quality: 0.88 }));
}

async function thumbnailDataUrl(frames: Thumbnail[]): Promise<string | undefined> {
  try {
    if (!frames[0]) return undefined;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(frames[0]!.blob);
    });
  } finally { frames.forEach((frame) => URL.revokeObjectURL(frame.url)); }
}

const pending = new Map<string, Promise<string | undefined>>();
/** Lazily backfill only projects shown on the current page; coalesce repeated renders. */
export function ensureCaptionProjectCover(scope: string, id: string): Promise<string | undefined> {
  const key = JSON.stringify([scope, id]);
  const existing = pending.get(key);
  if (existing) return existing;
  const work = (async () => {
    const task = await loadCaptionTask(scope, id);
    if (!task || task.coverThumb) return task?.coverThumb;
    const file = await loadLocalVideo(task.sourceSig);
    if (!file) return undefined;
    const coverThumb = await captureCaptionCover(file, task.durationSec);
    if (coverThumb) await patchCaptionProjectMetadata(scope, id, { coverThumb });
    return coverThumb;
  })().finally(() => pending.delete(key));
  pending.set(key, work);
  return work;
}
