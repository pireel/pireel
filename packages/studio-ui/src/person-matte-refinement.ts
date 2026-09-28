/** MODNet's reference preprocessing keeps a 512 reference short edge, not a 512 long edge.
 * Bound panoramic inputs so browser inference remains finite; dimensions must be multiples of 32.
 * https://github.com/ZHKKKe/MODNet/blob/master/demo/image_matting/colab/inference.py */
export function matteInputSize(width: number, height: number): { width: number; height: number } {
  const w = Math.max(1, width); const h = Math.max(1, height);
  const scale = Math.min(1, 512 / Math.min(w, h), 1024 / Math.max(w, h));
  return { width: Math.max(32, Math.floor(w * scale / 32) * 32), height: Math.max(32, Math.floor(h * scale / 32) * 32) };
}

/** A small joint bilateral filter removes uncertain alpha noise without blurring across RGB edges.
 * Confident foreground/background stay fixed; soft hair stays fractional. No erosion or binary mask.
 * Stateless processing gives seeks, preview and export the same result and cannot leave motion trails. */
export function refinePersonAlpha(alpha: Float32Array, rgba: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
  if (alpha.length !== width * height || rgba.length !== width * height * 4) throw new Error('人像遮罩尺寸不匹配。');
  const pixels = new Uint8ClampedArray(alpha.length * 4);
  const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const rangeDenominator = 2 * 24 * 24;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x; const base = i * 4; const current = clamp(alpha[i]!);
    let result = current;
    if (current > .02 && current < .98) {
      let total = current * 2; let weights = 2;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
        const j = (y + dy) * width + x + dx; const neighbor = j * 4;
        const dr = rgba[base]! - rgba[neighbor]!; const dg = rgba[base + 1]! - rgba[neighbor + 1]!; const db = rgba[base + 2]! - rgba[neighbor + 2]!;
        const weight = (dx && dy ? .5 : 1) * Math.exp(-(dr * dr + dg * dg + db * db) / rangeDenominator);
        total += clamp(alpha[j]!) * weight; weights += weight;
      }
      // Retain fine strands supported by the original model; filtering cannot erase more than 4% alpha.
      result = Math.max(current - .04, Math.min(current + .04, total / weights));
    }
    // Remove only near-transparent haze; keep the original continuous transition above it.
    const clean = result <= .015 ? 0 : result >= .985 ? 1 : (result - .015) / .97;
    pixels[base + 3] = Math.round(clean * 255);
  }
  return pixels;
}

