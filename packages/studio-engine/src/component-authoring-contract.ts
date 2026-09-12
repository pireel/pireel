import { artPresetTextScale, BLOCK_MIN_READABLE_FONT_PX, BLOCK_TEXT_BASELINE_PX } from './block-typography';

/** One authoring vocabulary for every HTML generation entry, independent of edit/new/host surface. */
export const COMPONENT_COORDINATE_CONTRACT = `SIZING — use the target box and its coordinate system supplied in the request. Ordinary HTML/CSS px are canvas pixels; do not assume a fixed 1080px width or copy a reference's numeric sizes into a different coordinate system. Use flex/grid and percentages for arrangement; let line-height be unitless. Prefer explicit px or locally declared --type-* tokens for text and px for geometry; viewport/physical units and font shorthand make export sizing harder to reason about.
- Studio supplies a ${BLOCK_TEXT_BASELINE_PX}px inherited fallback. Aim for at least ${BLOCK_MIN_READABLE_FONT_PX}px of rendered text at the authored canvas size; text smaller than ${BLOCK_MIN_READABLE_FONT_PX}px merits a visual check, not automatic rejection. Adapt density and hierarchy to the actual box. In an existing SVG artboard, px inside foreignObject are SVG user units multiplied by the viewBox scale; preserve that coordinate system when editing it.
- Keep the supplied component id, duration, wording and numeric values unless the request changes them. The platform positions the component; authored animation uses only local time on the provided tl.`;

export function componentCoordinateContext(block: { boxPx?: { w: number; h: number }; innerHtml: string }): string {
  if (!block.boxPx) return 'No measured box was supplied. Use a flexible local layout; do not invent a fixed full-canvas viewport.';
  const { w, h } = block.boxPx;
  const scale = artPresetTextScale(block.innerHtml, block.boxPx);
  const base = `Target box: ${w}×${h} canvas px. Keep visible content inside this box; choose typography and spacing for its content and aspect ratio.`;
  return scale !== 1
    ? `${base}\nThe existing art preset uses a 120×67.5 SVG viewBox, with minimum-axis scale ${scale.toFixed(4)}. For example, 6 local px renders at ${(6 * scale).toFixed(2)} canvas px. Keep its local units; do not apply the ${BLOCK_MIN_READABLE_FONT_PX}px canvas guideline directly to SVG user units.`
    : `${base}\nOrdinary CSS text sizes are canvas px. Use a deliberate hierarchy rather than a universal headline cap.`;
}

/** Executable contract example, checked by the same parser and validator as real output.
 * The structure is deliberately minimal: it explains the wire format, not a visual style. */
export function componentContractExample(id: string): string {
  return 'Minimal format example (adapt the design, not a template):\n```html\n'
    + `<span class="label" data-edit="label">Text</span><style>.label{font-size:36px;color:var(--p-accent)}</style>`
    + '\n```\n```js\n'
    + `tl.from('#${id} .label',{autoAlpha:0,y:8,duration:0.25},0);`
    + '\n```\n```json\n{"accent":{"type":"string","format":"color","title":"Accent","default":"var(--accent)"}}\n```';
}
