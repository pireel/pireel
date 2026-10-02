import { describe, expect, it } from 'vitest';
import { logoCandidate, measureVideo, type VideoMeasures, type VideoObservation } from './brand-analysis';
import { brandSeries, deriveBrandEditSpec, seriesOutliers, silenceMode, validateBrandEditSpec } from './brand-edit-spec';
import { validateBrandKit, emptyBrandKit } from './brand-kit';

const sentence = 'so the first thing you do is write down every expense then you cut what hurts'.split(' ');

/** A 60 s talking-head video: one word every 0.4 s (0.3 s long), a cut between words every 4 s leaving `gap` silence,
 *  a synced caption every second, a face in every sampled frame. */
function talking(id: string, patch: Partial<VideoObservation> = {}, gap = 0.1): VideoObservation {
  const words: NonNullable<VideoObservation['words']> = [];
  let t = 0;
  for (let index = 0; t < 59; index++) {
    words.push({ text: sentence[index % sentence.length]!, start: t, end: t + 0.3 });
    t += (index % 10 === 9) ? 0.3 + gap : 0.4;
  }
  const cuts = words.filter((_, index) => index % 10 === 9).map(word => word.end + gap / 2);
  const ocr = Array.from({ length: 60 }, (_, s) => {
    const spoken = words.filter(word => word.start >= s - 0.2 && word.start < s + 1).map(word => word.text).join(' ');
    return { t: s, boxes: spoken ? [{ text: spoken, x: 0.25, y: 0.66, w: 0.5, h: 0.04 }] : [] };
  });
  return {
    id, durationSec: 60, width: 1080, height: 1920, ocr, cuts, words, loudnessLufs: -15,
    faces: Array.from({ length: 60 }, (_, s) => ({ t: s, x: 0.35, y: 0.25, w: 0.3, h: 0.2 })),
    headHashes: [], tailHashes: [], overlays: [], ...patch,
  };
}

const measures = (id: string, patch: Partial<VideoMeasures> = {}): VideoMeasures => ({
  id, durationSec: 60, vertical: true, cutsPerMin: 15, p90ShotSec: 6, captionSync: 0.8, captionCoverage: 0.8,
  captionUpper: 0.05, captionLineHeight: 0.04, captionBottom: 0.7, captionWidth: 0.5, captionXCenter: 0.5, wordsPerLine: 3,
  faceH: 0.2, faceCx: 0.5, faceCy: 0.35, faceShare: 1, wpm: 180, cutGapMs: 120, pausesPerMin: 1, speakers: 1, lufs: -15, ...patch,
});

describe('per-video measures', () => {
  it('reads body pace, cut-point silence, speech-synced captions and framing', () => {
    const m = measureVideo(talking('v1'));
    expect(m.cutsPerMin).toBeGreaterThan(12);
    expect(m.cutsPerMin).toBeLessThan(17);
    expect(m.cutGapMs).toBe(100);
    expect(m.captionSync).toBeGreaterThan(0.8);
    expect(m.faceH).toBe(0.2);
    expect(m.faceCy).toBe(0.35);
    expect(m.wpm).toBeGreaterThan(140);
    expect(m.lufs).toBe(-15);
    expect(m.vertical).toBe(true);
  });

  it('does not count on-screen text that is never spoken as captions', () => {
    const video = talking('v1');
    video.ocr = video.ocr.map(sample => ({ t: sample.t, boxes: [{ text: 'OPEN DAILY 9-5', x: 0.1, y: 0.1, w: 0.4, h: 0.05 }] }));
    expect(measureVideo(video).captionSync).toBe(0);
  });

  it('measures pace over the whole video', () => {
    const video = talking('v1', { durationSec: 300, cuts: [...Array.from({ length: 30 }, (_, i) => i + 0.5), 60, 120, 180, 240] });
    expect(measureVideo(video).cutsPerMin).toBeCloseTo(34 / 300 * 60, 1);
  });

  it('maps trimmed silence to a mode', () => {
    expect(silenceMode(120)).toBe('aggressive');
    expect(silenceMode(420)).toBe('moderate');
    expect(silenceMode(900)).toBe('natural');
  });
});

describe('logo candidate', () => {
  it('drops a persistent platform watermark identified through OCR', () => {
    const mark = { x: 0.78, y: 0.03, w: 0.18, h: 0.05 };
    const videos = ['v1', 'v2', 'v3'].map(id => {
      const video = talking(id, { overlays: [mark] });
      video.ocr[0]!.boxes.push({ text: '抖音号: 12345', x: 0.8, y: 0.035, w: 0.15, h: 0.04 });
      return video;
    });
    expect(logoCandidate(videos, 70)).toBeNull();
    const clean = ['v1', 'v2', 'v3'].map(id => talking(id, { overlays: [mark] }));
    expect(logoCandidate(clean, 70)?.corner).toBe('top-right');
  });
});

describe('series and outliers', () => {
  it('keeps one series when the creator cuts one way', () => {
    const videos = Array.from({ length: 8 }, (_, i) => measures(`v${i}`, { cutsPerMin: 14 + (i % 3) }));
    expect(brandSeries(videos)).toHaveLength(1);
  });

  it('splits a creator with a one-take format and a fast-cut format', () => {
    const videos = [
      ...Array.from({ length: 6 }, (_, i) => measures(`talk${i}`, { cutsPerMin: 1 + i * 0.3 })),
      ...Array.from({ length: 4 }, (_, i) => measures(`vlog${i}`, { cutsPerMin: 28 + i })),
    ];
    const series = brandSeries(videos);
    expect(series).toHaveLength(2);
    expect(series[0]).toMatchObject({ primary: true });
    expect(series[0]!.videos.every(id => id.startsWith('talk'))).toBe(true);
  });

  it('never splits fewer than six videos', () => {
    expect(brandSeries([measures('a', { cutsPerMin: 1 }), measures('b', { cutsPerMin: 1 }), measures('c', { cutsPerMin: 40 }), measures('d', { cutsPerMin: 40 })])).toHaveLength(1);
  });

  it('drops a single far-off video but at most a quarter', () => {
    const videos = [...Array.from({ length: 7 }, (_, i) => measures(`v${i}`, { cutsPerMin: 12 + i % 2 })), measures('collab', { cutsPerMin: 60 })];
    expect(seriesOutliers(videos)).toEqual(['collab']);
  });
});

describe('derived edit spec', () => {
  it('turns consistent videos into measured fields', () => {
    const spec = deriveBrandEditSpec(Array.from({ length: 5 }, (_, i) => measures(`v${i}`, { cutsPerMin: 15 + i * 0.5 })));
    expect(spec.platform).toBe('vertical_short');
    expect(spec.cutting.targetCpm.provenance.source).toBe('measured');
    expect(spec.cutting.targetCpm.value[0]).toBeLessThan(16);
    expect(spec.cutting.targetCpm.value[1]).toBeGreaterThan(16);
    expect(spec.cutting.silence.value).toEqual({ mode: 'aggressive', maxGapMs: 200 });
    expect(spec.captions.presence.value).toBe('always');
    expect(spec.captions.box.value).toMatchObject({ lineHeightPct: 4, bottomPct: 70 });
    expect(spec.audio.targetLufs.value).toBe(-15);
    expect(spec.framing.faceH.value).toBe(0.2);
    expect(spec.lowConfidence).toEqual([]);
    expect(validateBrandEditSpec(spec)).toBe(spec);
  });

  it("keeps the creator's own values but flags them when there are too few videos or they disagree", () => {
    const spec = deriveBrandEditSpec([measures('a', { cutsPerMin: 3, lufs: -26 }), measures('b', { cutsPerMin: 40, lufs: -12 })]);
    expect(spec.cutting.targetCpm.provenance.source).toBe('measured');
    expect(spec.cutting.targetCpm.provenance.confidence).toBeLessThan(0.5);
    expect(spec.audio.targetLufs.value).toBe(-19);
    expect(spec.lowConfidence).toEqual(expect.arrayContaining(['cutting.targetCpm', 'audio.targetLufs']));
    // Two agreeing videos give 1 × 2/3 confidence for a 3-video field: just above the floor.
    expect(spec.captions.presence.provenance.confidence).toBeCloseTo(0.67, 2);
    // Framing needs one video: two agreeing faces are enough.
    expect(spec.lowConfidence).not.toContain('framing.faceH');
  });

  it('uses the platform default only when the videos say nothing about a field', () => {
    const spec = deriveBrandEditSpec(Array.from({ length: 3 }, (_, i) => measures(`v${i}`, { lufs: null, faceH: null, faceCx: null, faceCy: null, faceShare: 0 })));
    expect(spec.audio.targetLufs).toMatchObject({ value: -16, provenance: { source: 'platform_default', videos: 0 } });
    expect(spec.framing.faceH).toMatchObject({ value: 0.22, provenance: { source: 'platform_default' } });
  });

  it('describes the primary series, not an average of two formats', () => {
    const videos = [
      ...Array.from({ length: 6 }, (_, i) => measures(`talk${i}`, { cutsPerMin: 2 + i * 0.2 })),
      ...Array.from({ length: 4 }, (_, i) => measures(`vlog${i}`, { cutsPerMin: 30 + i })),
    ];
    const spec = deriveBrandEditSpec(videos);
    expect(spec.series).toHaveLength(2);
    expect(spec.cutting.targetCpm.value[1]).toBeLessThan(4);
  });

  it('uses mostly-horizontal sources as long-form', () => {
    const spec = deriveBrandEditSpec(Array.from({ length: 4 }, (_, i) => measures(`v${i}`, { vertical: false, captionSync: 0, captionCoverage: 0 })));
    expect(spec.platform).toBe('horizontal_long');
    expect(spec.captions.presence.value).toBe('never');
  });

  it('is accepted by the brand kit validator and rejected when malformed', () => {
    const kit = { ...emptyBrandKit('b1', 'Me'), spec: deriveBrandEditSpec(Array.from({ length: 3 }, (_, i) => measures(`v${i}`))) };
    expect(() => validateBrandKit(kit)).not.toThrow();
    const broken = structuredClone(kit); broken.spec!.audio.targetLufs.value = 3;
    expect(() => validateBrandKit(broken)).toThrow(/targetLufs/);
  });
});
