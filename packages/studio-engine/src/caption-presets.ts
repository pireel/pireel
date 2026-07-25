/**
 * Caption visual preset table — mirrors Google Vids Captions' two caption kinds
 * (actual colors lifted from temp/captions.html):
 *   emphasis (Word emphasis) = whole line always shown, the spoken word
 *     highlighted (color / underline / highlight box);
 *   line (Line by line) = clean full-line fade-in, no per-word animation.
 * Vids' third kind, Word by word (one word at a time), is not done — the keyword
 * kinetic-slam already occupies that niche.
 *
 * Presets govern LOOK only (colors/backing/decoration/typeface identity); animation
 * NOTE weight is NOT preset-owned either: everything renders REGULAR by default
 * (CAPTION_WEIGHT_REGULAR) — bold is exclusively the user's toggle (captionStyle.bold).
 * behavior is defined by mode, rendered in templates.renderCaption. SIZE is NOT part
 * of a preset — the font-size base is the global BASE_CAPTION_FONT_PX (switching
 * presets never changes layout metrics); drop shadow is a derived rule (bare text
 * gets one, backed text doesn't). Dependency-free leaf module: composition-core /
 * templates / panels all read from here, don't inline color values elsewhere.
 */

/** Global caption font-size base (px on the width-normalized 1080 canvas, scale=1) — every preset
 *  renders at this size; user scaling multiplies it. 48 matches the short-video industry default
 *  (a mainstream editor portrait captions land at ~48px on a 1080-wide canvas). Layout math (line split budget /
 *  size dropdown / selection box) all anchor here. */
export const BASE_CAPTION_FONT_PX = 48;
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
}

export const CAPTION_PRESETS: CaptionPreset[] = [
  // —— Word emphasis ——
  { id: 'em-yellow', name: 'engine.yellowPop', mode: 'emphasis', text: '#ffffff', emphasis: '#ffe34f' },
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
