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
import { extractThumbnails } from '@pireel/studio-engine/video-edit/thumbnails';
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

/** File fingerprint: same file (name/size/mtime) → same key, so ASR/uploads can hit the cache. */
export function fileSig(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
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
export async function transcribeFile(file: File): Promise<AsrSegment[]> {
  const sig = fileSig(file);
  const cached = getCachedAsr(sig);
  if (cached) return cached;

  const audio = await extractAudio(file);
  const { url } = await studioProviders().uploads.upload(audio, { contentType: audio.type || 'audio/mp4', filename: 'studio-audio.m4a' });
  const r = await fetch('/api/auto-edit/asr', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ audio_url: url }),
  });
  // Server failures must throw a clear error, not silently become an empty array — callers need to tell "ASR failed" apart from "the video truly has no speech"
  // 402 = credits exhausted (creditsGate): say so instead of an opaque HTTP code
  if (r.status === 402) throw new Error(t('chatGen.notEnoughCreditsTop'));
  if (!r.ok) throw new Error(t('common.transcriptionRequestFailedHttp', { status: r.status }));
  const j = (await r.json()) as {
    lang?: string | null;
    segments?: Array<{ start: number; end: number; text: string; lang?: string; speaker?: string; words?: Array<{ start: number; end: number; text: string }> }>;
  };
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
  if (segs.length) setCachedAsr(sig, segs);
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
  const n = Math.max(2, Math.min(count, 600));
  // Each cell takes its interval's midpoint, avoiding 0 and the trailing black frame
  const stamps = Array.from({ length: n }, (_, i) => Math.min(dur - 0.05, ((i + 0.5) / n) * dur));
  const frames: FilmstripFrame[] = [];
  await extractThumbnails(file, stamps, {
    width: 96,
    quality: 0.6,
    onThumb: (th) => {
      const f = { t: th.timestamp, url: th.url };
      frames.push(f);
      onFrame?.(f);
    },
  });
  return frames.sort((a, b) => a.t - b.t);
}

/** Upload the full source clip only at export time, returning an https URL the render service can fetch. */
export async function uploadVideoFile(file: File): Promise<string> {
  const { url } = await studioProviders().uploads.upload(file, { contentType: file.type || 'video/mp4', filename: file.name || 'studio-video.mp4' });
  return url;
}

/** Upload a material-slot image, returning an https URL (the render service can fetch and localize it). */
export async function uploadImageFile(file: File): Promise<string> {
  const { url } = await studioProviders().uploads.upload(file, { contentType: file.type || 'image/png', filename: file.name || 'studio-image.png' });
  return url;
}
