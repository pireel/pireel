'use client';

/**
 * Studio local media pipeline — video is never uploaded to the cloud, only read in the browser.
 *
 * Open → pick a local file (URL.createObjectURL for local preview playback) → MediaBunny probes metadata →
 * **audio only** (tens of MB) is uploaded for ASR → shots. The full source clip is uploaded only on Export.
 * Reuses existing shared pieces: extractAudio (MediaBunny audio-track extraction) / studioProviders().uploads.upload
 * (clean intermediate-artifact path, doesn't pollute the material library).
 */

import { extractAudio } from '@pireel/studio-engine/video-edit/extract-audio';
import { extractThumbnails, extractThumbnailsFromUrl } from '@pireel/studio-engine/video-edit/thumbnails';
import { studioProviders } from '@pireel/studio-engine/providers';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { detectLang } from '@pireel/studio-engine/caption-fx';
import { getCachedAsr, setCachedAsr } from './asr-cache';
import { t } from './i18n';

export interface ProbedFile {
  durationSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

/** The ASR routes deliberately return HTTP 200 for both genuine no-speech and provider
 * failures so a batch import can continue. The browser must still distinguish them: only
 * an explicit provider "no text/speech" result is an empty transcript; every other
 * asr_ok:false response is a failed service call. */
export function classifyAsrResponse(value: { asr_ok?: boolean; detail?: string }): 'ok' | 'empty' | 'failed' {
  if (value.asr_ok !== false) return 'ok';
  return /returned no (?:text|transcript)|no speech|no_valid_fragment/i.test(value.detail ?? '') ? 'empty' : 'failed';
}

const durableFileSigs = new WeakMap<File, string>();
const CONTENT_SIG_MARKER = '#pireel=';

/** Legacy synchronous identity. Newly imported browser files are upgraded through durableFileSig;
 * callers that receive an aligned/restored File transparently get its remembered durable sig. */
export function fileSig(file: File): string {
  return durableFileSigs.get(file) ?? `${file.name}:${file.size}:${file.lastModified}`;
}

/** Stable lightweight content identity for newly imported files. Hashing three bounded slices keeps
 * multi-GB videos cheap while preventing unrelated same-name/size/mtime files from sharing OPFS,
 * ASR or cloud-vault entries. The final size/mtime fields preserve the legacy locator grammar. */
export async function durableFileSig(file: File): Promise<string> {
  const remembered = durableFileSigs.get(file);
  if (remembered) return remembered;
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
  const sig = `${file.name}${CONTENT_SIG_MARKER}${hash}:${file.size}:${file.lastModified}`;
  durableFileSigs.set(file, sig);
  return sig;
}

export function rememberDurableFileSig(file: File, sig: string): File {
  durableFileSigs.set(file, sig);
  return file;
}

export function fileNameFromSig(sig: string): string {
  const raw = sig.split(':').slice(0, -2).join(':') || sig;
  const marker = raw.lastIndexOf(CONTENT_SIG_MARKER);
  return marker >= 0 && /^[0-9a-f]{32}$/.test(raw.slice(marker + CONTENT_SIG_MARKER.length))
    ? raw.slice(0, marker)
    : raw;
}

export async function fileMatchesSig(file: File, sig: string): Promise<boolean> {
  return sig.includes(CONTENT_SIG_MARKER)
    ? (await durableFileSig(file)) === sig
    : `${file.name}:${file.size}:${file.lastModified}` === sig;
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

/** Extract audio (upload audio only) → ASR → sentence-level shots. Cached by fileSig (same clip transcribed once). */
export async function transcribeFile(file: File, opts?: { projectId?: string }): Promise<AsrSegment[]> {
  const sig = fileSig(file);
  const cached = await getCachedAsr(sig);
  if (cached) return cached;

  const probe = await probeVideoFile(file).catch(() => null);
  // A missing audio track is a valid media property, not an ASR failure. Resolve it locally before
  // extracting/uploading bytes so silent visual assets cost nothing and never surface an error.
  if (probe && !probe.hasAudio) {
    setCachedAsr(sig, []);
    return [];
  }
  const durationSec = probe?.durationSec;
  const audio = await extractAudio(file);
  const { url } = await studioProviders().uploads.upload(audio, { contentType: audio.type || 'audio/mp4', filename: 'studio-audio.m4a' });
  const r = await fetch('/api/auto-edit/asr', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ audio_url: url, duration_sec: durationSec, ...(opts?.projectId ? { projectId: opts.projectId } : {}) }),
  });
  // Server failures must throw a clear error, not silently become an empty array — callers need to tell "ASR failed" apart from "the video truly has no speech"
  // 402 = credits exhausted: say so instead of an opaque HTTP code
  if (r.status === 402) throw new Error(t('chatGen.notEnoughCreditsTop'));
  if (!r.ok) throw new Error(t('common.transcriptionRequestFailedHttp', { status: r.status }));
  const j = (await r.json()) as {
    asr_ok?: boolean;
    detail?: string;
    lang?: string | null;
    segments?: Array<{ start: number; end: number; text: string; lang?: string; speaker?: string; words?: Array<{ start: number; end: number; text: string }> }>;
  };
  const asrState = classifyAsrResponse(j);
  if (asrState === 'failed') throw new Error(t('workbench.transcriptExtractionFailedTry'));
  if (asrState === 'empty') return [];
  // ASR times are in the "audio track's own zero" frame (audio extraction subtracts the audio track's first
  // packet), while playback is in "earliest sample across all tracks". Files whose two tracks' first packets
  // are out of sync need this delta added back, or captions/cut points shift wholesale.
  const off = await audioPlaybackOffset(file);
  // Language: provider-reported when available, script-detection fallback otherwise (feeds translate
  // defaults / segmentation hints; per-segment so mixed-language sources stay honest).
  const fallbackLang = j.lang ?? detectLang((Array.isArray(j.segments) ? j.segments : []).map((s) => s.text ?? '').join(' '));
  const segs: AsrSegment[] = (Array.isArray(j.segments) ? j.segments : [])
    .filter((s) => s.text?.trim())
    .map((s) => {
      const words = (Array.isArray(s.words) ? s.words : [])
        .filter((w) => w.text?.trim() && typeof w.start === 'number' && typeof w.end === 'number')
        .map((w) => ({ text: w.text.trim(), start: Math.max(0, w.start + off), end: Math.max(0, w.end + off) }));
      const lang = s.lang ?? fallbackLang;
      return {
        start: Math.max(0, s.start + off),
        end: Math.max(s.start + off + 0.1, s.end + off),
        text: s.text.trim(),
        ...(lang ? { lang } : {}),
        ...(s.speaker ? { speaker: s.speaker } : {}),
        ...(words.length ? { words } : {}),
      };
    });
  // Empty is a durable verdict too — without caching it, every later pass re-uploads,
  // re-charges and re-asks the provider about the same speech-less source.
  setCachedAsr(sig, segs);
  return segs;
}

/** Audio track's first-packet offset relative to the playback zero (earliest sample across all tracks), in seconds. ≈0 for normal in-sync files. */
async function audioPlaybackOffset(file: File): Promise<number> {
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

/** Upload the full source clip only at export time, returning an https URL the render service can fetch. */
export async function uploadVideoFile(file: File): Promise<string> {
  const { url } = await studioProviders().uploads.upload(file, { contentType: file.type || 'video/mp4', filename: file.name || 'studio-video.mp4' });
  return url;
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
