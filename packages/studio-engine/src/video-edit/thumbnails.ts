// mediabunny is dynamically imported on demand (convention in extract-audio.ts) — the type import doesn't enter the bundle
import type { Source } from 'mediabunny';
import type { Thumbnail } from './types';

interface ThumbOpts {
  width?: number;
  /** If omitted, derived from width × aspect ratio */
  height?: number;
  quality?: number;
  /** Called on each extracted frame (incremental rendering: thumbnails appear as they decode, no need to wait for the whole video) */
  onThumb?: (thumb: Thumbnail) => void;
}

/** Core: given a mediabunny Source (Blob or Url), extract frames at the given timestamps and render JPEG. */
async function extractFromSource(
  source: Source,
  timestamps: number[],
  opts: ThumbOpts,
): Promise<Thumbnail[]> {
  const targetW = opts.width ?? 240;
  const quality = opts.quality ?? 0.75;

  const { ALL_FORMATS, Input, VideoSampleSink } = await import('mediabunny');
  const input = new Input({ source, formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return [];

    const aspect = track.displayWidth / track.displayHeight;
    const targetH = opts.height ?? Math.round(targetW / aspect);

    // Zero the time base: an mp4 cut with -c copy can have a non-zero first-packet timestamp;
    // mediabunny reports raw track time, while <video> playback / ASR (Conversion also subtracts
    // getFirstTimestamp internally) are all zero-based. Without subtracting, thumbnails shift as a
    // whole (once off by 2s+). A negative first packet (B-frame edit list) is clamped to 0 ("not presented").
    const t0 = Math.max(0, await input.getFirstTimestamp());
    const sink = new VideoSampleSink(track);
    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;

    const out: Thumbnail[] = [];
    for await (const sample of sink.samplesAtTimestamps(timestamps.map((t) => t + t0))) {
      if (!sample) continue;
      // try/finally: convertToBlob awaits between draw and close — a throw there (or in onThumb)
      // must not leak the sample ("VideoSample was garbage collected without being closed").
      try {
        sample.draw(ctx, 0, 0, targetW, targetH);
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
        const thumb: Thumbnail = {
          timestamp: sample.timestamp - t0,
          url: URL.createObjectURL(blob),
          blob,
        };
        out.push(thumb);
        opts.onThumb?.(thumb);
      } finally {
        sample.close();
      }
    }
    return out;
  } finally {
    await input.dispose();
  }
}

/**
 * Extract video frames at the given timestamps, rendered to JPEG Blobs (local File source).
 *
 * Monotonic timestamps take an optimized decode path, faster than looping getSample.
 *
 * Perf: ~50-150ms per frame at 1080p.
 */
export async function extractThumbnails(
  file: File,
  timestamps: number[],
  opts: ThumbOpts = {},
): Promise<Thumbnail[]> {
  const { BlobSource } = await import('mediabunny');
  return extractFromSource(new BlobSource(file), timestamps, opts);
}

/**
 * Same as extractThumbnails, but streams frames directly from a URL: mediabunny
 * UrlSource uses HTTP Range, fetching only moov + the sample bytes near the target
 * frames, no need to download the whole file first. With onThumb incremental
 * rendering, thumbnails start appearing quickly, like a <video> preview.
 *
 * url must support Range (the same-origin proxy /api/media/fetch passes Range through).
 */
export async function extractThumbnailsFromUrl(
  url: string,
  timestamps: number[],
  opts: ThumbOpts = {},
): Promise<Thumbnail[]> {
  // same-origin proxy carries the cookie for auth
  const { UrlSource } = await import('mediabunny');
  return extractFromSource(
    new UrlSource(url, { requestInit: { credentials: 'same-origin' } }),
    timestamps,
    opts,
  );
}
