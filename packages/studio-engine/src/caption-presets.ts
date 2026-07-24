/**
 * Caption visual preset table — mirrors Google Vids Captions' two caption kinds
 * (actual colors lifted from temp/captions.html):
 *   emphasis (Word emphasis) = whole line always shown, the spoken word
 *     highlighted (color / underline / highlight box);
 *   line (Line by line) = clean full-line fade-in, no per-word animation.
 * Vids' third kind, Word by word (one word at a time), is not done — the keyword
 * kinetic-slam already occupies that niche.
 *
 * Presets govern VISUALS only (colors/backing/decoration/fonts); animation
 * behavior is defined by mode, rendered in templates.renderCaption. Dependency-
 * free leaf module: composition-core / templates / panels all read from here,
 * don't inline color values elsewhere.
 */

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
  /** Drop shadow for bare text (not needed when there's a backing). */
  shadow?: boolean;
  italic?: boolean;
  /** Base font size px (1080-wide canvas, scale=1). */
  size: number;
  weight: number;
}

export const CAPTION_PRESETS: CaptionPreset[] = [
  // —— Word emphasis ——
  { id: 'em-yellow', name: 'engine.yellowPop', mode: 'emphasis', text: '#ffffff', emphasis: '#ffe34f', shadow: true, size: 50, weight: 800 },
  { id: 'em-green', name: 'engine.neonGreen', mode: 'emphasis', text: '#ffffff', emphasis: '#5affb6', shadow: true, size: 50, weight: 800 },
  { id: 'em-purple-black', name: 'engine.purpleBlack', mode: 'emphasis', text: '#ffffff', emphasis: '#cf96ff', bg: 'rgba(0,0,0,0.72)', size: 47, weight: 700 },
  { id: 'em-serif-black', name: 'engine.mintSerif', mode: 'emphasis', text: '#ffffff', emphasis: '#63ffc7', bg: 'rgba(0,0,0,0.72)', font: 'serif', size: 47, weight: 700 },
  { id: 'em-underline', name: 'engine.blackUnderline', mode: 'emphasis', text: '#ffffff', bg: 'rgba(0,0,0,0.8)', deco: 'underline', decoColor: '#ffffff', size: 48, weight: 800 },
  { id: 'em-blue-line', name: 'engine.blueUnderline', mode: 'emphasis', text: '#111111', emphasis: '#0059ff', bg: 'rgba(255,255,255,0.78)', deco: 'underline', decoColor: '#0059ff', size: 47, weight: 700 },
  { id: 'em-box-purple', name: 'engine.purpleBlocks', mode: 'emphasis', text: '#ffffff', bg: 'rgba(118,40,187,0.85)', deco: 'highlight', decoColor: 'rgba(0,0,0,0.4)', size: 45, weight: 800 },
  { id: 'em-box-blue', name: 'engine.blueBlocks', mode: 'emphasis', text: '#ffffff', bg: 'rgba(0,89,255,0.85)', deco: 'highlight', decoColor: '#000000', size: 45, weight: 800 },
  { id: 'em-pink', name: 'engine.pinkPop', mode: 'emphasis', text: '#fccfcf', emphasis: '#ffffff', bg: 'rgba(236,137,134,0.85)', size: 47, weight: 800 },
  { id: 'em-gold-serif', name: 'engine.goldCream', mode: 'emphasis', text: '#b89d4c', emphasis: '#7f6000', bg: 'rgba(248,233,192,0.85)', font: 'serif', size: 47, weight: 700 },
  // —— Line by line ——
  { id: 'ln-clean', name: 'engine.cleanWhite', mode: 'line', text: '#ffffff', shadow: true, size: 40, weight: 700 },
  { id: 'ln-black', name: 'engine.blackTape', mode: 'line', text: '#ffffff', bg: 'rgba(0,0,0,0.85)', size: 36, weight: 600 },
  { id: 'ln-navy', name: 'engine.navySerif', mode: 'line', text: '#ffffff', bg: 'rgba(70,80,109,0.85)', font: 'serif', size: 39, weight: 700 },
  { id: 'ln-white', name: 'engine.whiteTape', mode: 'line', text: '#3901ee', bg: 'rgba(255,255,255,0.85)', italic: true, size: 39, weight: 700 },
  { id: 'ln-orange', name: 'engine.orangeTape', mode: 'line', text: '#ffffff', bg: 'rgba(255,140,90,0.85)', size: 40, weight: 800 },
  { id: 'ln-yellow', name: 'engine.yellowTape', mode: 'line', text: '#000000', bg: 'rgba(255,227,79,0.85)', size: 39, weight: 700 },
  { id: 'ln-red', name: 'engine.redMono', mode: 'line', text: '#ffffff', bg: 'rgba(255,0,0,0.85)', font: 'mono', size: 38, weight: 700 },
  { id: 'ln-mint', name: 'engine.mintGlow', mode: 'line', text: '#63ffc7', shadow: true, size: 40, weight: 800 },
];

export const DEFAULT_CAPTION_PRESET = 'em-yellow';
/** Translation line's own default (independent of the main line — it no longer follows the main preset). */
export const DEFAULT_SUB_CAPTION_PRESET = 'ln-clean';

const BY_ID = new Map(CAPTION_PRESETS.map((p) => [p.id, p]));

/** Get a preset; unknown id falls back to the default (don't let a bad id render empty). */
export function getCaptionPreset(id: string | undefined): CaptionPreset {
  return (id && BY_ID.get(id)) || BY_ID.get(DEFAULT_CAPTION_PRESET)!;
}
