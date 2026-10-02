import type { BrandConfidence, BrandCorner, BrandEvidence } from './brand-kit';

/**
 * Brand extraction, deterministic half: per-video observations (measured in the browser and by OCR)
 * are reduced to brand conclusions with evidence. Semantic judgements (font, colors, playbook, cover)
 * are made elsewhere from the crops this module points at. Validated on a 9-creator evaluation set:
 * caption band 9/9, pacing after full-rate cut detection, recurring intro/outro where they exist.
 */

/** OCR text box in normalized frame coordinates (origin top-left). */
export interface OcrBox { text: string; x: number; y: number; w: number; h: number }
export interface VideoObservation {
  id: string;
  durationSec: number;
  /** Frame samples at a fixed rate with their OCR boxes. */
  ocr: { t: number; boxes: OcrBox[] }[];
  /** Shot cut times in seconds (full-rate scene detection). */
  cuts: number[];
  /** Largest face per sampled frame, normalized; absent when no face. */
  faces: { t: number; x: number; y: number; w: number; h: number }[];
  /** Frames the face detector looked at (faces are sampled separately from OCR); defaults to the OCR samples. */
  faceSamples?: number;
  /** Perceptual hashes (hex) of the first and last seconds, one per sample; '' for a near-flat frame
   *  (black/solid frames hash alike across unrelated videos, so they never count as a match). */
  headHashes: string[];
  tailHashes: string[];
  /** Candidate persistent overlays from edge persistence (normalized boxes). */
  overlays: { x: number; y: number; w: number; h: number; text?: string }[];
  /** ASR words over the whole video (source seconds); absent when the video was not transcribed. */
  words?: { text: string; start: number; end: number; speaker?: string }[];
  /** BS.1770 integrated loudness of the soundtrack; null = silent or not measured. */
  loudnessLufs?: number | null;
  /** Frame size, so platform (vertical short vs horizontal long) is decided per video, not from the first one. */
  width?: number;
  height?: number;
}

export interface CaptionGeometry {
  /** Caption group bottom edge, % of frame height. */
  bottomPct: number;
  /** Median line height, % of frame height. */
  lineHeightPct: number;
  widthPct: number;
  xCenterPct: number;
  tokensPerLine: number;
  upperRatio: number;
  /** Sampled frames/boxes to crop for the style judgement. */
  samples: { video: string; t: number; box: OcrBox }[];
}

export interface BrandObservationSummary {
  captions: (CaptionGeometry & { evidence: BrandEvidence }) | null;
  pacing: { avgShotSec: number; evidence: BrandEvidence } | null;
  framing: { faceScale: number; faceCenterY: number; evidence: BrandEvidence } | null;
  intro: { video: string; endSec: number; evidence: BrandEvidence } | null;
  outro: { video: string; startSec: number; evidence: BrandEvidence } | null;
  /** A recurring opening/closing whose text changes per video: a title-card template, not a reusable clip. */
  titleCards: { position: 'intro' | 'outro'; videos: string[]; texts: string[] }[];
  logo: { video: string; box: { x: number; y: number; w: number; h: number }; corner: BrandCorner; evidence: BrandEvidence } | null;
}

const median = (values: number[]) => {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
const confidence = (share: number): BrandConfidence => share >= 0.7 ? 'high' : share >= 0.4 ? 'medium' : 'low';
const latin = (text: string) => /[A-Za-z]/.test(text);
const tokens = (text: string) => latin(text) ? text.trim().split(/\s+/).length : [...text.replace(/\s/g, '')].length;

/** The caption band: the horizontal band where text appears often AND changes often (titles and
 * watermarks are frequent but static; one-off overlays change but are rare). */
export function captionBand(video: VideoObservation): { bottom: number; items: { t: number; box: OcrBox }[]; coverage: number } | null {
  const bands = new Map<number, { t: number; box: OcrBox; frame: number }[]>();
  video.ocr.forEach((sample, frame) => {
    for (const box of sample.boxes) {
      if (box.w < 0.08) continue;
      const key = Math.round((box.y + box.h) * 20) / 20;
      const list = bands.get(key) ?? [];
      list.push({ t: sample.t, box, frame }); bands.set(key, list);
    }
  });
  let best: { score: number; items: { t: number; box: OcrBox; frame: number }[] } | null = null;
  for (const items of bands.values()) {
    const coverage = new Set(items.map(item => item.frame)).size / Math.max(1, video.ocr.length);
    const changes = items.slice(1).filter((item, index) => item.box.text !== items[index]!.box.text).length;
    const changeRate = changes / Math.max(1, items.length);
    const score = coverage * changeRate;
    // Captions both recur and change; a static title or watermark never qualifies.
    if (coverage > 0.15 && changeRate >= 0.15 && (!best || score > best.score)) best = { score, items };
  }
  if (!best) return null;
  return { bottom: median(best.items.map(item => item.box.y + item.box.h)), items: best.items.map(({ t, box }) => ({ t, box })), coverage: new Set(best.items.map(item => item.frame)).size / video.ocr.length };
}

export function captionGeometry(videos: VideoObservation[]): BrandObservationSummary['captions'] {
  const found = videos.flatMap(video => { const band = captionBand(video); return band ? [{ video, band }] : []; });
  if (!found.length) return null;
  const boxes = found.flatMap(({ band }) => band.items.map(item => item.box));
  const letters = boxes.filter(box => latin(box.text));
  // Casing only means something for Latin captions; a Chinese caption with an occasional "AI" is not all-caps.
  const upper = letters.length * 2 > boxes.length ? median(letters.map(box => { const alpha = [...box.text].filter(ch => /[A-Za-z]/.test(ch)); return alpha.filter(ch => ch === ch.toUpperCase()).length / alpha.length; })) : 0;
  const samples = found.flatMap(({ video, band }) => { const step = Math.max(1, Math.floor(band.items.length / 3)); return band.items.filter((_, index) => index % step === 0).slice(0, 3).map(item => ({ video: video.id, t: item.t, box: item.box })); }).slice(0, 12);
  return {
    bottomPct: round(median(found.map(({ band }) => band.bottom)) * 100),
    lineHeightPct: round(median(boxes.map(box => box.h)) * 100, 2),
    widthPct: round(median(boxes.map(box => box.w)) * 100),
    xCenterPct: round(median(boxes.map(box => box.x + box.w / 2)) * 100),
    tokensPerLine: median(boxes.map(box => tokens(box.text))),
    upperRatio: round(upper, 2),
    samples,
    evidence: { videos: found.map(({ video }) => video.id), frames: samples.map(sample => ({ video: sample.video, sec: sample.t })), confidence: confidence(found.length / videos.length) },
  };
}

export function pacing(videos: VideoObservation[]): BrandObservationSummary['pacing'] {
  const perVideo = videos.filter(video => video.durationSec > 0).map(video => {
    const bounds = [0, ...video.cuts.filter(cut => cut > 0 && cut < video.durationSec), video.durationSec];
    return video.durationSec / (bounds.length - 1);
  });
  if (!perVideo.length) return null;
  const spread = Math.max(...perVideo) / Math.max(0.01, Math.min(...perVideo));
  return { avgShotSec: round(median(perVideo), 2), evidence: { videos: videos.map(video => video.id), confidence: spread < 3 ? 'high' : spread < 6 ? 'medium' : 'low' } };
}

export function framing(videos: VideoObservation[]): BrandObservationSummary['framing'] {
  const faces = videos.flatMap(video => video.faces.map(face => ({ video: video.id, face })));
  const withFaces = new Set(faces.map(item => item.video));
  if (withFaces.size < Math.max(1, Math.ceil(videos.length / 2))) return null;
  return { faceScale: round(median(faces.map(item => item.face.h)), 3), faceCenterY: round(median(faces.map(item => item.face.y + item.face.h / 2)), 3),
    evidence: { videos: [...withFaces], confidence: confidence(withFaces.size / videos.length) } };
}

const hamming = (a: string, b: string) => {
  let distance = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    let x = parseInt(a[index]!, 16) ^ parseInt(b[index]!, 16);
    while (x) { distance += x & 1; x >>= 1; }
  }
  return distance + Math.abs(a.length - b.length) * 4;
};

/** A segment recurs when several of its hashes match another video's (≥3 videos share it). Returns the
 * matched span of the video with the most partners, so the asset is cut from real footage. */
function recurring(videos: VideoObservation[], key: 'headHashes' | 'tailHashes', maxShare: number): { video: VideoObservation; matched: number[]; partners: string[] } | null {
  let best: { video: VideoObservation; matched: number[]; partners: string[] } | null = null;
  for (const video of videos) {
    const partners: string[] = []; const matchedSet = new Set<number>();
    for (const other of videos) {
      if (other === video) continue;
      const hits = video[key].flatMap((hash, index) => hash && other[key].some(candidate => candidate && hamming(hash, candidate) <= hash.length * 4 * maxShare) ? [index] : []);
      if (hits.length >= 4) { partners.push(other.id); hits.forEach(index => matchedSet.add(index)); }
    }
    if (partners.length + 1 >= 3 && (!best || partners.length > best.partners.length)) best = { video, matched: [...matchedSet].sort((a, b) => a - b), partners };
  }
  return best;
}

/** Head/tail hashes are sampled at `rate` per second: head from 0, tail ending at the video end. */
/** Text shown in [from, to) of a video, normalized for comparison. */
function spanText(video: VideoObservation, from: number, to: number): string {
  return video.ocr.filter(sample => sample.t >= from && sample.t < to).flatMap(sample => sample.boxes.map(box => box.text)).join(' ').replace(/\s+/g, '').toLowerCase();
}

/** `maxShare`: share of hash bits that may differ (0.16 ≈ 40 of 256 bits, validated on the evaluation set).
 * A recurring span only becomes a reusable intro/outro when its on-screen text is the same in every
 * matched video; changing text means a title-card template (e.g. black card + per-video title). */
export function bookends(videos: VideoObservation[], rate: number, maxShare = 0.16): Pick<BrandObservationSummary, 'intro' | 'outro' | 'titleCards'> {
  const byId = new Map(videos.map(video => [video.id, video]));
  const head = recurring(videos, 'headHashes', maxShare);
  const tail = recurring(videos, 'tailHashes', maxShare);
  const titleCards: BrandObservationSummary['titleCards'] = [];
  let intro: BrandObservationSummary['intro'] = null;
  let outro: BrandObservationSummary['outro'] = null;
  if (head) {
    const endSec = round((head.matched.at(-1)! + 1) / rate, 2);
    const ids = [head.video.id, ...head.partners];
    const texts = ids.map(id => spanText(byId.get(id)!, 0, endSec));
    if (new Set(texts).size > 1) titleCards.push({ position: 'intro', videos: ids, texts });
    else intro = { video: head.video.id, endSec, evidence: { videos: ids, confidence: confidence(ids.length / videos.length) } };
  }
  if (tail) {
    const startSec = round(tail.video.durationSec - (tail.video.tailHashes.length - tail.matched[0]!) / rate, 2);
    const ids = [tail.video.id, ...tail.partners];
    const texts = ids.map(id => { const video = byId.get(id)!; return spanText(video, video.durationSec - (tail.video.durationSec - startSec), video.durationSec); });
    if (new Set(texts).size > 1) titleCards.push({ position: 'outro', videos: ids, texts });
    else outro = { video: tail.video.id, startSec, evidence: { videos: ids, confidence: confidence(ids.length / videos.length) } };
  }
  return { intro, outro, titleCards };
}

const PLATFORM_MARKS = /bilibili|抖音|douyin|tiktok|快手|kuaishou|youtube|小红书|xiaohongshu|视频号/i;

/** Text read inside a persistent overlay: edge persistence finds the box, OCR says what it is. */
export function overlayText(video: VideoObservation, box: { x: number; y: number; w: number; h: number }): string {
  const inside = (b: OcrBox) => { const cx = b.x + b.w / 2; const cy = b.y + b.h / 2; return cx >= box.x - 0.02 && cx <= box.x + box.w + 0.02 && cy >= box.y - 0.02 && cy <= box.y + box.h + 0.02; };
  return [...new Set(video.ocr.flatMap(sample => sample.boxes.filter(inside).map(b => b.text)))].join(' ');
}

/** Only a confident logo becomes a candidate (the evaluation showed static backgrounds, caption bands
 * and platform watermarks all look persistent): near an edge, outside the caption band, not a platform
 * mark, and present in most videos at the same place. Otherwise the user uploads their logo. */
export function logoCandidate(videos: VideoObservation[], captionBottomPct: number | null): BrandObservationSummary['logo'] {
  const candidates = videos.flatMap(video => video.overlays
    .filter(box => !PLATFORM_MARKS.test(box.text ?? overlayText(video, box)))
    .filter(box => box.y < 0.2 || box.y + box.h > 0.8)
    .filter(box => captionBottomPct === null || Math.abs((box.y + box.h) * 100 - captionBottomPct) > 6)
    .map(box => ({ video: video.id, box })));
  let best: { video: string; box: VideoObservation['overlays'][number]; partners: Set<string> } | null = null;
  for (const item of candidates) {
    const partners = new Set(candidates.filter(other => Math.abs(other.box.x - item.box.x) < 0.04 && Math.abs(other.box.y - item.box.y) < 0.04).map(other => other.video));
    if (!best || partners.size > best.partners.size) best = { ...item, partners };
  }
  if (!best || best.partners.size < Math.max(3, Math.ceil(videos.length * 0.6))) return null;
  const { box } = best;
  const corner = `${box.y + box.h / 2 < 0.5 ? 'top' : 'bottom'}-${box.x + box.w / 2 < 0.5 ? 'left' : 'right'}` as BrandCorner;
  return { video: best.video, box: { x: box.x, y: box.y, w: box.w, h: box.h }, corner, evidence: { videos: [...best.partners], confidence: confidence(best.partners.size / videos.length) } };
}

/**
 * One video reduced to the numbers a brand fingerprint is built from (research: 960 videos of 100
 * creators, docs/creator-style-research-2026-10). Each is null when this video cannot say.
 */
export interface VideoMeasures {
  id: string;
  durationSec: number;
  vertical: boolean;
  /** Cuts per minute over the whole video. Evaluated on the research set, whole-video pace predicts a
   *  creator's other videos better than body-only pace (more cuts to count beats skipping a faster hook). */
  cutsPerMin: number;
  p90ShotSec: number;
  /** Share of speech-time samples showing a caption that matches the spoken words (null without ASR). */
  captionSync: number | null;
  /** Share of sampled frames with a changing caption band (OCR only; fallback when there is no ASR). */
  captionCoverage: number;
  captionUpper: number | null;
  captionLineHeight: number | null;
  captionBottom: number | null;
  captionWidth: number | null;
  captionXCenter: number | null;
  wordsPerLine: number | null;
  faceH: number | null;
  faceCx: number | null;
  faceCy: number | null;
  /** Share of sampled frames with a detected face. */
  faceShare: number;
  wpm: number | null;
  /** Median silence left at cuts that fall between words: how hard pauses are trimmed. */
  cutGapMs: number | null;
  pausesPerMin: number | null;
  speakers: number;
  lufs: number | null;
}

const norm = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, ' ').trim();
const percentile = (values: number[], p: number) => { if (!values.length) return NaN; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!; };
const finite = (value: number) => Number.isFinite(value) ? value : null;

/** Caption text counts as speech-synced when most of its tokens were spoken within ±2 s. CJK captions are
 *  compared per character, Latin ones per word. */
function syncedWithSpeech(text: string, t: number, words: NonNullable<VideoObservation['words']>): boolean {
  const near = norm(words.filter(word => word.start >= t - 2 && word.start <= t + 2).map(word => word.text).join(' '));
  if (!near) return false;
  const parts = latin(text) ? norm(text).split(' ').filter(Boolean) : [...norm(text).replace(/\s/g, '')];
  if (!parts.length) return false;
  const pool = latin(text) ? new Set(near.split(' ')) : new Set([...near.replace(/\s/g, '')]);
  return parts.filter(part => pool.has(part)).length / parts.length >= 0.6;
}

export function measureVideo(video: VideoObservation): VideoMeasures {
  const duration = Math.max(0.01, video.durationSec);
  const cuts = video.cuts.filter(cut => cut > 0 && cut < duration).sort((a, b) => a - b);
  const bounds = [0, ...cuts, duration];
  const shots = bounds.slice(1).map((end, index) => end - bounds[index]!);
  const band = captionBand(video);
  const words = video.words ?? [];
  const speaking = (t: number) => words.some(word => word.start - 0.3 <= t && t <= word.end + 0.3);
  const speechSamples = video.ocr.filter(sample => speaking(sample.t));
  const captionSync = words.length >= 10 && speechSamples.length
    ? speechSamples.filter(sample => sample.boxes.some(box => syncedWithSpeech(box.text, sample.t, words))).length / speechSamples.length
    : null;
  const boxes = band?.items.map(item => item.box) ?? [];
  const alpha = boxes.filter(box => latin(box.text)).flatMap(box => [...box.text].filter(ch => /[A-Za-z]/.test(ch)));
  const faces = video.faces;
  let cutGapMs: number | null = null; let wpm: number | null = null; let pausesPerMin: number | null = null;
  if (words.length >= 10) {
    const span = words.at(-1)!.end - words[0]!.start;
    wpm = finite(words.length / Math.max(1, span) * 60);
    const gaps = words.slice(1).map((word, index) => ({ from: words[index]!.end, to: word.start }));
    pausesPerMin = finite(gaps.filter(gap => gap.to - gap.from > 0.7).length / Math.max(1, span) * 60);
    // A cut between two words leaves exactly the silence the editor kept there.
    const atCuts = cuts.flatMap(cut => { const gap = gaps.find(g => g.from <= cut + 0.05 && g.to >= cut - 0.05 && g.to - g.from < 2.5); return gap ? [Math.max(0, gap.to - gap.from)] : []; });
    cutGapMs = atCuts.length >= 3 ? Math.round(median(atCuts) * 1000) : null;
  }
  return {
    id: video.id, durationSec: duration,
    vertical: video.width && video.height ? video.height > video.width : true,
    cutsPerMin: round(cuts.length / duration * 60, 2), p90ShotSec: round(percentile(shots, 0.9), 2),
    captionSync: captionSync === null ? null : round(captionSync, 3),
    captionCoverage: round(band?.coverage ?? 0, 3),
    captionUpper: alpha.length >= 20 ? round(alpha.filter(ch => ch === ch.toUpperCase()).length / alpha.length, 2) : null,
    captionLineHeight: boxes.length ? round(median(boxes.map(box => box.h)), 4) : null,
    captionBottom: band ? round(band.bottom, 3) : null,
    captionWidth: boxes.length ? round(median(boxes.map(box => box.w)), 3) : null,
    captionXCenter: boxes.length ? round(median(boxes.map(box => box.x + box.w / 2)), 3) : null,
    wordsPerLine: boxes.length ? median(boxes.map(box => tokens(box.text))) : null,
    faceH: faces.length ? round(median(faces.map(face => face.h)), 3) : null,
    faceCx: faces.length ? round(median(faces.map(face => face.x + face.w / 2)), 3) : null,
    faceCy: faces.length ? round(median(faces.map(face => face.y + face.h / 2)), 3) : null,
    faceShare: (video.faceSamples ?? video.ocr.length) ? round(Math.min(1, faces.length / (video.faceSamples ?? video.ocr.length)), 2) : 0,
    wpm: wpm === null ? null : round(wpm, 0), cutGapMs, pausesPerMin: pausesPerMin === null ? null : round(pausesPerMin, 2),
    speakers: new Set(words.map(word => word.speaker).filter(Boolean)).size || (words.length ? 1 : 0),
    lufs: video.loudnessLufs != null && Number.isFinite(video.loudnessLufs) ? round(video.loudnessLufs, 1) : null,
  };
}

export function summarizeBrandObservations(videos: VideoObservation[], hashRate: number): BrandObservationSummary {
  const captions = captionGeometry(videos);
  return { captions, pacing: pacing(videos), framing: framing(videos), ...bookends(videos, hashRate), logo: logoCandidate(videos, captions?.bottomPct ?? null) };
}
