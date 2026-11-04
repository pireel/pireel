'use client';

import { montageFrameSignals } from '@pireel/studio-engine/montage-signals';
import type { MontageFrameSignal } from '@pireel/studio-engine/montage-plan';
import { analyzeGeometryRange, analyzeMouthAtTimes, analyzeQualityAtTimes } from './geometry';

/** Samples per second a montage window is chosen from. */
export const MONTAGE_SIGNAL_FPS = 10;
/** Person segmentation is slower; it only has to tell a back view from an empty frame. */
const PRESENCE_FPS = 2;

/**
 * Measure a source range for fitMontage, locally in the browser (no network or model calls): camera
 * shake and pans, detail and light, the main face's size, turn and mouth, competing faces, and
 * whether a person is in frame without a face. Returns one signal per sample from `from`.
 */
export async function measureMontageSignals(file: File, from: number, to: number, onProgress?: (fraction: number) => void): Promise<MontageFrameSignal[]> {
  const count = Math.max(1, Math.floor((to - from) * MONTAGE_SIGNAL_FPS));
  const times = Array.from({ length: count }, (_, index) => Math.round((from + index / MONTAGE_SIGNAL_FPS) * 1000) / 1000);
  const quality = await analyzeQualityAtTimes(file, times, (done, total) => onProgress?.((done / Math.max(1, total)) * 0.4));
  const faces = await analyzeMouthAtTimes(file, times);
  onProgress?.(0.8);
  const geometry = await analyzeGeometryRange(file, from, to, Math.max(2, Math.ceil((to - from) * PRESENCE_FPS)));
  onProgress?.(1);
  const presence = geometry?.map((frame) => ({ timeSec: frame.t, value: frame.occ.reduce((sum, cell) => sum + cell, 0) / Math.max(1, frame.occ.length) >= 0.02 ? 1 : 0 }));
  return montageFrameSignals({ times, quality, faces, ...(presence ? { presence } : {}) });
}
