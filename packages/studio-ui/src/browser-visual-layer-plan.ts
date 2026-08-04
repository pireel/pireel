import {
  compositionVisualLayerPlan,
  type Composition,
  type CompositionVisualLayer,
  type SupplementalVisualMediaClip,
  type VideoShotTimelinePlacement,
  videoTrackShots,
} from '@pireel/studio-engine/composition';

export function personMatteCompositingActive(
  comp: Composition,
  videoPlacements?: readonly VideoShotTimelinePlacement[],
): boolean {
  const placedIds = videoPlacements === undefined
    ? null
    : new Set(videoPlacements.map((placement) => placement.shotId));
  return videoTrackShots(comp).some((shot) => (!placedIds || placedIds.has(shot.id)) && shot.personMatte);
}

/** Browser pass plan. Person extraction deliberately wraps the neutral stack as one semantic pass. */
export function browserVisualLayerPlan(
  comp: Composition,
  visuals: readonly SupplementalVisualMediaClip[],
  videoPlacements?: readonly VideoShotTimelinePlacement[],
): CompositionVisualLayer[] {
  if (!personMatteCompositingActive(comp, videoPlacements)) {
    return compositionVisualLayerPlan(comp.blocks, visuals);
  }
  const mediaLayers = compositionVisualLayerPlan([], visuals)
    .filter((layer): layer is Extract<CompositionVisualLayer, { kind: 'media' }> => layer.kind === 'media');
  return [
    ...mediaLayers,
    { kind: 'html' as const, stackOrder: comp.blocks[0]?.trackIndex ?? 0, blocks: [...comp.blocks] },
  ];
}

/** Serialize either one HTML-track pass or the complete person-matte overlay pass. */
export function serializeBrowserOverlayElements(
  root: HTMLElement,
  document: Document,
  blocks?: readonly { id: string }[],
): string {
  const serializer = new XMLSerializer();
  const shell = serializer.serializeToString(root.cloneNode(false));
  const open = shell.endsWith('/>') ? `${shell.slice(0, -2)}>` : shell.slice(0, shell.lastIndexOf('</'));
  let result = open;
  const elements = blocks
    ? blocks.map((block) => document.getElementById(block.id)).filter((element): element is HTMLElement => !!element)
    : [...root.children] as HTMLElement[];
  for (const element of elements) {
    if (element.style.visibility === 'hidden') continue;
    result += serializer.serializeToString(element);
  }
  return `${result}</div>`;
}
