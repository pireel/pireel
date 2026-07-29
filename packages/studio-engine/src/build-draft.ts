/**
 * Auto-storyboard — **lay_out stage**. plan (scene storyboard) + speech sentences + visual analysis → the **structure** of a Composition:
 * video-track shot slices (cut only at **visual state-change points**: framing changes ∪ source hard cuts; scene boundaries don't auto-become cuts)
 * + framing (corner/split/punch make room) + **graphic-placeholder blocks**.
 *
 * Key (2026-06 scene rewrite): plan already merged sentences into scenes, each carrying a **graphic design brief**. Here:
 *  - shots = scene starts (semantic cuts) ∪ real source cuts; with no scenes, fall back to per-sentence.
 *  - each scene (non-screencast) gets a **graphic placeholder** (slots.spec = component + brief + real data); the compose step turns each into a designed graphic.
 *  - **graphics first**; captions/kinetic-text are a theme choice (theme.captions, off by default in general); only emphasis keywords are optionally overlaid.
 */

import { wordsFromText } from './caption-fx';
import {
  type Block,
  type Composition,
  type ShotTreatment,
  type VideoShot,
  captionBlock,
  emptyComposition,
  freeTrack,
  mediaBlock,
  shotId,
  shotsFromSentences,
  treatmentVacancyBox,
} from './composition';
import { t } from './i18n';
import { getTheme } from './theme';
import type { DraftPlan, Framing, GraphicSize, Scene, SceneGraphic } from './plan';
import { type AsrSegment, captionBlocksFromAsr } from './build-blocks';
import type { VisualTimeline } from './visual-types';

export type Box = { x: number; y: number; w: number; h: number };
type VisSeg = VisualTimeline['segments'][number];
/**
 * **Fallback** fixed box for graphic placement under full/punch: lower safe zone, bottom edge at y=0.84,
 * staying out of the caption no-go zone (visual.ts CAPTION_RESERVE reserves the bottom 16%). Prefer graphicBoxFromGeometry when geometry is available.
 */
const FULL_GRAPHIC_BOX: Box = { x: 0.07, y: 0.46, w: 0.86, h: 0.38 };
/** Min graphic-placeholder duration (sec): if a title squeezes it shorter than this, it's not worth showing — skip. */
const MIN_GRAPHIC_SEC = 0.8;
/** Min framing hold (sec): scenes shorter than this get no framing (a punch-in/corner that flashes by reads as flicker).
 *  The "HOLD ≥1s" in the prompt only constrains LLM planning; this is the layout layer's hard fallback. Manual user cuts are exempt (the render layer runs them as-is). */
const MIN_FRAMING_HOLD_SEC = 1;
/** Nearby-cut merge threshold (sec), also the **min auto-shot segment length**: a visual cut hugging an already-kept cut is dropped
 *  (semantics win) — cuts spaced ≥ this value, so auto-storyboard stops producing <1s fragment shots. */
export const MIN_CUT_GAP_SEC = 1;

const intersects = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Graphic placement for full/punch scenes: **geometry safe-zone driven** — take the largest empty rect of the dominant
 * segment in the window (the one overlapping the scene longest; rects already have faces/caption bands subtracted, largest-first), then:
 * margin inset → clamp bottom to the caption no-go zone (y+h ≤ 0.84) → size floor (skip if no decent graphic fits) →
 * **cross-segment face avoidance** (when a scene spans multiple segments, the dominant segment's empty area may cover another segment's face). All fail → fall back to the fixed box.
 */
export function graphicBoxFromGeometry(visual: VisualTimeline | undefined, from: number, to: number): Box {
  const segs = (visual?.segments ?? []).filter((s) => s.end > from + 0.05 && s.start < to - 0.05);
  const withGeom = segs.filter((s) => s.geom?.rects?.length);
  if (!withGeom.length) return FULL_GRAPHIC_BOX;
  const overlap = (s: { start: number; end: number }) => Math.min(s.end, to) - Math.max(s.start, from);
  const dominant = withGeom.reduce((a, b) => (overlap(b) > overlap(a) ? b : a));
  const faces = segs.map((s) => s.geom?.face).filter((f): f is Box => !!f);
  return pickGraphicBox(dominant.geom!.rects, faces);
}

/** rects→box selection core (shared by main source and inserted clips): margin inset → clamp bottom to caption no-go zone (y+h ≤ 0.84) →
 *  size floor (w≥0.42/h≥0.2, skip if no decent graphic fits) → face avoidance → all fail, return fallback box. */
export function pickGraphicBox(rects: Box[], faces: Box[], fallback: Box = FULL_GRAPHIC_BOX): Box {
  const M = 0.03; // margin inset: empty rects often hug the frame edge; keep graphics off the edge
  for (const r of rects) {
    const x = r.x + M;
    const y = r.y + M;
    const w = r.w - M * 2;
    const h = Math.min(r.h - M * 2, 0.84 - y); // clamp to caption no-go zone
    if (w < 0.42 || h < 0.2) continue; // no decent graphic fits
    const box = { x, y, w, h };
    if (faces.some((f) => intersects(box, f))) continue;
    return box;
  }
  return fallback;
}

/** Size tier → carve the actual box within the safe base rect (plan sets the tier, geometry sets the base, neither oversteps):
 *  poster = whole base · card = full width, height clamped to 0.42 and vertically centered (split's full column reserved for poster) ·
 *  banner = full-width strip vertically centered · badge = small tag in the top-left. Fixes "every graphic is the same fallback box". */
export function graphicBoxForSize(base: Box, size: GraphicSize | undefined): Box {
  switch (size) {
    case 'poster':
      return base;
    case 'banner': {
      const h = Math.min(base.h, 0.18);
      return { x: base.x, y: base.y + (base.h - h) / 2, w: base.w, h };
    }
    case 'badge': {
      const w = Math.min(base.w, 0.46);
      const h = Math.min(base.h, 0.18);
      return { x: base.x, y: base.y, w, h };
    }
    default: {
      const h = Math.min(base.h, 0.42);
      return { x: base.x, y: base.y + (base.h - h) / 2, w: base.w, h };
    }
  }
}

/** Backdrop hint for the graphic (lets compose decide "card surface or not", instead of a blanket rule):
 *  corner/split empty area = solid page color (video shrunk aside), card optional, open layouts encouraged;
 *  full/punch = live moving footage, needs a separation device (card/scrim/strong type treatment). */
function backdropNote(treatment: ShotTreatment, vis: VisSeg | null): string {
  if (treatment !== 'full' && treatment !== 'punch-in') {
    return 'BACKDROP: flat theme page — the video is shrunk aside; your box sits on the solid page color, NOT on footage. A filled card is OPTIONAL here; open editorial composition directly on the page is welcome.';
  }
  const d = vis?.label.desc ? ` Scene behind: ${vis.label.desc}.` : '';
  const t = vis?.label.hasText ? ' The footage already carries burned-in text — keep the fragment visually quiet and clearly separated.' : '';
  return `BACKDROP: live moving footage behind your box.${d}${t} Default to direct composition on the footage — high-contrast ink, strong type, NO filled background; use a card/scrim only for dense structured content (multi-row data / chart / table).`;
}

/** Cut merge: keep all semantic cuts (framing-change points); drop any visual cut within MIN_CUT_GAP_SEC of a kept cut. */
export function mergeCuts(semantic: number[], visualCuts: number[]): { start: number }[] {
  const kept = [...semantic].sort((a, b) => a - b);
  for (const c of [...visualCuts].sort((a, b) => a - b)) {
    if (kept.some((k) => Math.abs(k - c) < MIN_CUT_GAP_SEC)) continue;
    kept.push(c);
  }
  return kept.sort((a, b) => a - b).map((start) => ({ start }));
}

/** Storyboard: place structure + graphic placeholders (no designed graphics yet). The compose step turns each placeholder into a designed graphic. */
export function layoutFromPlan(
  plan: DraftPlan,
  opts: {
    video: { url: string; durationSec: number; width?: number; height?: number };
    sentences: AsrSegment[];
    cuts?: number[];
    visual?: VisualTimeline;
  },
): Composition {
  const c = emptyComposition();
  c.theme = 'general';
  c.video = { url: opts.video.url, durationSec: opts.video.durationSec };
  if (opts.video.width && opts.video.height) {
    c.width = opts.video.width;
    c.height = opts.video.height;
  }
  const captions = getTheme(c.theme).captions; // theme decides whether to show per-sentence captions/kinetic-text (general=false)
  const end = opts.video.durationSec;
  const sents = opts.sentences;
  const blocks: Block[] = [];
  // track = layer: when placing a block, find a free track among already-placed blocks (chips on the same track and window would overlap). Template default track is the starting preference.
  const put = (b: Block) => blocks.push({ ...b, trackIndex: freeTrack(blocks, b.startSec, b.durationSec, b.trackIndex) });
  const treatments: { from: number; to: number; treatment: ShotTreatment }[] = [];

  const sStart = (i: number) => sents[Math.max(0, Math.min(sents.length - 1, i))]?.start ?? 0;
  const sEnd = (i: number) => sents[Math.max(0, Math.min(sents.length - 1, i))]?.end ?? end;

  // opening title → placeholder (compose designs it into an opening card)
  if (plan.title) {
    put(
      placeholder(titleInstruction(plan.title.text, plan.title.sub, 'opening title card'), { x: 0.08, y: 0.3, w: 0.84, h: 0.4 }, 0, plan.title.durationSec, plan.title.text),
    );
  }

  const scenes = plan.scenes ?? [];
  for (const scene of scenes) {
    const start = sStart(scene.from);
    const stop = sEnd(scene.to);
    const mid = (start + stop) / 2;
    const vis = opts.visual ? visualAt(opts.visual, mid) : null;
    const screen = !!vis && (vis.label.content === 'screen' || vis.label.content === 'slide');

    // Framing: screencasts don't shrink; otherwise follow framing (corner/half direction set by which side the person is on).
    // Recorded per **scene interval** (not a single point) — a scene with source cuts splits into multiple shots, and the whole
    // span must hold the framing; otherwise it snaps back to full mid-way while the graphic still hangs on and covers the face.
    // Hard constraint (restraint enforced in the layout layer; the prompt only handles the LLM side): scene < 1s gets no framing.
    const raw = screen ? 'full' : framingToTreatment(scene.framing, vis, { w: c.width, h: c.height });
    const treatment = stop - start >= MIN_FRAMING_HOLD_SEC ? raw : 'full';

    // Graphic placeholder (screencast scenes get no overlaid graphic; theme graphics come first). Shot boundaries use no transition (jump cut);
    // corner/split framing is itself a 0.5s smooth transition, so no extra transition block is needed.
    // Start avoids the opening title card (same track and area, overlapping would blur): defer to max(scene start, title end); skip if too little remains.
    let placedGraphic = false;
    if (scene.graphic && !screen) {
      const titleEnd = plan.title?.durationSec ?? 0;
      const gStart = Math.max(start, titleEnd);
      const gDur = stop - gStart;
      if (gDur >= MIN_GRAPHIC_SEC) {
        // corner/split use the empty area freed by framing; full/punch use the geometry-safe-zone-driven placement (fall back to fixed box with no geometry).
        // Within the safe base, carve the actual box by plan's size tier — size set by narrative weight, no longer uniform.
        const vac = treatmentVacancyBox(treatment);
        const base = vac ?? graphicBoxFromGeometry(opts.visual, start, stop);
        // ANCHOR: the graphic outlives its scene (blocks live on their own tracks — duration is
        // free), riding across whatever framing follows. Structural guard, not prompt-side: an
        // anchored graphic is FORCED to badge scale, because any larger box chosen against this
        // scene's framing would bury the speaker once the framing changes under it.
        const holdStop = scene.graphic.holdTo !== undefined && scene.graphic.holdTo > scene.to ? sEnd(scene.graphic.holdTo) : stop;
        const anchored = holdStop > stop + 0.05;
        // Corner hands the graphic the WHOLE freed block: shrinking the speaker aside to then
        // float a small card in the emptiness reads as a mistake — the freed area IS the layout.
        // Splits keep the size carve (a card centred in a clean half reads fine).
        const box = anchored ? graphicBoxForSize(base, 'badge') : treatment.startsWith('corner') ? base : graphicBoxForSize(base, scene.graphic.size);
        put(placeholder(graphicInstruction(scene.graphic, backdropNote(treatment, vis)), box, gStart, (anchored ? holdStop : stop) - gStart, graphicGist(scene.graphic)));
        placedGraphic = true;
      }
    }
    // corner/split exist to make room for a graphic: keep them only if a graphic actually landed, else revert to full — no more
    // "person shrunk aside, empty area holding nothing" (covers both no planned graphic and a placeholder skipped by the duration floor).
    // punch-in is emphasis, not room-making, so it holds even with no graphic.
    const needsGraphic = treatment !== 'full' && treatment !== 'punch-in';
    if (treatment !== 'full' && (!needsGraphic || placedGraphic)) treatments.push({ from: start, to: stop, treatment });

    // Optional overlaid text: only when the theme has captions on + the scene provided keywords
    if (captions && scene.emphasis?.length) {
      put(keywordBlock(scene.emphasis.join(' '), start, Math.min(stop, start + 1.4)));
    }
  }

  // When the theme has captions on, lay out captions from the speech script (independent of scenes; long-sentence splitting in captionBlocksFromAsr).
  // preset is only the initial form; global kinetic-text styles override once set. Sentence captions are a dedicated layer (global styles keyed by
  // isSentenceCaption); adjacent sentences occasionally overlap by milliseconds — don't use put() to find a free track, being bumped to another row is messier.
  if (captions) blocks.push(...captionBlocksFromAsr(sents, { preset: 'ln-clean', yPct: 93 }));

  // closing CTA → placeholder
  if (plan.outro) {
    put(
      placeholder(titleInstruction(plan.outro.text, plan.outro.sub, 'closing CTA card'), { x: 0.08, y: 0.32, w: 0.84, h: 0.36 }, Math.max(0, end - plan.outro.durationSec), plan.outro.durationSec, plan.outro.text),
    );
  }

  c.blocks = blocks;
  // shots = **visual state-change points**: framing-change points (adjacent same-framing merged first) ∪ real source cuts.
  // Scenes (semantic rhythm) are only graphic units and no longer auto-cut the video track — when the speaker footage itself doesn't change,
  // chapter feel is carried by overlaid graphics; chopping the video only fragments it (decided from user observation); use split_shot to subdivide.
  // Merge nearby cuts (framing wins) to keep fragment shots from crowding the timeline.
  // Bridge inter-sentence breathing gaps: framing intervals are recorded by scene sentence ranges, and adjacent sentences have pauses — without
  // bridging, the gap produces a sub-second full fragment shot, playing back as "corner → flash full → half-split" (the flicker users reported).
  // The gap goes to the preceding framing; the switch happens at the next state's own start. A gap ≥ threshold counts as real full-screen content
  // (a full scene is at least one sentence long) and isn't bridged.
  const BRIDGE_GAP_SEC = 1.5;
  const sorted = [...treatments].sort((a, b) => a.from - b.from).map((t) => ({ ...t }));
  for (let i = 0; i + 1 < sorted.length; i++) {
    const gap = sorted[i + 1]!.from - sorted[i]!.to;
    if (gap > 0 && gap < BRIDGE_GAP_SEC) sorted[i]!.to = sorted[i + 1]!.from;
  }
  const coalesced: typeof treatments = [];
  for (const t of sorted) {
    const prev = coalesced[coalesced.length - 1];
    if (prev && prev.treatment === t.treatment && t.from - prev.to < 0.05) prev.to = Math.max(prev.to, t.to);
    else coalesced.push(t);
  }
  const semantic = coalesced.flatMap((t) => [t.from, t.to]);
  // Visual cuts: keep only those where **content truly changes** (speaker → screencast/b-roll, etc.); same-content jump cuts don't enter the storyboard
  // — framing direction is set by scene midpoint, and fragment cuts only shatter the timeline; cuts within 1s of the head/tail are dropped (avoid fragmented start/end).
  const visualCuts = contentCuts(opts.visual, opts.cuts ?? []).filter((t) => t > MIN_CUT_GAP_SEC && t < end - MIN_CUT_GAP_SEC);
  const baseShots = shotsFromSentences(mergeCuts(semantic, visualCuts), end);
  c.shots = applyTreatments(baseShots, coalesced);
  return c;
}

/** Visual-cut content filter: keep a cut only if the content labels of the segments on either side differ (speaker ↔ screencast/b-roll/slide).
 *  Same-content jump cuts (creator speaker norm, one cut per sentence) don't enter the storyboard — no effect on framing/render,
 *  they only shatter the storyboard strip (decided from user observation). With no visual semantic data / no matching segment boundary, keep conservatively. */
export function contentCuts(visual: VisualTimeline | undefined, cuts: number[]): number[] {
  const segs = visual?.segments ?? [];
  if (!segs.length) return cuts;
  return cuts.filter((c) => {
    const before = segs.find((s) => Math.abs(s.end - c) < 0.15);
    const after = segs.find((s) => Math.abs(s.start - c) < 0.15);
    if (!before || !after) return true;
    return before.label.content !== after.label.content;
  });
}

/* ============================ Framing / placement ============================ */

/**
 * Framing → concrete ShotTreatment. Three independent inputs, and they used to be confused:
 *
 *  - THE MOVE comes from the plan: corner shrinks the speaker into a corner, split gives them half.
 *  - THE CANVAS picks the SPLIT AXIS. Halving the long side leaves two usable halves; halving the
 *    short side leaves slivers (l/r on portrait) or flat strips (t/b on landscape). So a portrait
 *    frame splits top/bottom and a landscape frame splits left/right — the illegal pairing cannot
 *    be expressed here, rather than being a rule the planning prompt is asked to respect.
 *  - THE PERSON picks the DIRECTION for sideways moves only (corner / split-l/r): keep them on
 *    the side they already occupy, free the other for the graphic. Vertical splits don't care —
 *    the band re-frames around the speaker, so portrait split is always video-bottom (split-b).
 */
function framingToTreatment(framing: Framing, vis: VisSeg | null, canvas: { w: number; h: number }): ShotTreatment {
  const onLeft = vis?.label.person === 'left';
  switch (framing) {
    case 'punch-in':
      return 'punch-in';
    case 'corner':
      return onLeft ? 'corner-tl' : 'corner-br';
    case 'split': {
      if (canvas.w >= canvas.h) return onLeft ? 'split-l' : 'split-r';
      // Portrait: video always takes the BOTTOM half — the split band re-frames around the
      // speaker anyway, so their face position is irrelevant; the graphic reads first up top.
      return 'split-b';
    }
    default:
      return 'full';
  }
}

/* ============================ Graphic placeholders ============================ */

/** Placeholder = media block (shows a placeholder in edit mode) + slots.spec (the instruction for the compose step). Compose turns it into a designed graphic and replaces it. */
function placeholder(spec: string, box: Box, startSec: number, durationSec: number, gist: string): Block {
  const b = mediaBlock({ startSec, durationSec: Math.max(0.8, durationSec), box, trackIndex: 2, label: gist.slice(0, 16) || t('engine.graphicPending') });
  b.slots = { spec };
  return b;
}

/** Whether this is a graphic-placeholder block. */
export function isPlaceholder(b: Block): boolean {
  return b.templateId === 'media' && typeof (b.slots as { spec?: unknown }).spec === 'string';
}
/** Get a placeholder block's graphic instruction. */
export function placeholderSpec(b: Block): string {
  return String((b.slots as { spec?: unknown }).spec ?? '');
}

/** Within inserted-clip windows, drop **main-source scene** graphic placeholders: their briefs come from the main-source speech, and once
 *  shifted into the insert window they'd be mismatched. The inserted clip's own graphics go through insertedClipPlaceholder (equal footing: matched to
 *  its own content), not skipped. windows = final-cut time windows; only placeholders are dropped, other blocks (captions/titles) untouched. */
export function dropPlaceholdersInWindows(blocks: Block[], windows: { start: number; end: number }[]): Block[] {
  if (!windows.length) return blocks;
  return blocks.filter((b) => {
    if (!isPlaceholder(b)) return true;
    const s = b.startSec;
    const e = b.startSec + b.durationSec;
    return !windows.some((w) => s < w.end - 0.05 && e > w.start + 0.05);
  });
}

/** Graphic placeholder for an inserted clip (**equal footing, per the user's decision**: like the main source, the clip gets a graphic from its own speech content).
 *  layout = the clip's own geometry analysis (free MediaPipe pass, see visual.insertedClipSafeZone →
 *  pickGraphicBox); missing (no File / analysis failed) still falls back to FULL_GRAPHIC_BOX.
 *  spec lets compose pick the component by content (same freedom as add_block), and carries a BACKDROP line — an inserted clip
 *  is always live moving footage (wording aligned with backdropNote's full/punch branch). No speech / too short → no placeholder —
 *  a graphic with no data behind it is decoration, better omitted. */
export function insertedClipPlaceholder(
  win: { start: number; end: number },
  speech: string,
  layout?: { box: Box; hasFace?: boolean },
): Block | null {
  const dur = win.end - win.start;
  const text = speech.trim();
  if (!text || dur < MIN_GRAPHIC_SEC + 0.4) return null;
  const face = layout?.hasFace
    ? ' A face was detected in this clip — the given box already avoids it; keep everything inside the box.'
    : '';
  const backdrop = `BACKDROP: live moving footage behind your box (inserted real-life clip). Default to direct composition on the footage — high-contrast ink, strong type, NO filled background; use a card/scrim only for dense structured content (multi-row data / chart / table).${face}`;
  // Leave 0.2s at each end: the graphic doesn't butt against the clip's in/out cuts
  return placeholder(
    `Design ONE graphic for what this inserted clip says (pick the component by content: big number / comparison / flow / bullets; pull data VERBATIM from the words, never invent): "${text.slice(0, 200)}"\n${backdrop}`,
    layout?.box ?? FULL_GRAPHIC_BOX,
    Math.round((win.start + 0.2) * 10) / 10,
    Math.round(Math.max(MIN_GRAPHIC_SEC, dur - 0.4) * 10) / 10,
    text.slice(0, 12),
  );
}

/** Inserted-clip storyboard on equal footing: using the scenes plan gave this clip (**the clip's own sentence indices**), split the whole
 *  clip into multiple shots + framing + per-scene graphic placeholders. Same restraint constraints as the main-source layoutFromPlan
 *  (<1s no framing, corner/split with no graphic reverts to full, graphics shorter than the floor are skipped). Returns null = scenes/sentences
 *  don't match (caller falls back to the old path of one shot + one whole-window placeholder).
 *  With no per-segment visual analysis for the person's side, infer from the geometry safe zone: graphic safe zone on the left → person on the right (corner-br/split-r). */
export function layoutInsertWindow(args: {
  /** This clip's final-cut time window. */
  win: { start: number; end: number };
  /** The original whole inserted shot (src/srcStart/srcEnd are the clip's own source clock). */
  clip: VideoShot;
  /** Sentences within the clip window (its own source clock; index shares the domain of plan's clip scene indices). */
  sentences: { index: number; start: number; end: number; text: string }[];
  scenes: Scene[];
  layout?: { box: Box; hasFace?: boolean };
}): { shots: VideoShot[]; blocks: Block[] } | null {
  const { win, clip, sentences, scenes, layout } = args;
  if (!scenes.length || !sentences.length) return null;
  const clamp = (t: number) => Math.max(clip.srcStart, Math.min(clip.srcEnd, t));
  const sAt = (i: number) => sentences[Math.max(0, Math.min(sentences.length - 1, i))]!;
  // Person side: geometry safe zone (graphic placement) in the left half → person on the right; missing geometry defaults to person-right (corner-br convention)
  const personLeft = layout ? layout.box.x + layout.box.w / 2 >= 0.5 : false;
  const toTreatment = (f: Framing): ShotTreatment => {
    switch (f) {
      case 'punch-in':
        return 'punch-in';
      case 'corner':
        return personLeft ? 'corner-tl' : 'corner-br';
      case 'split':
        return personLeft ? 'split-l' : 'split-r';
      default:
        return 'full';
    }
  };
  const face = layout?.hasFace ? ' A face was detected in this clip — the given box already avoids it; keep everything inside the box.' : '';
  const backdrop = `BACKDROP: live moving footage behind your box (inserted real-life clip). Default to direct composition on the footage — high-contrast ink, strong type, NO filled background; use a card/scrim only for dense structured content (multi-row data / chart / table).${face}`;

  const blocks: Block[] = [];
  const treatments: { from: number; to: number; treatment: ShotTreatment }[] = []; // clip source clock
  for (const scene of scenes) {
    const a = clamp(sAt(scene.from).start);
    const b = clamp(sAt(scene.to).end);
    if (b - a < 0.2) continue;
    const raw = toTreatment(scene.framing);
    const treatment = b - a >= MIN_FRAMING_HOLD_SEC ? raw : 'full';
    let placedGraphic = false;
    if (scene.graphic) {
      const es = win.start + (a - clip.srcStart) + 0.2; // 0.2s lead-in: don't butt against the cut
      const ee = Math.min(win.end, win.start + (b - clip.srcStart)) - 0.2;
      if (ee - es >= MIN_GRAPHIC_SEC) {
        const vac = treatmentVacancyBox(treatment);
        const box = graphicBoxForSize(vac ?? layout?.box ?? FULL_GRAPHIC_BOX, scene.graphic.size);
        blocks.push(placeholder(graphicInstruction(scene.graphic, backdrop), box, Math.round(es * 10) / 10, Math.round((ee - es) * 10) / 10, graphicGist(scene.graphic)));
        placedGraphic = true;
      }
    }
    const needsGraphic = treatment !== 'full' && treatment !== 'punch-in';
    if (treatment !== 'full' && (!needsGraphic || placedGraphic)) treatments.push({ from: a, to: b, treatment });
  }

  // Merge adjacent same-framing → cuts = framing state-change points (same idea as the main source: scene semantics don't auto-cut, only framing does)
  const sorted = [...treatments].sort((x, y) => x.from - y.from);
  const coalesced: typeof treatments = [];
  for (const t of sorted) {
    const prev = coalesced[coalesced.length - 1];
    if (prev && prev.treatment === t.treatment && t.from - prev.to < 0.05) prev.to = Math.max(prev.to, t.to);
    else coalesced.push(t);
  }
  const bounds = [...new Set([clip.srcStart, ...coalesced.flatMap((t) => [t.from, t.to]).map((t) => Math.round(t * 10) / 10), clip.srcEnd])]
    .filter((t) => t >= clip.srcStart - 1e-3 && t <= clip.srcEnd + 1e-3)
    .sort((x, y) => x - y);
  const shots: VideoShot[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const a = bounds[i]!;
    const b = bounds[i + 1]!;
    if (b - a < 0.05) continue;
    const mid = (a + b) / 2;
    const t = coalesced.find((x) => mid >= x.from && mid < x.to)?.treatment ?? 'full';
    shots.push({ ...clip, id: shotId(), srcStart: a, srcEnd: b, treatment: t });
  }
  if (!shots.length) return null;
  return { shots, blocks };
}

const SIZE_INTENT: Record<GraphicSize, string> = {
  badge: 'compact badge — one fact, minimal chrome, no filler',
  card: 'standard mid-size fragment',
  banner: 'full-width strip — lay the content out horizontally',
  poster: 'HERO moment — use the whole given box at editorial scale (oversized focal element, generous negative space)',
};

/** SceneGraphic → graphic instruction. Machine-generated instructions use English (same language as system, models follow more reliably);
 *  brief/data embedded verbatim (in the speech script's language); the language of visible on-screen text is pinned by BLOCK_SYSTEM's LANGUAGE rule.
 *  backdrop = backdrop hint (empty-area solid color / live moving footage), leaving compose to decide whether to use a card surface. */
function graphicInstruction(g: SceneGraphic, backdrop?: string): string {
  const data = g.data ? `\nREAL DATA (use these values verbatim from the script; do NOT invent numbers): ${g.data}` : '';
  const size = `\nSIZE INTENT: ${SIZE_INTENT[g.size ?? 'card']}.`;
  const bd = backdrop ? `\n${backdrop}` : '';
  // No component named here on purpose — the graphics layer picks it from the brief and the data,
  // with the box and the theme's stagings in hand. See the note at the top of plan.ts.
  return `Create ONE designed graphic for this beat. Not a subtitle, not plain styled text; it needs real structure. What it shows: ${g.brief}${data}${size}${bd}`;
}

/** Short label text for the placeholder block. */
function graphicGist(g: SceneGraphic): string {
  return (g.data || g.brief).slice(0, 16);
}

function titleInstruction(text: string, sub: string | undefined, role: string): string {
  return `Create a ${role}: “${text}”${sub ? ` with a sub-line “${sub}”` : ''}. Centered or editorial layout, on-theme. Keep the given text verbatim (it is already in the script's language).`;
}

/* ============================ Kinetic text (when the theme has it on) ============================ */

/** Keyword pop: keywords from the speech, slammed in large near the top. Used only when theme.captions. */
function keywordBlock(kw: string, start: number, end: number): Block {
  const words = wordsFromText(kw, start, Math.min(end, start + 1.2));
  const b = captionBlock({ effect: 'kinetic-slam', words, label: kw, trackIndex: 2 });
  b.box = { x: 0.1, y: 0.18, w: 0.8, h: 0.34 };
  return b;
}

/** Apply each scene's framing interval to every shot falling within it (membership by shot midpoint) — multiple shots in a scene all hold the framing. */
function applyTreatments(shots: VideoShot[], treatments: { from: number; to: number; treatment: ShotTreatment }[]): VideoShot[] {
  return shots.map((s) => {
    const mid = (s.srcStart + s.srcEnd) / 2;
    const tr = treatments.find((t) => mid >= t.from - 0.01 && mid < t.to + 0.01);
    return tr ? { ...s, treatment: tr.treatment } : s;
  });
}

/** Find the visual segment covering moment t (fall back to the last segment). */
function visualAt(v: VisualTimeline, t: number): VisSeg | null {
  return v.segments.find((s) => t >= s.start - 0.01 && t < s.end + 0.01) ?? v.segments.at(-1) ?? null;
}
