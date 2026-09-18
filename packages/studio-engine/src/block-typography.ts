/** Shared Motion Graphic readability guidance and coordinate interpretation. */
export const BLOCK_TEXT_BASELINE_PX = 36;
export const BLOCK_MIN_READABLE_FONT_PX = 24;

/** Built-in art presets use a 120×67.5 SVG coordinate system stretched to the clip box.
 * Their CSS px are SVG user units, not final canvas pixels. Only recognize that complete
 * preset wrapper; an unrelated SVG or small sibling text must not relax normal checks. */
export function artPresetTextScale(html: string, boxPx?: { w: number; h: number }): number {
  if (!boxPx || !Number.isFinite(boxPx.w) || !Number.isFinite(boxPx.h) || boxPx.w <= 0 || boxPx.h <= 0) return 1;
  const content = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  const svg = /^<svg\b([^>]*)>([\s\S]*)<\/svg>$/i.exec(content);
  if (!svg || !/\bdata-pireel-art-preset=["']\d+["']/i.test(svg[1]!)
    || !/\bclass=["']artboard-frame["']/i.test(svg[1]!)
    || !/\bviewBox=["']0 0 120 67\.5["']/i.test(svg[1]!)
    || !/\bpreserveAspectRatio=["']none["']/i.test(svg[1]!)
    || !/^<foreignObject\b[^>]*>[\s\S]*<\/foreignObject>$/i.test(svg[2]!.trim())) return 1;
  return Math.min(boxPx.w / 120, boxPx.h / 67.5);
}
