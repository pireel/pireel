import type { VideoMeasures } from './brand-analysis';

/**
 * The executable half of a brand: structured edit parameters reduced from per-video measures, each
 * with where it came from and how sure it is. Built on the creator-style research (960 videos of 100
 * top talking-head creators, docs/creator-style-research-2026-10):
 *  - only stable fingerprints are extracted (body pace, caption presence/case/size/position, face
 *    framing, loudness, silence trimming); per-video variables (punch-in counts, hook pace, B-roll
 *    share) are never averaged into a rule;
 *  - videos are split into series first (22% of top creators cut two formats); on a strong split the
 *    fields describe the primary series, so a median never lands between two styles;
 *  - confidence = agreement × min(1, n / minSamples); below CONFIDENCE_FLOOR a field is listed in
 *    lowConfidence (a consumer may ask the user or prefer an archetype preset). The platform default is
 *    used only when the videos say nothing at all about a field.
 */

export const BRAND_EDIT_SPEC_VERSION = 1;
export const BRAND_EXTRACTOR_VERSION = 'brand-extract-p0';
export const CONFIDENCE_FLOOR = 0.5;

export type SpecSource = 'measured' | 'platform_default';
export interface SpecProvenance { source: SpecSource; confidence: number; videos: number; /** Within-series CV (continuous) or 1 − mode share (categorical). */ dispersion?: number }
export interface SpecField<T> { value: T; provenance: SpecProvenance }
export type SilenceMode = 'aggressive' | 'moderate' | 'natural';
export type CaptionPresence = 'always' | 'sometimes' | 'never';

export interface BrandSeries { id: string; videos: string[]; cutsPerMin: number; captions: boolean; primary: boolean; /** Pace separation from the other series (absent for a single series). */ separation?: number }

export interface BrandEditSpec {
  version: typeof BRAND_EDIT_SPEC_VERSION;
  extractor: string;
  platform: 'vertical_short' | 'horizontal_long';
  /** Detected series. Fields describe the primary one when the split is strong, otherwise all videos. */
  series: BrandSeries[];
  usedVideos: string[];
  outliers: string[];
  framing: { faceH: SpecField<number>; faceCx: SpecField<number>; faceCy: SpecField<number> };
  cutting: {
    /** Body cuts per minute, ±25% around the series median. */
    targetCpm: SpecField<[number, number]>;
    p90ShotSec: SpecField<number>;
    silence: SpecField<{ mode: SilenceMode; maxGapMs: number }>;
  };
  captions: {
    presence: SpecField<CaptionPresence>;
    case: SpecField<'upper' | 'sentence'>;
    /** % of frame: line height, bottom edge, width, centre x. */
    box: SpecField<{ lineHeightPct: number; bottomPct: number; widthPct: number; xCenterPct: number }>;
    wordsPerLine: SpecField<number>;
  };
  audio: { targetLufs: SpecField<number> };
  /** Speaker traits: pace captions with them, never enforce them as style. */
  speech: { wpm: number | null; speakers: number };
  lowConfidence: string[];
}

interface PlatformDefaults { faceH: number; faceCx: number; faceCy: number; cpm: number; p90: number; silence: SilenceMode; presence: CaptionPresence; lineHeight: number; bottom: number; width: number; wordsPerLine: number; lufs: number }
/** Medians of the research sample per platform; loudness uses the product's scene target. */
export const PLATFORM_DEFAULTS: Record<BrandEditSpec['platform'], PlatformDefaults> = {
  vertical_short: { faceH: 0.22, faceCx: 0.5, faceCy: 0.41, cpm: 15, p90: 7, silence: 'aggressive', presence: 'always', lineHeight: 0.043, bottom: 0.71, width: 0.44, wordsPerLine: 3, lufs: -16 },
  horizontal_long: { faceH: 0.3, faceCx: 0.5, faceCy: 0.39, cpm: 11, p90: 9.5, silence: 'moderate', presence: 'never', lineHeight: 0.08, bottom: 0.88, width: 0.6, wordsPerLine: 4, lufs: -16 },
};

/** Videos needed before a field can be trusted, and the within-creator CV the research saw for it. */
const FIELD = {
  faceH: { min: 1, cv: 0.15 }, faceCx: { min: 1, cv: 0.09 }, faceCy: { min: 1, cv: 0.12 },
  cpm: { min: 3, cv: 0.4 }, p90: { min: 3, cv: 0.45 }, silence: { min: 3, cv: 0.4 },
  presence: { min: 3 }, case: { min: 3 }, box: { min: 3, cv: 0.12 }, wordsPerLine: { min: 3, cv: 0.2 },
  lufs: { min: 2, spreadDb: 2.5 },
} as const;

const SILENCE_GAP_MS: Record<SilenceMode, number> = { aggressive: 200, moderate: 400, natural: 1500 };

const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); const mid = sorted.length >> 1; return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2; };
const mad = (values: number[]) => { const m = median(values); return median(values.map(value => Math.abs(value - m))); };
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const present = <T>(values: (T | null)[]) => values.filter((value): value is T => value !== null && !(typeof value === 'number' && !Number.isFinite(value)));
const cv = (values: number[]) => { const mean = values.reduce((a, b) => a + b, 0) / values.length; const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length); return Math.abs(mean) > 1e-9 ? sd / Math.abs(mean) : 0; };

/** A caption is "on" for a video when synced captions (or, without ASR, a changing caption band) cover ≥30% of it. */
export const captionsOn = (video: VideoMeasures) => (video.captionSync ?? video.captionCoverage) >= 0.3;
const logPace = (video: VideoMeasures) => Math.log1p(video.cutsPerMin);

/** Separation of two groups' pace on a log scale, in units of their pooled spread. */
function paceSeparation(a: VideoMeasures[], b: VideoMeasures[]): number {
  const la = a.map(logPace); const lb = b.map(logPace);
  return Math.abs(median(la) - median(lb)) / (Math.max(mad(la), mad(lb)) * 1.4826 + 0.15);
}

/**
 * Split into at most two series. A pace split needs a clear break (see SERIES_THRESHOLDS, ≥3 videos a side);
 * a caption on/off split needs ≥3 a side and some pace difference too, otherwise mixed captioning is
 * just "sometimes". Fewer than six videos are never split.
 */
export interface SeriesThresholds { minBreak: number; minSeparation: number }
/** Swept on the research labels (pace only): 9/22 "varies by series" creators split, 6/37 "very consistent"
 *  split; the rest of the two-format creators differ in layout, which pace cannot see. */
export const SERIES_THRESHOLDS: SeriesThresholds = { minBreak: 0.4, minSeparation: 1.5 };

export function brandSeries(videos: VideoMeasures[], thresholds: SeriesThresholds = SERIES_THRESHOLDS): BrandSeries[] {
  const describe = (group: VideoMeasures[], index: number, primary: boolean, separation?: number): BrandSeries => ({
    id: `s${index + 1}`, videos: group.map(video => video.id), primary, ...(separation !== undefined ? { separation: round(separation, 2) } : {}),
    cutsPerMin: round(median(group.map(video => video.cutsPerMin)), 1),
    captions: group.filter(captionsOn).length * 2 > group.length,
  });
  let best: { score: number; groups: [VideoMeasures[], VideoMeasures[]] } | null = null;
  if (videos.length >= 6) {
    // Split at the widest natural break in pace (≥ 0.5 on log1p ≈ a 1.65× jump), then require the groups
    // to be well separated relative to their own spread.
    const sorted = [...videos].sort((a, b) => logPace(a) - logPace(b));
    let at = -1; let widest = 0;
    for (let index = 3; index <= sorted.length - 3; index++) {
      const gap = logPace(sorted[index]!) - logPace(sorted[index - 1]!);
      if (gap > widest) { widest = gap; at = index; }
    }
    if (at > 0 && widest >= thresholds.minBreak) {
      const groups: [VideoMeasures[], VideoMeasures[]] = [sorted.slice(0, at), sorted.slice(at)];
      const score = paceSeparation(...groups);
      if (score >= thresholds.minSeparation) best = { score, groups };
    }
    const on = videos.filter(captionsOn); const off = videos.filter(video => !captionsOn(video));
    if (!best && on.length >= 3 && off.length >= 3) {
      const score = paceSeparation(on, off);
      if (score >= 1.5) best = { score, groups: [on, off] };
    }
  }
  if (!best) return [describe(videos, 0, true)];
  // Primary = the larger series; on a tie, the one holding the first (newest) video.
  const [a, b] = best.groups;
  const firstId = videos[0]!.id;
  const aFirst = a.length > b.length || (a.length === b.length && a.some(video => video.id === firstId));
  const ordered = aFirst ? [a, b] : [b, a];
  return ordered.map((group, index) => describe(group, index, index === 0, best!.score));
}

/** Drop videos far from their series on pace or framing (≥3.5 robust z), at most a quarter of them. */
export function seriesOutliers(videos: VideoMeasures[]): string[] {
  if (videos.length < 4) return [];
  const score = (pick: (video: VideoMeasures) => number | null, floor: number) => {
    const values = present(videos.map(pick));
    if (values.length < 4) return () => 0;
    const m = median(values); const spread = mad(values) * 1.4826 + floor;
    return (video: VideoMeasures) => { const value = pick(video); return value === null ? 0 : Math.abs(value - m) / spread; };
  };
  const pace = score(logPace, 0.25); const face = score(video => video.faceH, 0.03);
  return videos.map(video => ({ id: video.id, z: Math.max(pace(video), face(video)) }))
    .filter(item => item.z >= 3.5).sort((x, y) => y.z - x.z)
    .slice(0, Math.floor(videos.length / 4)).map(item => item.id);
}

const confidence = (agreement: number, n: number, min: number) => round(clamp01(agreement) * Math.min(1, n / min));

/** A continuous field: series median, agreement from CV against the CV the research saw for it. */
function continuous(values: number[], spec: { min: number; cv: number }, fallback: number, digits = 3): SpecField<number> & { low: boolean } {
  if (!values.length) return { value: fallback, provenance: { source: 'platform_default', confidence: 0, videos: 0 }, low: true };
  const dispersion = cv(values);
  const conf = confidence(1 - dispersion / (3 * spec.cv), values.length, spec.min);
  // Evaluated on the research set: the creator's own median, even when spread, beats any platform default
  // (pace: 46% vs 14% of held-out videos within ±25%). Low confidence is flagged, not replaced.
  return { value: round(median(values), digits), provenance: { source: 'measured', confidence: conf, videos: values.length, dispersion: round(dispersion, 3) }, low: conf < CONFIDENCE_FLOOR };
}

function categorical<T extends string>(values: T[], min: number, fallback: T): SpecField<T> & { low: boolean } {
  if (!values.length) return { value: fallback, provenance: { source: 'platform_default', confidence: 0, videos: 0 }, low: true };
  const counts = new Map<T, number>(); values.forEach(value => counts.set(value, (counts.get(value) ?? 0) + 1));
  const [mode, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
  const share = count / values.length;
  const conf = confidence(share, values.length, min);
  return { value: mode, provenance: { source: 'measured', confidence: conf, videos: values.length, dispersion: round(1 - share, 3) }, low: conf < CONFIDENCE_FLOOR };
}

export function silenceMode(cutGapMs: number): SilenceMode { return cutGapMs <= 250 ? 'aggressive' : cutGapMs <= 600 ? 'moderate' : 'natural'; }

/**
 * Series are always detected and reported, but the fields are narrowed to the primary series only on a
 * strong split (≥4 videos, separation ≥ 3): on the research set a weak split (16% false on steady
 * creators) cost more by dropping videos than it gained. Outlier dropping showed no gain and is opt-in.
 */
export interface DeriveOptions { series?: boolean; outliers?: boolean }
const STRONG_SPLIT = { videos: 4, separation: 3 };

export function deriveBrandEditSpec(all: VideoMeasures[], options: DeriveOptions = {}): BrandEditSpec {
  if (!all.length) throw new Error('deriveBrandEditSpec: no videos');
  const platform: BrandEditSpec['platform'] = all.filter(video => video.vertical).length * 2 >= all.length ? 'vertical_short' : 'horizontal_long';
  const base = PLATFORM_DEFAULTS[platform];
  const series = options.series === false ? brandSeries(all, { minBreak: Infinity, minSeparation: Infinity }) : brandSeries(all);
  const strong = series.length > 1 && series[0]!.videos.length >= STRONG_SPLIT.videos && (series[0]!.separation ?? 0) >= STRONG_SPLIT.separation;
  const primaryIds = new Set(strong ? series[0]!.videos : all.map(video => video.id));
  const inSeries = all.filter(video => primaryIds.has(video.id));
  const outliers = options.outliers === true ? seriesOutliers(inSeries) : [];
  const videos = inSeries.filter(video => !outliers.includes(video.id));
  const low: string[] = [];
  const track = <T>(name: string, field: SpecField<T> & { low: boolean }): SpecField<T> => { if (field.low) low.push(name); const { low: _low, ...rest } = field; return rest; };

  const faceVideos = videos.filter(video => video.faceShare >= 0.3);
  const faceH = track('framing.faceH', continuous(present(faceVideos.map(video => video.faceH)), FIELD.faceH, base.faceH));
  const faceCx = track('framing.faceCx', continuous(present(faceVideos.map(video => video.faceCx)), FIELD.faceCx, base.faceCx));
  const faceCy = track('framing.faceCy', continuous(present(faceVideos.map(video => video.faceCy)), FIELD.faceCy, base.faceCy));

  const pace = continuous(videos.map(video => video.cutsPerMin), FIELD.cpm, base.cpm, 1);
  const targetCpm = track('cutting.targetCpm', { ...pace, value: [round(pace.value * 0.75, 1), round(pace.value * 1.25, 1)] as [number, number] });
  const p90ShotSec = track('cutting.p90ShotSec', continuous(videos.map(video => video.p90ShotSec), FIELD.p90, base.p90, 1));
  const gaps = continuous(present(videos.map(video => video.cutGapMs)), FIELD.silence, SILENCE_GAP_MS[base.silence], 0);
  const mode = gaps.provenance.source === 'measured' ? silenceMode(gaps.value) : base.silence;
  const silence = track('cutting.silence', { ...gaps, value: { mode, maxGapMs: SILENCE_GAP_MS[mode] } });

  const presenceShare = videos.filter(captionsOn).length / videos.length;
  const presenceValue: CaptionPresence = presenceShare >= 0.75 ? 'always' : presenceShare <= 0.25 ? 'never' : 'sometimes';
  const presenceConf = confidence(Math.max(presenceShare, 1 - presenceShare), videos.length, FIELD.presence.min);
  const presence = track('captions.presence', { value: presenceValue, provenance: { source: 'measured', confidence: presenceConf, videos: videos.length, dispersion: round(Math.min(presenceShare, 1 - presenceShare), 3) }, low: presenceConf < CONFIDENCE_FLOOR });

  const captioned = videos.filter(captionsOn);
  const casing = track('captions.case', categorical(present(captioned.map(video => video.captionUpper)).map(upper => upper >= 0.7 ? 'upper' as const : 'sentence' as const), FIELD.case.min, 'sentence'));
  const lineHeight = continuous(present(captioned.map(video => video.captionLineHeight)), FIELD.box, base.lineHeight, 4);
  const bottoms = present(captioned.map(video => video.captionBottom));
  const widths = present(captioned.map(video => video.captionWidth));
  const centres = present(captioned.map(video => video.captionXCenter));
  const box = track('captions.box', {
    ...lineHeight,
    value: lineHeight.provenance.source === 'measured' && bottoms.length
      ? { lineHeightPct: round(lineHeight.value * 100, 2), bottomPct: round(median(bottoms) * 100, 1), widthPct: round(median(widths) * 100, 1), xCenterPct: round(median(centres) * 100, 1) }
      : { lineHeightPct: round(base.lineHeight * 100, 2), bottomPct: round(base.bottom * 100, 1), widthPct: round(base.width * 100, 1), xCenterPct: 50 },
  });
  const wordsPerLine = track('captions.wordsPerLine', continuous(present(captioned.map(video => video.wordsPerLine)), FIELD.wordsPerLine, base.wordsPerLine, 1));

  // Loudness agreement is a spread in dB, not a CV of a negative number.
  const lufsValues = present(videos.map(video => video.lufs));
  const lufsSpread = lufsValues.length ? Math.sqrt(lufsValues.reduce((a, b) => a + (b - median(lufsValues)) ** 2, 0) / lufsValues.length) : 0;
  const lufsConf = lufsValues.length ? confidence(1 - lufsSpread / (3 * FIELD.lufs.spreadDb), lufsValues.length, FIELD.lufs.min) : 0;
  const targetLufs = track('audio.targetLufs', !lufsValues.length
    ? { value: base.lufs, provenance: { source: 'platform_default', confidence: 0, videos: 0 }, low: true }
    : { value: round(median(lufsValues), 1), provenance: { source: 'measured', confidence: lufsConf, videos: lufsValues.length, dispersion: round(lufsSpread, 2) }, low: lufsConf < CONFIDENCE_FLOOR });

  const wpms = present(videos.map(video => video.wpm));
  return {
    version: BRAND_EDIT_SPEC_VERSION, extractor: BRAND_EXTRACTOR_VERSION, platform, series,
    usedVideos: videos.map(video => video.id), outliers,
    framing: { faceH, faceCx, faceCy },
    cutting: { targetCpm, p90ShotSec, silence },
    captions: { presence, case: casing, box, wordsPerLine },
    audio: { targetLufs },
    speech: { wpm: wpms.length ? Math.round(median(wpms)) : null, speakers: Math.max(0, ...videos.map(video => video.speakers)) },
    lowConfidence: low,
  };
}

function fail(path: string, reason: string): never { throw new Error(`品牌剪辑规范字段无效：${path}（${reason}）`); }

/** Shape check for a stored spec (the server refuses a malformed one rather than patching it). */
export function validateBrandEditSpec(value: unknown): BrandEditSpec {
  const spec = value as BrandEditSpec;
  if (!spec || typeof spec !== 'object') fail('spec', '不是对象');
  if (spec.version !== BRAND_EDIT_SPEC_VERSION) fail('spec.version', `需要 ${BRAND_EDIT_SPEC_VERSION}`);
  if (spec.platform !== 'vertical_short' && spec.platform !== 'horizontal_long') fail('spec.platform', 'vertical_short/horizontal_long');
  if (!Array.isArray(spec.series) || !spec.series.length) fail('spec.series', '至少一个系列');
  const fields: [string, SpecField<unknown> | undefined][] = [
    ['framing.faceH', spec.framing?.faceH], ['framing.faceCx', spec.framing?.faceCx], ['framing.faceCy', spec.framing?.faceCy],
    ['cutting.targetCpm', spec.cutting?.targetCpm], ['cutting.p90ShotSec', spec.cutting?.p90ShotSec], ['cutting.silence', spec.cutting?.silence],
    ['captions.presence', spec.captions?.presence], ['captions.case', spec.captions?.case], ['captions.box', spec.captions?.box], ['captions.wordsPerLine', spec.captions?.wordsPerLine],
    ['audio.targetLufs', spec.audio?.targetLufs],
  ];
  for (const [path, field] of fields) {
    if (!field || field.value === undefined) fail(`spec.${path}`, '缺失');
    const p = field.provenance;
    if (!p || (p.source !== 'measured' && p.source !== 'platform_default') || !(p.confidence >= 0 && p.confidence <= 1)) fail(`spec.${path}.provenance`, '来源或置信度无效');
  }
  if (!['aggressive', 'moderate', 'natural'].includes(spec.cutting.silence.value.mode)) fail('spec.cutting.silence', '未知档位');
  if (!['always', 'sometimes', 'never'].includes(spec.captions.presence.value)) fail('spec.captions.presence', '未知取值');
  if (!(spec.audio.targetLufs.value >= -40 && spec.audio.targetLufs.value <= -5)) fail('spec.audio.targetLufs', '-40…-5');
  return spec;
}
