/**
 * Composition-diff classifiers for the preview rebuild gate: each answers "did ONLY this narrow slice change?"
 * A hit lets the workbench skip the full doc rebuild (double-buffer swap = video reload = flicker) and apply the
 * change through a live in-place channel instead. Anything broader falls through to the rebuild path.
 */

import type {
  Block,
  Composition,
  SupplementalVisualMediaClip,
  VideoShotTimelinePlacement,
} from '@pireel/studio-engine/composition';

/**
 * Composition is now a V2-document render projection. A projection intentionally rebuilds
 * compatibility objects such as `video`, `shots`, and media-backed `slots`, so reference equality
 * no longer means that a preview surface changed. Keep the Object.is fast path, then compare the
 * JSON-shaped render data structurally. Without this, every native overlay edit falls through to a
 * full double-buffered iframe rebuild even when only one component changed.
 */
export function previewDataEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  const aArray = Array.isArray(a);
  if (aArray !== Array.isArray(b)) return false;
  if (aArray) {
    const aa = a as unknown[];
    const bb = b as unknown[];
    return aa.length === bb.length && aa.every((value, index) => previewDataEqual(value, bb[index]));
  }
  const aProto = Object.getPrototypeOf(a);
  const bProto = Object.getPrototypeOf(b);
  if ((aProto !== Object.prototype && aProto !== null) || (bProto !== Object.prototype && bProto !== null)) return false;
  const aa = a as Record<string, unknown>;
  const bb = b as Record<string, unknown>;
  const aKeys = Object.keys(aa);
  if (aKeys.length !== Object.keys(bb).length) return false;
  return aKeys.every((key) => Object.prototype.hasOwnProperty.call(bb, key) && previewDataEqual(aa[key], bb[key]));
}

interface BoxRowsChange {
  valid: boolean;
  changed: boolean;
  changedIndexes: number[];
}

/** Compare render-input rows while allowing only their persisted canvas box to change. */
function boxRowsChange(a: readonly object[], b: readonly object[]): BoxRowsChange {
  if (a.length !== b.length) return { valid: false, changed: false, changedIndexes: [] };
  const changedIndexes: number[] = [];
  for (let index = 0; index < a.length; index++) {
    const { box: aBox, ...aRest } = a[index] as Record<string, unknown>;
    const { box: bBox, ...bRest } = b[index] as Record<string, unknown>;
    if (!previewDataEqual(aRest, bRest)) return { valid: false, changed: false, changedIndexes: [] };
    if (!previewDataEqual(aBox, bBox)) changedIndexes.push(index);
  }
  return { valid: true, changed: changedIndexes.length > 0, changedIndexes };
}

/** Primary media boxes are also projected into Composition.shots. Permit that one matching change,
 *  while rejecting every other composition edit so the fast path cannot hide a structural update. */
function compositionShotBoxOnlyChange(a: Composition, b: Composition): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Composition>;
  for (const key of keys) {
    if (key === 'shots') continue;
    if (!previewDataEqual(a[key], b[key])) return false;
  }
  return boxRowsChange(a.shots ?? [], b.shots ?? []).changed;
}

export interface NativeMediaPreviewInputs {
  videoPlacements: readonly VideoShotTimelinePlacement[];
  supplementalVisuals: readonly SupplementalVisualMediaClip[];
}

/**
 * Native media move/resize is already painted through `hf:mediaBox` during the gesture. A canonical
 * box-only commit must therefore update the native timelines in place, never rebuild/swap the iframe.
 * Supplemental clips with box keyframes are excluded because their animation body must be regenerated.
 */
export function nativeMediaBoxOnlyChange(
  previousComposition: Composition | null,
  nextComposition: Composition,
  previous: NativeMediaPreviewInputs | null,
  next: NativeMediaPreviewInputs,
): boolean {
  if (!previousComposition || !previous) return false;
  const video = boxRowsChange(previous.videoPlacements, next.videoPlacements);
  const supplemental = boxRowsChange(previous.supplementalVisuals, next.supplementalVisuals);
  if (!video.valid || !supplemental.valid || (!video.changed && !supplemental.changed)) return false;
  if (!previewDataEqual(previousComposition, nextComposition) && !compositionShotBoxOnlyChange(previousComposition, nextComposition)) return false;
  for (const index of supplemental.changedIndexes) {
    const before = previous.supplementalVisuals[index]?.keyframes?.box;
    const after = next.supplementalVisuals[index]?.keyframes?.box;
    if (before?.length || after?.length) return false;
  }
  return true;
}

/** Atomic framing on ordinary visual clips is a style-only update. It can be pushed directly to
 * the existing native image/video element and must not swap the preview document. */
export function supplementalMediaFramingOnlyChange(
  previousComposition: Composition | null,
  nextComposition: Composition,
  previous: NativeMediaPreviewInputs | null,
  next: NativeMediaPreviewInputs,
): boolean {
  if (!previousComposition || !previous || !previewDataEqual(previousComposition, nextComposition)) return false;
  if (!previewDataEqual(previous.videoPlacements, next.videoPlacements)) return false;
  if (previous.supplementalVisuals.length !== next.supplementalVisuals.length) return false;
  let changed = false;
  for (let index = 0; index < previous.supplementalVisuals.length; index++) {
    const { mediaFraming: before, ...beforeRest } = previous.supplementalVisuals[index]!;
    const { mediaFraming: after, ...afterRest } = next.supplementalVisuals[index]!;
    if (!previewDataEqual(beforeRest, afterRest)) return false;
    if (!previewDataEqual(before, after)) changed = true;
  }
  return changed;
}

/** Only the theme-mount surface (frameId/custom style/palette) changed: skip the rebuild and hot-patch #root's vars.
 *  Already-inserted components carry their frozen insertion-time tokens (Block.vars, #id-scoped above
 *  #root), so a theme swap genuinely never restyles them — on this fast path AND on every later rebuild.
 *  Only the stage background and future generations pick up the new palette. */
export function themeMountOnlyChange(a: Composition | null, b: Composition): boolean {
  if (!a) return false;
  if (previewDataEqual(a.palette, b.palette)
    && previewDataEqual(a.frameId, b.frameId)
    && previewDataEqual(a.customVisualStyle, b.customVisualStyle)) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Composition>;
  for (const k of keys) {
    if (k === 'palette' || k === 'frameId' || k === 'customVisualStyle' || k === 'personFx') continue;
    if (!previewDataEqual(a[k], b[k])) return false;
  }
  return true;
}

/** All fields identical except captionStyle (by reference) — the criterion for rebuild debounce/skip. */
export function sameExceptCapStyle(a: Composition | null, b: Composition): boolean {
  if (!a) return false;
  if (previewDataEqual(a.captionStyle, b.captionStyle)) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Composition>;
  for (const k of keys) {
    if (k === 'captionStyle') continue;
    if (!previewDataEqual(a[k], b[k])) return false;
  }
  return true;
}

/** Only shot framing/grade (treatment/treatSize/treatCrop/preciseFraming/filter) changed: skip the rebuild — hf:shotVars was already applied instantly,
 *  and the vid timeline is swapped in place by hf:vidTimeline (identical to what a rebuild would bake, with framing and grade keyframes inside the body).
 *  Any other field/structural change doesn't take this path. */
export function shotFramingOnlyChange(a: Composition | null, b: Composition): boolean {
  if (!a || a === b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Composition>;
  for (const k of keys) {
    if (k === 'shots') continue;
    if (!previewDataEqual(a[k], b[k])) return false;
  }
  const sa = a.shots ?? [];
  const sb = b.shots ?? [];
  if (sa === sb) return false; // shots unchanged too = no change, leave the identity check to the normal path
  if (sa.length !== sb.length) return false;
  let framingChanged = false;
  for (let i = 0; i < sa.length; i++) {
    const x = sa[i]!;
    const y = sb[i]!;
    if (x === y) continue;
    const { treatment: _xt, treatSize: _xs, treatCrop: _xc, preciseFraming: _xp, mediaFraming: _xm, filter: _xf, ...rx } = x;
    const { treatment: _yt, treatSize: _ys, treatCrop: _yc, preciseFraming: _yp, mediaFraming: _ym, filter: _yf, ...ry } = y;
    const kx = Object.keys(rx) as (keyof typeof rx)[];
    if (kx.length !== Object.keys(ry).length) return false;
    for (const k of kx) if (!previewDataEqual(rx[k], (ry as typeof rx)[k])) return false;
    if (
      !previewDataEqual(x.treatment, y.treatment)
      || !previewDataEqual(x.treatSize, y.treatSize)
      || !previewDataEqual(x.treatCrop, y.treatCrop)
      || !previewDataEqual(x.preciseFraming, y.preciseFraming)
      || !previewDataEqual(x.mediaFraming, y.mediaFraming)
      || !previewDataEqual(x.filter, y.filter)
    ) framingChanged = true;
  }
  return framingChanged;
}

/** Only the canvas size (width/height) changed — a discrete action (ratio picker), so the rebuild
 *  should run with ZERO debounce; the 300ms debounce exists for per-frame streams like box drags. */
export function canvasSizeOnlyChange(a: Composition | null, b: Composition): boolean {
  if (!a || a === b) return false;
  if (a.width === b.width && a.height === b.height) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Composition>;
  for (const k of keys) {
    if (k === 'width' || k === 'height') continue;
    if (!previewDataEqual(a[k], b[k])) return false;
  }
  return true;
}

/** Shot COUNT changed (split / delete / insert) — always a discrete click, so the rebuild runs with
 *  ZERO debounce. Length-equal shot edits (transition-handle drags stream per frame) stay debounced.
 *  Blocks shift alongside cuts and the FIRST insert may also set the canvas size — both ignored here. */
export function shotCountChange(a: Composition | null, b: Composition): boolean {
  if (!a || a === b) return false;
  if ((a.shots?.length ?? 0) === (b.shots?.length ?? 0)) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Composition>;
  for (const k of keys) {
    if (k === 'shots' || k === 'blocks' || k === 'width' || k === 'height') continue;
    if (!previewDataEqual(a[k], b[k])) return false;
  }
  return true;
}

/** Only the caption position (xPct/yPct) changed: can skip the rebuild (hf:capStyle already wrote it directly, the re-baked value is identical). */
export function capPosOnlyChange(a: Composition | null, b: Composition): boolean {
  if (!a || !sameExceptCapStyle(a, b)) return false;
  const ca = a.captionStyle;
  const cb = b.captionStyle;
  if (!ca || !cb) return previewDataEqual(ca, cb);
  // sub (translation line) the same: position (yPct/xPct/hPct) already written via the live channel, skippable; a font-size/box-width change needs re-segmentation, must rebuild
  const sa = ca.sub ?? {};
  const sb = cb.sub ?? {};
  return (
    ca.preset === cb.preset &&
    previewDataEqual(ca.scale, cb.scale) &&
    previewDataEqual(ca.wPct, cb.wPct) &&
    // visual overrides (text color / plate) re-bake CSS — never skippable
    previewDataEqual(ca.color, cb.color) &&
    previewDataEqual(ca.bg, cb.bg) &&
    previewDataEqual(ca.bold, cb.bold) &&
    previewDataEqual(sa.scale, sb.scale) &&
    previewDataEqual(sa.wPct, sb.wPct) &&
    previewDataEqual(sa.preset, sb.preset) &&
    previewDataEqual(sa.color, sb.color) &&
    previewDataEqual(sa.bg, sb.bg) &&
    previewDataEqual(sa.bold, sb.bold) &&
    // sub going from absent to present / present to absent (first drag-out of an independent position / clearing) also needs a rebuild: the anchoring changes (top↔bottom)
    !!ca.sub === !!cb.sub
  );
}

/** Classification result of block-level in-place patches: each changed pair is annotated with the patch dimensions it hits. */
export interface BlockPatchPair {
  a: Block;
  b: Block;
  geom: boolean; // box/contentBox/scale/rotation → hf:boxSize/hf:rotate
  timing: boolean; // startSec/durationSec → hf:blockTiming (runtime reads data-start dynamically per frame, changing the attribute takes effect immediately)
  style: boolean; // bg/border/radius/opacity → hf:blockStyle (shares blockBgCss with assemble, identical output)
  mediaTimeline: boolean; // media slots.anim only → replace the GSAP timeline, never the image/video DOM node
  slots: boolean; // slots changed → parent re-assembles the block and swaps the node in via hf:blockAdd (echo of an iframe text edit skips even that)
  kitProps: boolean; // kit block props → parent re-renders the one block's content via hf:blockHtml
  replace: boolean; // templateId swap → full node replace via hf:blockAdd
}
export interface BlockPatchChange {
  pairs: BlockPatchPair[];
  removed: Block[];
  added: Block[];
}
const PATCH_GEOM = new Set(['box', 'contentBox', 'scale', 'rotation']);
const PATCH_TIMING = new Set(['startSec', 'durationSec']);
const PATCH_STYLE = new Set(['bg', 'border', 'radius', 'opacity']);
const PATCH_IGNORE = new Set(['fitScale', 'label']); // not in the preview doc (fitScale goes through hf:fit separately; label only on the timeline)

function mediaAnimationOnlyChange(a: Block, b: Block): boolean {
  if (a.templateId !== 'media' || b.templateId !== 'media') return false;
  const { anim: aAnim, ...aSlots } = a.slots;
  const { anim: bAnim, ...bSlots } = b.slots;
  return !previewDataEqual(aAnim, bAnim) && previewDataEqual(aSlots, bSlots);
}

/** Only block-level changes that can be patched in place (geometry/time-window/appearance/slots echo) + pure deletes: return a patch list;
 *  any other change (new block / track swap / template swap / caption re-lay / comp-level field…) returns null and goes to a full doc rebuild.
 *  On a hit, skip the rebuild (rebuild = double-buffer swap = video reload, the source of "flicker per edit") and commit the final value once into the active doc. */
export function blockPatchableChange(a: Composition | null, b: Composition): BlockPatchChange | null {
  if (!a || a === b) return null;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Composition>;
  for (const k of keys) {
    if (k === 'blocks') continue;
    if (!previewDataEqual(a[k], b[k])) return null;
  }
  const ba = a.blocks;
  const bb = b.blocks;
  if (ba === bb) return null;
  // Id pairing, order-checked: deletions and ADDITIONS are patchable (hf:remove / hf:blockAdd);
  // reorders of surviving blocks change stacking (DOM order) → leave to the rebuild.
  const posA = new Map(ba.map((x, i) => [x.id, i] as const));
  const idsB = new Set(bb.map((x) => x.id));
  const pairs: BlockPatchPair[] = [];
  const removed: Block[] = ba.filter((x) => !idsB.has(x.id));
  const added: Block[] = [];
  let last = -1;
  for (const y of bb) {
    const i = posA.get(y.id);
    if (i === undefined) {
      added.push(y);
      continue;
    }
    if (i < last) return null; // surviving blocks reordered
    last = i;
    const x = ba[i]!;
    if (x === y) continue;
    const p: BlockPatchPair = { a: x, b: y, geom: false, timing: false, style: false, mediaTimeline: false, slots: false, kitProps: false, replace: false };
    const ks = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of ks) {
      const xv = (x as unknown as Record<string, unknown>)[k];
      const yv = (y as unknown as Record<string, unknown>)[k];
      if (previewDataEqual(xv, yv) || PATCH_IGNORE.has(k)) continue;
      if (PATCH_GEOM.has(k)) {
        if (!x.box || !y.box) return null; // box going from absent to present = a layout-mode switch, must rebuild
        p.geom = true;
      } else if (PATCH_TIMING.has(k)) p.timing = true;
      else if (PATCH_STYLE.has(k)) p.style = true;
      else if (k === 'templateId') p.replace = true;
      else if (k === 'slots') {
        // Kit blocks derive HTML from slots.props — content-only re-render (hf:blockHtml);
        // media animation changes only replace the GSAP timeline; any other slots change
        // re-assembles the whole node (hf:blockAdd replace)
        if (y.templateId.startsWith('kit:')) p.kitProps = true;
        else if (mediaAnimationOnlyChange(x, y)) p.mediaTimeline = true;
        else p.slots = true;
      }
      else return null;
    }
    if (p.geom || p.timing || p.style || p.mediaTimeline || p.slots || p.kitProps || p.replace) pairs.push(p);
  }
  // A blocks-array update that only changes ignored metadata (fitScale/label) is still a valid
  // no-op patch. Returning null would incorrectly fall through to a full double-buffer rebuild —
  // most visibly after resize, when measureFit writes fitScale after the live geometry commit.
  return { pairs, removed, added };
}

/**
 * Existing nodes can always be replaced in place: replaceWith preserves their exact parent and
 * stacking position, including around supplemental visual and person-matte layers. Only additions
 * need a global insertion index, so layered canvases keep the full rebuild fallback for that case.
 */
export function canApplyBlockPatchInPlace(
  change: BlockPatchChange,
  options: { hasSupplementalVisuals: boolean; hasPersonMatte: boolean },
): boolean {
  if (change.added.length === 0) return true;
  return change.added.length <= 8 && !options.hasSupplementalVisuals && !options.hasPersonMatte;
}

/** Translate the whole block: box (crop window) and contentBox (content anchor) move together, keeping the crop relationship unchanged. */
export function shiftBox(b: Block, dx: number, dy: number): Block {
  if (!b.box) return b;
  return {
    ...b,
    box: { ...b.box, x: b.box.x + dx, y: b.box.y + dy },
    contentBox: b.contentBox ? { ...b.contentBox, x: b.contentBox.x + dx, y: b.contentBox.y + dy } : undefined,
  };
}
