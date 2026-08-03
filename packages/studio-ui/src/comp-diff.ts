/**
 * Composition-diff classifiers for the preview rebuild gate: each answers "did ONLY this narrow slice change?"
 * A hit lets the workbench skip the full doc rebuild (double-buffer swap = video reload = flicker) and apply the
 * change through a live in-place channel instead. Anything broader falls through to the rebuild path.
 */

import type { Block, Composition } from '@pireel/studio-engine/composition';

/** Only the theme-mount surface (frameId/palette) changed: skip the rebuild and hot-patch #root's vars.
 *  Already-inserted components carry their frozen insertion-time tokens (Block.vars, #id-scoped above
 *  #root), so a theme swap genuinely never restyles them — on this fast path AND on every later rebuild.
 *  Only the stage background and future generations pick up the new palette. */
export function themeMountOnlyChange(a: Composition | null, b: Composition): boolean {
  if (!a) return false;
  if (Object.is(a.palette, b.palette) && Object.is(a.frameId, b.frameId)) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Composition>;
  for (const k of keys) {
    if (k === 'palette' || k === 'frameId' || k === 'personFx') continue;
    if (!Object.is(a[k], b[k])) return false;
  }
  return true;
}

/** All fields identical except captionStyle (by reference) — the criterion for rebuild debounce/skip. */
export function sameExceptCapStyle(a: Composition | null, b: Composition): boolean {
  if (!a) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Composition>;
  for (const k of keys) {
    if (k === 'captionStyle') continue;
    if (!Object.is(a[k], b[k])) return false;
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
    if (!Object.is(a[k], b[k])) return false;
  }
  const sa = a.shots ?? [];
  const sb = b.shots ?? [];
  if (sa === sb) return false; // shots unchanged too = no change, leave the identity check to the normal path
  if (sa.length !== sb.length) return false;
  for (let i = 0; i < sa.length; i++) {
    const x = sa[i]!;
    const y = sb[i]!;
    if (x === y) continue;
    const { treatment: _xt, treatSize: _xs, treatCrop: _xc, preciseFraming: _xp, filter: _xf, ...rx } = x;
    const { treatment: _yt, treatSize: _ys, treatCrop: _yc, preciseFraming: _yp, filter: _yf, ...ry } = y;
    const kx = Object.keys(rx) as (keyof typeof rx)[];
    if (kx.length !== Object.keys(ry).length) return false;
    for (const k of kx) if (!Object.is(rx[k], (ry as typeof rx)[k])) return false;
  }
  return true;
}

/** Only the caption position (xPct/yPct) changed: can skip the rebuild (hf:capStyle already wrote it directly, the re-baked value is identical). */
export function capPosOnlyChange(a: Composition | null, b: Composition): boolean {
  if (!a || !sameExceptCapStyle(a, b)) return false;
  const ca = a.captionStyle;
  const cb = b.captionStyle;
  if (!ca || !cb) return Object.is(ca, cb);
  // sub (translation line) the same: position (yPct/xPct/hPct) already written via the live channel, skippable; a font-size/box-width change needs re-segmentation, must rebuild
  const sa = ca.sub ?? {};
  const sb = cb.sub ?? {};
  return (
    ca.preset === cb.preset &&
    Object.is(ca.scale, cb.scale) &&
    Object.is(ca.wPct, cb.wPct) &&
    // visual overrides (text color / plate) re-bake CSS — never skippable
    Object.is(ca.color, cb.color) &&
    Object.is(ca.bg, cb.bg) &&
    Object.is(ca.bold, cb.bold) &&
    Object.is(sa.scale, sb.scale) &&
    Object.is(sa.wPct, sb.wPct) &&
    Object.is(sa.preset, sb.preset) &&
    Object.is(sa.color, sb.color) &&
    Object.is(sa.bg, sb.bg) &&
    Object.is(sa.bold, sb.bold) &&
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
  slots: boolean; // slots changed → parent re-assembles the block and swaps the node in via hf:blockAdd (echo of an iframe text edit skips even that)
  kitProps: boolean; // kit block props → parent re-renders the one block's content via hf:blockHtml
  replace: boolean; // templateId swap → full node replace via hf:blockAdd
}
const PATCH_GEOM = new Set(['box', 'contentBox', 'scale', 'rotation']);
const PATCH_TIMING = new Set(['startSec', 'durationSec']);
const PATCH_STYLE = new Set(['bg', 'border', 'radius', 'opacity']);
const PATCH_IGNORE = new Set(['fitScale', 'label']); // not in the preview doc (fitScale goes through hf:fit separately; label only on the timeline)

/** Only block-level changes that can be patched in place (geometry/time-window/appearance/slots echo) + pure deletes: return a patch list;
 *  any other change (new block / track swap / template swap / caption re-lay / comp-level field…) returns null and goes to a full doc rebuild.
 *  On a hit, skip the rebuild (rebuild = double-buffer swap = video reload, the source of "flicker per edit") and commit the final value once into the active doc. */
export function blockPatchableChange(a: Composition | null, b: Composition): { pairs: BlockPatchPair[]; removed: Block[]; added: Block[] } | null {
  if (!a || a === b) return null;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Composition>;
  for (const k of keys) {
    if (k === 'blocks') continue;
    if (!Object.is(a[k], b[k])) return null;
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
    const p: BlockPatchPair = { a: x, b: y, geom: false, timing: false, style: false, slots: false, kitProps: false, replace: false };
    const ks = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of ks) {
      const xv = (x as unknown as Record<string, unknown>)[k];
      const yv = (y as unknown as Record<string, unknown>)[k];
      if (Object.is(xv, yv) || PATCH_IGNORE.has(k)) continue;
      if (PATCH_GEOM.has(k)) {
        if (!x.box || !y.box) return null; // box going from absent to present = a layout-mode switch, must rebuild
        p.geom = true;
      } else if (PATCH_TIMING.has(k)) p.timing = true;
      else if (PATCH_STYLE.has(k)) p.style = true;
      else if (k === 'templateId') p.replace = true;
      else if (k === 'slots') {
        // Kit blocks derive HTML from slots.props — content-only re-render (hf:blockHtml);
        // any other slots change re-assembles the whole node (hf:blockAdd replace)
        if (y.templateId.startsWith('kit:')) p.kitProps = true;
        else p.slots = true;
      }
      else return null;
    }
    if (p.geom || p.timing || p.style || p.slots || p.kitProps || p.replace) pairs.push(p);
  }
  if (!pairs.length && !removed.length && !added.length) return null;
  return { pairs, removed, added };
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
