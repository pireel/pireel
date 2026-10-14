import { personCutoutFrame } from './person-cutout-frame';

/** Ignore nearly transparent mask noise when computing layout bounds. */
export function alphaBounds(rgba: Uint8ClampedArray, width: number, height: number) {
  let left = width, top = height, right = -1, bottom = -1, count = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (rgba[(y * width + x) * 4 + 3] < 32) continue;
    count++; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (count > width * height * .98) throw Error('Mask did not separate a person from the background; use the original photo.');
  if (count < width * height * .005) throw Error('No usable person mask; use the original photo.');
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** Run once at authoring time. Preserve source pixels and soft alpha; theme outline stays editable. */
export async function preparePersonImage(file: File) {
  const original = await createImageBitmap(file);
  // Segmentation already resizes its model input. Composite its mask over the original
  // color pixels, otherwise a later board zoom magnifies a needlessly downsampled portrait.
  if (original.width * original.height > 32_000_000) {
    original.close();
    throw Error('Image exceeds the 32 megapixel preparation budget; use a smaller original photo.');
  }
  const alpha = await personCutoutFrame(original);
  try {
    const canvas = new OffscreenCanvas(alpha.width, alpha.height), ctx = canvas.getContext('2d');
    if (!ctx) throw Error('Image preparation canvas unavailable');
    ctx.drawImage(alpha, 0, 0);
    const bounds = alphaBounds(ctx.getImageData(0, 0, alpha.width, alpha.height).data, alpha.width, alpha.height);
    const cropped = new OffscreenCanvas(bounds.width, bounds.height), out = cropped.getContext('2d');
    if (!out) throw Error('Image preparation canvas unavailable');
    out.drawImage(alpha, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
    return { file: new File([await cropped.convertToBlob({ type: 'image/png' })], 'person-cutout.png', { type: 'image/png' }), width: bounds.width, height: bounds.height, bounds };
  } finally { alpha.close(); }
}
