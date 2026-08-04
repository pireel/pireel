import {
  sourceDrawRect,
  type ShotPreciseFraming,
  type SupplementalVisualMediaClip,
} from '@pireel/studio-engine/composition';
import type { VideoSample } from 'mediabunny';
import { t } from './i18n';

export interface SampledVisualVideo {
  sourceWidth: number;
  sourceHeight: number;
  sample: VideoSample;
}

type VisualCanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export async function loadExportVideoFile(source: string, localFiles: Map<string, File>): Promise<File> {
  const local = localFiles.get(source);
  if (local) return local;
  const direct = source.startsWith('blob:') || source.startsWith('data:') || source.startsWith('/') || source.startsWith(location.origin);
  const response = await fetch(direct ? source : `/api/media/fetch?url=${encodeURIComponent(source)}`);
  if (!response.ok) throw new Error(t('workbench.failedFetchInsertClip'));
  return new File([await response.blob()], 'visual-clip.mp4', { type: 'video/mp4' });
}

export async function loadVisualImageBitmaps(
  visuals: readonly SupplementalVisualMediaClip[],
): Promise<Map<string, ImageBitmap>> {
  const images = new Map<string, ImageBitmap>();
  await Promise.all(visuals.filter((visual) => visual.kind === 'image').map(async (visual) => {
    try {
      const direct = visual.source.startsWith('blob:') || visual.source.startsWith('data:')
        || visual.source.startsWith('/') || visual.source.startsWith(location.origin);
      const response = await fetch(direct ? visual.source : `/api/media/fetch?url=${encodeURIComponent(visual.source)}`);
      if (!response.ok) return;
      images.set(visual.clipId, await createImageBitmap(await response.blob()));
    } catch {
      // Keep rendering the other layers when one offline image cannot be resolved.
    }
  }));
  return images;
}

export function activeVisualMedia(
  visuals: readonly SupplementalVisualMediaClip[],
  timelineTime: number,
): SupplementalVisualMediaClip[] {
  return visuals.filter((visual) => (
    timelineTime >= visual.startSec - 1e-6 && timelineTime < visual.endSec - 1e-6
  ));
}

function visualFraming(visual: SupplementalVisualMediaClip): ShotPreciseFraming | undefined {
  return visual.fit === 'cover'
    ? { scale: 1, anchorX: 0.5, anchorY: 0.5, coordinateSpace: 'source-normalized' }
    : undefined;
}

/** Draw already-sampled V2 visual media in adapter order (bottom-to-top). */
export function drawSupplementalVisualMedia(args: {
  ctx: VisualCanvasContext;
  visuals: readonly SupplementalVisualMediaClip[];
  timelineTime: number;
  imageBitmaps: ReadonlyMap<string, ImageBitmap>;
  videoSamples: ReadonlyMap<string, SampledVisualVideo>;
  targetWidth: number;
  targetHeight: number;
  scaleX: number;
  scaleY: number;
}): void {
  const { ctx, visuals, timelineTime, imageBitmaps, videoSamples, targetWidth, targetHeight, scaleX, scaleY } = args;
  for (const visual of activeVisualMedia(visuals, timelineTime)) {
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    const image = imageBitmaps.get(visual.clipId);
    const video = videoSamples.get(visual.clipId);
    if (image) {
      const rect = sourceDrawRect(image.width, image.height, targetWidth, targetHeight, visualFraming(visual));
      ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    } else if (video) {
      const rect = sourceDrawRect(video.sourceWidth, video.sourceHeight, targetWidth, targetHeight, visualFraming(visual));
      video.sample.draw(ctx, rect.x, rect.y, rect.width, rect.height);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

export function disposeVisualImageBitmaps(images: ReadonlyMap<string, ImageBitmap>): void {
  for (const image of images.values()) image.close();
}
