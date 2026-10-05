import type { OcrBox, VideoObservation } from './brand-analysis';

/** A frame of the creator's footage to show their brand on, and whether it is free of overlaid text. */
export interface PreviewPick { video: string; t: number; clean: boolean; textArea: number }

/** Text boxes smaller than this (share of the frame) are specks — a corner bug, a timestamp — not text a preview would show. */
const SPECK = 0.0015;
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0; };

/**
 * The frame that best shows the creator as they usually appear, with nothing written over it: among the
 * text-read samples, one with a face at the creator's usual size near the middle, away from the first
 * second (covers, hook labels) and the last two (end cards). A clean frame wins; without one, the frame
 * with the least text is returned with `clean: false`, to be cleaned before use.
 */
export function pickPreviewFrame(videos: readonly VideoObservation[]): PreviewPick | null {
  const usual = median(videos.flatMap(video => video.faces.map(face => face.h)));
  if (!(usual > 0)) return null;
  let best: (PreviewPick & { score: number }) | null = null;
  for (const video of videos) {
    for (const sample of video.ocr) {
      if (sample.t < 1 || sample.t > video.durationSec - 2) continue;
      const face = video.faces.reduce<VideoObservation['faces'][number] | null>((near, item) => Math.abs(item.t - sample.t) <= 0.6 && (!near || Math.abs(item.t - sample.t) < Math.abs(near.t - sample.t)) ? item : near, null);
      if (!face) continue;
      const ratio = face.h / usual; const cx = face.x + face.w / 2;
      if (ratio < 0.75 || ratio > 1.33 || cx < 0.25 || cx > 0.75) continue;
      const textArea = sample.boxes.reduce((sum, box) => sum + (box.w * box.h >= SPECK ? box.w * box.h : 0), 0);
      const clean = textArea === 0;
      // Clean frames first; then the least text; among equals, the most typical framing.
      const score = (clean ? 0 : 10 + textArea * 100) + Math.abs(Math.log(ratio)) + Math.abs(cx - 0.5);
      if (!best || score < best.score) best = { video: video.id, t: sample.t, clean, textArea: Math.round(textArea * 10000) / 10000, score };
    }
  }
  if (!best) return null;
  const { score: _score, ...pick } = best;
  return pick;
}

/** Where the creator's captions sit, as measured: their bottom edge and line height, % of the frame height. */
export interface CaptionBand { bottomPct: number; lineHeightPct: number }

/** Whether text is still read in the caption band of a frame meant to be clean (the text a sample caption
 *  drawn over the preview would clash with). Specks are ignored. */
export function captionLeft(boxes: readonly OcrBox[], band: CaptionBand): boolean {
  const bottom = band.bottomPct / 100; const line = band.lineHeightPct / 100;
  return boxes.some(box => box.w * box.h >= SPECK && box.y + box.h > bottom - 2.5 * line && box.y < bottom + line);
}
