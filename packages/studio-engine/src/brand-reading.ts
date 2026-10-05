import { BLOCK_GUIDE, NOT_BRAND, PROSE_BLOCKS, WINDOWS, type BlockGuide } from './brand-method';
import type { BlockId } from './brand-playbook';

/**
 * The method's judgement steps, with their contracts: a text model picks the moments of each video
 * worth a close look from its transcript; a vision model reads each video (overview, opening, ending
 * and those moments) block by block; a synthesis keeps what recurs and writes the brand's prose blocks;
 * the cover block is written apart, from the creator's covers. Readings are evidence and parse
 * leniently; the synthesis and the cover apply the evidence bar in code.
 */

/**
 * Closed-vocabulary judgements per video. The vocabulary and its definitions were chosen by evaluating
 * reading prompts on 50 archived creator videos against per-video reference labels. "unknown"
 * parses to null.
 */
export const STYLE_FACETS = {
  layout: ['full_frame_host', 'split_screen', 'pip_host', 'pip_source', 'greenscreen_composite', 'template_frame', 'first_person', 'host_absent'],
  camera: ['tripod', 'handheld', 'multicam', 'webcam'],
  cuttingDevice: ['long_take', 'same_size_jumpcut', 'punchin_alternation', 'multicam_switch', 'broll_cover'],
  punchIn: ['none', 'two_sizes', 'three_plus', 'on_emphasis'],
  captionPresence: ['on', 'off'],
  captionStyle: ['word_pop', 'chunk', 'full_line', 'keyword_callouts', 'none'],
  fontClass: ['heavy_sans', 'rounded_sans', 'condensed_sans', 'serif', 'handwritten', 'monospace', 'platform_native', 'none'],
  captionCase: ['upper', 'sentence', 'lower', 'none'],
  captionTreatment: ['stroke', 'shadow', 'box', 'plain', 'none'],
  captionPosition: ['upper_third', 'center', 'lower_third', 'none'],
  accentRule: ['none', 'current_word', 'keywords', 'numbers_money', 'speaker'],
  captionAnimation: ['none', 'pop_scale', 'bounce', 'fade', 'typewriter', 'word_reveal'],
  emoji: ['none', 'occasional', 'frequent'],
  heldHeader: ['yes', 'no'],
  hookLabel: ['yes', 'no'],
  colorGrade: ['natural', 'warm', 'cool', 'high_contrast', 'muted', 'bright_high_key'],
  hookStructure: ['cold_statement', 'question', 'text_hook_card', 'broll_montage', 'result_first', 'in_media_res', 'source_clip_first'],
} as const;
export const STYLE_FACET_LISTS = {
  callouts: ['arrows', 'circles', 'highlight_boxes', 'zoomed_screenshots', 'articles_or_tweets', 'charts', 'memes_or_gifs', 'stickers', 'progress_bar', 'chapter_cards', 'lower_thirds', 'price_or_spec_tags'],
  brollTypes: ['user_footage', 'product_macro', 'screen_recording', 'screenshot_article', 'stock', 'archival_news', 'ai_image', 'meme_gif', 'map_3d', 'animation'],
  brandElements: ['logo_bug', 'intro_sting', 'end_card', 'series_label'],
} as const;
export type StyleFacetKey = keyof typeof STYLE_FACETS;
export type StyleFacetListKey = keyof typeof STYLE_FACET_LISTS;
export type VideoStyleFacets = { [K in StyleFacetKey]: typeof STYLE_FACETS[K][number] | null } & { [K in StyleFacetListKey]: typeof STYLE_FACET_LISTS[K][number][] };

/** Lenient on facets only: an out-of-vocabulary value blanks that facet, it never fails the reading. */
export function parseStyleFacets(value: unknown): VideoStyleFacets {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const out: Record<string, unknown> = {};
  for (const [key, options] of Object.entries(STYLE_FACETS)) out[key] = (options as readonly string[]).includes(raw[key] as string) ? raw[key] : null;
  for (const [key, options] of Object.entries(STYLE_FACET_LISTS)) {
    const list = raw[key];
    out[key] = Array.isArray(list) ? [...new Set(list.filter(item => (options as readonly string[]).includes(item as string)))] : [];
  }
  return out as VideoStyleFacets;
}

/** Facet definitions as evaluated (reading prompt v1, part 2). */
const FACET_GUIDE = `How to tell captions from other text: CAPTIONS are burned-in text that follows the speech — it changes every second or two and shows the words being said. A HEADER is text that stays on screen, unchanged, for most of the video (a title band, a series label). A HOOK LABEL is text shown only in the first seconds. Text on signs, packaging, screens, clothes or in source footage is SCENE TEXT and is none of these.
- layout — check in this order, the first that fits: host_absent (in most cells there is no host face) | first_person (mostly the host's hands / point of view) | split_screen (host in one part, other footage in another, for much of the video) | pip_host (a small window of the host over full-frame footage) | pip_source (a small window of other footage over the host) | greenscreen_composite (host cut out over changing backgrounds while staying in place) | template_frame (a fixed graphic frame with a camera box) | full_frame_host (otherwise; stitch videos that play a source clip full screen and then cut to the host are full_frame_host).
- camera: tripod | handheld | multicam (two or more distinct camera positions) | webcam.
- cuttingDevice: long_take | same_size_jumpcut (cuts inside a talking shot keep the framing) | punchin_alternation (talking shots alternate framing sizes of the same angle) | multicam_switch | broll_cover (talking mostly covered by footage).
- punchIn: none | two_sizes | three_plus | on_emphasis. From the cut strips: a punch-in is the same angle and background, only bigger.
- captionPresence: on | off. When off, the caption facets below are "none".
- captionStyle: word_pop | chunk (1–4 words) | full_line | keyword_callouts. fontClass: heavy_sans | rounded_sans | condensed_sans | serif | handwritten | monospace | platform_native (the app's own plain text, often a rounded box or thin shadow). captionCase: upper | sentence | lower. captionTreatment: stroke | shadow | box | plain. captionPosition: upper_third | center | lower_third. accentRule: none | current_word | keywords | numbers_money | speaker (each speaker's own colour). captionAnimation (from caption-change strips): none | pop_scale | bounce | fade | typewriter | word_reveal; unknown when no strip shows a change.
- emoji: none | occasional | frequent. heldHeader: yes | no. hookLabel: yes | no.
- callouts (list): arrows | circles | highlight_boxes | zoomed_screenshots | articles_or_tweets | charts | memes_or_gifs | stickers | progress_bar | chapter_cards | lower_thirds | price_or_spec_tags.
- brollTypes (list): user_footage | product_macro | screen_recording | screenshot_article | stock | archival_news | ai_image | meme_gif | map_3d | animation.
- brandElements (list): logo_bug | intro_sting | end_card | series_label.
- colorGrade: natural | warm | cool | high_contrast | muted | bright_high_key.
- hookStructure (first 3 s): cold_statement | question | text_hook_card | broll_montage | result_first | in_media_res | source_clip_first.`;

// ── Step 1: moments worth a close look, from the transcript

export function momentsSystemPrompt(): string {
  return `You read the transcript of a short talking-head video and pick the moments where an editor in this genre most likely added something on screen or in the cut: a motion graphic (a number, a list, a comparison, a chart, a named product, place or person), B-roll or a cutaway, a punch-in on a punchline or key claim, or a transition at a turn to a new point.
Each line is "<line index> @<start seconds>s: <text>". Pick the ${WINDOWS.moments} moments most likely to carry one, spread over the video, never in its first ${WINDOWS.openingSec} seconds or last ${WINDOWS.closingSec} seconds (those are looked at anyway), at least ${WINDOWS.momentSec} seconds apart. Pick fewer only when the middle of the video has no room for more.
Return only JSON: {"moments":[{"line":<line index>,"why":"<a few words>"}]}`;
}

export interface Moment { startSec: number; endSec: number; why: string }

/** Moments as windows around the picked lines' starts; picks outside the video's middle are dropped. */
export function parseMoments(raw: string, lines: { index: number; startSec: number }[], durationSec: number): Moment[] {
  const value = json(raw);
  const middle = (t: number) => t >= WINDOWS.openingSec && t <= durationSec - WINDOWS.closingSec;
  const picked = (Array.isArray(value.moments) ? value.moments : []).flatMap(entry => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const line = lines.find(row => row.index === item.line);
    if (!line || !middle(line.startSec)) return [];
    const startSec = Math.max(0, line.startSec - 0.5);
    return [{ startSec, endSec: Math.min(durationSec, startSec + WINDOWS.momentSec), why: optionalText(item.why, 120) ?? '' }];
  });
  return picked.sort((a, b) => a.startSec - b.startSec).filter((moment, at, all) => at === 0 || moment.startSec >= all[at - 1]!.endSec).slice(0, WINDOWS.moments);
}

// ── Step 2: reading one video

const blockLines = (kinds: BlockGuide['kind'][]) => BLOCK_GUIDE.filter(item => kinds.includes(item.kind)).map(item => `- ${item.id}: ${item.look}${item.pitfalls ? ` Beware: ${item.pitfalls}` : ''}`).join('\n');
const READ_NOTES: BlockId[] = ['layout', 'editing', 'motion_graphics', 'structure'];

export function readingSystemPrompt(): string {
  return `You study ONE video by a creator, as part of extracting their style. Everything you report must be visible in the images; when you cannot see it, answer "unknown" or leave it out — never guess.

What you get:
- an overview grid: frames spread over the whole video, the time and the caption read at that moment under each cell;
- an opening strip and an ending strip: frames close together over the first and last seconds;
- moment strips: frames close together around moments the speech made likely to carry a graphic, a cutaway, a punch-in or a transition, each with the words spoken there;
- measured facts, including rough automatic guesses (layoutGuess, cutDevice, hostOnScreen) that often fail on composites and multi-camera footage: confirm or correct them from the frames.

Report:
1. portrait — one English sentence on this video's look and pace.
2. facets — one value per key from the options, or "unknown".
${FACET_GUIDE}
3. moments — for each moment strip, in order: what happens on screen there (any of: motion_graphic, broll, punch_in, transition, sticker, nothing) and a short description of how it looks and moves.
4. notes — what this video shows for each block, in English, concrete enough to recreate (positions, colours as #RRGGBB, type character, motion, timing, real words of titles); leave a block out when the video shows nothing for it:
${blockLines(['prose'])}
5. look — captionFill and captionOutline (#RRGGBB, when captions show), palette (up to 4 #RRGGBB colours of the creator's own text and graphics).

Return only JSON:
{"portrait":"…","facets":{"layout":"…","camera":"…","cuttingDevice":"…","punchIn":"…","captionPresence":"…","captionStyle":"…","fontClass":"…","captionCase":"…","captionTreatment":"…","captionPosition":"…","accentRule":"…","captionAnimation":"…","emoji":"…","heldHeader":"…","hookLabel":"…","callouts":[],"brollTypes":[],"brandElements":[],"colorGrade":"…","hookStructure":"…"},
 "moments":[{"seen":["…"],"how":"…"}],
 "notes":{"layout":"…","editing":"…","motion_graphics":"…","structure":"…"},
 "look":{"captionFill":"#…","captionOutline":"#…","palette":["#…"]}}`;
}

// ── Parsing

function fail(path: string, value: unknown): never { throw new Error(`品牌提取输出不符合约定：${path} = ${JSON.stringify(value)?.slice(0, 160)}`); }
function json(raw: string): Record<string, unknown> {
  try { return JSON.parse(/\{[\s\S]*\}/.exec(raw)?.[0] ?? raw) as Record<string, unknown>; } catch { return fail('json', raw.slice(0, 200)); }
}
const HEX = /^#[0-9a-f]{6}$/i;
const text = (value: unknown, path: string, max = 600) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : fail(path, value);
const optionalText = (value: unknown, max = 1200) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
const hex = (value: unknown) => typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : undefined;

export const SEEN = ['motion_graphic', 'broll', 'punch_in', 'transition', 'sticker', 'nothing'] as const;
export type Seen = typeof SEEN[number];

export interface VideoReading {
  video: string;
  portrait: string;
  facets: VideoStyleFacets;
  /** Per moment strip, in the order given. */
  moments: { seen: Seen[]; how?: string }[];
  notes: Partial<Record<BlockId, string>>;
  look: { captionFill?: string; captionOutline?: string; palette: string[] };
  /** Names the reading used outside the vocabulary, kept visible, not used. */
  unread?: string[];
}

/** A reading is evidence, not the contract: names outside the vocabulary are set aside (listed in
 *  `unread`), missing or malformed parts are left out, and only an answer that is not JSON fails. */
export function parseVideoReading(raw: string, video: string, momentCount: number): VideoReading {
  const value = json(raw);
  const unread: string[] = [];
  const moments = (Array.isArray(value.moments) ? value.moments : []).slice(0, momentCount).map(entry => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const seen = (Array.isArray(item.seen) ? item.seen : []).flatMap(name => { if (SEEN.includes(name as Seen)) return [name as Seen]; unread.push(String(name)); return []; });
    const how = optionalText(item.how, 400);
    return { seen: [...new Set(seen)], ...(how ? { how } : {}) };
  });
  const rawNotes = (value.notes ?? {}) as Record<string, unknown>;
  const notes = Object.fromEntries(READ_NOTES.flatMap(id => { const note = optionalText(rawNotes[id]); return note ? [[id, note]] : []; })) as VideoReading['notes'];
  const look = (value.look ?? {}) as Record<string, unknown>;
  return {
    video, portrait: optionalText(value.portrait, 600) ?? '', facets: parseStyleFacets(value.facets), moments, notes,
    look: {
      ...(hex(look.captionFill) ? { captionFill: hex(look.captionFill) } : {}), ...(hex(look.captionOutline) ? { captionOutline: hex(look.captionOutline) } : {}),
      palette: (Array.isArray(look.palette) ? look.palette : []).flatMap(item => hex(item) ? [hex(item)!] : []).slice(0, 4),
    },
    ...(unread.length ? { unread } : {}),
  };
}

// ── Step 3: synthesis

export function synthesisSystemPrompt(language: string): string {
  return `You write a creator's brand — the prompt an editor and a designer will follow to make new videos exactly in this creator's style — from readings of several of their videos and measurements of all of them.

Keep only what recurs: a habit must be seen in at least two videos, the same way. Something seen in one video, or the topic of a video, is not style.
How often something happens in one video depends on its content: describe the moments a habit serves and how much restraint the creator shows, never a rate, an interval or a count.
Describe habits as tendencies the readings support ("mostly", "rarely", "on numbers"). Five videos never prove a prohibition: when a technique was not seen, say it was not seen in these videos; never forbid it.
Measured facts come from every frame and the soundtrack; never contradict them.
Never put these in the brand: ${NOT_BRAND.join('; ')}.
The platform can punch in, transition, cut to B-roll, add stickers, sound effects and motion graphics for every brand; a block says how THIS creator uses them, not whether they exist.

Blocks to write (each as prose a model can follow, concrete: positions, colours as #RRGGBB, type character, motion, timing, real examples):
${blockLines(['prose'])}
- sound: only what frames show about music or sound effects; leave out when nothing does.

Write every block in ${language}. A block the videos give no recurring evidence for is left out.
Return only JSON:
{"blocks":{"<block id>":{"text":"…","videos":["<video ids where it holds>"]}},
 "palette":{"accent":"#…","accent2":"#…","text":"#…","ground":"#…"} (each optional)}
Block ids, used exactly as written: ${[...PROSE_BLOCKS, 'sound'].join(', ')}. The portrait is two to four sentences; other blocks as long as they need, without repeating each other.`;
}

export type SynthesisBlockId = (typeof PROSE_BLOCKS)[number] | 'sound';
export interface Synthesis {
  blocks: Partial<Record<SynthesisBlockId, { text: string; videos: string[] }>>;
  palette: { accent?: string; accent2?: string; text?: string; ground?: string };
  /** Blocks the evidence bar removed, with why — kept visible, never used. */
  setAside: string[];
  /** Blocks kept without any video cited for them (no evidence to show). */
  uncited: string[];
}

/**
 * The synthesis checked against the method. A block may come as text or as {text, videos}. A block the
 * answer itself places in fewer than two real videos (with three or more) is set aside with the reason;
 * a block with no videos cited is kept and listed as uncited; unknown block ids are set aside. Only an
 * answer that is not JSON, or has no portrait, fails.
 */
export function parseSynthesis(raw: string, videos: { id: string }[]): Synthesis {
  const value = json(raw);
  const ids = new Set(videos.map(video => video.id));
  const need = videos.length >= 3 ? 2 : 1;
  const setAside: string[] = []; const uncited: string[] = [];
  const allowed = [...PROSE_BLOCKS, 'sound'] as SynthesisBlockId[];
  const rawBlocks = (value.blocks ?? {}) as Record<string, unknown>;
  const blocks: Synthesis['blocks'] = {};
  for (const [id, entry] of Object.entries(rawBlocks)) {
    if (!allowed.includes(id as SynthesisBlockId)) { setAside.push(`${id}: not a block`); continue; }
    const item = (typeof entry === 'string' ? { text: entry } : entry ?? {}) as Record<string, unknown>;
    const words = optionalText(item.text, 4000);
    if (!words) { setAside.push(`${id}: no text`); continue; }
    const cited = Array.isArray(item.videos) ? item.videos : [];
    const seen = [...new Set(cited.filter((video): video is string => ids.has(video as string)))];
    if (id !== 'portrait' && cited.length && seen.length < need) { setAside.push(`${id}: seen in ${seen.length} video(s)`); continue; }
    if (id !== 'portrait' && !cited.length) uncited.push(id);
    blocks[id as SynthesisBlockId] = { text: words, videos: seen };
  }
  if (!blocks.portrait) text(undefined, 'blocks.portrait');
  const palette = (value.palette ?? {}) as Record<string, unknown>;
  return { blocks, palette: Object.fromEntries((['accent', 'accent2', 'text', 'ground'] as const).flatMap(key => hex(palette[key]) ? [[key, hex(palette[key])]] : [])), setAside, uncited };
}

// ── The cover, from the creator's covers

/** The cover prompt for new videos, written from the creator's past covers (the images given). */
export function coverSystemPrompt(language: string): string {
  return `You study a creator's past video covers to write the prompt that will make the cover of each NEW video of theirs in the same style. The prompt has three parts, used one after the other:

frame — how to choose, from the new video's footage, the still the cover is built on: the person's expression, gesture, gaze and pose, how close the shot is, who is in it when there are several people, what the moment should say. When the covers are not built on a still of the video (a designed graphic, a product shot, a cut-out on a plain ground), say what the cover is built on instead.

headline — how the words on the cover are written, for a writer who will word the next one from what the new video says: how many lines (a main line, a second line, a small label) and how long each is; the structure (a question, a bold claim, a number or result, a series name with an episode number, a quote); the voice, punctuation and emphasis marks; how it hooks (curiosity, conflict, a promise of use). Quote two to four real headlines from the covers as examples. When the covers carry no words, leave it empty.

design — how the still and the headline become the cover: crop, where the person sits and how large; what happens to the background (kept, darkened, blurred, replaced, a colour, a scene from the topic); how the headline is lettered (type character, weight, colours as #RRGGBB, stroke, shadow or plate, size, position); other marks (logo, arrows, circles, emoji, borders, series or episode labels); the finish (contrast, saturation, glow). When the covers are plain stills with nothing added, say so: that is the style.

Keep only what recurs: with three or more covers, a habit must hold in at least two. When the covers follow two styles, describe the main one and name the other in one sentence.
Write as instructions to a designer who has never seen these covers, concrete enough to recreate them, without naming the people in them.
Write every part in ${language}.
Return only JSON: {"frame":"…","headline":"…","design":"…","covers":[<indices of the covers the design holds for, from 0>]}`;
}

export interface CoverReading { frame: string; headline?: string; design: string; covers: number[] }

/** The cover prompt checked against the evidence bar: with three or more covers it must hold in two;
 *  `null` when it does not (the brand then has no cover prompt, only its references). */
export function parseCover(raw: string, coverCount: number): CoverReading | null {
  const value = json(raw);
  const frame = text(value.frame, 'frame', 2000);
  const design = text(value.design, 'design', 3000);
  const headline = optionalText(value.headline, 2000);
  const covers = [...new Set((Array.isArray(value.covers) ? value.covers : []).filter((at): at is number => Number.isInteger(at) && (at as number) >= 0 && (at as number) < coverCount))].sort((a, b) => a - b);
  if (coverCount >= 3 && covers.length < 2) return null;
  return { frame, ...(headline ? { headline } : {}), design, covers };
}

/** Picking, among stills of a new video, the one its cover is built on, by the brand's cover prompt. */
export function coverFrameSystemPrompt(): string {
  return `You pick the still of a video that its cover will be built on, the way the creator picks it (their rule is given). Prefer a still where the face is sharp, the eyes are open and the mouth is not caught mid-word, unless the rule asks otherwise.
Return only JSON: {"pick":<index of the still>}`;
}

export function parseCoverFrame(raw: string, count: number): number {
  const pick = json(raw).pick;
  return Number.isInteger(pick) && (pick as number) >= 0 && (pick as number) < count ? pick as number : fail('pick', pick);
}

/** Writing the headline of a new video's cover from what it says, the way the creator's covers word theirs. */
export function coverHeadlineSystemPrompt(): string {
  return `You write the headline lettered on the cover of a creator's new video, the way their covers word headlines (their rule is given, with real examples). Write it from what this video actually says, in the language it is spoken in; follow the rule's number of lines, length, structure, voice and punctuation; never promise what the video does not deliver and never copy an example's words.
Write one headline, the best one; do not offer alternatives.
Return only JSON: {"lines":["<first line>", "<next line, only when the rule uses more lines>"]}`;
}

/** The headline's lines, in order (one to three, each short enough to letter). */
export function parseCoverHeadline(raw: string): string[] {
  const value = json(raw).lines;
  const lines = (Array.isArray(value) ? value : []).flatMap(line => typeof line === 'string' && line.trim() ? [line.trim()] : []);
  if (!lines.length || lines.length > 3 || lines.some(line => line.length > 40)) fail('lines', value);
  return lines;
}
