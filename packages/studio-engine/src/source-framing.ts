import type { ShotPreciseFraming } from './composition-core';

export interface SourceDrawRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Source frame → target canvas rectangle. A source-normalized anchor is held at target centre and
 * clamped to the no-empty-border envelope. Legacy/absent precision keeps the old centred cover.
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
  const cover = Math.max(tw / sw, th / sh);
  const sourceAware = framing?.coordinateSpace === 'source-normalized';
  const scale = sourceAware ? Math.max(1, Math.min(4, framing.scale)) : 1;
  const width = sw * cover * scale;
  const height = sh * cover * scale;
  const anchorX = sourceAware ? Math.max(0, Math.min(1, framing.anchorX)) : 0.5;
  const anchorY = sourceAware ? Math.max(0, Math.min(1, framing.anchorY)) : 0.5;
  const x = Math.min(0, Math.max(tw - width, tw / 2 - anchorX * width));
  const y = Math.min(0, Math.max(th - height, th / 2 - anchorY * height));
  return { x, y, width, height };
}

/** Same function in dependency-free ES5 syntax for the sandboxed preview iframe. Tests execute this
 * string against sourceDrawRect so preview cannot silently drift from export geometry. */
export const SOURCE_DRAW_RECT_FUNCTION = `function(sw0, sh0, tw0, th0, framing) {
  var sw = Math.max(1, sw0), sh = Math.max(1, sh0), tw = Math.max(1, tw0), th = Math.max(1, th0);
  var cover = Math.max(tw / sw, th / sh);
  var sourceAware = !!framing && framing.coordinateSpace === 'source-normalized';
  var scale = sourceAware ? Math.max(1, Math.min(4, framing.scale)) : 1;
  var width = sw * cover * scale, height = sh * cover * scale;
  var anchorX = sourceAware ? Math.max(0, Math.min(1, framing.anchorX)) : 0.5;
  var anchorY = sourceAware ? Math.max(0, Math.min(1, framing.anchorY)) : 0.5;
  var x = Math.min(0, Math.max(tw - width, tw / 2 - anchorX * width));
  var y = Math.min(0, Math.max(th - height, th / 2 - anchorY * height));
  return { x: x, y: y, width: width, height: height };
}`;
