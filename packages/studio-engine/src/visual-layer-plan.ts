import type { AtomicMediaFraming, Block, ShotFilter } from './composition-core';

export interface SupplementalVisualMediaClip {
  clipId: string;
  trackId: string;
  stackOrder: number;
  kind: 'image' | 'video';
  source: string;
  startSec: number;
  endSec: number;
  sourceInSec: number;
  sourceOutSec: number;
  fit: 'contain' | 'cover';
  muted: boolean;
  /** Per-clip video settings remain independent from the visual track's mute flag. */
  volumeDb?: number;
  audioMuted?: boolean;
  audioFadeInSec?: number;
  audioFadeOutSec?: number;
  filter?: ShotFilter;
  box?: { x: number; y: number; w: number; h: number };
  mediaFraming?: AtomicMediaFraming;
  anchorX?: number;
  anchorY?: number;
  opacity?: number;
  keyframes?: {
    box?: Array<{ atSec: number; x: number; y: number; w: number; h: number }>;
    opacity?: Array<{ atSec: number; value: number }>;
  };
}

export interface SupplementalVisualState {
  box: { x: number; y: number; w: number; h: number };
  opacity: number;
  anchorX: number;
  anchorY: number;
}

function interpolateRows<T extends { atSec: number }>(
  rows: readonly T[],
  localSec: number,
  base: T,
  mix: (left: T, right: T, progress: number) => T,
): T {
  const ordered = [base, ...rows].sort((left, right) => left.atSec - right.atSec);
  if (localSec <= ordered[0]!.atSec) return ordered[0]!;
  for (let index = 1; index < ordered.length; index++) {
    const right = ordered[index]!;
    if (localSec > right.atSec) continue;
    const left = ordered[index - 1]!;
    const span = Math.max(1e-9, right.atSec - left.atSec);
    return mix(left, right, Math.max(0, Math.min(1, (localSec - left.atSec) / span)));
  }
  return ordered.at(-1)!;
}

/** Resolve one visual's static/keyframed state at final timeline time. Shared by preview HTML and canvas export tests. */
export function supplementalVisualStateAt(visual: SupplementalVisualMediaClip, timelineSec: number): SupplementalVisualState {
  const localSec = Math.max(0, timelineSec - visual.startSec);
  const boxBase = { atSec: 0, ...(visual.box ?? { x: 0, y: 0, w: 1, h: 1 }) };
  const box = interpolateRows(visual.keyframes?.box ?? [], localSec, boxBase, (left, right, progress) => ({
    atSec: localSec,
    x: left.x + (right.x - left.x) * progress,
    y: left.y + (right.y - left.y) * progress,
    w: left.w + (right.w - left.w) * progress,
    h: left.h + (right.h - left.h) * progress,
  }));
  const opacityBase = { atSec: 0, value: visual.opacity ?? 1 };
  const opacity = interpolateRows(visual.keyframes?.opacity ?? [], localSec, opacityBase, (left, right, progress) => ({
    atSec: localSec,
    value: left.value + (right.value - left.value) * progress,
  })).value;
  return {
    box: { x: box.x, y: box.y, w: box.w, h: box.h },
    opacity,
    anchorX: visual.anchorX ?? 0.5,
    anchorY: visual.anchorY ?? 0.5,
  };
}

export type CompositionVisualLayer =
  | { kind: 'media'; stackOrder: number; visuals: SupplementalVisualMediaClip[] }
  | { kind: 'html'; stackOrder: number; blocks: Block[] };

interface AtomicMediaLayer {
  kind: 'media';
  stackOrder: number;
  tieKey: string;
  visuals: SupplementalVisualMediaClip[];
}

interface AtomicHtmlLayer {
  kind: 'html';
  stackOrder: number;
  tieKey: string;
  blocks: Block[];
}

type AtomicLayer = AtomicMediaLayer | AtomicHtmlLayer;

/**
 * One bottom-to-top visual plan shared by iframe assembly and browser compositing.
 * Adjacent tracks of the same renderer are coalesced into one pass; media/html boundaries remain
 * explicit so canvas export can interleave decoded frames with rasterized Pireel blocks.
 */
export function compositionVisualLayerPlan(
  blocks: readonly Block[],
  visuals: readonly SupplementalVisualMediaClip[],
): CompositionVisualLayer[] {
  const atoms: AtomicLayer[] = [];
  const mediaByTrack = new Map<string, SupplementalVisualMediaClip[]>();
  for (const visual of visuals) {
    mediaByTrack.set(visual.trackId, [...(mediaByTrack.get(visual.trackId) ?? []), visual]);
  }
  for (const [trackId, trackVisuals] of mediaByTrack) {
    atoms.push({
      kind: 'media',
      stackOrder: trackVisuals[0]!.stackOrder,
      tieKey: `0:${trackId}`,
      visuals: trackVisuals,
    });
  }

  const blocksByTrack = new Map<number, Block[]>();
  for (const block of blocks) {
    blocksByTrack.set(block.trackIndex, [...(blocksByTrack.get(block.trackIndex) ?? []), block]);
  }
  for (const [stackOrder, trackBlocks] of blocksByTrack) {
    atoms.push({ kind: 'html', stackOrder, tieKey: `1:${stackOrder}`, blocks: trackBlocks });
  }

  atoms.sort((left, right) => left.stackOrder - right.stackOrder || left.tieKey.localeCompare(right.tieKey));
  const result: CompositionVisualLayer[] = [];
  for (const atom of atoms) {
    const previous = result.at(-1);
    if (atom.kind === 'media' && previous?.kind === 'media') {
      previous.visuals.push(...atom.visuals);
      continue;
    }
    if (atom.kind === 'html' && previous?.kind === 'html') {
      previous.blocks.push(...atom.blocks);
      continue;
    }
    result.push(atom.kind === 'media'
      ? { kind: 'media', stackOrder: atom.stackOrder, visuals: [...atom.visuals] }
      : { kind: 'html', stackOrder: atom.stackOrder, blocks: [...atom.blocks] });
  }
  return result;
}
