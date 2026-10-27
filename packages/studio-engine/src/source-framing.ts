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

/**
 * Blurred fill behind a source that does not cover its frame (Composition.backdrop 'blur'): the
 * same frame cover-fitted into a tiny sample, drawn back over the frame softened, then dimmed so
 * the real picture stands out. Preview (shim) and export draw with these same numbers.
 */
export const BACKDROP_SAMPLE_WIDTH = 48;
export const BACKDROP_DIM = 0.28;
/** Blur radius for a frame this wide; the fill is overdrawn by twice this so its edges stay opaque. */
export const backdropBlurPx = (frameWidth: number) => Math.max(4, Math.round(frameWidth / 40));
/** The tiny cover-fitted sample's size for a frame of this shape. */
export const backdropSampleSize = (frameWidth: number, frameHeight: number) => ({ width: BACKDROP_SAMPLE_WIDTH, height: Math.max(2, Math.round(BACKDROP_SAMPLE_WIDTH * frameHeight / Math.max(1, frameWidth))) });

/** The same fill in ES5 for the sandboxed preview: (g, sample canvas, image, source w/h, frame x/y/w/h). */
export const SOURCE_BACKDROP_FUNCTION = `function(g, sample, img, sw0, sh0, x, y, w, h) {
  var sw = Math.max(1, sw0), sh = Math.max(1, sh0);
  var tw = ${BACKDROP_SAMPLE_WIDTH}, th = Math.max(2, Math.round(${BACKDROP_SAMPLE_WIDTH} * h / Math.max(1, w)));
  if (sample.width !== tw || sample.height !== th) { sample.width = tw; sample.height = th; }
  var s = sample.getContext('2d');
  var k = Math.max(tw / sw, th / sh);
  s.clearRect(0, 0, tw, th);
  s.drawImage(img, (tw - sw * k) / 2, (th - sh * k) / 2, sw * k, sh * k);
  var blur = Math.max(4, Math.round(w / 40));
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  if ('filter' in g) g.filter = 'blur(' + blur + 'px)';
  g.drawImage(sample, x - 2 * blur, y - 2 * blur, w + 4 * blur, h + 4 * blur);
  if ('filter' in g) g.filter = 'none';
  g.fillStyle = 'rgba(0,0,0,${BACKDROP_DIM})';
  g.fillRect(x, y, w, h);
  g.restore();
}`;
