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

/** The elements one pass draws: one HTML track's blocks, or everything for the person-matte pass,
 *  without those the timeline has hidden. */
export function browserOverlayElements(
  root: HTMLElement,
  document: Document,
  blocks?: readonly { id: string }[],
): HTMLElement[] {
  const elements = blocks
    ? blocks.map((block) => document.getElementById(block.id)).filter((element): element is HTMLElement => !!element)
    : [...root.children] as HTMLElement[];
  return elements.filter((element) => element.style.visibility !== 'hidden');
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
  for (const element of browserOverlayElements(root, document, blocks)) {
    result += serializer.serializeToString(withCanvasSnapshots(element, document));
  }
  return `${result}</div>`;
}

/**
 * Canvas pixels are not part of serialized markup, so a canvas-drawn layer (a WebGL component, a
 * matte) would export empty. Each canvas in the clone becomes an <img> of what the live canvas
 * shows at this seek, with the same attributes; an element without canvases is returned as is.
 * A canvas that cannot be read (tainted, lost context) is left for the empty result it had before.
 */
export function withCanvasSnapshots(element: HTMLElement, document: Document): Node {
  const live = element.querySelectorAll('canvas');
  if (!live.length) return element;
  const clone = element.cloneNode(true) as HTMLElement;
  const copies = clone.querySelectorAll('canvas');
  live.forEach((canvas, index) => {
    const copy = copies[index];
    if (!copy) return;
    let src = '';
    try {
      src = canvas.toDataURL('image/png');
    } catch {
      return;
    }
    const img = document.createElement('img');
    for (const attr of Array.from(copy.attributes)) img.setAttribute(attr.name, attr.value);
    img.setAttribute('src', src); // class/style carry over, so the stylesheet sizes it like the canvas
    copy.replaceWith(img);
  });
  return clone;
}
