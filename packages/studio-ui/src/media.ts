'use client';
/** Local probing, fingerprints and thumbnails. No generation or network service. */
import {extractThumbnails, extractThumbnailsFromUrl} from '@pireel/studio-engine/video-edit/thumbnails';


export interface ProbedFile {
  durationSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
}


const durableFileSigs = new WeakMap<File, string>();

const CONTENT_SIG_MARKER = '#pireel=';

/** Name-free content identity: `pireel2:<hash>:<size>`. Same bytes → same asset on every device,
 * regardless of filename, mtime or the MIME a particular picker reports. */
const CONTENT_SIG_PREFIX = 'pireel2:';


/** Legacy synchronous identity. Newly imported browser files are upgraded through durableFileSig;
 * callers that receive an aligned/restored File transparently get its remembered durable sig. */
export function fileSig(file: File): string {
  return durableFileSigs.get(file) ?? `${file.name}:${file.size}:${file.lastModified}`;
}


export const isContentSig = (sig: string): boolean => sig.startsWith(CONTENT_SIG_PREFIX);


/** Byte size encoded in any locator format (content sig: last field; legacy: second to last). */
export function sigSize(sig: string): number | null {
  const parts = sig.split(':');
  const raw = Number(isContentSig(sig) ? parts[parts.length - 1] : parts[parts.length - 2]);
  return Number.isSafeInteger(raw) && raw >= 0 ? raw : null;
}


async function sampledContentHash(file: File): Promise<string> {
  const chunkSize = 64 * 1024;
  const offsets = file.size <= chunkSize * 5
    ? [0]
    : [0, 0.25, 0.5, 0.75, 1].map((fraction) =>
        Math.max(0, Math.min(file.size - chunkSize, Math.floor(file.size * fraction) - (fraction === 1 ? chunkSize : Math.floor(chunkSize / 2)))),
      );
  const slices = file.size <= chunkSize * 5
    ? [await file.arrayBuffer()]
    : await Promise.all(offsets.map((offset) => file.slice(offset, Math.min(file.size, offset + chunkSize)).arrayBuffer()));
  const metadata = new TextEncoder().encode(`${file.size}\n`);
  const total = metadata.byteLength + slices.reduce((sum, value) => sum + value.byteLength, 0);
  const input = new Uint8Array(total);
  let cursor = 0;
  input.set(metadata, cursor);
  cursor += metadata.byteLength;
  for (const slice of slices) {
    input.set(new Uint8Array(slice), cursor);
    cursor += slice.byteLength;
  }
  const digest = await crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(digest)].slice(0, 16).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}


/** Stable lightweight content identity for imported files. Hashing five bounded slices keeps
 * multi-GB videos cheap while preventing unrelated same-size files from sharing OPFS, ASR or cloud
 * entries. Filename, mtime and MIME are deliberately NOT part of the identity: the same file imported
 * from another device or after a rename must dedupe to one asset and one upload. */
export async function durableFileSig(file: File): Promise<string> {
  const remembered = durableFileSigs.get(file);
  if (remembered) return remembered;
  const sig = `${CONTENT_SIG_PREFIX}${await sampledContentHash(file)}:${file.size}`;
  durableFileSigs.set(file, sig);
  return sig;
}


/** Legacy fingerprint (`name#pireel=<hash>:size:mtime`) recomputed only to validate an old locator. */
async function legacyDurableFileSig(file: File): Promise<string> {
  const chunkSize = 64 * 1024;
  const slices = file.size <= chunkSize * 3
    ? [await file.arrayBuffer()]
    : await Promise.all(
        [0, Math.max(0, Math.floor(file.size / 2) - Math.floor(chunkSize / 2)), Math.max(0, file.size - chunkSize)]
          .map((offset) => file.slice(offset, Math.min(file.size, offset + chunkSize)).arrayBuffer()),
      );
  const metadata = new TextEncoder().encode(`${file.size}\n${file.type}`);
  const total = metadata.byteLength + slices.reduce((sum, value) => sum + value.byteLength, 0);
  const input = new Uint8Array(total);
  let cursor = 0;
  input.set(metadata, cursor);
  cursor += metadata.byteLength;
  for (const slice of slices) {
    input.set(new Uint8Array(slice), cursor);
    cursor += slice.byteLength;
  }
  const digest = await crypto.subtle.digest('SHA-256', input);
  const hash = [...new Uint8Array(digest)].slice(0, 16).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${file.name}${CONTENT_SIG_MARKER}${hash}:${file.size}:${file.lastModified}`;
}


export function rememberDurableFileSig(file: File, sig: string): File {
  durableFileSigs.set(file, sig);
  return file;
}


/** Display filename recoverable from LEGACY locators only. Content sigs carry no name: callers fall
 * back to the asset's label. */
export function fileNameFromSig(sig: string): string {
  if (isContentSig(sig)) return '';
  const raw = sig.split(':').slice(0, -2).join(':') || sig;
  const marker = raw.lastIndexOf(CONTENT_SIG_MARKER);
  return marker >= 0 && /^[0-9a-f]{32}$/.test(raw.slice(marker + CONTENT_SIG_MARKER.length))
    ? raw.slice(0, marker)
    : raw;
}


export async function fileMatchesSig(file: File, sig: string): Promise<boolean> {
  if (isContentSig(sig)) {
    if (sigSize(sig) !== file.size) return false;
    return (await durableFileSig(file)) === sig;
  }
  if (sig.includes(CONTENT_SIG_MARKER)) {
    const remembered = durableFileSigs.get(file);
    if (remembered) return remembered === sig;
    const legacy = await legacyDurableFileSig(file);
    if (legacy === sig) durableFileSigs.set(file, sig);
    return legacy === sig;
  }
  return `${file.name}:${file.size}:${file.lastModified}` === sig;
}


/** Probe video metadata locally (MediaBunny dynamically loaded, no upload). */
export async function probeVideoFile(file: File): Promise<ProbedFile> {
  const { ALL_FORMATS, BlobSource, Input } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const v = await input.getPrimaryVideoTrack();
    const a = await input.getPrimaryAudioTrack().catch(() => null);
    // computeDuration measures the "max end timestamp": an mp4 with a non-zero first packet inflates the
    // duration by that offset. Subtract getFirstTimestamp to convert to <video> playback frame (currentTime 0 = earliest sample).
    const duration = (await input.computeDuration()) - Math.max(0, await input.getFirstTimestamp());
    return {
      durationSec: Number.isFinite(duration) && duration > 0 ? duration : 0,
      width: v?.displayWidth ?? 0,
      height: v?.displayHeight ?? 0,
      hasAudio: !!a,
    };
  } finally {
    await input.dispose();
  }
}


/** Audio track's first-packet offset relative to the playback zero (earliest sample across all tracks), in seconds. ≈0 for normal in-sync files. */
export async function audioPlaybackOffset(file: File): Promise<number> {
  const { ALL_FORMATS, BlobSource, Input } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const a = await input.getPrimaryAudioTrack();
    if (!a) return 0;
    const off = Math.max(0, await a.getFirstTimestamp()) - Math.max(0, await input.getFirstTimestamp());
    return Math.abs(off) > 0.02 ? off : 0;
  } catch {
    return 0;
  } finally {
    await input.dispose();
  }
}


/** One filmstrip frame: global timestamp + blob URL (backing the timeline video track). */
export interface FilmstripFrame {
  t: number;
  url: string;
}


const filmstripTimestamps = (durationSec: number, count: number): number[] => {
  const n = Math.max(2, Math.min(count, 600));
  // Each cell takes its interval's midpoint, avoiding 0 and the trailing black frame.
  return Array.from({ length: n }, (_, i) => Math.min(durationSec - 0.05, ((i + 0.5) / n) * durationSec));
};


export interface FilmstripSourceRange {
  startSec: number;
  endSec: number;
}


export function filmstripSourceRangeForTimelineWindow(
  timelineStartSec: number,
  timelineEndSec: number,
  sourceInSec: number,
  sourceOutSec: number,
  visibleStartSec: number,
  visibleEndSec: number,
): FilmstripSourceRange | null {
  if (timelineEndSec <= visibleStartSec || timelineStartSec >= visibleEndSec) return null;
  const timelineDurationSec = timelineEndSec - timelineStartSec;
  const sourceDurationSec = sourceOutSec - sourceInSec;
  if (timelineDurationSec <= 0 || sourceDurationSec <= 0) return null;
  const overlapStartSec = Math.max(timelineStartSec, visibleStartSec);
  const overlapEndSec = Math.min(timelineEndSec, visibleEndSec);
  const sourceRate = sourceDurationSec / timelineDurationSec;
  return {
    startSec: sourceInSec + (overlapStartSec - timelineStartSec) * sourceRate,
    endSec: sourceInSec + (overlapEndSec - timelineStartSec) * sourceRate,
  };
}


/** Stable, source-clock thumbnail demand for the ranges that survive the edit. The grid is anchored
 * to source time so trimming a clip inside one bucket does not schedule a whole new filmstrip. */
export function filmstripTimestampsForRanges(
  ranges: readonly FilmstripSourceRange[],
  maxCount = 60,
): number[] {
  const normalized = ranges
    .filter((range) => Number.isFinite(range.startSec) && Number.isFinite(range.endSec) && range.endSec > range.startSec)
    .map((range) => ({ startSec: Math.max(0, range.startSec), endSec: Math.max(0, range.endSec) }))
    .filter((range) => range.endSec > range.startSec)
    .sort((left, right) => left.startSec - right.startSec || left.endSec - right.endSec);
  const merged: FilmstripSourceRange[] = [];
  for (const range of normalized) {
    const previous = merged.at(-1);
    if (previous && range.startSec <= previous.endSec + 0.001) {
      previous.endSec = Math.max(previous.endSec, range.endSec);
    } else {
      merged.push({ ...range });
    }
  }
  if (!merged.length || maxCount <= 0) return [];
  const usedDurationSec = merged.reduce((sum, range) => sum + range.endSec - range.startSec, 0);
  const stepSec = Math.max(1, Math.ceil(usedDurationSec / Math.max(1, maxCount)));
  const timestamps: number[] = [];
  for (const range of merged) {
    const firstBucket = Math.floor(range.startSec / stepSec);
    const lastBucket = Math.ceil(range.endSec / stepSec) - 1;
    for (let bucket = firstBucket; bucket <= lastBucket; bucket++) {
      const midpoint = (bucket + 0.5) * stepSec;
      timestamps.push(Math.max(range.startSec, Math.min(range.endSec - 0.001, midpoint)));
    }
  }
  const unique = [...new Set(timestamps.map((timestamp) => Math.round(timestamp * 1_000) / 1_000))];
  if (unique.length <= maxCount) return unique;
  return Array.from({ length: maxCount }, (_, index) => unique[Math.floor(index * unique.length / maxCount)]!);
}


export async function extractFilmstripAtTimestamps(
  file: File,
  timestamps: readonly number[],
  onFrame?: (frame: FilmstripFrame) => void,
): Promise<FilmstripFrame[]> {
  const frames: FilmstripFrame[] = [];
  await extractThumbnails(file, [...timestamps], {
    width: 96,
    quality: 0.6,
    onThumb: (thumbnail) => {
      const frame = { t: thumbnail.timestamp, url: thumbnail.url };
      frames.push(frame);
      onFrame?.(frame);
    },
  });
  return frames.sort((left, right) => left.t - right.t);
}


export async function extractFilmstripFromUrlAtTimestamps(
  url: string,
  timestamps: readonly number[],
  onFrame?: (frame: FilmstripFrame) => void,
): Promise<FilmstripFrame[]> {
  const frames: FilmstripFrame[] = [];
  await extractThumbnailsFromUrl(url, [...timestamps], {
    width: 96,
    quality: 0.6,
    onThumb: (thumbnail) => {
      const frame = { t: thumbnail.timestamp, url: thumbnail.url };
      frames.push(frame);
      onFrame?.(frame);
    },
  });
  return frames.sort((left, right) => left.t - right.t);
}


/**
 * Sample evenly-spaced filmstrip frames to back the timeline video track (local decode, no upload).
 * count controls density; onFrame is an incremental callback so the filmstrip appears as it decodes.
 */
export async function extractFilmstrip(
  file: File,
  durationSec: number,
  count = 14,
  onFrame?: (f: FilmstripFrame) => void,
): Promise<FilmstripFrame[]> {
  const dur = durationSec > 0 ? durationSec : 0;
  if (dur <= 0) return [];
  return extractFilmstripAtTimestamps(file, filmstripTimestamps(dur, count), onFrame);
}


/** Remote counterpart: MediaBunny's UrlSource requests only the container index and sample
 * ranges needed for the visible strip instead of materializing the entire video as a Blob. */
export async function extractFilmstripFromUrl(
  url: string,
  durationSec: number,
  count = 14,
  onFrame?: (f: FilmstripFrame) => void,
): Promise<FilmstripFrame[]> {
  const dur = durationSec > 0 ? durationSec : 0;
  if (dur <= 0) return [];
  return extractFilmstripFromUrlAtTimestamps(url, filmstripTimestamps(dur, count), onFrame);
}


/** Extract embedded cover art from an audio file (ID3 APIC / MP4 covr / FLAC PICTURE — MediaBunny
 *  reads them all) as an object URL, or null. Best-effort: any failure = no cover, never an error. */
export async function audioCoverUrl(file: File): Promise<string | null> {
  try {
    const { ALL_FORMATS, BlobSource, Input } = await import('mediabunny');
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
      const tags = (await input.getMetadataTags()) as { images?: { data: Uint8Array; mimeType?: string }[] };
      const img = tags.images?.[0];
      if (!img?.data?.length) return null;
      return URL.createObjectURL(new Blob([img.data as BlobPart], { type: img.mimeType || 'image/jpeg' }));
    } finally {
      (input as { dispose?: () => void }).dispose?.();
    }
  } catch {
    return null;
  }
}