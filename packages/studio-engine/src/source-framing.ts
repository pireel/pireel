import type { ShotPreciseFraming } from './composition-core';

export interface SourceDrawRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Source frame → target canvas rectangle. Unframed sources contain-fit so imported media is never
 * silently cropped. A source-normalized framing request deliberately switches to cover-fit, holds
 * its anchor at target centre, and clamps to the no-empty-border envelope. This preserves both the
 * local-first asset contract and the Agent's explicit reframe primitive.
 */
export function sourceDrawRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  framing?: ShotPreciseFraming,
): SourceDrawRect {
  const sw = Math.max(1, sourceWidth);
  const sh = Math.max(1, sourceHeight);
  const tw = Math.max(1, targetWidth);
  const th = Math.max(1, targetHeight);
  const sourceAware = framing?.coordinateSpace === 'source-normalized';
  const fit = sourceAware ? Math.max(tw / sw, th / sh) : Math.min(tw / sw, th / sh);
  const scale = sourceAware ? Math.max(1, Math.min(4, framing.scale)) : 1;
  const width = sw * fit * scale;
  const height = sh * fit * scale;
  const anchorX = sourceAware ? Math.max(0, Math.min(1, framing.anchorX)) : 0.5;
  const anchorY = sourceAware ? Math.max(0, Math.min(1, framing.anchorY)) : 0.5;
  const x = sourceAware ? Math.min(0, Math.max(tw - width, tw / 2 - anchorX * width)) : (tw - width) / 2;
  const y = sourceAware ? Math.min(0, Math.max(th - height, th / 2 - anchorY * height)) : (th - height) / 2;
  return { x, y, width, height };
}

/** Same function in dependency-free ES5 syntax for the sandboxed preview iframe. Tests execute this
 * string against sourceDrawRect so preview cannot silently drift from export geometry. */
export const SOURCE_DRAW_RECT_FUNCTION = `function(sw0, sh0, tw0, th0, framing) {
  var sw = Math.max(1, sw0), sh = Math.max(1, sh0), tw = Math.max(1, tw0), th = Math.max(1, th0);
  var sourceAware = !!framing && framing.coordinateSpace === 'source-normalized';
  var fit = sourceAware ? Math.max(tw / sw, th / sh) : Math.min(tw / sw, th / sh);
  var scale = sourceAware ? Math.max(1, Math.min(4, framing.scale)) : 1;
  var width = sw * fit * scale, height = sh * fit * scale;
  var anchorX = sourceAware ? Math.max(0, Math.min(1, framing.anchorX)) : 0.5;
  var anchorY = sourceAware ? Math.max(0, Math.min(1, framing.anchorY)) : 0.5;
  var x = sourceAware ? Math.min(0, Math.max(tw - width, tw / 2 - anchorX * width)) : (tw - width) / 2;
  var y = sourceAware ? Math.min(0, Math.max(th - height, th / 2 - anchorY * height)) : (th - height) / 2;
  return { x: x, y: y, width: width, height: height };
}`;
