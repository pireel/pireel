/**
 * Studio Kit components as block templates.
 *
 * A kit block stores ONLY `{ templateId: 'kit:<component>', slots: { props } }` —
 * HTML/timeline are derived at render time (same philosophy as derived captions:
 * upgrade the kit and every old project re-renders better; palette changes restyle
 * instantly; agents edit a small JSON patch instead of rewriting markup).
 *
 * Sizing context (box/canvas px) is injected into slots by the assembler right
 * before render — the component computes all type sizes from it. Kit prop parsing
 * never throws: malformed props degrade to designed defaults.
 *
 * The kit consumes --sk-* tokens; here they are bridged to the composition's
 * theme palette (--fg/--panel/--accent…) so frames' palettes restyle kit blocks
 * with zero kit knowledge of the studio theme system.
 */

import { components, render as renderKit } from '@pireel/studio-kit';
import { registerTemplate, type Rendered, type Slots } from './composition-core';
import { getBlueprint } from './blueprint-registry';

/** Map studio palette tokens onto the kit's theme surface (kit fallbacks used when a token is unset). */
const TOKEN_BRIDGE =
  '--sk-fg:var(--fg);--sk-muted:var(--muted);--sk-accent:var(--accent);--sk-accent-2:var(--accent-2);' +
  '--sk-panel:var(--panel);--sk-panel-2:var(--panel-2);--sk-line:var(--line);--sk-radius:var(--radius);' +
  '--sk-shadow:var(--shadow);--sk-font-head:var(--font-head);--sk-font-num:var(--font-num);';

const px = (v: unknown, fallback: number): number => (typeof v === 'number' && v > 0 ? v : fallback);

function renderKitBlock(component: string, slots: Slots, blockId: string, durationSec?: number): Rendered {
  // A staging the block was made with. Unknown ids resolve to undefined and the component renders
  // its built-in variant — a project must open after a theme's stagings are renamed or removed.
  const blueprint = getBlueprint(typeof slots.blueprintId === 'string' ? slots.blueprintId : undefined);
  const ctx = {
    box: { w: px(slots.boxW, 920), h: px(slots.boxH, 560) },
    canvas: { w: px(slots.canvasW, 1080), h: px(slots.canvasH, 1920) },
    ...(typeof slots.lang === 'string' && slots.lang ? { lang: slots.lang } : {}),
    ...(typeof durationSec === 'number' && durationSec > 0 ? { durationSec } : {}),
    ...(blueprint ? { blueprint } : {}),
  };
  const out = renderKit(component, blockId, slots.props, ctx);
  return {
    innerHtml: `<div class="sk-root" style="position:absolute;inset:0;${TOKEN_BRIDGE}">\n${out.html}\n</div>`,
    timelineBody: out.timeline,
  };
}

export const KIT_TEMPLATE_PREFIX = 'kit:';

/** Kit component registry (props JSON Schemas, defaults, summaries) — the source for
 *  pickers, the props editor panel and agent tool contracts. */
export { components as kitComponents } from '@pireel/studio-kit';

/** Designed surface colours (Morandi) offered by the kit — the props panel's swatch row. */
export { SURFACE_SWATCHES as kitSurfaceSwatches } from '@pireel/studio-kit';

/** Render a kit component as a standalone element (asset-panel previews, thumbnails):
 *  explicit box/canvas instead of assembler-injected slots. */
export function kitElement(
  component: string,
  id: string,
  props: unknown,
  box: { w: number; h: number },
  canvas: { w: number; h: number } = { w: 1920, h: 1080 },
): Rendered {
  return renderKitBlock(component, { props, boxW: box.w, boxH: box.h, canvasW: canvas.w, canvasH: canvas.h }, id);
}

for (const [cid, def] of Object.entries(components)) {
  registerTemplate({
    id: `${KIT_TEMPLATE_PREFIX}${cid}`,
    name: `engine.kit.${cid}`,
    kind: 'custom',
    defaultTrackIndex: 2,
    // props is a JSON slot: created empty (defaults render a finished-looking block),
    // filled by pickers/agents with schema-validated values. See `components[cid].jsonSchema`.
    slots: { props: { type: 'json', label: 'engine.kit.props' }, blueprintId: { type: 'text', label: 'engine.kit.blueprintId' } },
    render: (slots, blockId, _startSec, durationSec) => renderKitBlock(cid, slots, blockId, durationSec),
  });
  void def; // schema/summary consumed by pickers and agent tooling, not by registration
}
