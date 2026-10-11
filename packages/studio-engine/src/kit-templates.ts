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
export { PROPERTY_GROUPS, groupOf, type PropertyGroup } from '@pireel/studio-kit';
import { registerTemplate, type Rendered, type Slots } from './composition-core';
import { displayTextFontCss } from './display-text-presets';

/** Map studio palette tokens onto the kit's theme surface (kit fallbacks used when a token is unset). */
const TOKEN_BRIDGE =
  '--sk-fg:var(--fg);--sk-muted:var(--muted);--sk-accent:var(--accent);--sk-accent-2:var(--accent-2);' +
  '--sk-panel:var(--panel);--sk-panel-2:var(--panel-2);--sk-line:var(--line);--sk-radius:var(--radius);' +
  '--sk-shadow:var(--shadow);--sk-font-head:var(--font-head);--sk-font-num:var(--font-num);' +
  // A Frame's typographic voice (palette head-weight / head-case). Unset leaves the kit's own values.
  '--sk-head-weight:var(--head-weight);--sk-head-case:var(--head-case);';

const px = (v: unknown, fallback: number): number => (typeof v === 'number' && v > 0 ? v : fallback);

/** The shared style group, as the host applies it: token overrides on the component root. */
function styleOverrides(style: Record<string, unknown>): string {
  const hex = (v: unknown) => (typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? v : '');
  const accent = hex(style.accent);
  const ink = hex(style.ink);
  const face = typeof style.font === 'string' && style.font ? displayTextFontCss(style.font) : null;
  return (
    (accent ? `--sk-accent:${accent};` : '') +
    // One text colour for the whole component: over footage, on a page and on its own panel.
    (ink ? `--sk-ink:${ink};--sk-fg:${ink};` : '') +
    (face ? `--sk-font-head:${face.replaceAll('"', "'")};` : '')
  );
}

function renderKitBlock(component: string, slots: Slots, blockId: string, durationSec?: number): Rendered {
  const style = (slots.props && typeof slots.props === 'object' ? slots.props : {}) as Record<string, unknown>;
  const ctx = {
    box: { w: px(slots.boxW, 920), h: px(slots.boxH, 560) },
    canvas: { w: px(slots.canvasW, 1080), h: px(slots.canvasH, 1920) },
    ...(typeof slots.lang === 'string' && slots.lang ? { lang: slots.lang } : {}),
    ...(typeof durationSec === 'number' && durationSec > 0 ? { durationSec } : {}),
    ...(typeof style.textScale === 'number' && style.textScale !== 1 ? { textScale: style.textScale } : {}),
  };
  const out = renderKit(component, blockId, slots.props, ctx);
  // Type without a surface: light over moving footage (lifted by a soft shadow), the theme's ink over
  // a flat page (no shadow — on a light page it only smudges the letters).
  const ink = slots.backdrop === 'page'
    ? '--sk-ink:var(--fg);--sk-ink-muted:var(--muted);--sk-ink-shadow:none;'
    : '--sk-ink:#ffffff;--sk-ink-muted:rgba(255,255,255,0.74);';
  return {
    innerHtml: `<div class="sk-root" style="position:absolute;inset:0;${TOKEN_BRIDGE}${ink}${styleOverrides(style)}">\n${out.html}\n</div>`,
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
  // Library previews sit on a light checker, not footage: the theme ink keeps them readable.
  return renderKitBlock(component, { props, boxW: box.w, boxH: box.h, canvasW: canvas.w, canvasH: canvas.h, backdrop: 'page' }, id);
}

for (const [cid, def] of Object.entries(components)) {
  registerTemplate({
    id: `${KIT_TEMPLATE_PREFIX}${cid}`,
    name: `engine.kit.${cid}`,
    kind: 'custom',
    defaultTrackIndex: 2,
    // props is a JSON slot: created empty (defaults render a finished-looking block),
    // filled by pickers/agents with schema-validated values. See `components[cid].jsonSchema`.
    slots: { props: { type: 'json', label: 'engine.kit.props' } },
    render: (slots, blockId, _startSec, durationSec) => renderKitBlock(cid, slots, blockId, durationSec),
  });
  void def; // schema/summary consumed by pickers and agent tooling, not by registration
}
