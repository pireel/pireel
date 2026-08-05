import type { GenElementResult } from '../../element-history';

export type ArtDirectedElementSpec = Omit<GenElementResult, 'label' | 'presetId'> & { presetId: string };
export const ART_DIRECTED_PRESET_VERSION = 5;

/** Art-directed template components are real insertable elements, not decorative card mockups. */
export const artElement = (
  seedId: string,
  presetId: string,
  body: string,
  css: string,
  timelineBody: string,
): ArtDirectedElementSpec => ({
  seedId,
  presetId,
  innerHtml: `<svg class="artboard-frame" data-pireel-art-preset="${ART_DIRECTED_PRESET_VERSION}" viewBox="0 0 120 67.5" preserveAspectRatio="none" aria-hidden="true" focusable="false"><foreignObject x="0" y="0" width="120" height="67.5"><div xmlns="http://www.w3.org/1999/xhtml" class="artboard">${body}</div></foreignObject></svg>
<style>
#${seedId} .artboard-frame{position:absolute;inset:0;display:block;width:100%;height:100%;overflow:hidden}
#${seedId} .artboard{position:relative;width:120px;height:67.5px;overflow:hidden;font-family:inherit;box-sizing:border-box}
#${seedId} .artboard *{box-sizing:border-box}
${css}
</style>`,
  timelineBody,
  presetVersion: ART_DIRECTED_PRESET_VERSION,
  designW: 1920,
  designH: 1080,
  previewFit: 'canvas',
  insertFit: 'canvas',
  insertScale: 0.56,
});
