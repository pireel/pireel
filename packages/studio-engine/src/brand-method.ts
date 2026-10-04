import type { MoveKind } from './brand-playbook';

/**
 * A — the method for extracting a creator's style brand (a playbook, brand-playbook.ts) from their
 * published videos, distilled from two studies of top talking-head creators (TikTok / YouTube: 100
 * creators, 960 videos; Douyin / Bilibili: 85 creators, 369 videos).
 *
 * The dimension table below is the single source the extractor, the reading and synthesis prompts
 * and the playbook all follow. Each row says which part of the playbook it feeds, how it is found
 * (measured by code, read from frames by a vision model, or both), how many videos it takes to
 * trust, and what is known to go wrong. Raise METHOD_VERSION whenever a row, a tool or a prompt
 * changes; every playbook records the version that made it.
 */
export const METHOD_VERSION = 'brand-method-2';

export type PlaybookSection = 'fixed' | 'moves' | 'structure' | 'generation';
export type Finding = 'measure' | 'read' | 'both';

export interface Dimension {
  id: string;
  section: PlaybookSection;
  /** The move it fills, for moves. */
  move?: MoveKind;
  finding: Finding;
  /** Videos needed before a value is trusted (from within-creator consistency in the studies). */
  minVideos: number;
  /** What to look for and how to tell it apart — the text the reading and synthesis prompts carry. */
  look: string;
  /** Known false readings to guard against. */
  pitfalls?: string;
  /** False while A cannot find it yet (e.g. sound, which frames do not carry); the playbook leaves it out. */
  live?: false;
}

export const DIMENSIONS: readonly Dimension[] = [
  // ── Fixed habits: the same in every video, executed as parameters.
  { id: 'captions', section: 'fixed', finding: 'both', minVideos: 3,
    look: 'Burned-in captions: on or off; typeface character (weight, width, serif, case), fill, outline / shadow / plate, size, how much text shows at once, and whether key words are marked and by which rule (key words, numbers, the word being spoken).',
    pitfalls: 'Captions follow the speech; a headline held still, a label over the opening, signs, packaging and screen text are not captions. A second speaker in another colour is not keyword marking.' },
  { id: 'bands', section: 'fixed', finding: 'both', minVideos: 3,
    look: 'Text bands repeated across videos with words that change per video: a large headline held over most of the video (usually the upper frame), a label over the opening seconds. Place, size, text colour, plate.',
    pitfalls: 'Station bugs, corner badges, disclaimers and set signage are not headlines: a headline is wide, large and in the upper frame.' },
  { id: 'frame', section: 'fixed', finding: 'measure', minVideos: 3,
    look: 'Vertical template frame: landscape footage in a fixed window, a headline band above and a decorated band below, the surround never moving.',
    pitfalls: 'Measure the speaker and shot sizes inside the window, or the speaker reads as B-roll.' },
  { id: 'logo', section: 'fixed', finding: 'measure', minVideos: 3, look: 'A mark held in one corner across videos.', pitfalls: 'Platform watermarks are not the creator\'s logo.' },
  { id: 'intro_outro', section: 'fixed', finding: 'measure', minVideos: 3, look: 'The same clip at the start (often after a cold open) or the end of every video.', pitfalls: 'Title cards with the same layout but different words are a band template, not a fixed clip.' },
  { id: 'palette', section: 'fixed', finding: 'both', minVideos: 3, look: 'Colours the creator\'s own graphics and text keep: accent, second accent, text, ground.', pitfalls: 'Set and wardrobe colours are not brand colours; skin and footage grade are not palette.' },
  { id: 'loudness', section: 'fixed', finding: 'measure', minVideos: 2, look: 'Integrated loudness of the mix: a target, not one video\'s level.' },
  { id: 'pauses', section: 'fixed', finding: 'measure', minVideos: 3, look: 'Silence left at cuts between words: tight (breaths gone), moderate, or natural pauses kept.' },

  // ── Moves: a repertoire drawn on per moment — which variants, how often (level and cap), when.
  { id: 'punch_in', section: 'moves', move: 'punch_in', finding: 'both', minVideos: 5,
    look: 'Digital zoom on the same camera: quick punch, instant cut-in, slow push, in-and-out; how tight; and on what it lands (a punchline, a key claim, a number, a turn).',
    pitfalls: 'A switch to another camera angle is multicam, not a punch-in. How many per video is decided by the content: record the trigger and a cap, never a rate.' },
  { id: 'transition', section: 'moves', move: 'transition', finding: 'read', minVideos: 3,
    look: 'Anything but a hard cut between shots: whip, zoom, flash, glitch, fade, a sound hit on the cut; and where it sits (a new section or topic, or anywhere).',
    pitfalls: 'Hard cuts are the default for nearly every creator, and a jump cut is a hard cut; a transition is an accent at a boundary, not the style of every cut.' },
  { id: 'broll', section: 'moves', move: 'broll', finding: 'both', minVideos: 5,
    look: 'Footage other than the speaker: own footage, product close-ups, screen recordings, screenshots or articles, stock, archive news, AI images, memes; how much; and what triggers it (a noun or step mentioned, a claim needing proof).',
    pitfalls: 'Same-location selfie footage is the creator\'s own footage, not stock. Jump cuts and B-roll covering rarely go together.' },
  { id: 'multicam', section: 'moves', move: 'multicam', finding: 'both', minVideos: 3, look: 'A second camera angle or a cut to the other speaker, and when it switches.' },
  { id: 'sfx', section: 'moves', move: 'sfx', finding: 'measure', minVideos: 3, live: false, look: 'Sound effects: whooshes, pops, dings, risers, impacts; on what (a cut, a graphic appearing, a joke).', pitfalls: 'Needs the soundtrack (source separation); frames cannot show it.' },
  { id: 'graphic_callout', section: 'moves', move: 'graphic_callout', finding: 'read', minVideos: 3, look: 'Graphics that explain: arrows, circles, highlight boxes, zoomed screenshots, number cards, charts, lower thirds, price tags; on what moments.' },
  { id: 'sticker', section: 'moves', move: 'sticker', finding: 'read', minVideos: 3, look: 'Decorative stickers, emoji and meme images over the picture, and on what moments.' },
  { id: 'music', section: 'moves', move: 'music', finding: 'measure', minVideos: 3, live: false, look: 'Background music under the voice (all along, only intro and outro, by section), its level below the voice and its mood.', pitfalls: 'Needs the soundtrack; frames cannot show it. A raised noise floor is not proof of music.' },

  // ── Structure: how videos are built; defaults a single video may depart from.
  { id: 'opening', section: 'structure', finding: 'read', minVideos: 3, look: 'How a video opens: straight to camera, a question, a big-text cover frame at 0 s, a highlight teaser before the title, result first.', pitfalls: 'The opening is a per-video choice more than a fingerprint; keep it as a default.' },
  { id: 'closing', section: 'structure', finding: 'both', minVideos: 3, look: 'How a video ends: a recurring sign-off line, a call to action, an end card.' },
  { id: 'pace', section: 'structure', finding: 'measure', minVideos: 3, look: 'Cuts per minute in the body of the video, as a range.' },

  // ── Generation: prompts and references for generated material.
  { id: 'cover', section: 'generation', finding: 'read', minVideos: 3, look: 'Cover composition, where the person sits, headline lettering and colours.' },
  { id: 'headlines', section: 'generation', finding: 'both', minVideos: 3, look: 'How their headlines read: length, tone, whether they ask, promise or state; with real examples.' },
  { id: 'elements', section: 'generation', finding: 'read', minVideos: 3, look: 'Titles, cards and other generated elements: shape language, typography, motion temperament.' },
];

/** Never part of a playbook: decided by the footage, the platform or the moment. */
export const NOT_BRAND = [
  'aspect ratio (follows the footage; the export target converts it)',
  'shot size of each moment',
  'how many cuts, zooms or B-roll shots one video has',
  'colour grade saturation and temperature (set by the location)',
] as const;

export const dimension = (id: string) => DIMENSIONS.find(item => item.id === id);
/** The dimensions A can find today. */
export const LIVE_DIMENSIONS = DIMENSIONS.filter(item => item.live !== false);
