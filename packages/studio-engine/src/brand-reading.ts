import { LIVE_DIMENSIONS, NOT_BRAND } from './brand-method';
import { MOVE_KINDS, MOVE_VARIANTS, type Frequency, type MoveKind } from './brand-playbook';

/**
 * A's two judgement steps, with their contracts: a vision model reads each video (what it can see
 * that measurement cannot), then a synthesis keeps only what recurs and writes the playbook's
 * judged sections. Both prompts are built from the method's dimension table; the outputs are parsed
 * strictly — anything off-contract fails with the field, never patched.
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

/** The moves A can find from frames, with what to look for and the variant names to use. */
const liveMoves = () => LIVE_DIMENSIONS.filter(item => item.section === 'moves' && item.move).map(item => item.move!);
function moveGuide(): string {
  return LIVE_DIMENSIONS.filter(item => item.section === 'moves' && item.move).map(item =>
    `- ${item.move}: ${item.look}${item.pitfalls ? ` Beware: ${item.pitfalls}` : ''} Variants: ${MOVE_VARIANTS[item.move!].join(' | ')}.`).join('\n');
}

export function readingSystemPrompt(): string {
  return `You study ONE video by a creator, as part of extracting their editing style. Everything you report must be visible in the images; when you cannot see it, answer "unknown" or leave the list empty — never guess.

What you get:
- grids: frames every 2 s, with the time and the caption read at that moment under each cell.
- caption-change strips: 10 frames over 2 s around a caption change.
- cut strips: 9 frames 0.1 s apart around one cut.
- measured facts, including rough automatic guesses (layoutGuess, cutDevice, hostOnScreen) that often fail on composites and multi-camera footage: confirm or correct them from the frames.

Report:
1. portrait — one English sentence on this video's look and pace.
2. facets — one value per key from the options, or "unknown".
${FACET_GUIDE}
3. moves — each of these moves you can see in this video (leave out the ones you cannot):
${moveGuide()}
   For each: the variants seen (names from its list), the seconds where it happens, and the kind of moment it lands on, in English (e.g. "the punchline", "naming a product", "a new topic", "a number").
4. opening and closing — how this video opens and how it ends, in English; quote a sign-off line when it shows as text.
5. look — captionFill and captionOutline (#RRGGBB, when captions show), palette (up to 4 #RRGGBB colours the creator's own text and graphics use, not the set or clothes), elements (look and motion of titles, cards and graphics the creator adds, in English), cover (composition and lettering, when a cover image is given).

Return only JSON:
{"portrait":"…","facets":{"layout":"…","camera":"…","cuttingDevice":"…","punchIn":"…","captionPresence":"…","captionStyle":"…","fontClass":"…","captionCase":"…","captionTreatment":"…","captionPosition":"…","accentRule":"…","captionAnimation":"…","emoji":"…","heldHeader":"…","hookLabel":"…","callouts":[],"brollTypes":[],"brandElements":[],"colorGrade":"…","hookStructure":"…"},
 "moves":[{"kind":"…","variants":["…"],"times":[<seconds>],"on":"…"}],
 "opening":"…","closing":"…",
 "look":{"captionFill":"#…","captionOutline":"#…","palette":["#…"],"elements":"…","cover":"…"}}`;
}

export function synthesisSystemPrompt(language: string): string {
  const structure = LIVE_DIMENSIONS.filter(item => item.section === 'structure' || item.section === 'generation').map(item => `- ${item.id}: ${item.look}${item.pitfalls ? ` ${item.pitfalls}` : ''}`).join('\n');
  return `You write a creator's editing playbook from readings of several of their videos and measurements of all of them. An editor will cut new videos from this playbook the way this creator does.

Keep only what recurs: a move, rule or habit must be seen in at least two videos, the same way. Something seen in one video, or the topic of a video, is not style.
How often a move happens in one video depends on that video's content. Give each move a frequency level — rare (a few times in a whole video), moderate (about once or twice a minute), frequent (several times a minute) — and its trigger: the kind of moment it lands on. Never an interval or a count.
Measured facts come from every frame and the soundtrack; never contradict them.
Never put these in the playbook: ${NOT_BRAND.join('; ')}.

Moves — only these kinds, with these variant names:
${moveGuide()}
Structure and generated material:
${structure}

Write "text" in ${language} for the creator to read, and "en" as an English instruction an editor can follow.
Return only JSON:
{"portrait":{"text":"…","en":"…"},
 "moves":[{"kind":"…","variants":["…"],"frequency":"rare|moderate|frequent","trigger":{"text":"…","en":"…"},"videos":["<video ids>"],"evidence":[{"video":"<id>","sec":<seconds>}]}],
 "opening":{"text":"…","en":"…","videos":["…"]} or null,
 "closing":{"text":"…","en":"…","videos":["…"]} or null,
 "structure":[{"text":"…","en":"…","videos":["…"]}],
 "palette":{"accent":"#…","accent2":"#…","text":"#…","ground":"#…"} (each optional),
 "cover":{"layout":{"text":"…","en":"…"},"lettering":{"text":"…","en":"…"}} or null,
 "headlines":{"text":"…","en":"…"} or null,
 "elements":[{"text":"…","en":"…","videos":["…"]}]}
At most one entry per move kind; at most 8 structure rules and 6 element rules.`;
}

// ── Parsing

function fail(path: string, value: unknown): never { throw new Error(`品牌提取输出不符合约定：${path} = ${JSON.stringify(value)?.slice(0, 160)}`); }
function json(raw: string): Record<string, unknown> {
  try { return JSON.parse(/\{[\s\S]*\}/.exec(raw)?.[0] ?? raw) as Record<string, unknown>; } catch { return fail('json', raw.slice(0, 200)); }
}
const HEX = /^#[0-9a-f]{6}$/i;
const text = (value: unknown, path: string, max = 600) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : fail(path, value);
const optionalText = (value: unknown, max = 600) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined;
const hex = (value: unknown) => typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : undefined;
const list = (value: unknown, path: string) => Array.isArray(value) ? value : value == null ? [] : fail(path, value);

export interface VideoReading {
  video: string;
  portrait: string;
  facets: VideoStyleFacets;
  moves: { kind: MoveKind; variants: string[]; times: number[]; on: string }[];
  opening?: string; closing?: string;
  look: { captionFill?: string; captionOutline?: string; palette: string[]; elements?: string; cover?: string };
}

export function parseVideoReading(raw: string, video: string, durationSec: number): VideoReading {
  const value = json(raw);
  const live = liveMoves();
  const moves = list(value.moves, 'moves').map((entry, index) => {
    const move = (entry ?? {}) as Record<string, unknown>;
    const kind = move.kind as MoveKind;
    if (!live.includes(kind)) fail(`moves.${index}.kind`, move.kind);
    const variants = list(move.variants, `moves.${index}.variants`).map((variant, at) => MOVE_VARIANTS[kind].includes(variant as string) ? variant as string : fail(`moves.${index}.variants.${at}`, variant));
    const times = list(move.times, `moves.${index}.times`).map((t, at) => typeof t === 'number' && t >= 0 && t <= durationSec + 0.5 ? Math.round(t * 10) / 10 : fail(`moves.${index}.times.${at}`, t));
    return { kind, variants, times, on: text(move.on, `moves.${index}.on`, 300) };
  });
  const look = (value.look ?? {}) as Record<string, unknown>;
  return {
    video, portrait: text(value.portrait, 'portrait'), facets: parseStyleFacets(value.facets), moves,
    ...(optionalText(value.opening) ? { opening: optionalText(value.opening) } : {}), ...(optionalText(value.closing) ? { closing: optionalText(value.closing) } : {}),
    look: {
      ...(hex(look.captionFill) ? { captionFill: hex(look.captionFill) } : {}), ...(hex(look.captionOutline) ? { captionOutline: hex(look.captionOutline) } : {}),
      palette: list(look.palette, 'look.palette').flatMap(item => hex(item) ? [hex(item)!] : []).slice(0, 4),
      ...(optionalText(look.elements) ? { elements: optionalText(look.elements) } : {}), ...(optionalText(look.cover) ? { cover: optionalText(look.cover) } : {}),
    },
  };
}

interface Said { text: string; en: string }
export interface Synthesis {
  portrait: Said;
  moves: { kind: MoveKind; variants: string[]; frequency: Frequency; trigger: Said; videos: string[]; evidence: { video: string; sec: number }[] }[];
  opening: (Said & { videos: string[] }) | null;
  closing: (Said & { videos: string[] }) | null;
  structure: (Said & { videos: string[] })[];
  palette: { accent?: string; accent2?: string; text?: string; ground?: string };
  cover: { layout: Said; lettering: Said } | null;
  headlines: Said | null;
  elements: (Said & { videos: string[] })[];
}

/** The synthesis must keep to recurring evidence: every video id and time it cites is real, and with three
 *  or more videos a move or rule holds in at least two. */
export function parseSynthesis(raw: string, videos: { id: string; durationSec: number }[]): Synthesis {
  const value = json(raw);
  const ids = new Set(videos.map(video => video.id));
  const need = videos.length >= 3 ? 2 : 1;
  const said = (entry: unknown, path: string): Said => { const item = (entry ?? {}) as Record<string, unknown>; return { text: text(item.text, `${path}.text`), en: text(item.en, `${path}.en`) }; };
  const cited = (entry: unknown, path: string) => {
    const seen = list((entry as Record<string, unknown>)?.videos, `${path}.videos`).map((id, at) => ids.has(id as string) ? id as string : fail(`${path}.videos.${at}`, id));
    if (new Set(seen).size < need) fail(`${path}.videos`, seen);
    return [...new Set(seen)];
  };
  const live = liveMoves();
  const kinds = new Set<string>();
  const moves = list(value.moves, 'moves').map((entry, index) => {
    const move = (entry ?? {}) as Record<string, unknown>; const path = `moves.${index}`;
    const kind = move.kind as MoveKind;
    if (!live.includes(kind) || kinds.has(kind)) fail(`${path}.kind`, move.kind);
    kinds.add(kind);
    const variants = list(move.variants, `${path}.variants`).map((variant, at) => MOVE_VARIANTS[kind].includes(variant as string) ? variant as string : fail(`${path}.variants.${at}`, variant));
    if (!variants.length) fail(`${path}.variants`, variants);
    if (!['rare', 'moderate', 'frequent'].includes(move.frequency as string)) fail(`${path}.frequency`, move.frequency);
    const evidence = list(move.evidence, `${path}.evidence`).map((ref, at) => {
      const item = (ref ?? {}) as Record<string, unknown>; const video = videos.find(v => v.id === item.video);
      return video && typeof item.sec === 'number' && item.sec >= 0 && item.sec <= video.durationSec + 0.5 ? { video: video.id, sec: Math.round(item.sec * 10) / 10 } : fail(`${path}.evidence.${at}`, ref);
    });
    return { kind, variants: [...new Set(variants)], frequency: move.frequency as Frequency, trigger: said(move.trigger, `${path}.trigger`), videos: cited(move, path), evidence };
  });
  const rule = (entry: unknown, path: string) => entry == null ? null : { ...said(entry, path), videos: cited(entry, path) };
  const palette = (value.palette ?? {}) as Record<string, unknown>;
  const cover = value.cover as Record<string, unknown> | null | undefined;
  return {
    portrait: said(value.portrait, 'portrait'), moves,
    opening: rule(value.opening, 'opening'), closing: rule(value.closing, 'closing'),
    structure: list(value.structure, 'structure').slice(0, 8).map((entry, index) => rule(entry, `structure.${index}`)!),
    palette: Object.fromEntries((['accent', 'accent2', 'text', 'ground'] as const).flatMap(key => hex(palette[key]) ? [[key, hex(palette[key])]] : [])),
    cover: cover ? { layout: said(cover.layout, 'cover.layout'), lettering: said(cover.lettering, 'cover.lettering') } : null,
    headlines: value.headlines ? said(value.headlines, 'headlines') : null,
    elements: list(value.elements, 'elements').slice(0, 6).map((entry, index) => rule(entry, `elements.${index}`)!),
  };
}

export { MOVE_KINDS };
