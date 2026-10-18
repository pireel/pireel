'use client';
import { editorRequest } from '@pireel/studio-ui/host-request';
import { audioPlaybackOffset } from '@pireel/studio-ui/media';
import {type ProbedFile,fileSig,isContentSig,sigSize,durableFileSig,rememberDurableFileSig,fileNameFromSig,fileMatchesSig,probeVideoFile,type FilmstripFrame,type FilmstripSourceRange,filmstripSourceRangeForTimelineWindow,filmstripTimestampsForRanges,extractFilmstripAtTimestamps,extractFilmstripFromUrlAtTimestamps,extractFilmstrip,extractFilmstripFromUrl,audioCoverUrl} from '@pireel/studio-ui/media';
export {type ProbedFile,fileSig,isContentSig,sigSize,durableFileSig,rememberDurableFileSig,fileNameFromSig,fileMatchesSig,probeVideoFile,type FilmstripFrame,type FilmstripSourceRange,filmstripSourceRangeForTimelineWindow,filmstripTimestampsForRanges,extractFilmstripAtTimestamps,extractFilmstripFromUrlAtTimestamps,extractFilmstrip,extractFilmstripFromUrl,audioCoverUrl} from '@pireel/studio-ui/media';


import { groupAsrWords } from '@pireel/studio-engine/caption-fx';


/**
 * Studio media pipeline — the browser reads the local file directly for preview/probing; the bytes are
 * backed up to the cloud rendezvous in the background (asset-upload-queue) so any device can reopen the project.
 *
 * Open → pick a local file (URL.createObjectURL for local preview playback) → MediaBunny probes metadata →
 * **audio only** (tens of MB) is uploaded for ASR → shots.
 * Reuses existing shared pieces: extractAudio (MediaBunny audio-track extraction) / studioProviders().uploads.upload
 * (clean intermediate-artifact path, doesn't pollute the material library).
 */

import { extractAudio } from '@pireel/studio-engine/video-edit/extract-audio';

import { extractThumbnails, extractThumbnailsFromUrl } from '@pireel/studio-engine/video-edit/thumbnails';

import { studioProviders } from '@pireel/studio-engine/providers';

import type { AsrSegment } from '@pireel/studio-engine/build-blocks';

import { detectLang } from '@pireel/studio-engine/caption-fx';

import { getCachedAsr, setCachedAsr } from '@pireel/studio-ui/asr-cache';

import { t } from '@pireel/studio-ui/i18n';


/** The ASR routes deliberately return HTTP 200 for both genuine no-speech and provider
 * failures so a batch import can continue. The browser must still distinguish them: only
 * an explicit provider "no text/speech" result is an empty transcript; every other
 * asr_ok:false response is a failed service call. */
export function classifyAsrResponse(value: { asr_ok?: boolean; detail?: string }): 'ok' | 'empty' | 'failed' {
  if (value.asr_ok !== false) return 'ok';
  return /returned no (?:text|transcript)|no speech|no_valid_fragment/i.test(value.detail ?? '') ? 'empty' : 'failed';
}


type TranscribeOptions = { projectId?: string; sceneRun?: string; signal?: AbortSignal; onUsage?: (usage: import('@pireel/studio-engine/usage').WorkflowUsage) => void; onPhase?: (phase: 'checking' | 'extracting' | 'uploading' | 'recognizing' | 'aligning') => void };


/** Transcriptions under way, by file: a caller that stopped waiting leaves its request running, and
 *  asking again meanwhile joins it instead of paying for the same audio twice. */
const transcribing = new Map<string, Promise<AsrSegment[]>>();


/** Extract audio (upload audio only) → ASR → sentence-level shots. Cached by fileSig (same clip transcribed
 *  once); a second call while the first runs joins it (its usage is reported to the first caller only).
 *  Calls with their own abort signal or scene run stay separate: they can be cancelled or billed apart. */
export function transcribeFile(file: File, opts?: TranscribeOptions): Promise<AsrSegment[]> {
  if (opts?.signal || opts?.sceneRun) return transcribeFileOnce(file, opts);
  const sig = fileSig(file);
  const running = transcribing.get(sig);
  if (running) return running;
  const started = transcribeFileOnce(file, opts).finally(() => transcribing.delete(sig));
  transcribing.set(sig, started);
  return started;
}


async function transcribeFileOnce(file: File, opts?: TranscribeOptions): Promise<AsrSegment[]> {
  const phase = (value: 'checking' | 'extracting' | 'uploading' | 'recognizing' | 'aligning') => { opts?.signal?.throwIfAborted(); opts?.onPhase?.(value); };
  phase('checking');
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
  phase('extracting');
  const audio = await extractAudio(file);
  phase('uploading');
  const { url } = await studioProviders().uploads.upload(audio, { contentType: audio.type || 'audio/mp4', filename: 'studio-audio.m4a' });
  phase('recognizing');
  const r = await editorRequest('/api/auto-edit/asr', {
    signal: opts?.signal,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ audio_url: url, duration_sec: durationSec, ...(opts?.projectId ? { projectId: opts.projectId } : {}), ...(opts?.sceneRun ? { sceneRun: opts.sceneRun } : {}) }),
  });
  // Server failures must throw a clear error, not silently become an empty array — callers need to tell "ASR failed" apart from "the video truly has no speech"
  // 402 = credits exhausted: say so instead of an opaque HTTP code
  if (r.status === 402) throw new Error(t('chatGen.notEnoughCreditsTop'));
  if (!r.ok) throw new Error(t('common.transcriptionRequestFailedHttp', { status: r.status }));
  const j = (await r.json()) as {
    usage?: import('@pireel/studio-engine/usage').WorkflowUsage;
    asr_ok?: boolean;
    detail?: string;
    lang?: string | null;
    segments?: Array<{ start: number; end: number; text: string; lang?: string; speaker?: string; words?: Array<{ start: number; end: number; text: string }> }>;
  };
  if (j.usage) opts?.onUsage?.(j.usage);
  const asrState = classifyAsrResponse(j);
  if (asrState === 'failed') throw new Error(t('workbench.transcriptExtractionFailedTry'));
  if (asrState === 'empty') return [];
  // ASR times are in the "audio track's own zero" frame (audio extraction subtracts the audio track's first
  // packet), while playback is in "earliest sample across all tracks". Files whose two tracks' first packets
  // are out of sync need this delta added back, or captions/cut points shift wholesale.
  phase('aligning');
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
        ...(words.length ? { words: groupAsrWords(s.text, words) } : {}),
      };
    });
  // Empty is a durable verdict too — without caching it, every later pass re-uploads,
  // re-charges and re-asks the provider about the same speech-less source.
  setCachedAsr(sig, segs);
  return segs;
}


/**
 * The browser's part of a server-run transcription: extract the speech, upload it, and report how far
 * the audio track sits from the picture's zero (the server adds it to every time). null = no audio.
 */
export async function prepareSpeechAudio(file: File, opts?: { signal?: AbortSignal; onPhase?: (phase: 'checking' | 'extracting' | 'uploading') => void }): Promise<{ key: string; offset: number } | null> {
  opts?.onPhase?.('checking');
  const probe = await probeVideoFile(file).catch(() => null);
  if (probe && !probe.hasAudio) return null;
  opts?.signal?.throwIfAborted(); opts?.onPhase?.('extracting');
  const audio = await extractAudio(file);
  opts?.signal?.throwIfAborted(); opts?.onPhase?.('uploading');
  const { key } = await studioProviders().uploads.upload(audio, { contentType: audio.type || 'audio/mp4', filename: 'studio-audio.m4a' });
  return { key, offset: await audioPlaybackOffset(file) };
}


/** Upload the full source clip only at export time, returning an https URL the render service can fetch. */
export async function uploadVideoFile(file: File): Promise<string> {
  const { url } = await studioProviders().uploads.upload(file, { contentType: file.type || 'video/mp4', filename: file.name || 'studio-video.mp4' });
  return url;
}