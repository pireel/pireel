/**
 * Shared global subtitle presets: classic appearances, whole-caption entrances,
 * speech-timed reveal, and bundled spoken-word emphasis. The renderer and tools
 * use this same catalog. Presets do not change font size or weight; those remain
 * user controls. Older presets retain their existing static / emphasis behavior.
 */

/** Global caption font-size base (canvas px at scale=1) — every preset renders at this size; user
 *  scaling multiplies it. 64 is 6% of a 1080-wide portrait canvas: between the 4% a mainstream
 *  web editor defaults to and the ~8% a desktop NLE lands on for portrait (it sizes by height).
 *  Layout math (line split budget / size dropdown / selection box) all anchor here. */
export const BASE_CAPTION_FONT_PX = 64;
/** Default (non-bold) caption weight — medium 500 reads cleanly on video; the bold toggle jumps to 800 (sub line 700). */
export const CAPTION_WEIGHT_REGULAR = 500;
export const CAPTION_WEIGHT_BOLD = 800;

export type CaptionMode = 'emphasis' | 'line';

export interface CaptionPreset {
  id: string;
  /** Display name shown on the panel. */
  name: string;
  mode: CaptionMode;
  /** Body text color. */
  text: string;
  /** Emphasized-word color (emphasis mode; absent = no color change, relies on deco). */
  emphasis?: string;
  /** Full-line backing color (rounded bar, CSS color may carry alpha); absent = bare text. */
  bg?: string;
  /** Per-word emphasis decoration: underline sliding under the current word / highlight box popping behind it. */
  deco?: 'underline' | 'highlight';
  decoColor?: string;
  /** Font: default theme sans; serif = Noto Serif SC, mono = --font-num. */
  font?: 'serif' | 'mono';
  italic?: boolean;
  weight?: number;
  stroke?: { color: string; widthEm: number };
  shadow?: string;
  plateRadiusEm?: number;
  plateBorder?: string;
  /** Whole-caption entrance or speech-timed reveal, selected globally by preset. */
  motion?: 'fade' | 'rise' | 'pop' | 'slide' | 'blur' | 'typewriter';
  /** Spoken-word emphasis is bundled with the global preset. */
  wordMotion?: 'pulse' | 'bounce' | 'glow';
  /** Latin text renders (and is measured) in capitals. */
  upper?: boolean;
  /** Letter spacing in em. */
  trackingEm?: number;
  /** Whole caption rotation in degrees (negative = counter-clockwise). */
  tiltDeg?: number;
  /** Artistic layout: each caption breaks into short stacked rows with their own size / color /
   *  plate. Cue derivation and rendering share one row plan (captionStackRows), so a cue always
   *  holds exactly what fits in maxRows rows. */
  stack?: CaptionStack;
}

export interface CaptionStack {
  /** Row width budget in em of the base caption size (a row at scale s holds rowEm / s em). */
  rowEm: number;
  /** At most 2 — captions never take more than two rows. */
  maxRows: 1 | 2;
  /** Per-row size multipliers, cycled. */
  scales?: number[];
  /** Per-row text colors, cycled (overrides the preset text color). */
  colors?: string[];
  /** Per-row plates, cycled; replaces the single stack plate. */
  plates?: string[];
  /** Alternate rows shift left / right by this many em. */
  staggerEm?: number;
  align?: 'center' | 'start';
}

/** Simple looks for the translation line: no stacking, no motion. */
export const SUB_CAPTION_PRESET_IDS = ['ln-clean', 'ln-black', 'style-glass', 'ln-yellow', 'ln-mint', 'ln-navy'] as const;

/** Artistic main-caption looks: short stacked rows, size contrast, tilt, per-row color and plates. */
export const CAPTION_ART_PRESETS: CaptionPreset[] = [
  { id: 'art-beast', name: 'engine.artBeast', mode: 'line', text: '#ffffff', weight: 900, upper: true, tiltDeg: -3, stroke: { color: '#000000', widthEm: 0.2 }, shadow: '0 0.09em 0 #000000',
    stack: { rowEm: 6, maxRows: 2, scales: [1.3], colors: ['#ffffff', '#ffe600'] } },
  { id: 'art-keyline', name: 'engine.artKeyline', mode: 'line', text: '#ffffff', weight: 900, stroke: { color: '#111111', widthEm: 0.12 },
    stack: { rowEm: 6, maxRows: 2, scales: [0.9, 1.5], colors: ['#ffffff', '#ffe34f'] } },
  { id: 'art-ribbon', name: 'engine.artRibbon', mode: 'line', text: '#ffffff', weight: 800, tiltDeg: -2, shadow: 'none',
    stack: { rowEm: 6.5, maxRows: 2, plates: ['#ff3b6b', '#161616'], staggerEm: 0.6 } },
  { id: 'art-ticket', name: 'engine.artTicket', mode: 'line', text: '#111111', weight: 900, upper: true, tiltDeg: -6, plateRadiusEm: 0, shadow: 'none',
    stack: { rowEm: 7, maxRows: 2, plates: ['#ffe600'] } },
  { id: 'art-comic', name: 'engine.artComic', mode: 'line', text: '#ffe600', weight: 900, tiltDeg: 3, stroke: { color: '#000000', widthEm: 0.22 }, shadow: '0.06em 0.09em 0 #000000',
    stack: { rowEm: 6, maxRows: 2, scales: [1, 1.2] } },
  { id: 'art-neon', name: 'engine.artNeon', mode: 'line', text: '#ffffff', weight: 700, trackingEm: 0.04, shadow: '0 0 0.1em #ff2bd6,0 0 0.35em #ff2bd6,0 0 0.8em #b100ff',
    stack: { rowEm: 7, maxRows: 2 } },
  { id: 'art-glitch', name: 'engine.artGlitch', mode: 'line', text: '#ffffff', weight: 900, upper: true, shadow: '0.05em 0 0 #ff0050,-0.05em 0 0 #00f0ff',
    stack: { rowEm: 7, maxRows: 2 } },
  { id: 'art-hollow', name: 'engine.artHollow', mode: 'line', text: '#ffffff', weight: 900, upper: true, stroke: { color: '#ffffff', widthEm: 0.05 }, shadow: 'none',
    stack: { rowEm: 6, maxRows: 2, scales: [1, 1.15], colors: ['transparent', '#ffffff'] } },
  { id: 'art-duo', name: 'engine.artDuo', mode: 'line', text: '#ffffff', weight: 800, shadow: '0 2px 10px rgba(0,0,0,0.8)',
    stack: { rowEm: 8, maxRows: 2, colors: ['#ffffff', '#c9a6ff'] } },
  { id: 'art-magazine', name: 'engine.artMagazine', mode: 'line', text: '#ffffff', font: 'serif', weight: 700, trackingEm: 0.02, shadow: '0 2px 10px rgba(0,0,0,0.75)',
    stack: { rowEm: 6, maxRows: 2, scales: [1.4, 0.8], colors: ['#ffffff', '#e6e1d6'], align: 'start' } },
  { id: 'art-tower', name: 'engine.artTower', mode: 'line', text: '#ffffff', weight: 900, upper: true, trackingEm: -0.02, stroke: { color: '#000000', widthEm: 0.1 },
    stack: { rowEm: 4.5, maxRows: 2, colors: ['#ffffff', '#ff4d4d'] } },
  { id: 'art-bubble', name: 'engine.artBubble', mode: 'line', text: '#111111', weight: 800, tiltDeg: 1.5, shadow: 'none', plateRadiusEm: 0.5,
    stack: { rowEm: 7, maxRows: 2, plates: ['#ffffff', '#9ff2c8'], staggerEm: 0.4 } },
];

export const CAPTION_STYLE_PRESETS: CaptionPreset[] = [
  { id: 'style-documentary', name: 'engine.styleDocumentary', mode: 'line', text: '#ffffff', weight: 500, shadow: '0 2px 8px #000000,0 0 2px #000000' },
  { id: 'style-outline', name: 'engine.styleOutline', mode: 'line', text: '#ffffff', weight: 800, stroke: { color: '#111111', widthEm: 0.16 }, shadow: '0 3px 0 #111111' },
  { id: 'style-editorial', name: 'engine.styleEditorial', mode: 'line', text: '#fff7e7', font: 'serif', italic: true, weight: 500, shadow: '0 2px 7px #000000' },
  { id: 'style-news', name: 'engine.styleNews', mode: 'line', text: '#ffffff', weight: 800, bg: '#172c47', plateRadiusEm: 0, plateBorder: '0.05em solid #e7bc64' },
  { id: 'style-paper', name: 'engine.stylePaper', mode: 'line', text: '#28231b', bg: '#f5eddc', font: 'serif', weight: 500, plateRadiusEm: 0.04, plateBorder: '0.025em solid #b4a58a', shadow: 'none' },
  { id: 'style-terminal', name: 'engine.styleTerminal', mode: 'line', text: '#b9f6bb', bg: '#10251d', font: 'mono', plateRadiusEm: 0.06, plateBorder: '0.025em solid #629477', shadow: 'none' },
  { id: 'style-sticker', name: 'engine.styleSticker', mode: 'line', text: '#171717', weight: 800, stroke: { color: '#ffffff', widthEm: 0.12 }, shadow: '4px 5px 0 #ff86b5' },
  { id: 'style-glass', name: 'engine.styleGlass', mode: 'line', text: '#ffffff', weight: 500, bg: 'rgba(16,22,29,0.58)', plateRadiusEm: 0.65, plateBorder: '0.025em solid rgba(255,255,255,0.5)', shadow: 'none' },
];

/** One-line descriptions of the current looks, for agents choosing a preset (English, model-facing). */
export const CAPTION_LOOK_HINTS: Record<string, string> = {
  'art-beast': 'bold caps, thick black outline, tilted, second row yellow',
  'art-keyline': 'small row then a big yellow key row',
  'art-ribbon': 'each row on its own pink/black ribbon, staggered',
  'art-ticket': 'black caps on a tilted yellow tag',
  'art-comic': 'yellow comic lettering, heavy outline, slight tilt',
  'art-neon': 'white text with pink neon glow',
  'art-glitch': 'caps with red/cyan split shadow',
  'art-hollow': 'outlined hollow row over a solid row',
  'art-duo': 'two rows, second in lilac',
  'art-magazine': 'left-aligned serif, big row over small row',
  'art-tower': 'narrow stacked caps, last row red',
  'art-bubble': 'white/mint rounded speech bubbles, staggered',
  'style-documentary': 'clean white text with soft shadow',
  'style-outline': 'heavy white text, thick black outline',
  'style-editorial': 'italic serif, warm white',
  'style-news': 'navy news bar with gold border',
  'style-paper': 'dark serif on a paper-colored plate',
  'style-terminal': 'green mono text on a dark terminal plate',
  'style-sticker': 'black text, white sticker outline, pink drop shadow',
  'style-glass': 'white text on a frosted rounded plate',
};

export const CAPTION_PRESETS: CaptionPreset[] = [
  ...CAPTION_ART_PRESETS,
  ...CAPTION_STYLE_PRESETS,
  // —— Legacy looks (existing projects and pinned skills keep working) ——
  // —— Word emphasis ——
  { id: 'em-yellow', name: 'engine.yellowPop', mode: 'emphasis', text: '#ffffff', emphasis: '#ffe34f' },
  { id: 'kw-yellow', name: 'engine.keyPhrases', mode: 'emphasis', text: '#ffffff', emphasis: '#ffe34f' },
  { id: 'em-green', name: 'engine.neonGreen', mode: 'emphasis', text: '#ffffff', emphasis: '#5affb6' },
  { id: 'em-purple-black', name: 'engine.purpleBlack', mode: 'emphasis', text: '#ffffff', emphasis: '#cf96ff', bg: 'rgba(0,0,0,0.72)' },
  { id: 'em-serif-black', name: 'engine.mintSerif', mode: 'emphasis', text: '#ffffff', emphasis: '#63ffc7', bg: 'rgba(0,0,0,0.72)', font: 'serif' },
  { id: 'em-underline', name: 'engine.blackUnderline', mode: 'emphasis', text: '#ffffff', bg: 'rgba(0,0,0,0.8)', deco: 'underline', decoColor: '#ffffff' },
  { id: 'em-blue-line', name: 'engine.blueUnderline', mode: 'emphasis', text: '#111111', emphasis: '#0059ff', bg: 'rgba(255,255,255,0.78)', deco: 'underline', decoColor: '#0059ff' },
  { id: 'em-box-purple', name: 'engine.purpleBlocks', mode: 'emphasis', text: '#ffffff', bg: 'rgba(118,40,187,0.85)', deco: 'highlight', decoColor: 'rgba(0,0,0,0.4)' },
  { id: 'em-box-blue', name: 'engine.blueBlocks', mode: 'emphasis', text: '#ffffff', bg: 'rgba(0,89,255,0.85)', deco: 'highlight', decoColor: '#000000' },
  { id: 'em-pink', name: 'engine.pinkPop', mode: 'emphasis', text: '#fccfcf', emphasis: '#ffffff', bg: 'rgba(236,137,134,0.85)' },
  { id: 'em-gold-serif', name: 'engine.goldCream', mode: 'emphasis', text: '#b89d4c', emphasis: '#7f6000', bg: 'rgba(248,233,192,0.85)', font: 'serif' },
  // —— Line by line ——
  { id: 'ln-clean', name: 'engine.cleanWhite', mode: 'line', text: '#ffffff' },
  { id: 'ln-black', name: 'engine.blackTape', mode: 'line', text: '#ffffff', bg: 'rgba(0,0,0,0.85)' },
  { id: 'ln-navy', name: 'engine.navySerif', mode: 'line', text: '#ffffff', bg: 'rgba(70,80,109,0.85)', font: 'serif' },
  { id: 'ln-white', name: 'engine.whiteTape', mode: 'line', text: '#3901ee', bg: 'rgba(255,255,255,0.85)', italic: true },
  { id: 'ln-orange', name: 'engine.orangeTape', mode: 'line', text: '#ffffff', bg: 'rgba(255,140,90,0.85)' },
  { id: 'ln-yellow', name: 'engine.yellowTape', mode: 'line', text: '#000000', bg: 'rgba(255,227,79,0.85)' },
  { id: 'ln-red', name: 'engine.redMono', mode: 'line', text: '#ffffff', bg: 'rgba(255,0,0,0.85)', font: 'mono' },
  { id: 'ln-mint', name: 'engine.mintGlow', mode: 'line', text: '#63ffc7' },
];

export const DEFAULT_CAPTION_PRESET = 'em-yellow';
/** Translation line's own default (independent of the main line — it no longer follows the main preset). */
export const DEFAULT_SUB_CAPTION_PRESET = 'ln-clean';

const BY_ID = new Map(CAPTION_PRESETS.map((p) => [p.id, p]));

/** Get a preset; unknown id falls back to the default (don't let a bad id render empty). */
export function getCaptionPreset(id: string | undefined): CaptionPreset {
  return (id && BY_ID.get(id)) || BY_ID.get(DEFAULT_CAPTION_PRESET)!;
}
