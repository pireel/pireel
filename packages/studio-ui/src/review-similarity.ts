/**
 * Local similarity gate for paid rendered-frame review.
 *
 * The fingerprint is computed from the final composed frame before the harness timecode is drawn.
 * It combines coarse colour structure with an average perceptual hash: tiny talking-head motion can
 * collapse to one representative, while a changed layout/scene stays eligible for cloud review.
 */

const COLOR_GRID = 16;
const HASH_GRID = 8;

export interface ReviewFrameFingerprint {
  /** RGB cell averages normalized to 0..1, row-major. */
  colors: Float32Array;
  /** 8×8 average-hash bits. */
  hash: Uint8Array;
}

export interface ReviewFrameSimilarity {
  /** Mean absolute RGB-cell difference, normalized to 0..1. */
  colorDistance: number;
  /** Perceptual-hash Hamming distance, normalized to 0..1. */
  hashDistance: number;
}

export interface ReviewFrameCandidate {
  atSec: number;
  /** Visible overlay/caption signature. Different expected content is never deduplicated. */
  expected: string;
  fingerprint?: ReviewFrameFingerprint;
}

export interface ReviewFrameGroup<T extends ReviewFrameCandidate> {
  representative: T;
  similar: T[];
}

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Build a compact local fingerprint from RGBA pixels. No model/network dependency. */
export function fingerprintReviewPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): ReviewFrameFingerprint | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) return null;
  if (rgba.length < width * height * 4) return null;

  const cells = COLOR_GRID * COLOR_GRID;
  const sums = new Float64Array(cells * 3);
  const counts = new Uint32Array(cells);
  for (let y = 0; y < height; y += 1) {
    const cy = Math.min(COLOR_GRID - 1, Math.floor((y * COLOR_GRID) / height));
    for (let x = 0; x < width; x += 1) {
      const cx = Math.min(COLOR_GRID - 1, Math.floor((x * COLOR_GRID) / width));
      const cell = cy * COLOR_GRID + cx;
      const src = (y * width + x) * 4;
      const dst = cell * 3;
      sums[dst] += rgba[src]!;
      sums[dst + 1] += rgba[src + 1]!;
      sums[dst + 2] += rgba[src + 2]!;
      counts[cell] += 1;
    }
  }

  const colors = new Float32Array(cells * 3);
  for (let cell = 0; cell < cells; cell += 1) {
    const count = Math.max(1, counts[cell]!);
    const index = cell * 3;
    colors[index] = sums[index]! / count / 255;
    colors[index + 1] = sums[index + 1]! / count / 255;
    colors[index + 2] = sums[index + 2]! / count / 255;
  }

  const hashLuma = new Float32Array(HASH_GRID * HASH_GRID);
  let hashMean = 0;
  for (let hy = 0; hy < HASH_GRID; hy += 1) {
    for (let hx = 0; hx < HASH_GRID; hx += 1) {
      let sum = 0;
      for (let oy = 0; oy < COLOR_GRID / HASH_GRID; oy += 1) {
        for (let ox = 0; ox < COLOR_GRID / HASH_GRID; ox += 1) {
          const cell = (hy * 2 + oy) * COLOR_GRID + (hx * 2 + ox);
          const index = cell * 3;
          sum += luma(colors[index]!, colors[index + 1]!, colors[index + 2]!);
        }
      }
      const value = sum / 4;
      hashLuma[hy * HASH_GRID + hx] = value;
      hashMean += value;
    }
  }
  hashMean /= hashLuma.length;
  const hash = new Uint8Array(hashLuma.length);
  for (let index = 0; index < hash.length; index += 1) hash[index] = hashLuma[index]! >= hashMean ? 1 : 0;
  return { colors, hash };
}

export function compareReviewFingerprints(
  a: ReviewFrameFingerprint,
  b: ReviewFrameFingerprint,
): ReviewFrameSimilarity {
  if (a.colors.length !== b.colors.length || a.hash.length !== b.hash.length) {
    return { colorDistance: 1, hashDistance: 1 };
  }
  let color = 0;
  for (let index = 0; index < a.colors.length; index += 1) {
    color += Math.abs(a.colors[index]! - b.colors[index]!);
  }
  let hash = 0;
  for (let index = 0; index < a.hash.length; index += 1) {
    if (a.hash[index] !== b.hash[index]) hash += 1;
  }
  return { colorDistance: color / a.colors.length, hashDistance: hash / a.hash.length };
}

/** Conservative threshold: both colour structure and perceptual layout must agree. */
export function areReviewFramesSimilar(
  a: ReviewFrameFingerprint,
  b: ReviewFrameFingerprint,
): boolean {
  const distance = compareReviewFingerprints(a, b);
  return distance.colorDistance <= 0.055 && distance.hashDistance <= 0.16;
}

/** First representative wins. Missing fingerprints remain distinct (paid review is the safe fallback). */
export function groupSimilarReviewFrames<T extends ReviewFrameCandidate>(
  frames: T[],
  options: { forceCloudAll?: boolean } = {},
): ReviewFrameGroup<T>[] {
  const groups: ReviewFrameGroup<T>[] = [];
  for (const frame of frames) {
    const match = options.forceCloudAll || !frame.fingerprint
      ? undefined
      : groups.find(
          (group) =>
            group.representative.expected === frame.expected &&
            !!group.representative.fingerprint &&
            areReviewFramesSimilar(group.representative.fingerprint, frame.fingerprint!),
        );
    if (match) match.similar.push(frame);
    else groups.push({ representative: frame, similar: [] });
  }
  return groups;
}
