/**
 * Video posters for asset cards: one small still, extracted once and stored, so a library card is
 * an <img> instead of a live <video> decode (faster lists, same look in every browser).
 */

import { studioProviders } from '@pireel/studio-engine/providers';
import { decodableMediaUrl } from './video-frame-decoder';

/** Candidate times: the first frame, then a little later in case the opening is a fade from black. */
const POSTER_TIMES_SEC = [0, 0.5, 1, 2];
const POSTER_WIDTH = 480;
/** Mean luma (0–255) below which a frame counts as black. */
const DARK_LUMA = 24;

function meanLuma(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number): number {
  const { data } = ctx.getImageData(0, 0, width, height);
  let total = 0;
  let count = 0;
  // Every 16th pixel is plenty for a brightness check.
  for (let at = 0; at < data.length; at += 64) {
    total += 0.299 * data[at]! + 0.587 * data[at + 1]! + 0.114 * data[at + 2]!;
    count += 1;
  }
  return count ? total / count : 0;
}

/**
 * The first frame that is not near-black (else the brightest candidate), as a WebP about 480px
 * wide. `source` is the file itself or any playable URL (blob: URLs are read whole; remote ones
 * stream through the same-origin media proxy with Range). Null when the media has no video track.
 */
export async function extractVideoPoster(source: Blob | string): Promise<Blob | null> {
  const { ALL_FORMATS, BlobSource, Input, UrlSource, VideoSampleSink } = await import('mediabunny');
  const blob = typeof source === 'string' && source.startsWith('blob:')
    ? await (await fetch(source)).blob()
    : source;
  const input = new Input({
    source: typeof blob === 'string'
      ? new UrlSource(decodableMediaUrl(blob), { requestInit: { credentials: 'same-origin' } })
      : new BlobSource(blob),
    formats: ALL_FORMATS,
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const width = Math.min(POSTER_WIDTH, track.displayWidth || POSTER_WIDTH);
    const height = Math.max(1, Math.round(width / ((track.displayWidth || 16) / (track.displayHeight || 9))));
    const t0 = Math.max(0, await input.getFirstTimestamp());
    const duration = await input.computeDuration().catch(() => 0);
    const times = POSTER_TIMES_SEC.filter((time, index) => index === 0 || !duration || time < duration - t0);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    const best = new OffscreenCanvas(width, height);
    const bestCtx = best.getContext('2d') as OffscreenCanvasRenderingContext2D;
    let bestLuma = -1;
    for await (const sample of new VideoSampleSink(track).samplesAtTimestamps(times.map((time) => time + t0))) {
      if (!sample) continue;
      try {
        sample.draw(ctx, 0, 0, width, height);
      } finally {
        sample.close();
      }
      const luma = meanLuma(ctx, width, height);
      if (luma > bestLuma) {
        bestLuma = luma;
        bestCtx.clearRect(0, 0, width, height);
        bestCtx.drawImage(canvas, 0, 0);
      }
      if (luma >= DARK_LUMA) break;
    }
    if (bestLuma < 0) return null;
    return await best.convertToBlob({ type: 'image/webp', quality: 0.8 });
  } finally {
    await input.dispose();
  }
}

/** Extract and store a poster; resolves to its bare storage key, or null when there is none. */
export async function storeVideoPoster(source: Blob | string, name: string): Promise<string | null> {
  const poster = await extractVideoPoster(source);
  if (!poster) return null;
  const { key } = await studioProviders().uploads.upload(poster, { contentType: 'image/webp', filename: `${name.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'video'}-poster.webp` });
  return key;
}
