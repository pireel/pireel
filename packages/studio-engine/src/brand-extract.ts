import { BRAND_PREFERENCE_IDS, brandEditingSkills, type BrandPreferences } from './brand-preferences';
import { techniqueProse } from './brand-prose';
import { BASE_CAPTION_FONT_PX, CAPTION_PRESETS } from './caption-presets';
import { CAPTION_ANIMATIONS, type CaptionAnimationId } from './caption-animations';
import { WEB_FONTS } from './font-library';
import { BRAND_EDITING_SKILL_IDS } from './editing-skills';
import { fixedBrandConfiguration, DEFAULT_BRAND_SKILL_ID, PLAYBOOK_SCHEMA, type BrandAsset, type BrandBlocks, type BrandPlatform, type BrandPlaybook, type Corner } from './brand-playbook';
import type { CaptionStyle } from './composition-core';

// Automatic cover is an execution choice; legacy visual analyses need not emit it.
const ANALYSIS_PREFERENCE_IDS = BRAND_PREFERENCE_IDS.filter(id => !['cover', 'logo', 'intro', 'outro', 'music', 'loudness'].includes(id));

/**
 * The brand extraction method: how a creator's videos become their brand (brand-playbook.ts).
 *
 * Code measures what models cannot: speech timing, cuts, faces, loudness, pause lengths, a music bed
 * under the speech, the exact size and place of caption letters. A model then watches each video as
 * an editor would and keeps a shot log — facts only, shot by shot — and one more call reads every shot
 * log with the creator's frames and covers and writes the brand: the values a program applies as they
 * are, and the creator's toolkit for the agent that edits their new videos. A long video is not watched
 * whole: its opening and ending are, and the middle stretches its transcript says are worth a look.
 */
export const METHOD_VERSION = 'brand-method-33';

// ── What is watched

export const VIEW = {
  /** A video this short is watched whole. */
  wholeUnderSec: 180,
  openingSec: 120,
  closingSec: 60,
  /** Middle stretches picked from the transcript. */
  windows: 8, windowSec: 10,
  /** Shot rows: four frames each — before the cut, the cut, 0.3 s in, the middle — eight rows a sheet. */
  rowsPerSheet: 8, cellWidth: 213, maxSheets: 18,
  /** Full frames spread over each video, for captions and on-screen text. */
  styleFrames: 12,
} as const;

export interface Word { text: string; start: number; end: number }
export interface Sentence { start: number; end: number; text: string }

/** The transcript as sentences (split at sentence-ending punctuation). */
export function spokenSentences(words: readonly Word[]): Sentence[] {
  const out: Sentence[] = []; let current: Word[] = [];
  for (const word of words) {
    current.push(word);
    if (/[。！？!?；;]$/.test(word.text) || current.length >= 60) { out.push(sentenceOf(current)); current = []; }
  }
  if (current.length) out.push(sentenceOf(current));
  return out;
}
const sentenceOf = (words: Word[]): Sentence => ({ start: round(words[0]!.start, 1), end: round(words.at(-1)!.end, 1), text: words.map(word => word.text).join('') });
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

/** The stretches of a video that are watched: all of a short one; else the opening, the ending and the picked middle windows. */
export function viewingWindows(durationSec: number, middle: readonly { start: number; end: number }[]): [number, number][] {
  if (durationSec <= VIEW.wholeUnderSec) return [[0, durationSec]];
  const windows: [number, number][] = [[0, VIEW.openingSec], [Math.max(VIEW.openingSec, durationSec - VIEW.closingSec), durationSec]];
  for (const window of middle) windows.push([window.start, window.end]);
  return windows.sort((a, b) => a[0] - b[0]);
}

/** Middle windows spread evenly, for a long video without speech to pick them from. */
export function evenWindows(from: number, to: number): { start: number; end: number }[] {
  if (to - from < VIEW.windowSec) return [];
  const count = Math.min(VIEW.windows, Math.floor((to - from) / VIEW.windowSec));
  return Array.from({ length: count }, (_, at) => { const start = round(from + (to - from - VIEW.windowSec) * (at + 0.5) / count, 1); return { start, end: round(start + VIEW.windowSec, 1) }; });
}

/** The middle of a long video, as the transcript the window picker reads (empty for a short one). */
export function middleSentences(sentences: readonly Sentence[], durationSec: number): Sentence[] {
  if (durationSec <= VIEW.wholeUnderSec) return [];
  return sentences.filter(sentence => sentence.start >= VIEW.openingSec && sentence.end <= durationSec - VIEW.closingSec);
}

export interface Shot { index: number; start: number; end: number }

/** Shots between the measured cuts. */
export function shotsOf(cuts: readonly number[], durationSec: number): Shot[] {
  const edges = [0, ...cuts.filter(cut => cut > 0 && cut < durationSec), durationSec];
  return edges.slice(0, -1).flatMap((start, at) => edges[at + 1]! - start > 0.05 ? [{ index: at, start: round(start), end: round(edges[at + 1]!) }] : []);
}

/** The shots inside the watched stretches, at most as many as the sheets hold (spread evenly beyond). */
export function shotsSeen(shots: readonly Shot[], windows: readonly [number, number][]): Shot[] {
  const seen = shots.filter(shot => windows.some(([from, to]) => shot.start < to && shot.end > from));
  const most = VIEW.rowsPerSheet * VIEW.maxSheets;
  return seen.length <= most ? seen : Array.from({ length: most }, (_, at) => seen[Math.floor(at * seen.length / most)]!);
}

/** A sheet row's four times: just before the cut (none for the first shot), the cut, 0.3 s in, the middle. */
export function rowTimes(shot: Shot): (number | null)[] {
  return [shot.index > 0 ? Math.max(0, shot.start - 0.3) : null, shot.start + 0.04, Math.min(shot.end - 0.02, shot.start + 0.3), (shot.start + shot.end) / 2];
}

/** Style frames spread over a video. */
export const styleFrameTimes = (durationSec: number) => Array.from({ length: VIEW.styleFrames }, (_, at) => round(durationSec * (at + 0.5) / VIEW.styleFrames, 1));

export interface Face { t: number; h: number }
export interface ShotFact { shot: number; start: number; end: number; line: string; faceH?: [number, number]; motion?: string; atCut?: string; face?: 'none' }

/** What code can tell about each watched shot: what is said over it, and how the face's size moves (push-ins and punch-ins). */
export function shotFacts(shots: readonly Shot[], all: readonly Shot[], faces: readonly Face[], sentences: readonly Sentence[]): ShotFact[] {
  const heights = (shot: Shot) => faces.filter(face => face.t >= shot.start && face.t <= shot.end).map(face => face.h);
  const lineAt = (t: number) => sentences.find(sentence => t >= sentence.start - 0.2 && t <= sentence.end + 0.2)?.text ?? '';
  return shots.map(shot => {
    const fact: ShotFact = { shot: shot.index, start: shot.start, end: shot.end, line: lineAt((shot.start + shot.end) / 2).slice(0, 120) };
    const hs = heights(shot);
    const before = shot.index > 0 ? all.find(other => other.index === shot.index - 1) : undefined;
    const prev = before ? heights(before) : [];
    if (!hs.length) { fact.face = 'none'; return fact; }
    fact.faceH = [round(hs[0]!, 3), round(hs.at(-1)!, 3)];
    if (hs.length >= 2 && hs.at(-1)! / hs[0]! > 1.12) fact.motion = `face grows ${hs[0]!.toFixed(2)}→${hs.at(-1)!.toFixed(2)} within the shot`;
    else if (hs.length >= 2 && hs[0]! / hs.at(-1)! > 1.12) fact.motion = `face shrinks ${hs[0]!.toFixed(2)}→${hs.at(-1)!.toFixed(2)} within the shot`;
    if (prev.length && hs[0]! / prev.at(-1)! > 1.25) fact.atCut = `face jumps ${prev.at(-1)!.toFixed(2)}→${hs[0]!.toFixed(2)} at the cut`;
    else if (prev.length && prev.at(-1)! / hs[0]! > 1.25) fact.atCut = `face drops ${prev.at(-1)!.toFixed(2)}→${hs[0]!.toFixed(2)} at the cut`;
    return fact;
  });
}

/** Whether music runs under the speech: the level in pauses between words against the level of speech. */
export function musicBed(pausesDb: readonly number[], speechDb: readonly number[]): { pauseLevelDb: number; speechLevelDb: number; reading: string } | null {
  if (pausesDb.length < 5 || speechDb.length < 5) return null;
  const median = (values: readonly number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
  const pause = round(median(pausesDb), 1); const speech = round(median(speechDb), 1);
  return { pauseLevelDb: pause, speechLevelDb: speech, reading: speech - pause < 25 ? 'a bed under the speech: pauses stay within 25 dB of the voice' : 'pauses go quiet: little or no music under the speech' };
}

/** Pause trimming by the silence kept at cuts between words. */
export const pausesOf = (cutGapMs: number | null): 'tight' | 'moderate' | 'natural' | null => cutGapMs === null ? null : cutGapMs <= 250 ? 'tight' : cutGapMs <= 600 ? 'moderate' : 'natural';

/**
 * The frame to show the brand on: the middle of a plain speaker shot (no other text on it, not a missed
 * cut) where the face is the creator's usual size and near the centre. `clean` when the video has no
 * captions either; otherwise the frame is cleaned of them before use.
 */
export function pickPreviewShot(videos: readonly { id: string; log: ShotLog; facts: readonly ShotFact[] }[]): { video: string; t: number; clean: boolean } | null {
  const sizes = videos.flatMap(video => video.facts.flatMap(fact => fact.faceH ? [fact.faceH[0]] : []));
  if (!sizes.length) return null;
  const usual = [...sizes].sort((a, b) => a - b)[Math.floor(sizes.length / 2)]!;
  let best: { video: string; t: number; clean: boolean; score: number } | null = null;
  for (const video of videos) {
    for (const entry of video.log.shots) {
      const fact = video.facts.find(item => item.shot === entry.shot);
      if (entry.picture !== 'host' || entry.text || entry.missedCut || !fact?.faceH || fact.end - fact.start < 1) continue;
      const score = Math.abs(Math.log(fact.faceH[0] / usual)) + (fact.motion || fact.atCut ? 0.3 : 0);
      if (!best || score < best.score) best = { video: video.id, t: round((fact.start + fact.end) / 2, 2), clean: !video.log.captions.present, score };
    }
  }
  if (!best) return null;
  const { score: _score, ...pick } = best;
  return pick;
}

// ── Model step 1: the middle windows of a long video

export function windowsSystemPrompt(): string {
  return `You help extract a video creator's editing style. You get the transcript of the MIDDLE of one of their videos (its opening and ending are watched whole). Not every frame of the middle can be looked at, so pick the stretches most worth watching — where the edit most likely shows the creator's techniques: topic turns and section starts, dense facts and numbers, examples, mentions of specific people, places, products or documents, jokes and emotional peaks, and one or two ordinary stretches for contrast.
Pick up to ${VIEW.windows} windows of about ${VIEW.windowSec} seconds (8–14 s), not overlapping, spread across the middle, on the transcript's own times.
Return only JSON: {"windows":[{"start":<sec>,"end":<sec>,"why":"<short reason>"}]}`;
}

export function parseWindows(raw: string, from: number, to: number): { start: number; end: number; why: string }[] {
  const value = json(raw, 'windows');
  const list = Array.isArray(value.windows) ? value.windows as Record<string, unknown>[] : [];
  const out = list.flatMap(item => {
    const start = Number(item?.start); const end = Number(item?.end);
    if (!(start >= from - 1 && end <= to + 1 && end - start >= 4 && end - start <= 30)) return [];
    return [{ start: round(Math.max(from, start), 1), end: round(Math.min(to, end), 1), why: String(item?.why ?? '').slice(0, 120) }];
  }).sort((a, b) => a.start - b.start).filter((window, at, all) => at === 0 || window.start >= all[at - 1]!.end).slice(0, VIEW.windows);
  if (!out.length) throw new Error('no usable window: each needs start/end inside the middle, 4–30 s long');
  return out;
}

// ── Model step 2: one video's shot log

export const PICTURES = ['host', 'host_pip', 'broll', 'graphic', 'document', 'screenshot', 'meme', 'ai_image', 'title_card', 'split', 'other'] as const;
export const SOURCES = ['own_shoot', 'news_footage', 'web_screenshot', 'document_scan', 'stock', 'motion_graphic', 'ai_generated', 'meme', 'unknown'] as const;

export function shotLogSystemPrompt(): string {
  return `You keep the shot log of one video by a creator whose editing style is being extracted. Record what is there, shot by shot — facts only, no conclusions about their style (a later step reads every shot log and draws those).
You get:
- facts: the watched stretches, and for each watched shot its start/end seconds, the line spoken over it, and face measurements (the face's height share at the shot's start and end; notes when the face grows or shrinks within the shot or jumps at the cut — push-ins and punch-ins);
- shot sheets: one row per watched shot, labelled "shot N start-end", four frames — just before the cut | the cut | 0.3 s in | the shot's middle. The first two show how the shot comes in (a hard cut, or a dissolve, flash, wipe, zoom); the last three show movement inside it. The cut detector misses some cuts: when the middle frame is another shot, say so;
- style frames: full frames spread over the whole video, to read captions and other on-screen text (face, colours, outline, shadow, plate, size, place, highlighting);
- overlay crops: things that stay in one place on the frame, enlarged — a logo, or the platform's watermark.
Frames cannot be heard: say what you cannot judge instead of guessing.

Return only JSON (free text in the video's language):
{"shots":[{"shot":<n>,"picture":"${PICTURES.join('|')}","what":"<what is on screen, one short sentence>","source":"${SOURCES.join('|')}","enter":"hard_cut|dissolve|flash|wipe|zoom|whip|other: …","motion":"none|push_in|pull_out|punch_in|pan|3d_camera|ken_burns|other: …","text":"<on-screen text other than captions, and how it looks; empty if none>","missedCut":<true when the middle frame is another shot>}, … every watched shot …],
 "captions":{"present":true|false,"box":{"frame":<style frame index>,"x":<0-1>,"y":<0-1>,"w":<0-1>,"h":<0-1>} (one caption line's box on a style frame where it is clear),"fill":"#hex","outline":"#hex|none","outlineWeight":"none|thin|medium|heavy","shadow":"none|soft|hard","plate":"#hex|rgba(…)|none","fontLook":"<e.g. rounded sans, medium>","lines":"single|double|varies","charsPerLine":<typical>,"highlight":"<none, or how words are marked and in what colour>","entrance":"<what the frames tell about how lines appear>","notes":"…"},
 "overlayText":[{"kind":"<e.g. opening headline, date label, term card, keyword sticker, chapter title>","look":"<face, colours, outline/plate, size>","where":"<placement>","seenAt":[<shot numbers>]}],
 "overlays":[{"crop":<overlay crop index>,"is":"logo|platform_watermark|other","what":"<what it is>"}],
 "recurring":["<anything else that recurs: picture in picture, end card, frames around footage, colour grade, …>"],
 "cannotJudge":["<what these inputs cannot show>"]}`;
}

export interface ShotLogEntry { shot: number; picture: string; what: string; source: string; enter: string; motion: string; text: string; missedCut?: boolean }
export interface ShotLog {
  video: string;
  shots: ShotLogEntry[];
  captions: Record<string, unknown> & { present: boolean; box?: { frame: number; x: number; y: number; w: number; h: number }; fill?: string };
  overlayText: Record<string, unknown>[];
  overlays: { crop: number; is: 'logo' | 'platform_watermark' | 'other'; what: string }[];
  recurring: string[];
  cannotJudge: string[];
}

export function parseShotLog(raw: string, video: string, shots: readonly number[], styleFrames: number, overlayCrops: number): ShotLog {
  const value = json(raw, 'shot log');
  const known = new Set(shots);
  const entries = (Array.isArray(value.shots) ? value.shots as Record<string, unknown>[] : []).flatMap(item => {
    const shot = Number(item?.shot);
    if (!known.has(shot)) return [];
    const text = (key: string, max = 200) => String(item?.[key] ?? '').trim().slice(0, max);
    return [{ shot, picture: text('picture', 40), what: text('what'), source: text('source', 40), enter: text('enter', 80), motion: text('motion', 80), text: text('text', 300), ...(item?.missedCut === true ? { missedCut: true } : {}) }];
  });
  if (entries.length < Math.min(known.size, 3) || entries.length < known.size * 0.6) throw new Error(`the shot log covers ${entries.length} of ${known.size} watched shots; log every watched shot`);
  const captions = (value.captions && typeof value.captions === 'object' ? value.captions : { present: false }) as ShotLog['captions'];
  if (typeof captions.present !== 'boolean') throw new Error('captions.present must be true or false');
  const box = captions.box as Record<string, unknown> | undefined;
  if (box) {
    const ok = Number.isInteger(box.frame) && (box.frame as number) >= 0 && (box.frame as number) < styleFrames && ['x', 'y', 'w', 'h'].every(key => typeof box[key] === 'number' && (box[key] as number) >= 0 && (box[key] as number) <= 1) && (box.w as number) > 0.02 && (box.h as number) > 0.01;
    if (!ok) delete captions.box;
  }
  if (captions.fill !== undefined && !HEX.test(String(captions.fill))) delete captions.fill;
  const overlays = (Array.isArray(value.overlays) ? value.overlays as Record<string, unknown>[] : []).flatMap(item => {
    const crop = Number(item?.crop);
    const is = item?.is === 'logo' || item?.is === 'platform_watermark' ? item.is : 'other';
    return Number.isInteger(crop) && crop >= 0 && crop < overlayCrops ? [{ crop, is: is as ShotLog['overlays'][number]['is'], what: String(item?.what ?? '').slice(0, 120) }] : [];
  });
  const strings = (key: string) => (Array.isArray(value[key]) ? value[key] as unknown[] : []).map(String).map(item => item.slice(0, 300)).slice(0, 20);
  return { video, shots: entries, captions, overlayText: (Array.isArray(value.overlayText) ? value.overlayText as Record<string, unknown>[] : []).slice(0, 20), overlays, recurring: strings('recurring'), cannotJudge: strings('cannotJudge') };
}

// ── Model step 3: the brand

/** The technique blocks the synthesis writes, with the measured facts each draws on. */
export const SYNTHESIS_TECHNIQUES = ['layout', 'transitions', 'camera', 'graphics', 'illustrations', 'footage', 'sound', 'pacing', 'structure'] as const;
export type SynthesisTechnique = typeof SYNTHESIS_TECHNIQUES[number];

/** The caption presets and fonts the synthesis picks from, as it reads them. */
export function synthesisCatalogs() {
  const presets = CAPTION_PRESETS.map(({ name: _name, ...preset }) => preset);
  const fonts = [{ id: 'sans', look: 'Source Han Sans (default sans)' }, { id: 'serif', look: 'Source Han Serif (default serif)' }, ...WEB_FONTS.map(font => ({ id: `web:${font.id}`, look: `${font.label.en} (${font.label.zh}), ${font.category}` }))];
  const animations = CAPTION_ANIMATIONS.map(item => ({ id: item.id, look: item.hint }));
  return { presets, fonts, animations };
}

export function brandSynthesisSystemPrompt(language: string): string {
  return `Extract only fixed, reusable brand configuration from the supplied measurements, shot logs and images.
Do not write a style description, editing techniques, portrait, B-roll, transition or motion-graphics guidance. B-roll and motion graphics are boolean editing preferences: enable only when supported by the supplied evidence, without writing style prose.
Use only supplied caption preset, font and animation ids. Preserve measured caption geometry. Do not infer raw-recording denoise from finished videos.
Write evidence and gaps in ${language}. Return only JSON:
{"evidence":"what was measured",
"preferences":{"cover":false,"cleanup":false,"pauses":false,"denoise":false,"broll":true|false,"graphics":true|false,"sound":false,"zoom":false,"headlines":true|false},
"captions":{"on":true|false,"preset":"catalog id","font":"catalog id","bold":true|false,"color":"#RRGGBB","stroke":{"color":"#RRGGBB","width":0}|null,"bg":"#RRGGBB or rgba(...) or null","animation":"catalog id","highlight":{"how":"keywords","color":"#RRGGBB"}|null},
"onScreenText":{"font":"catalog id","fontLike":"observed face"},
"logo":null|{"candidate":0,"corner":"top-left|top-right|bottom-left|bottom-right","widthPct":12},
"gaps":["missing measurements"]}
Set cleanup and pauses only when measurements support them. Covers are retained as reference images by the application, never described as abstract style. Unknown settings use conservative defaults; do not invent observations.`;
}

export interface Ref { video: string; shot: number }
export interface TechniqueText { text: string; refs: Ref[] }
export interface BrandSynthesis {
  evidence: string; portrait: string;
  style?: TechniqueText;
  preferences?: BrandPreferences;
  captions: { on: boolean; preset: string; font: string; bold: boolean; color: string; stroke: { color: string; width: number } | null; bg: string | null; animation: CaptionAnimationId; highlight: { how: string; color: string } | null; text: string };
  onScreenText: TechniqueText & { font: string; fontLike: string };
  logo: { candidate: number; corner: Corner; widthPct: number } | null;
  techniques: Record<SynthesisTechnique, TechniqueText>;
  assets: { what: string; refs: Ref[] }[];
  skills: string[];
  cover: { frame: string; design: string };
  gaps: string[];
}

const HEX = /^#[0-9a-f]{6}$/i;
const PLATE = /^(#[0-9a-f]{6}|rgba?\([\d.,\s]+\))$/i;
const CORNERS: readonly Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

/** The brand as the model wrote it, checked against the catalogs and the shots that were logged. */
export function parseBrandSynthesis(raw: string, context: { shots: Record<string, readonly number[]>; logoCandidates: number }): BrandSynthesis {
  const value = json(raw, 'brand');
  const { presets, fonts, animations } = synthesisCatalogs();
  const text = (from: unknown, max = 3000) => (typeof from === 'string' ? from.trim().slice(0, max) : '');
  const refs = (from: unknown): Ref[] => (Array.isArray(from) ? from : []).flatMap(item => {
    const ref = item as { video?: unknown; shot?: unknown };
    const video = String(ref?.video ?? ''); const shot = Number(ref?.shot);
    return context.shots[video]?.includes(shot) ? [{ video, shot }] : [];
  }).slice(0, 12);
  const technique = (from: unknown): TechniqueText => {
    const item = (from ?? {}) as Record<string, unknown>;
    return { text: techniqueProse(item).slice(0, 3600), refs: refs(item.refs) };
  };
  const c = (value.captions ?? {}) as Record<string, unknown>;
  if (typeof c.on !== 'boolean') throw new Error('captions.on must be true or false');
  const preset = presets.some(item => item.id === c.preset) ? String(c.preset) : null;
  const font = fonts.some(item => item.id === c.font) ? String(c.font) : null;
  const animation = animations.some(item => item.id === c.animation) ? c.animation as CaptionAnimationId : null;
  if (c.on && (!preset || !font || !animation)) throw new Error(`captions need a preset, font and animation from the catalogs (got preset ${String(c.preset)}, font ${String(c.font)}, animation ${String(c.animation)})`);
  if (c.on && !HEX.test(String(c.color))) throw new Error('captions.color must be #RRGGBB');
  const stroke = c.stroke && typeof c.stroke === 'object' ? c.stroke as Record<string, unknown> : null;
  const highlight = c.highlight && typeof c.highlight === 'object' ? c.highlight as Record<string, unknown> : null;
  const o = (value.onScreenText ?? {}) as Record<string, unknown>;
  const logo = value.logo && typeof value.logo === 'object' ? value.logo as Record<string, unknown> : null;
  const techniques = Object.fromEntries(SYNTHESIS_TECHNIQUES.map(id => [id, technique((value.techniques as Record<string, unknown> | undefined)?.[id])])) as Record<SynthesisTechnique, TechniqueText>;

  const cover = (value.cover ?? {}) as Record<string, unknown>;

  let preferences: BrandPreferences | undefined;
  if (value.preferences !== undefined) {
    if (!value.preferences || typeof value.preferences !== 'object' || Array.isArray(value.preferences)) throw new Error('preferences must be an object');
    const raw = value.preferences as Record<string, unknown>;
    if (ANALYSIS_PREFERENCE_IDS.some(id => typeof raw[id] !== 'boolean') || raw.cover !== undefined && typeof raw.cover !== 'boolean') throw new Error('every editing preference must be true or false');
    preferences = { ...Object.fromEntries(ANALYSIS_PREFERENCE_IDS.map(id => [id, raw[id]])), ...(typeof raw.cover === 'boolean' ? { cover: raw.cover } : {}) };
  }

  return {
    ...(preferences ? { preferences } : {}),
    evidence: text(value.evidence, 800), portrait: text(value.portrait, 1200),
    captions: {
      on: c.on, preset: preset ?? 'ln-clean', font: font ?? 'sans', bold: c.bold === true, color: HEX.test(String(c.color)) ? String(c.color) : '#ffffff',
      stroke: stroke && HEX.test(String(stroke.color)) && Number(stroke.width) > 0 ? { color: String(stroke.color), width: Math.min(8, Number(stroke.width)) } : null,
      bg: typeof c.bg === 'string' && PLATE.test(c.bg) ? c.bg : null, animation: animation ?? 'none',
      highlight: highlight && HEX.test(String(highlight.color)) ? { how: text(highlight.how, 400), color: String(highlight.color) } : null,
      text: text(c.text, 800),
    },
    onScreenText: { ...technique(o), font: fonts.some(item => item.id === o.font) ? String(o.font) : 'sans', fontLike: text(o.fontLike, 60) },
    logo: logo && Number.isInteger(logo.candidate) && (logo.candidate as number) >= 0 && (logo.candidate as number) < context.logoCandidates
      ? { candidate: logo.candidate as number, corner: CORNERS.includes(logo.corner as Corner) ? logo.corner as Corner : 'top-right', widthPct: Math.min(40, Math.max(3, Number(logo.widthPct) || 12)) }
      : null,
    techniques,
    assets: (Array.isArray(value.assets) ? value.assets as Record<string, unknown>[] : []).flatMap(item => text(item?.what) ? [{ what: text(item.what, 600), refs: refs(item.refs) }] : []).slice(0, 12),
    skills: (Array.isArray(value.skills) ? value.skills : []).filter((id): id is string => (BRAND_EDITING_SKILL_IDS as readonly string[]).includes(id as string)),
    cover: { frame: text(cover.frame, 3000), design: text(cover.design, 3000) },
    gaps: (Array.isArray(value.gaps) ? value.gaps : []).map(item => text(item, 600)).filter(Boolean).slice(0, 20),
  };
}

// ── The brand

/** Font size from the measured letters: CJK ink is about 0.88 of the font size; the engine's line box
 *  sits 0.2 of the font below the glyphs. */
const INK_PER_FONT = 0.88;
const LINE_BELOW_GLYPHS = 0.2;

/** The captions' size and place as the engine draws them, from the letters measured in a caption box. */
export function captionGeometry(box: { x: number; w: number }, ink: { top: number; bottom: number }, heightPerWidth: number): Pick<CaptionStyle, 'scale' | 'xPct' | 'yPct' | 'wPct'> {
  const fontPct = (ink.bottom - ink.top) * 100 / INK_PER_FONT;
  return {
    scale: round(fontPct / 100 * 1080 * heightPerWidth / BASE_CAPTION_FONT_PX),
    xPct: round((box.x + box.w / 2) * 100, 1),
    yPct: round(ink.bottom * 100 + LINE_BELOW_GLYPHS * fontPct, 1),
    wPct: Math.min(94, Math.max(40, Math.round(box.w * 115))),
  };
}

export interface BrandParts {
  id: string; name: string; platform: BrandPlatform; locale: 'zh' | 'en'; account?: string;
  videos: BrandPlaybook['source']['videos'];
  synthesis: BrandSynthesis;
  measured: { lufs: number | null; pauses: 'tight' | 'moderate' | 'natural' | null; captions?: Pick<CaptionStyle, 'scale' | 'xPct' | 'yPct' | 'wPct'> };
  /** Stills for the blocks that cite shots. */
  references: Partial<Record<'overlay_text' | SynthesisTechnique | 'assets' | 'style', BrandAsset[]>>;
  logo?: BrandAsset;
  coverReferences?: string[];
}


export function assembleBrand(parts: BrandParts): BrandPlaybook {
  const s = parts.synthesis;
  const c = s.captions;
  const blocks: BrandBlocks = {
    captions: c.on ? {
      on: true,
      style: {
        preset: c.preset, font: c.font, bold: c.bold, color: c.color, animation: c.animation,
        ...(c.stroke ? { strokeColor: c.stroke.color, strokeWidth: c.stroke.width } : {}),
        ...(c.bg ? { bg: c.bg } : {}),
        ...(c.highlight ? { emphasis: c.highlight.color } : {}),
        ...(parts.measured.captions ?? {}),
      },
      accent: c.highlight ? 'keywords' : null,
    } : { on: false },
    overlay_text: { font: s.onScreenText.font, ...(s.onScreenText.fontLike ? { fontLike: s.onScreenText.fontLike } : {}) },
    ...(s.logo && parts.logo ? { logo: { ...parts.logo, corner: s.logo.corner, widthPct: s.logo.widthPct, opacity: 1 } } : {}),
    sound: { ...(parts.measured.lufs !== null ? { lufs: Math.round(parts.measured.lufs * 2) / 2 } : {}), ...(parts.measured.pauses ? { pauses: parts.measured.pauses } : {}) },
    ...(parts.coverReferences?.length ? { cover: { referenceKeys: [...new Set(parts.coverReferences)].slice(0, 8) } } : {}),
  };
  return fixedBrandConfiguration({
    schema: PLAYBOOK_SCHEMA, id: parts.id, name: parts.name, version: 1, method: METHOD_VERSION,
    source: { platform: parts.platform, ...(parts.account ? { account: parts.account } : {}), videos: parts.videos },
    blocks,
    ...(s.preferences ? { preferences: s.preferences } : {}),
    skills: s.preferences ? brandEditingSkills({ blocks, preferences: s.preferences, skills: s.skills }).filter(id => (BRAND_EDITING_SKILL_IDS as readonly string[]).includes(id)) : BRAND_EDITING_SKILL_IDS.filter(id => s.skills.includes(id)),
    skillId: DEFAULT_BRAND_SKILL_ID,
    notes: { ...(s.evidence ? { evidence: s.evidence } : {}), ...(s.gaps.length ? { gaps: s.gaps } : {}) },
  });
}

function json(raw: string, what: string): Record<string, unknown> {
  try {
    const value = JSON.parse(/\{[\s\S]*\}/.exec(raw)?.[0] ?? raw) as unknown;
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch { /* reported below */ }
  throw new Error(`the ${what} answer is not a JSON object: ${raw.slice(0, 160)}`);
}
