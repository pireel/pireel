/**
 * Visual-analysis data contracts. The ANALYSIS itself (MediaPipe/VLM) lives in the
 * app layer; the engine only consumes these shapes (e.g. layoutFromPlan). Owning the
 * types here keeps the engine self-contained and the analysis implementation swappable.
 */

import type { NRect, SafeZone } from './geometry-math';

/** Palette derived from footage base colors (CSS var overrides). */
export type DerivedPalette = Record<string, string>;

export interface VisualLabel {
  content: 'talkinghead' | 'screen' | 'broll' | 'slide' | 'other';
  person: 'left' | 'center' | 'right' | 'none';
  safe: 'left' | 'right' | 'top' | 'bottom' | 'full' | 'none';
  hasText: boolean;
  desc: string;
}

export interface VisualSegment {
  start: number;
  end: number;
  /** Semantic label (sparse, VLM). */
  label: VisualLabel;
  /** Geometric safe zone (dense, MediaPipe; absent on failure). */
  geom?: SafeZone;
}

export interface VisualTimeline {
  /** Real scene-cut points in source seconds — hard boundaries for auto-storyboarding. */
  cuts: number[];
  segments: VisualSegment[];
  /** Geometry-pass diagnostics (for tests). */
  geomNote?: string;
  palette?: DerivedPalette;
  /** Bottom band reserved for captions (global no-go zone for graphics). */
  textBands?: NRect[];
}
