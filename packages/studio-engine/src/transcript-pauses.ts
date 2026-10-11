import type { EditorDocumentV2 } from './editor-document/types';
import { selectedSpeechClips } from './editor-document/commands/managed-captions';
import { transcriptSectionRuns, transcriptSourceEnd } from './transcript-sections';

export interface TranscriptPauseSpan {
  trackId: string;
  clipId: string;
  assetId: string;
  sourceStart: number;
  sourceEnd: number;
  startSec: number;
  endSec: number;
}

export interface TranscriptPause {
  id: string;
  paragraphId: string;
  startSec: number;
  endSec: number;
  spans: TranscriptPauseSpan[];
}

export const MIN_TRANSCRIPT_PAUSE_SEC = 0.15;
/** Speech cleanup rule: pauses longer than this shrink to CLEANUP_PAUSE_KEEP_SEC. */
export const CLEANUP_PAUSE_OVER_SEC = 0.4;
export const CLEANUP_PAUSE_KEEP_SEC = 0.3;

/** The complement of measured speech, never of estimated display-word timing. Sentence-only
 * transcripts protect their whole sentence interval; overlapping word spans are unioned first. */
function speechIntervals(document: EditorDocumentV2, assetId: string): Array<{ start: number; end: number }> {
  const ranges = (document.semantics.transcripts[assetId] ?? []).flatMap((segment) => segment.words?.length ? segment.words : [segment])
    .filter((word) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.end >= word.start)
    .map((word) => ({ start: word.start, end: word.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: typeof ranges = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

/** Only pauses still present in source-backed timeline clips are shown. Removed source ranges
 * never reappear as silence. Boundaries snap inward to whole frames to protect spoken samples. */
export function transcriptPauses(document: EditorDocumentV2): TranscriptPause[] {
  const fps = document.canvas.fps;
  const clips = selectedSpeechClips(document);
  const trackByClip = new Map(document.timeline.tracks.flatMap((track) => track.clips.map((clip) => [clip.id, track.id] as const)));
  const paragraphByClip = new Map(transcriptSectionRuns(clips, fps).flatMap((run) => run.clipIds.map((id) => [id, run.id] as const)));
  const speechByAsset = new Map<string, ReturnType<typeof speechIntervals>>();
  const pieces: TranscriptPause[] = [];
  for (const clip of clips) {
    if (!speechByAsset.has(clip.assetId)) speechByAsset.set(clip.assetId, speechIntervals(document, clip.assetId));
    const speech = speechByAsset.get(clip.assetId)!;
    if (!speech.length || clip.durationFrames <= 0) continue;
    const from = clip.sourceInSec;
    const to = transcriptSourceEnd(clip, fps);
    if (to <= from) continue;
    const sourcePerFrame = (to - from) / clip.durationFrames;
    const add = (start: number, end: number) => {
      const startFrame = clip.startFrame + Math.ceil((start - from) / sourcePerFrame - 1e-7);
      const endFrame = clip.startFrame + Math.floor((end - from) / sourcePerFrame + 1e-7);
      if (endFrame <= startFrame) return;
      const span: TranscriptPauseSpan = {
        trackId: trackByClip.get(clip.id)!, clipId: clip.id, assetId: clip.assetId,
        sourceStart: from + (startFrame - clip.startFrame) * sourcePerFrame,
        sourceEnd: from + (endFrame - clip.startFrame) * sourcePerFrame,
        startSec: startFrame / fps, endSec: endFrame / fps,
      };
      pieces.push({ id: `pause:${clip.id}:${span.sourceStart.toFixed(6)}:${span.sourceEnd.toFixed(6)}`, paragraphId: paragraphByClip.get(clip.id)!, startSec: span.startSec, endSec: span.endSec, spans: [span] });
    };
    let cursor = from;
    // Locate the first possibly overlapping interval without scanning a long source for every cut.
    let lo = 0; let hi = speech.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (speech[mid]!.end < from) lo = mid + 1; else hi = mid; }
    for (let index = lo; index < speech.length; index++) {
      const range = speech[index]!;
      if (range.start >= to) break;
      if (range.start > cursor) add(cursor, Math.min(to, range.start));
      cursor = Math.max(cursor, Math.min(to, range.end));
      if (cursor >= to) break;
    }
    if (cursor < to) add(cursor, to);
  }
  const pauses: TranscriptPause[] = [];
  for (const piece of pieces.sort((a, b) => a.startSec - b.startSec)) {
    const previous = pauses.at(-1);
    if (previous && previous.paragraphId === piece.paragraphId && Math.abs(previous.endSec - piece.startSec) < 1e-7) {
      previous.endSec = piece.endSec;
      previous.spans.push(...piece.spans);
    } else pauses.push(piece);
  }
  return pauses.filter((pause) => pause.endSec - pause.startSec >= MIN_TRANSCRIPT_PAUSE_SEC - 1e-7);
}

/** Shared manual/batch removal mapping. Manual removes the labelled pause; batch can retain
 * breathing room. One pause can cross several cleanup fragments and is still one undoable edit. */
export function transcriptPauseCuts(pause: TranscriptPause, keepSec = 0): Array<{ trackId: string; clipId: string; assetId: string; range: [number, number] }> {
  const from = pause.startSec + keepSec / 2;
  const to = pause.endSec - keepSec / 2;
  if (to <= from) return [];
  return pause.spans.flatMap((span) => {
    const start = Math.max(from, span.startSec);
    const end = Math.min(to, span.endSec);
    if (end <= start) return [];
    const ratio = (span.sourceEnd - span.sourceStart) / (span.endSec - span.startSec);
    return [{ trackId: span.trackId, clipId: span.clipId, assetId: span.assetId,
      range: [span.sourceStart + (start - span.startSec) * ratio, span.sourceStart + (end - span.startSec) * ratio] as [number, number] }];
  });
}
