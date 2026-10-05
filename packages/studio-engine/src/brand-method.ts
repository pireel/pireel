import type { BlockId } from './brand-playbook';

/**
 * The method for extracting a creator's brand (one prompt of XML blocks, brand-playbook.ts) from their
 * published videos, distilled from two studies of top talking-head creators (TikTok / YouTube: 100
 * creators, 960 videos; Douyin / Bilibili: 85 creators, 369 videos).
 *
 * How a video is looked at: the opening and the ending always; in between, the moments the speech says
 * are likely to carry a motion graphic, a transition, B-roll or a punch-in (numbers, lists, comparisons,
 * named things, turns, punchlines) — found from the transcript, never at random — plus one overview grid.
 *
 * The block table below is the single source the reading and synthesis prompts follow: which blocks are
 * fixed values (measured, applied by the engine) and which are prose for the models, what to look for,
 * and what goes wrong. Raise METHOD_VERSION whenever a row, a tool or a prompt changes; every brand
 * records the version that made it.
 */
export const METHOD_VERSION = 'brand-method-4';

export interface BlockGuide {
  id: BlockId;
  /** Fixed: values measured and applied by the engine. Prose: written for the models. */
  kind: 'fixed' | 'prose';
  /** What to look for — the text the reading and synthesis prompts carry. */
  look: string;
  /** Known false readings to guard against. */
  pitfalls?: string;
}

export const BLOCK_GUIDE: readonly BlockGuide[] = [
  { id: 'portrait', kind: 'prose', look: 'The style in two to four sentences: what kind of videos, the tone, the pace, what makes them recognisable.' },
  { id: 'captions', kind: 'fixed', look: 'Burned-in captions: typeface character, fill, outline / shadow / plate, size, how much text shows at once, how key words are marked.',
    pitfalls: 'Captions follow the speech; a headline held still, a label over the opening, signs, packaging and screen text are not captions. A second speaker in another colour is not keyword marking.' },
  { id: 'logo', kind: 'fixed', look: 'A mark held in one corner across videos.', pitfalls: 'Platform watermarks are not the creator\'s logo.' },
  { id: 'palette', kind: 'fixed', look: 'Colours the creator\'s own text and graphics keep: accent, second accent, text, ground.', pitfalls: 'Set and wardrobe colours are not brand colours; skin and footage grade are not palette.' },
  { id: 'sound', kind: 'fixed', look: 'Loudness and how tightly pauses are cut are measured; in prose, only what frames can show about music and sound effects (credits, visual beats).', pitfalls: 'Frames carry no audio: never claim a sound you cannot see evidence of.' },
  { id: 'bookends', kind: 'fixed', look: 'The same clip at the start (often after a cold open) or the end of every video.', pitfalls: 'Title cards with the same layout but different words are layout, not a fixed clip.' },
  { id: 'layout', kind: 'prose', look: 'Text and frames the creator puts on screen besides captions: a held headline band, an opening label, chapter or series labels, a template frame around the footage — where, how large, what colours and plates, how the words read (with real examples).',
    pitfalls: 'Station bugs, corner badges, disclaimers and set signage are not titles. Describe the convention, not one video\'s words.' },
  { id: 'editing', kind: 'prose', look: 'How the creator uses the platform\'s editing moves — punch-ins (quick push, instant cut-in, slow push, in-and-out; how close), transitions between shots, B-roll and cutaways (own footage, product close-ups, screen recordings, screenshots, stock, archive, memes), stickers and emoji, jump cuts — and on what moments of the speech each lands, and how often.',
    pitfalls: 'A switch to another camera angle is multi-cam, not a punch-in. Jump cuts are how the talk is cut, not a transition. How many per video depends on the content: describe the moments and the restraint, never a rate or an interval.' },
  { id: 'motion_graphics', kind: 'prose', look: 'Graphics that explain or emphasise: number cards, lists, comparisons, charts, arrows, circles, highlight boxes, zoomed screenshots, lower thirds, price tags — their shape language, type, colours, how they enter, hold and leave, and what in the speech brings them on. Written as a style prompt a designer could follow.',
    pitfalls: 'Captions, the creator\'s logo and scene text are not motion graphics.' },
  { id: 'structure', kind: 'prose', look: 'How a video opens (straight to camera, a question, a claim, a cover frame at 0 s, a teaser, result first), how the body is organised (points, recaps, chapters), and how it ends (sign-off line, call to action, end card).',
    pitfalls: 'The opening is a per-video choice more than a fingerprint: write it as the usual way, not a rule.' },
  { id: 'cover', kind: 'prose', look: 'The cover: composition, where the person sits, headline lettering, colours — as a prompt for generating a new cover.' },
];

/** Never part of a brand: decided by the footage, the platform or the moment. */
export const NOT_BRAND = [
  'aspect ratio (follows the footage; the export target converts it)',
  'shot size of each moment',
  'how many cuts, zooms or B-roll shots one video has, or at what interval',
  'colour grade saturation and temperature (set by the location)',
] as const;

export const blockGuide = (id: BlockId) => BLOCK_GUIDE.find(item => item.id === id)!;
export const PROSE_BLOCKS = BLOCK_GUIDE.filter(item => item.kind === 'prose').map(item => item.id);

/** Windows looked at closely in each video. */
export const WINDOWS = { openingSec: 8, closingSec: 10, moments: 4, momentSec: 4, framesPerWindow: 8 } as const;
