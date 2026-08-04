import type { Block } from './composition-core';

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
