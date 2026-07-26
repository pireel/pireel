/**
 * hyperframes-kit components as block templates.
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
 * The kit consumes --hfk-* tokens; here they are bridged to the composition's
 * theme palette (--fg/--panel/--accent…) so frames' palettes restyle kit blocks
 * with zero kit knowledge of the studio theme system.
 */

import { components, render as renderKit } from 'hyperframes-kit';
import { registerTemplate, type Rendered, type Slots } from './composition-core';

/** Map studio palette tokens onto the kit's theme surface (kit fallbacks used when a token is unset). */
const TOKEN_BRIDGE =
  '--hfk-fg:var(--fg);--hfk-muted:var(--muted);--hfk-accent:var(--accent);--hfk-accent-2:var(--accent-2);' +
  '--hfk-panel:var(--panel);--hfk-panel-2:var(--panel-2);--hfk-line:var(--line);--hfk-radius:var(--radius);' +
  '--hfk-shadow:var(--shadow);--hfk-font-head:var(--font-head);--hfk-font-num:var(--font-num);';

const px = (v: unknown, fallback: number): number => (typeof v === 'number' && v > 0 ? v : fallback);

function renderKitBlock(component: string, slots: Slots, blockId: string): Rendered {
  const ctx = {
    box: { w: px(slots.boxW, 920), h: px(slots.boxH, 560) },
    canvas: { w: px(slots.canvasW, 1080), h: px(slots.canvasH, 1920) },
    ...(typeof slots.lang === 'string' && slots.lang ? { lang: slots.lang } : {}),
  };
  const out = renderKit(component, blockId, slots.props, ctx);
  return {
    innerHtml: `<div class="hfk-root" style="position:absolute;inset:0;${TOKEN_BRIDGE}">\n${out.html}\n</div>`,
    timelineBody: out.timeline,
  };
}

export const KIT_TEMPLATE_PREFIX = 'kit:';

for (const [cid, def] of Object.entries(components)) {
  registerTemplate({
    id: `${KIT_TEMPLATE_PREFIX}${cid}`,
    name: `engine.kit.${cid}`,
    kind: 'custom',
    defaultTrackIndex: 2,
    // props is a JSON slot: created empty (defaults render a finished-looking block),
    // filled by pickers/agents with schema-validated values. See `components[cid].jsonSchema`.
    slots: { props: { type: 'json', label: 'engine.kit.props' } },
    render: (slots, blockId) => renderKitBlock(cid, slots, blockId),
  });
  void def; // schema/summary consumed by pickers and agent tooling, not by registration
}
