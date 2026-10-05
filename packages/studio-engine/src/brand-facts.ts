import { captionBand, type BrandObservationSummary, type VideoMeasures, type VideoObservation } from './brand-analysis';
import type { BrandEditSpec } from './brand-edit-spec';
import { WINDOWS } from './brand-method';
import type { Moment } from './brand-reading';
import { primaryDevice } from './brand-visual';
import { joinWords } from './caption-fx';

/**
 * What the extraction hands the models besides images: spoken lines, the windows a video is looked at
 * through, and the measured facts each judgement reads. Shared by the browser and the server run, so
 * both send the models the same inputs.
 */

export interface SpokenLine { index: number; startSec: number; endSec: number; text: string }

/** Spoken lines from the word timing: a new line after a pause or every ~18 words. */
export function spokenLines(words: NonNullable<VideoObservation['words']>): SpokenLine[] {
  const lines: SpokenLine[] = [];
  let current: typeof words = [];
  const flush = () => { if (current.length) lines.push({ index: lines.length, startSec: current[0]!.start, endSec: current.at(-1)!.end, text: joinWords(current.map(word => word.text)) }); current = []; };
  for (const word of words) {
    const last = current.at(-1);
    if (last && (word.start - last.end > 0.5 || current.length >= 18)) flush();
    current.push(word);
  }
  flush();
  return lines;
}

/** `count` times spread evenly over [from, to], to a tenth of a second. */
export const spread = (from: number, to: number, count: number) => Array.from({ length: count }, (_, k) => Math.round((from + (to - from) * (count === 1 ? 0.5 : k / (count - 1))) * 10) / 10);

/** The frames a video is read through: an overview grid over the whole video, and strips over the
 *  opening, the ending and each moment. */
export function readingWindows(durationSec: number, moments: readonly Moment[]) {
  return {
    overview: spread(0.5, durationSec - 0.5, 16),
    strips: [
      { role: 'opening strip', times: spread(0.2, Math.min(WINDOWS.openingSec, durationSec - 0.2), WINDOWS.framesPerWindow) },
      { role: 'ending strip', times: spread(Math.max(0, durationSec - WINDOWS.closingSec), durationSec - 0.2, WINDOWS.framesPerWindow) },
      ...moments.map((moment, at) => ({ role: `moment ${at + 1} strip`, times: spread(moment.startSec, moment.endSec, WINDOWS.framesPerWindow) })),
    ],
  };
}

/** The caption read near a time, for the overview grid's labels. */
export function captionNear(video: VideoObservation): (t: number) => string {
  const band = captionBand(video);
  return t => band?.items.find(entry => Math.abs(entry.t - t) <= 1)?.box.text ?? '';
}

/** Measured facts the per-video reading receives. */
export function readingFacts(video: VideoObservation, own: VideoMeasures, moments: readonly Moment[], lines: readonly SpokenLine[]) {
  const band = captionBand(video);
  return {
    durationSec: Math.round(video.durationSec * 10) / 10, cuts: video.cuts.length,
    ...(own.layout ? { layoutGuess: own.layout, hostOnScreen: own.hostShare } : {}),
    ...(own.cuts ? { cutDevice: primaryDevice(own.cutsPerMin, own.cuts, own.speakers) } : {}),
    speakers: own.speakers, ...(own.header ? { heldHeader: own.header.texts[0] } : {}),
    captionBand: band && { bottomPct: Math.round(band.bottom * 1000) / 10, coverage: Math.round(band.coverage * 100) / 100 },
    moments: moments.map((moment, at) => ({ strip: `moment ${at + 1}`, fromSec: Math.round(moment.startSec * 10) / 10, toSec: Math.round(moment.endSec * 10) / 10, spoken: lines.filter(line => line.endSec > moment.startSec && line.startSec < moment.endSec).map(line => line.text).join(' ').slice(0, 300) })),
  };
}

/** Measured facts the synthesis receives. */
export function synthesisFacts(videos: readonly VideoObservation[], spec: BrandEditSpec, summary: BrandObservationSummary) {
  return {
    videos: videos.map(video => ({ id: video.id, durationSec: Math.round(video.durationSec * 10) / 10 })),
    measured: { cutsPerMin: spec.cutting.targetCpm.value, pauses: spec.cutting.silence.value.mode, captions: spec.captions.presence.value, cuttingDevice: spec.cutting.primaryDevice?.value, layout: spec.layout?.value, heldHeader: spec.textOverlays.header.value.enabled, headerExamples: spec.textOverlays.header.value.examples.slice(0, 4), loudnessLufs: spec.audio.targetLufs.value },
    recurringIntro: !!summary.intro, recurringOutro: !!summary.outro, logo: summary.logo?.corner ?? null,
  };
}
