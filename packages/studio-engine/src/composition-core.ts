/**
 * Studio composition model — core layer: types + shot/duration geometry + template registry + shared text utils.
 *
 * Structure = continuous video (track 0) + multi-track overlay blocks. **Blocks store data only**: `{ templateId, slots, time, track }`;
 * the actual HTML/animation is rendered dynamically at assemble time by the [template registry] + [theme (CSS vars)]. Benefits:
 *  - Adding a template = one registry entry; switching theme = change vars, blocks untouched.
 *  - plan/agent can enumerate templates + slot schema and declaratively pick a template and fill slots (presets only, keeps it pretty).
 *  - Blocks are data → re-renderable, validatable, serializable (save project/version).
 *  - Agent-authored freeform HTML goes through the 'custom' template (slots = {innerHtml,timelineBody}), keeping flexibility.
 *
 * Layering (external entry is always the './composition' barrel, don't import this file directly):
 *   composition-core (this file, no sibling deps) ← templates (render impl + registration, import side effect)
 *   ← assemble (assemble the full document) / block-factory (block constructors)
 *
 * Convention: data-start/duration = global seconds; a block's GSAP timeline uses local time (0 = block start), assemble registers to
 * window.__timelines[block.id]; template selectors are always #blockId scoped.
 */

import type { ThemeId } from './theme';
import { type Clip, editedDuration, spans } from './trim';
import { BASE_CAPTION_FONT_PX, DEFAULT_CAPTION_PRESET, DEFAULT_SUB_CAPTION_PRESET, getCaptionPreset } from './caption-presets';

export type BlockKind = 'caption' | 'title' | 'stat' | 'list' | 'transition' | 'custom' | 'media';

/** Block slot data (each template defines its own keys). Text stored raw (unescaped); render escapes internally. */
export type Slots = Record<string, unknown>;

/** Normalized sub-region ([0..1], origin top-left). Shared by Block.box / framing vacancy / safe-area placement; don't redeclare inline elsewhere. */
export interface NormBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Media reference (minimal shape shared by slots.media / panel insert / asset picker). */
export interface MediaRef {
  type: 'image' | 'video';
  url: string;
}

export interface Block {
  id: string;
  /** Template id (registry key). 'custom' = agent-authored freeform HTML. */
  templateId: string;
  slots: Slots;
  /** Global start / duration (seconds). */
  startSec: number;
  durationSec: number;
  /** Track: 0 reserved for video; overlay blocks >=1, larger = higher layer. */
  trackIndex: number;
  /** Placement sub-region (normalized [0..1], origin top-left). Default = full canvas (inset:0). Used for safe-area placement.
   *  With a contentBox, box degrades to a **clipping window** (overflow:hidden framing frame). */
  box?: NormBox;
  /** Content layout rect (normalized, canvas coords): the carrier that keeps content anchored to the canvas during edge/corner cropping —
   *  shrinking box does not reflow content, it just narrows the window and clips content. Default = coincides with box (uncropped).
   *  When translating the whole block, both move together (see workbench shiftBox). */
  contentBox?: NormBox;
  /** autofit scale factor (<1): measured by the preview when content overflows box; assembleHtml applies transform:scale to #blockId,
   *  preview and export same-source. Default/≈1 = no scale. From sample-composition's measureFit → workbench applyFits. */
  fitScale?: number;
  /** Component backdrop background (CSS color): fills a solid base + overrides this block's --panel/--paper. Default = transparent over the frame. */
  bg?: string;
  /** Component border color (CSS color): container draws a 3px solid line (box blocks get rounded corners). Default = no border. */
  border?: string;
  /** Component overall opacity (0–1): container opacity. Default/1 = opaque. */
  opacity?: number;
  /** Corner radius (comp px): outermost container border-radius (box blocks overflow:hidden also round-clips content). Default/0 = square. */
  radius?: number;
  /** Overall rotation (deg, -180–180): outermost container transform:rotate around center. Default/0 = no rotation. */
  rotation?: number;
  /** Content visual scale factor (font size scales too), written by corner-handle proportional scaling: window (box) ×k, content layer
   *  (contentBox) layout size unchanged (only center moves), and scale ×k stay in sync — zero reflow. Rendered as the content layer's
   *  CSS scale **property**, not affecting layout and not entering the transform chain — mutually non-overwriting with autofit's transform
   *  and drag's translate (three separate channels). Default = 1. */
  scale?: number;
  /** Block-level override relative to the person-matte layer: 'front' = above the person, 'behind' = under the person.
   *  Default = follow global personFx.personFront (with person-on-top, all blocks go behind the person). No-op when matte pipeline is off. */
  personLayer?: 'front' | 'behind';
  /** User-facing label. */
  label?: string;
}

export interface StudioVideo {
  url: string;
  durationSec: number;
}

/** Shot treatment — how the talking-head video is framed within a segment (shrink to corner to make room for graphics / punch-in emphasis / half-split / fullscreen).
 *  split-l/-r/-t/-b = half-split: the video takes one half, the other half goes to a hyperframes block (partnerBlockId).
 *  The split axis is a canvas decision, not a taste one — halving the LONG side leaves two usable
 *  halves, halving the short side leaves slivers (l/r on a portrait frame) or flat strips (t/b on a
 *  landscape one). Vertical platforms lean on t/b the way wide ones lean on l/r. */
export type ShotTreatment = 'full' | 'punch-in' | 'corner-br' | 'corner-tl' | 'split-l' | 'split-r' | 'split-t' | 'split-b';

/**
 * One shot on the video track = one **clip**: keeps the source-video segment [srcStart, srcEnd).
 * The edited timeline = each clip's source interval joined end-to-end (trimmed-out source intervals don't exist in the edit).
 * See trim.ts for the mapping/CRUD.
 * Shot boundaries carry no transition semantics: slices of the same talking-head source are just jump cuts,
 * visual change is carried by framing (treatment); for an actual transition effect use a transition block on the component track.
 */
export interface VideoShot extends Clip {
  id: string;
  srcStart: number;
  srcEnd: number;
  /** Multi-source main track: set = externally inserted clip (srcStart/srcEnd are **this file's own** time, not the main video).
   *  Default = main-video slice. **Equal footing** (the main video is just the first-loaded source): framing/matte/audio/captions/split-trim-delete
   *  all apply to inserted segments (framing uniformly targets the #vidEl canvas, matte feeds MODNet with the segment's own source, captions transcribe/map per source;
   *  trim.ts's edit math only looks at length, so external segments work naturally). Don't add guards based on the early "v1 always-fullscreen-muted" constraint. */
  src?: string;
  /** Local inserted segment's fileSig (src is a session-scoped blob URL, dies on refresh): draft restore uses it to fetch the File
   *  back from the OPFS local video library and rebuild src. Remote-URL inserted segments don't have this field. */
  srcSig?: string;
  /** Framing always applies to the whole shot (one shot = one framing): to "punch in only the first few seconds", cut the shot — split is the only time-division primitive,
   *  don't build a private timeline within a shot (the treatmentLenSec loose-return model was removed; a keyframe sequence is equivalent to cutting). */
  treatment: ShotTreatment;
  /** For half-split/corner-shrink, which block goes in the other half / behind (hyperframes layer). Link only; the block renders independently. */
  partnerBlockId?: string;
  /** Enable smart matte for this shot (per-segment, user-set: the toggle only affects the selected segment, no global/auto backfill).
   *  When on, the parent budgets a mask for this segment; person effects (personFx) only take effect on matte-enabled segments. */
  personMatte?: boolean;
  /** Framing size 0–100 (unitless, a mainstream editor convention): punch-in = zoom amount, corner = small-window size, half-split = the share of the axis the video takes.
   *  Default = each type's TREAT_SIZE_DEFAULT (equivalent to the old constants). 'full' has no such concept. */
  treatSize?: number;
  /** Half-split only — WHICH part of the frame survives the crop, 0–100 along the split axis (0 = the
   *  top/left edge, 100 = the bottom/right, default 50 = centred). A filled half shows a window of the
   *  source, so something is always cut; this is the knob for choosing what. Ignored by other framings. */
  treatCrop?: number;
  /** Shot-level color grade (1 = neutral, only stores fields deviating from neutral; applies to the whole shot, swaps at the cut with no transition).
   *  Preview = #vidEl's CSS filter, export = ctx.filter, same shotFilterCss convention on both ends. */
  filter?: ShotFilter;
  /** Transition at this shot's **in-point** (content switch with the previous shot, not a mask): region is symmetric around the cut.
   *  prevId anchors to the previous shot — if either neighbor is deleted/replaced (id no longer adjacent), the transition auto-invalidates (cutTransitions
   *  filters it, no need to clean up in every edit path). Duration capped by MAX_TRANSITION_SEC, then clamped by both neighboring shot lengths. */
  transIn?: CutTransition;
  /** Shot audio level in dB (absent/0 = source level untouched, VOLUME_DB_MIN = silent). Attenuate-only for now:
   *  preview drives the decode element's own volume (0..1), so a boost above source level can't be previewed honestly —
   *  the ceiling stays 0 dB until a WebAudio mix stage exists on both ends. Whole shot, flat (no keyframes): shots are
   *  transcript slices, so "volume changes mid-shot" is expressed by splitting, same as framing/grade. */
  volumeDb?: number;
  /** Hard-silence this shot's own audio (independent of volumeDb, so unmuting restores the prior level). */
  audioMuted?: boolean;
  /** Fade the shot's own audio in/out at ITS edges, seconds (absent = 0, i.e. a hard start/stop — the
   *  default has to be no fade, or every cut in a narration would breathe). Shaped by fadeShape, same as
   *  the audio lane; preview and export both evaluate shotGainAt. */
  audioFadeInSec?: number;
  audioFadeOutSec?: number;
}

/** Cut transition: the handoff effect between two shots' content. Effect set = 10 picks from the gl-transitions gallery (id matches upstream shader name,
 *  GLSL itself in transition-gl.ts; preview/export/panel share one WebGL compositor). */
export type CutTransitionEffect =
  | 'fade'
  | 'fadeblack'
  | 'directional'
  | 'directionalwipe'
  | 'circleopen'
  | 'windowslice'
  | 'crosszoom'
  | 'rotatescale'
  | 'glitch'
  | 'dreamy';
/** Motion direction for push/slide (B's travel direction; up = entering upward, i.e. from the bottom edge). */
export type TransitionDirection = 'up' | 'down' | 'left' | 'right';
export interface CutTransition {
  prevId: string;
  effect: CutTransitionEffect;
  /** Total duration (seconds, half on each side); ≤ MAX_TRANSITION_SEC, and each side no longer than the neighboring shot. */
  durationSec: number;
  /** Only meaningful for push/slide; default 'left'. */
  direction?: TransitionDirection;
}
export const MAX_TRANSITION_SEC = 4;
export const CUT_TRANSITION_EFFECTS: { id: CutTransitionEffect; name: string }[] = [
  { id: 'fade', name: 'common.dissolve' },
  { id: 'fadeblack', name: 'common.dipBlack' },
  { id: 'directional', name: 'common.push' },
  { id: 'directionalwipe', name: 'common.wipe' },
  { id: 'circleopen', name: 'common.circle' },
  { id: 'windowslice', name: 'common.blinds' },
  { id: 'crosszoom', name: 'common.crossZoom' },
  { id: 'rotatescale', name: 'common.rotate' },
  { id: 'glitch', name: 'common.glitch' },
  { id: 'dreamy', name: 'common.wave' },
];
/** Direction-bearing effects (panel shows direction buttons for these). */
export const DIRECTIONAL_TRANSITIONS: ReadonlySet<CutTransitionEffect> = new Set(['directional', 'directionalwipe']);

/** Table of valid cut transitions (edited time): prevId must still be the immediately-preceding shot (deleting/trimming either side invalidates it),
 *  half is clamped by both neighboring shot lengths (transitions don't cross shots). Same convention for preview shim / export / timeline. */
export function cutTransitions(
  shots: VideoShot[],
): { cut: number; shotId: string; effect: CutTransitionEffect; half: number; dir: TransitionDirection }[] {
  const sp = spans(shots);
  const out: { cut: number; shotId: string; effect: CutTransitionEffect; half: number; dir: TransitionDirection }[] = [];
  for (let i = 1; i < sp.length; i++) {
    const s = sp[i]!.clip as VideoShot;
    const prev = sp[i - 1]!.clip as VideoShot;
    const tr = s.transIn;
    if (!tr || tr.prevId !== prev.id) continue;
    const lenPrev = sp[i - 1]!.editedEnd - sp[i - 1]!.editedStart;
    const lenSelf = sp[i]!.editedEnd - sp[i]!.editedStart;
    const half = Math.min(Math.max(0.1, Math.min(MAX_TRANSITION_SEC, tr.durationSec) / 2), lenPrev, lenSelf);
    out.push({ cut: sp[i]!.editedStart, shotId: s.id, effect: tr.effect, half: Math.round(half * 100) / 100, dir: tr.direction ?? 'left' });
  }
  return out;
}

/** Whether a split point falls inside some transition's coverage region (splitting inside is forbidden — remove the transition first). */
export function splitBlockedByTransition(shots: VideoShot[], atSec: number): boolean {
  return cutTransitions(shots).some((tr) => Math.abs(atSec - tr.cut) < tr.half - 1e-3);
}

/** Three color-grade params (numeric factors, 1 = no change; undefined treated as 1). */
export interface ShotFilter {
  brightness?: number;
  contrast?: number;
  saturate?: number;
}

/** ShotFilter → CSS/canvas filter string ('none' = neutral). Brightness/contrast clamped to [0.2, 3] (blackout/blowout have no
 *  legitimate use); saturation allowed down to 0 (black-and-white is a legitimate need). */
export function shotFilterCss(f?: ShotFilter): string {
  if (!f) return 'none';
  const clamp = (x: number, lo: number) => Math.min(3, Math.max(lo, Math.round(x * 100) / 100));
  const parts: string[] = [];
  if (f.brightness != null && f.brightness !== 1) parts.push(`brightness(${clamp(f.brightness, 0.2)})`);
  if (f.contrast != null && f.contrast !== 1) parts.push(`contrast(${clamp(f.contrast, 0.2)})`);
  if (f.saturate != null && f.saturate !== 1) parts.push(`saturate(${clamp(f.saturate, 0)})`);
  return parts.length ? parts.join(' ') : 'none';
}

/** THE audio level scale — one range for every sound in the composition (shots and lane clips alike), shared by
 *  the panel slider, the agent tools, preview and export. VOLUME_DB_MIN is -inf (true silence); above 0 dB is a
 *  real boost, which preview delivers by routing that element through a WebAudio gain node (an element's own
 *  volume caps at 1) and export delivers by scaling PCM. */
export const VOLUME_DB_MIN = -60;
export const VOLUME_DB_MAX = 20;
/** Longest a shot's own audio fade may be. */
export const SHOT_FADE_MAX_SEC = 10;

/** dB → linear gain; at/below VOLUME_DB_MIN snaps to true 0 (not just very quiet). */
export function dbToGain(db: number): number {
  if (db <= VOLUME_DB_MIN) return 0;
  return Math.pow(10, db / 20); // may exceed 1: boosts are real, and each surface knows how to deliver one
}

/** Effective linear gain of a shot's own audio (1 = untouched, 0 = silent), before its fades. */
export function shotGain(s: Pick<VideoShot, 'volumeDb' | 'audioMuted'>): number {
  if (s.audioMuted) return 0;
  return s.volumeDb == null ? 1 : dbToGain(s.volumeDb);
}

/** Smoothstep, the shape every fade in the project uses (audio lane and shot audio alike). */
export function fadeShape(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** A shot's fade factor at tLocal seconds into a segment of length lenSec (1 = untouched). */
export function shotFadeAt(s: Pick<VideoShot, 'audioFadeInSec' | 'audioFadeOutSec'>, tLocal: number, lenSec: number): number {
  let f = 1;
  if (s.audioFadeInSec) f *= fadeShape(tLocal / s.audioFadeInSec);
  if (s.audioFadeOutSec) f *= fadeShape((lenSec - tLocal) / s.audioFadeOutSec);
  return f;
}

/** Splice micro-fade (sec). Butt-joining two points of a recording that weren't adjacent leaves a waveform
 *  discontinuity — the noise floor jumps mid-cycle and the ear hears a click, even when both sides sound fine.
 *  A fade on each spliced edge removes it. 30 ms is still far too short to read as a fade, and unlike a
 *  shorter one it survives the preview's rAF-clock volume writes (~16 ms/tick) as an actual ramp rather than
 *  a single stray sample — which is what lets preview and export share the treatment. */
export const SPLICE_FADE_SEC = 0.03;

/** Does a's tail flow straight into b's head? (a split that removed nothing — same source, same instant.)
 *  Such a boundary is not a splice: the waveform is continuous across it and needs no micro-fade. */
export function shotsContiguous(a: Pick<VideoShot, 'src' | 'srcEnd'>, b: Pick<VideoShot, 'src' | 'srcStart'>): boolean {
  return (a.src ?? null) === (b.src ?? null) && Math.abs(a.srcEnd - b.srcStart) < 1e-3;
}

/** Micro-fade factor for a segment whose head/tail edges are splices (1 = untouched). */
export function spliceFadeAt(tLocal: number, lenSec: number, headSpliced: boolean, tailSpliced: boolean): number {
  const d = Math.min(SPLICE_FADE_SEC, lenSec / 2); // a segment shorter than two micro-fades just fades through
  let f = 1;
  if (headSpliced && d > 0) f *= fadeShape(tLocal / d);
  if (tailSpliced && d > 0) f *= fadeShape((lenSec - tLocal) / d);
  return f;
}

/** The complete per-segment audio envelope: the shot's own fades × the seam micro-fades. Returns null when the
 *  segment needs no envelope at all, so preview and export can keep their untouched-passthrough fast paths. */
export function segmentFadeFn(
  s: Pick<VideoShot, 'audioFadeInSec' | 'audioFadeOutSec'>,
  lenSec: number,
  headSpliced: boolean,
  tailSpliced: boolean,
): ((tLocal: number) => number) | null {
  const own = !!(s.audioFadeInSec || s.audioFadeOutSec);
  if (!own && !headSpliced && !tailSpliced) return null;
  return (tLocal: number) => (own ? shotFadeAt(s, tLocal, lenSec) : 1) * spliceFadeAt(tLocal, lenSec, headSpliced, tailSpliced);
}

/** Full gain of a shot's audio at tLocal into the segment: level × fades. Preview and export share it. */
export function shotGainAt(s: Pick<VideoShot, 'volumeDb' | 'audioMuted' | 'audioFadeInSec' | 'audioFadeOutSec'>, tLocal: number, lenSec: number): number {
  const g = shotGain(s);
  return g <= 0 ? 0 : g * shotFadeAt(s, tLocal, lenSec);
}

/** Apply an audio patch to one shot: clamps volumeDb into [VOLUME_DB_MIN, VOLUME_DB_MAX], drops fields at their
 *  neutral value (0 dB / unmuted) so untouched comps stay byte-identical. Shared by the panel and both tool executors. */
export function patchShotAudio<T extends VideoShot>(s: T, patch: { volumeDb?: number; mute?: boolean; fadeInSec?: number; fadeOutSec?: number }): T {
  const { volumeDb: _v, audioMuted: _m, audioFadeInSec: _fi, audioFadeOutSec: _fo, ...rest } = s;
  const db = patch.volumeDb != null ? Math.max(VOLUME_DB_MIN, Math.min(VOLUME_DB_MAX, patch.volumeDb)) : s.volumeDb;
  const muted = patch.mute != null ? patch.mute : s.audioMuted;
  const fade = (v: number | undefined) => (v == null ? undefined : Math.round(Math.max(0, Math.min(SHOT_FADE_MAX_SEC, v)) * 10) / 10);
  const fi = patch.fadeInSec != null ? fade(patch.fadeInSec) : s.audioFadeInSec;
  const fo = patch.fadeOutSec != null ? fade(patch.fadeOutSec) : s.audioFadeOutSec;
  return {
    ...(rest as T),
    ...(db != null && db !== 0 ? { volumeDb: Math.round(db * 10) / 10 } : {}),
    ...(muted ? { audioMuted: true } : {}),
    ...(fi ? { audioFadeInSec: fi } : {}),
    ...(fo ? { audioFadeOutSec: fo } : {}),
  };
}

export const SHOT_TREATMENTS: { id: ShotTreatment; name: string }[] = [
  { id: 'full', name: 'common.none' },
  { id: 'punch-in', name: 'common.zoomIn' },
  { id: 'corner-br', name: 'common.cornerBottomRight' },
  { id: 'corner-tl', name: 'common.cornerTopLeft' },
  { id: 'split-l', name: 'common.leftHalf' },
  { id: 'split-r', name: 'common.rightHalf' },
  { id: 'split-t', name: 'common.topHalf' },
  { id: 'split-b', name: 'common.bottomHalf' },
];

/** Global caption style (Vids Captions style): preset/position/scale tuned in one place, applied uniformly to all sentence-level captions.
 *  Only affects caption blocks **without a box** (the sentence-level subtitle layer); captions with a box (keyword punches, etc.) are independently
 *  positioned emphasis components not governed by the global style. Default (undefined) = each block renders per its own slots (draft-build theming tradeoff). */
export interface CaptionStyle {
  /** Captions layer switch. Captions are DERIVED at runtime from the transcript (displayCues) and are
   *  never persisted as blocks — this flag (plus the transcript) IS the stored state. Legacy comps
   *  that still carry persisted caption blocks read as "on" via isCaptionsOn's fallback. */
  on?: boolean;
  /** Visual preset id (caption-presets registry; the per-word-emphasis / full-sentence mode is also set by the preset). */
  preset: string;
  /** Vertical position: caption's bottom edge distance from canvas top, in % (height-based). */
  yPct: number;
  /** Horizontal position: caption line center distance from canvas left, in % (width-based). Default 50 = centered. */
  xPct?: number;
  /** Box width: max width allowed for a subtitle line (canvas width %). **Line-wrapping is derived live from this and the font size** (narrower box = fewer chars per line).
   *  Default 56 ≈ 13 CJK chars per line at 40px font. */
  wPct?: number;
  /** Overall scale factor (1 = preset's original font size). */
  scale: number;
  /** Subtitle box height (canvas height %): box bottom = yPct anchor. **Font size stays put, the backdrop follows the box** — rendered as
   *  .cap-line's min-height, text vertically centered inside (presets without a backdrop just grow taller as a placeholder).
   *  Default/0 = hugs the actual line height. */
  hPct?: number;
  /** Text color override (defaults to the preset's color). Optional and additive — existing projects render unchanged. */
  color?: string;
  /** Bold override: true = force bold (800), false = force regular (500); unset = the preset's own weight. */
  bold?: boolean;
  /** Backdrop plate override: a CSS color, or null = force no plate (defaults to the preset's plate). */
  bg?: string | null;
  /** Independent position/font for the translation line (bilingual second line): independent of the main line, dragged/scaled separately on canvas.
   *  Default = directly below the main line, 0.6× the main font size (moves with the main line). yPct = line-top distance from canvas top %,
   *  xPct = line-center distance from left %, scale = font factor (same convention as the main line's scale, 1 = preset's original size).
   *  preset/color/bg = independent visual overrides for the translation line; unset = derived from the main line's (overridden) look.
   *  lang = target language chosen in the UI (panel chip selected state + auto-translate for newly inserted segments). */
  sub?: { preset?: string; color?: string; bg?: string | null; bold?: boolean; yPct?: number; xPct?: number; wPct?: number; scale?: number; hPct?: number; lang?: string };
}

export interface Composition {
  width: number;
  height: number;
  /** Preset theme id — sets the whole video's colors/fonts/glow; templates read via var(--x). */
  theme: ThemeId;
  video: StudioVideo | null;
  blocks: Block[];
  /** Video-track shot slices (one framing per slice). Empty/absent = one continuous fullscreen clip. */
  shots?: VideoShot[];
  /** Palette derived from the frame's base colors (overrides #root color vars, layered after theme defaults). From frame analysis. */
  palette?: Record<string, string>;
  /** Global caption style, see CaptionStyle. At assemble time, overrides sentence-level captions' effect/yPct/scale. */
  /** SPARSE: only fields the user explicitly set are stored — defaults live in resolveCaptionStyle
   *  (so default evolution reaches existing projects). Always read through the resolvers. */
  captionStyle?: Partial<CaptionStyle>;
  /** Mounted frame theme-pack id (written to the document alongside palette on mount): the compose request carries it,
   *  the server injects that frame's design language into ACTIVE THEME (overrides generic aesthetics, engineering contract untouched). */
  frameId?: string;
  /** Global person-effect style (toolbar "Person" panel): person-on-top / feather / stroke / background swap.
   *  Only takes effect on matte-enabled (VideoShot.personMatte) shot segments; default = all defaults. */
  personFx?: PersonFx;
  /** Audio tracks on the music lane (plain NLE clips: position/level/fades/speed, no loop, sounds sum). See bgm.ts. */
  audioTracks?: import('./audio-tracks').AudioClip[];
  /** Narration denoise (MAIN source; baked in the browser — the wet file is cached, strength is a
   *  bake-time dry/wet blend so preview and export play one identical blended file). 0 < strength ≤ 1. */
  audioDenoise?: { strength: number };
}

/** Person-effect config (global style; matte on/off is per-segment, see VideoShot.personMatte).
 *  Composited live on the preview side; the export path is not yet supported (the background-swap layer is hidden on export, falling back to the original frame).
 *  All values are 0–100 unitless (a mainstream editor convention); assemble converts to px per canvas resolution. */
export interface PersonFx {
  /** Person-on-top: person overlays all components (text passes behind the person). Default = components in front of the person (normal overlay). */
  personFront?: boolean;
  /** Mask edge feather strength 0–100 (0 = hard edge). Default 0. */
  feather?: number;
  /** Person stroke: style card (solid/dashed) + width 0–100 + opacity 0–1. Default = none. */
  stroke?: { style: 'solid' | 'dashed'; width: number; color: string; opacity?: number };
  /** Background replacement: solid color or image (asset-library URL); default = no swap. */
  bg?: { type: 'color'; color: string } | { type: 'image'; url: string };
}

export function emptyComposition(): Composition {
  return { width: 1080, height: 1920, theme: 'general', video: null, blocks: [], shots: [] };
}

let _shotUid = 0;
export function shotId(): string {
  _shotUid += 1;
  return `shot${_shotUid}_${Math.floor(performance.now())}`;
}

/** Auto-slice by shot (sentence): cut at each sentence start → continuous clips covering [0, video end], default fullscreen framing. */
export function shotsFromSentences(sentences: { start: number }[], videoDurationSec: number): VideoShot[] {
  const cuts = [...new Set(sentences.map((s) => Math.max(0, Math.round(s.start * 10) / 10)))].sort((a, b) => a - b);
  if (!cuts.length || cuts[0]! > 0) cuts.unshift(0); // first segment starts at 0
  const shots: VideoShot[] = [];
  for (let i = 0; i < cuts.length; i++) {
    const srcStart = cuts[i]!;
    const srcEnd = i + 1 < cuts.length ? cuts[i + 1]! : videoDurationSec;
    if (srcEnd - srcStart < 0.05) continue; // skip too-short clips
    shots.push({ id: shotId(), srcStart, srcEnd, treatment: 'full' });
  }
  return shots;
}

/** Per-type defaults for framing size (0–100) — reverse-derived from the old hardcoded constants; default behavior unchanged. */
export const TREAT_SIZE_DEFAULT: Record<ShotTreatment, number> = {
  full: 0,
  'punch-in': 18,
  'corner-br': 35,
  'corner-tl': 35,
  'split-l': 50,
  'split-r': 50,
  'split-t': 50,
  'split-b': 50,
};

/** Framing size 0–100 → video scale: punch-in 1.05–2.0, corner 0.2–0.6, half-split 0.3–0.7. */
function treatScale(tr: ShotTreatment, size?: number): number {
  const v = Math.max(0, Math.min(100, size ?? TREAT_SIZE_DEFAULT[tr])) / 100;
  if (tr === 'punch-in') return 1.05 + v * 0.95;
  if (tr === 'corner-br' || tr === 'corner-tl') return 0.2 + v * 0.4;
  if (tr.startsWith('split-')) return 0.3 + v * 0.4;
  return 1;
}

/** Shot framing → GSAP transform variable object (transform-only, compositor layer, scrub-safe, same-source as export).
 *  Corner-shrink leaves a 2% margin from the corner, half-split hugs the edge; offset tracks scale (xPercent = (1-s)/2 convention).
 *  Export: while dragging the size slider, the parent uses this to emit hf:shotVars directly to the preview for a live set (zero setState, commits only on release). */
export interface ShotVars {
  scale: number;
  xPercent: number;
  yPercent: number;
  borderRadius: number;
  /** Always emitted (inset(0%) when nothing is cropped) so a tween between any two framings interpolates. */
  clipPath: string;
}

/**
 * A half-split FILLS its half. The video stays at full size and is CROPPED to the band it occupies,
 * instead of being scaled down and parked at an edge — a shrunken window left dead margins beside
 * it, which is not the half-and-half layout anyone means. Cropping means part of the frame is cut,
 * so `crop` picks which part survives (default centred).
 *
 * corner/punch-in keep the scale-and-park model: those ARE a small window over the footage.
 */
export function shotTransformVars(tr: ShotTreatment, size?: number, crop?: number): ShotVars {
  const s = treatScale(tr, size);
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const corner = r3(((1 - s) / 2 - 0.02) * 100);
  // Four explicit edges, never the shorthand: GSAP interpolates complex strings by pairing numeric
  // tokens, so tweening 'inset(0%)' (one token) against a split's four-token inset can't animate —
  // the transform would glide while the crop snapped. Same token count on every treatment keeps
  // every framing-to-framing transition tweenable.
  const NONE = 'inset(0% 0% 0% 0%)';
  // The freed share, and where in it the surviving window starts (o=0 keeps the near edge, 1 the far).
  const gap = 1 - s;
  const o = Math.min(1, Math.max(0, (typeof crop === 'number' ? crop : 50) / 100));
  const near = r3(-o * gap * 100); // video parked at the low edge (top / left)
  const far = r3((1 - o) * gap * 100); // video parked at the high edge (bottom / right)
  // clip-path is applied in the element's OWN box and the transform moves the clipped result, so the
  // cut has to name the surviving WINDOW OF THE SOURCE, not the band of canvas it lands in — cutting
  // "the far half" and then translating carried the visible band half off-screen. The window is the
  // same either way the video is parked; only the translate differs.
  const cutNear = r3(o * gap * 100);
  const cutFar = r3((1 - o) * gap * 100);
  switch (tr) {
    case 'punch-in':
      return { scale: r3(s), xPercent: 0, yPercent: 0, borderRadius: 0, clipPath: NONE };
    case 'corner-br':
      return { scale: r3(s), xPercent: corner, yPercent: corner, borderRadius: 54, clipPath: NONE };
    case 'corner-tl':
      return { scale: r3(s), xPercent: -corner, yPercent: -corner, borderRadius: 54, clipPath: NONE };
    case 'split-l':
      return { scale: 1, xPercent: near, yPercent: 0, borderRadius: 0, clipPath: `inset(0% ${cutFar}% 0% ${cutNear}%)` };
    case 'split-r':
      return { scale: 1, xPercent: far, yPercent: 0, borderRadius: 0, clipPath: `inset(0% ${cutFar}% 0% ${cutNear}%)` };
    case 'split-t':
      return { scale: 1, xPercent: 0, yPercent: near, borderRadius: 0, clipPath: `inset(${cutNear}% 0% ${cutFar}% 0%)` };
    case 'split-b':
      return { scale: 1, xPercent: 0, yPercent: far, borderRadius: 0, clipPath: `inset(${cutNear}% 0% ${cutFar}% 0%)` };
    default:
      return { scale: 1, xPercent: 0, yPercent: 0, borderRadius: 0, clipPath: NONE };
  }
}

/** Fractional insets of a computed clip-path (0..1 of the element's box). CSS collapses the
 *  four-value inset we set to shorthand in computed style — 'inset(0% 25%)' — so this expands
 *  1–4 values by the standard box rules. Non-inset / 'none' → all zero. Producer (shotTransformVars) and parser share this file so the two cannot drift. */
export function parseClipInset(clipPath: string | undefined): { t: number; r: number; b: number; l: number } {
  const none = { t: 0, r: 0, b: 0, l: 0 };
  const m = clipPath ? /inset\(([^)]+)\)/.exec(clipPath) : null;
  if (!m) return none;
  const parts = m[1]!.trim().split(/\s+/);
  const roundIdx = parts.indexOf('round'); // we never emit a corner radius, but don't choke on one
  const vals = (roundIdx >= 0 ? parts.slice(0, roundIdx) : parts).map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0));
  if (!vals.length || vals.some((v) => !Number.isFinite(v))) return none;
  const [a, b = a, c = a, d = b] = vals as [number, number?, number?, number?];
  return { t: a, r: b!, b: c!, l: d! };
}


function shotVars(tr: ShotTreatment, size?: number, crop?: number): string {
  const v = shotTransformVars(tr, size, crop);
  return `{ scale: ${n(v.scale)}, xPercent: ${n(v.xPercent)}, yPercent: ${n(v.yPercent)}, borderRadius: ${n(v.borderRadius)}, clipPath: '${v.clipPath}' }`;
}

/**
 * Normalized "vacancy" box freed up by framing (placement for the other half of a half-split/corner = partner block).
 * full/punch-in fill or zoom → no vacancy, returns null. Coords leave a margin, not edge-to-edge.
 */
/** Caption no-go floor (same 0.84 line pickGraphicBox clamps to): the sentence-caption layer lives
 *  in the bottom band, and a freed area running under it would put the graphic beneath the words. */
const VACANCY_CAPTION_FLOOR = 0.84;

export function treatmentVacancyBox(tr: ShotTreatment, size?: number): NormBox | null {
  const s = treatScale(tr, size);
  const raw = ((): NormBox | null => {
  switch (tr) {
    case 'corner-br': // video shrinks to bottom-right → frees a large top block (height tracks small-window size)
      return { x: 0.06, y: 0.1, w: 0.88, h: Math.max(0.2, 0.86 - s - 0.06) };
    case 'corner-tl': // video shrinks to top-left → frees a large bottom block
      return { x: 0.06, y: Math.min(0.7, s + 0.06), w: 0.88, h: Math.max(0.2, 0.86 - s - 0.06) };
    // A split fills its share exactly, so the freed band is the remaining (1 - s), inset by a margin.
    case 'split-l': // video takes the left band → frees the right
      return { x: s + 0.04, y: 0.06, w: Math.max(0.2, 1 - s - 0.08), h: 0.88 };
    case 'split-r': // video takes the right band → frees the left
      return { x: 0.04, y: 0.06, w: Math.max(0.2, 1 - s - 0.08), h: 0.88 };
    case 'split-t': // video takes the top band → frees the bottom
      return { x: 0.06, y: s + 0.04, w: 0.88, h: Math.max(0.2, 1 - s - 0.08) };
    case 'split-b': // video takes the bottom band → frees the top
      return { x: 0.06, y: 0.04, w: 0.88, h: Math.max(0.2, 1 - s - 0.08) };
    default:
      return null;
  }
  })();
  // Clamp the freed area above the caption band — bottom-reaching vacancies (split-t's band, the
  // side columns, corner-tl's block) ran to y≈0.96, straight through where captions render.
  return raw ? { ...raw, h: Math.max(0.2, Math.min(raw.h, VACANCY_CAPTION_FLOOR - raw.y)) } : null;
}

/**
 * Video framing timeline body (keyframe model, in **edited time**):
 *  1) One framing keyframe at each shot's start (framing always applies to the whole shot, one shot = one framing).
 *  2) Consecutive identical framings (same type + size) are deduped — adjacent split-off segments with the same framing are one state, no redundant tween.
 * Whatever is set gets executed, with **no minimum-hold merging** (user-set): "don't hold a framing under 1s" is a restraint asked of the LLM at shot-planning time
 * (see prompts/plan.ts FRAMING); framings on shot fragments the user hand-cut are executed as-is.
 * Registered to __timelines['vid'].
 */
export function videoFrameKeyframes(shots: VideoShot[]): { at: number; tr: ShotTreatment; size?: number; crop?: number }[] {
  const sp = spans(shots);
  if (sp.length === 0) return [];

  // canvas render mode: the video track is **one canvas**; all segments' framings (including other-source inserts) are applied to it uniformly
  const keys: { at: number; tr: ShotTreatment; size?: number; crop?: number }[] = [];
  for (const { clip, editedStart } of sp) {
    keys.push({ at: editedStart, tr: clip.treatment, size: (clip as VideoShot).treatSize, crop: (clip as VideoShot).treatCrop });
  }
  const final: typeof keys = [];
  for (const k of keys) {
    const prev = final[final.length - 1];
    if (!prev || prev.tr !== k.tr || (prev.size ?? -1) !== (k.size ?? -1) || (prev.crop ?? -1) !== (k.crop ?? -1)) final.push(k);
  }
  return final;
}

export function videoFrameTimelineBody(shots: VideoShot[]): string {
  const sp = spans(shots);
  if (sp.length === 0) return '';
  const total = sp[sp.length - 1]!.editedEnd;
  const final = videoFrameKeyframes(shots);
  if (!final.length) return '';

  const lines: string[] = [`tl.set('#vidEl', ${shotVars(final[0]!.tr, final[0]!.size, final[0]!.crop)}, 0);`];
  for (let i = 1; i < final.length; i++) {
    const gap = (final[i + 1]?.at ?? total) - final[i]!.at;
    const dur = Math.max(0.2, Math.min(0.5, gap - 0.05));
    lines.push(`tl.to('#vidEl', Object.assign({ duration: ${n(dur)}, ease: 'power2.inOut' }, ${shotVars(final[i]!.tr, final[i]!.size, final[i]!.crop)}), ${n(final[i]!.at)});`);
  }
  // Color-grade keyframes (deduped independently of framing): jump-cut semantics — swap at the cut (set), no transition tween.
  // No grading anywhere = no lines emitted; if any, neutral segments emit a 'none' reset, otherwise the prior shot's filter leaks into the next.
  if (sp.some(({ clip }) => shotFilterCss((clip as VideoShot).filter) !== 'none')) {
    let prevCss: string | null = null;
    for (const { clip, editedStart } of sp) {
      const css = shotFilterCss((clip as VideoShot).filter);
      if (css === prevCss) continue;
      prevCss = css;
      lines.push(`tl.set('#vidEl', { filter: '${css}' }, ${n(editedStart)});`);
    }
  }
  return lines.join('\n');
}

/** Edited duration: with shot clips = Σ clip source lengths, else original video duration; then max'd against block end times. */
export function editedVideoDuration(comp: Composition): number {
  return comp.shots && comp.shots.length ? editedDuration(comp.shots) : (comp.video?.durationSec ?? 0);
}

export function totalDuration(comp: Composition): number {
  let max = editedVideoDuration(comp);
  for (const b of comp.blocks) if (b.startSec + b.durationSec > max) max = b.startSec + b.durationSec;
  return Math.max(0.1, max);
}

/** Track count (including video track 0). */
export function trackCount(comp: Composition): number {
  let max = comp.video ? 0 : -1;
  for (const b of comp.blocks) if (b.trackIndex > max) max = b.trackIndex;
  return max + 1;
}

/** Find a component track (≥1) free within the [startSec, startSec+durationSec) window: starting from preferred and going up,
 *  return the first track index with no time overlap against existing blocks. Used when inserting a new component — tracks are layers, not categories;
 *  chips on the same track and window overlap on the timeline and become unclickable; larger index = higher, and row count grows dynamically via trackCount. */
export function freeTrack(blocks: Block[], startSec: number, durationSec: number, preferred = 2): number {
  const end = startSec + durationSec;
  for (let t = Math.max(1, preferred); ; t++) {
    const clash = blocks.some((b) => b.trackIndex === t && b.startSec < end - 1e-3 && b.startSec + b.durationSec > startSec + 1e-3);
    if (!clash) return t;
  }
}

/** Number/percent serialization (shared by templates/assemble, keeps output strings stable). */
export const n = (x: number) => (Math.round(x * 1000) / 1000).toString();
export const pct = (v: number) => `${n(v * 100)}%`;

/* ============================ Template registry ============================ */

export interface SlotSpec {
  type: 'text' | 'text[]' | 'words' | 'image' | 'enum' | 'json';
  label: string;
  required?: boolean;
  options?: string[];
}

export interface Rendered {
  innerHtml: string;
  timelineBody: string;
}

export interface Template {
  id: string;
  name: string;
  kind: BlockKind;
  defaultTrackIndex: number;
  /** Slot schema — tells plan/agent/UI what this template can be filled with. */
  slots: Record<string, SlotSpec>;
  /** slots (with data) + blockId (+ block's edited start, for embedded media's data-start; + block duration, for entrance-animation timing) → render output. Selectors must be #blockId scoped. */
  render(slots: Slots, blockId: string, startSec?: number, durationSec?: number): Rendered;
}

const REGISTRY = new Map<string, Template>();
export function registerTemplate(t: Template): void {
  REGISTRY.set(t.id, t);
}
export function getTemplate(id: string): Template {
  return REGISTRY.get(id) ?? REGISTRY.get('custom')!;
}
export function listTemplates(): Template[] {
  return [...REGISTRY.values()];
}

/** Render a block into innerHtml + timelineBody (via the registry + template). */
export function renderBlock(block: Block): Rendered {
  return getTemplate(block.templateId).render(block.slots, block.id, block.startSec, block.durationSec);
}

/** The block's semantic kind (from its template). */
export function blockKind(block: Block): BlockKind {
  return getTemplate(block.templateId).kind;
}

/** Sentence-level caption = a caption block without a box (target of the global style); boxed ones are independently positioned emphasis captions. */
export function isSentenceCaption(block: Block): boolean {
  return blockKind(block) === 'caption' && !block.box;
}

/* ============================ Agent screen placement (place_block) ============================ */

/** Canvas regions the agent can snap a block into (3×3 grid, safe margin). */
export const PLACE_ANCHORS = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'] as const;
export type PlaceAnchor = (typeof PLACE_ANCHORS)[number];

export interface PlaceBlockInput {
  /** Snap into a canvas region (keeps size). */
  anchor?: PlaceAnchor;
  /** Absolute top-left position, % of canvas (0–100). */
  xPct?: number;
  yPct?: number;
  /** Relative nudge, % of canvas (positive = right / down). */
  dxPct?: number;
  dyPct?: number;
  /** Multiply the box size around its center (clamped 0.4–2). */
  scale?: number;
}

/** 3×3 zone label for a normalized box (by center) — the agent-facing vocabulary for "where is this on screen". */
export function zoneOf(box: NormBox): string {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const col = cx < 1 / 3 ? 'left' : cx > 2 / 3 ? 'right' : '';
  const row = cy < 1 / 3 ? 'top' : cy > 2 / 3 ? 'bottom' : '';
  return row && col ? `${row}-${col}` : row || col || 'center';
}

const PLACE_MARGIN = 0.03;
const round4 = (v: number) => Math.round(v * 10000) / 10000;

/** Compute a block's new screen placement (normalized canvas space, shared by the browser runner and the offline executor).
 *  Position comes from ONE of: anchor / xPct+yPct / dxPct+dyPct; `scale` composes with any of them. The box is clamped fully
 *  on-canvas. Move shifts box + contentBox together (crop relationship preserved, same as the drag handle); scale mirrors the
 *  corner handle: box ×k around center, contentBox reset (re-crops nothing). Returns null when no effective directive given;
 *  caller pre-validates that the block has a box. */
export function applyBlockPlacement(block: Block, input: PlaceBlockInput): Block | null {
  const box0 = block.box;
  if (!box0) return null;
  let { x, y, w, h } = box0;
  let scaled = false;
  if (typeof input.scale === 'number' && Number.isFinite(input.scale) && input.scale !== 1) {
    const k = Math.min(2, Math.max(0.4, input.scale));
    const nw = Math.min(1, Math.max(0.04, w * k));
    const nh = Math.min(1, Math.max(0.03, h * k));
    x += (w - nw) / 2;
    y += (h - nh) / 2;
    w = nw;
    h = nh;
    scaled = true;
  }
  let placed = false;
  if (input.anchor && (PLACE_ANCHORS as readonly string[]).includes(input.anchor)) {
    x = input.anchor.includes('left') ? PLACE_MARGIN : input.anchor.includes('right') ? 1 - w - PLACE_MARGIN : (1 - w) / 2;
    y = input.anchor.includes('top') ? PLACE_MARGIN : input.anchor.includes('bottom') ? 1 - h - PLACE_MARGIN : (1 - h) / 2;
    placed = true;
  } else if (typeof input.xPct === 'number' || typeof input.yPct === 'number') {
    if (typeof input.xPct === 'number' && Number.isFinite(input.xPct)) {
      x = input.xPct / 100;
      placed = true;
    }
    if (typeof input.yPct === 'number' && Number.isFinite(input.yPct)) {
      y = input.yPct / 100;
      placed = true;
    }
  } else if (typeof input.dxPct === 'number' || typeof input.dyPct === 'number') {
    const ndx = Number(input.dxPct) || 0;
    const ndy = Number(input.dyPct) || 0;
    if (ndx || ndy) {
      x += ndx / 100;
      y += ndy / 100;
      placed = true;
    }
  }
  if (!placed && !scaled) return null;
  x = round4(Math.min(Math.max(x, 0), Math.max(0, 1 - w)));
  y = round4(Math.min(Math.max(y, 0), Math.max(0, 1 - h)));
  const dx = x - box0.x;
  const dy = y - box0.y;
  const next: Block = { ...block, box: { x, y, w: round4(w), h: round4(h) } };
  if (scaled) next.contentBox = undefined;
  else if (block.contentBox) next.contentBox = { ...block.contentBox, x: block.contentBox.x + dx, y: block.contentBox.y + dy };
  return next;
}

/** The currently-effective global caption style: explicit setting wins, else derived from the first sentence-level caption's slots (a stable initial value
 *  for the panel selected-state and canvas handles); if there's no caption yet, take the default. */
/** Default subtitle box width (canvas width %). The canvas follows the SOURCE aspect with the short
 *  side normalized to 1080 (normalizeDims): portrait 1080-wide → ≈11 zh chars per line; landscape
 *  1920-wide → a full single-line subtitle (~21 zh / ~42 latin chars). One ratio, geometry does the rest. */
export const DEFAULT_CAPTION_WIDTH_PCT = 56;

export function resolveCaptionStyle(comp: Composition): CaptionStyle {
  if (comp.captionStyle) return { preset: DEFAULT_CAPTION_PRESET, yPct: 88, scale: 1, xPct: 50, wPct: DEFAULT_CAPTION_WIDTH_PCT, ...comp.captionStyle };
  const first = comp.blocks.find(isSentenceCaption);
  const preset = typeof first?.slots.preset === 'string' ? (first.slots.preset as string) : DEFAULT_CAPTION_PRESET;
  const yPct = typeof first?.slots.yPct === 'number' ? (first.slots.yPct as number) : 88;
  return { preset, yPct, xPct: 50, wPct: DEFAULT_CAPTION_WIDTH_PCT, scale: 1 };
}

/** Is the captions layer on? The stored truth is captionStyle.on (captions derive from the transcript
 *  at runtime; blocks are a runtime materialization, never persisted). Legacy comps that predate the
 *  flag carry persisted caption blocks instead — their presence reads as "on". */
export function isCaptionsOn(comp: Composition): boolean {
  return comp.captionStyle?.on ?? comp.blocks.some(isSentenceCaption);
}

/** Persistence strip: derived caption blocks never land in storage — the transcript + captionStyle.on
 *  carry the caption state. Only strips when the caller confirms a transcript exists to re-derive from:
 *  a legacy comp holding caption blocks with NO transcript keeps them persisted (stripping would lose
 *  the captions with nothing to rebuild from). */
export function stripDerivedCaptions(comp: Composition, canDerive: boolean): Composition {
  if (!canDerive || !comp.blocks.some(isSentenceCaption)) return comp;
  return {
    ...comp,
    blocks: comp.blocks.filter((b) => !isSentenceCaption(b)),
    captionStyle: { ...resolveCaptionStyle(comp), on: true },
  };
}

/** Full style for the translation line (bilingual second line) — **same shape as CaptionStyle**, reusing the main line's handle/render/measure conventions
 *  as-is (selection box, live move, width-change ghost, tokenize-and-wrap all one set of logic). Values sub doesn't set are derived from the main line:
 *  line-bottom anchor = main bottom + 0.2 main-font gap + translation line's actual height (the closed form of "directly below the main line"),
 *  font 0.6× main, x/box-width follow the main line. */
export function resolveSubCaptionStyle(comp: Composition): CaptionStyle {
  const m = resolveCaptionStyle(comp);
  const p = getCaptionPreset(m.preset);
  const sub = m.sub ?? {};
  const scale = sub.scale ?? m.scale * 0.7;
  const mainFs = Math.max(10, Math.round(BASE_CAPTION_FONT_PX * m.scale));
  // Sub metrics come from the SUB preset + the effective sub plate (preset bg or the bg override) —
  // gating the padding on the MAIN preset's plate put the derived anchor off whenever they differed.
  const subP = getCaptionPreset(sub.preset ?? DEFAULT_SUB_CAPTION_PRESET);
  const subFs = Math.max(9, Math.round(BASE_CAPTION_FONT_PX * scale));
  const subPlate = sub.bg !== undefined ? sub.bg != null : !!subP.bg;
  const padY = subPlate ? Math.round(subFs * 0.18) * 2 : 0;
  const derivedY = m.yPct + ((mainFs * 0.2 + subFs * 1.35 + padY) / (comp.height || 1920)) * 100;
  return {
    preset: sub.preset ?? DEFAULT_SUB_CAPTION_PRESET,
    yPct: Math.min(99, sub.yPct ?? Math.round(derivedY * 10) / 10),
    xPct: sub.xPct ?? m.xPct ?? 50,
    wPct: sub.wPct ?? m.wPct ?? DEFAULT_CAPTION_WIDTH_PCT,
    scale,
    ...(sub.hPct ? { hPct: sub.hPct } : {}),
    ...(sub.color != null ? { color: sub.color } : {}),
    ...(sub.bg !== undefined ? { bg: sub.bg } : {}),
    ...(sub.bold != null ? { bold: sub.bold } : {}),
  };
}

/* ============================ Basics ============================ */

export interface FxWord {
  text: string;
  start: number;
  end: number;
  emphasis?: boolean;
}

let _uid = 0;
export function blockId(prefix = 'b'): string {
  _uid += 1;
  // Ids land in CSS selectors (#<id> .cls) — strip characters that would parse as
  // combinators/pseudo-classes there (a 'kit:metric' templateId prefix once produced
  // #kit:metric_… selectors that silently matched nothing → fully unstyled blocks).
  const safe = prefix.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${safe}${_uid}_${Math.floor(performance.now())}`;
}

export function span2(words: FxWord[]): { start: number; end: number; dur: number } {
  const start = words[0]?.start ?? 0;
  let end = 0;
  for (const w of words) if (w.end > end) end = w.end;
  end += 0.3;
  return { start, end, dur: Math.max(0.3, end - start) };
}

export const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
export const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
export const wordsOf = (v: unknown): FxWord[] => (Array.isArray(v) ? (v as FxWord[]) : []);

/* ============================ Safety ============================ */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function escapeAttr(s: string): string {
  return escapeHtml(s);
}
