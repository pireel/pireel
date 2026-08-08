import {
  IDENTITY_MEDIA_FRAMING,
  normalizeAtomicMediaFraming,
  shotFilterCss,
  sourceDrawRect,
  supplementalVisualStateAt,
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

function visualFraming(visual: SupplementalVisualMediaClip, anchorX: number, anchorY: number): ShotPreciseFraming | undefined {
  return visual.fit === 'cover'
    ? { scale: 1, anchorX, anchorY, coordinateSpace: 'source-normalized' }
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
    const state = supplementalVisualStateAt(visual, timelineTime);
    if (state.opacity <= 0.0001) continue;
    const targetX = state.box.x * targetWidth;
    const targetY = state.box.y * targetHeight;
    const boxWidth = state.box.w * targetWidth;
    const boxHeight = state.box.h * targetHeight;
    const framing = normalizeAtomicMediaFraming(visual.mediaFraming, IDENTITY_MEDIA_FRAMING);
    ctx.save();
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.globalAlpha *= state.opacity;
    ctx.filter = shotFilterCss(visual.filter);
    const transformed = framing.transform.scale !== 1
      || framing.transform.offsetX !== 0
      || framing.transform.offsetY !== 0;
    if (transformed) {
      const centreX = targetX + boxWidth / 2;
      const centreY = targetY + boxHeight / 2;
      ctx.translate(
        centreX + framing.transform.offsetX * boxWidth,
        centreY + framing.transform.offsetY * boxHeight,
      );
      ctx.scale(framing.transform.scale, framing.transform.scale);
      ctx.translate(-centreX, -centreY);
    }
    ctx.beginPath();
    const cropX = targetX + framing.crop.left * boxWidth;
    const cropY = targetY + framing.crop.top * boxHeight;
    const cropW = boxWidth * (1 - framing.crop.left - framing.crop.right);
    const cropH = boxHeight * (1 - framing.crop.top - framing.crop.bottom);
    if (framing.rounding > 0) ctx.roundRect(cropX, cropY, cropW, cropH, framing.rounding);
    else ctx.rect(cropX, cropY, cropW, cropH);
    ctx.clip();
    const image = imageBitmaps.get(visual.clipId);
    const video = videoSamples.get(visual.clipId);
    if (image) {
      const rect = sourceDrawRect(image.width, image.height, boxWidth, boxHeight, visualFraming(visual, state.anchorX, state.anchorY));
      ctx.drawImage(image, targetX + rect.x, targetY + rect.y, rect.width, rect.height);
    } else if (video) {
      const rect = sourceDrawRect(video.sourceWidth, video.sourceHeight, boxWidth, boxHeight, visualFraming(visual, state.anchorX, state.anchorY));
      video.sample.draw(ctx, targetX + rect.x, targetY + rect.y, rect.width, rect.height);
    }
    ctx.restore();
  }
}

export function disposeVisualImageBitmaps(images: ReadonlyMap<string, ImageBitmap>): void {
  for (const image of images.values()) image.close();
}
