/**
 * Measured facts about an output's material, for an agent that designs the video's graphics.
 *
 * Measurements, not judgements: the agent decides what they mean. Everything here is pure
 * and cheap. The browser supplies decoded pixels and audio numbers; this module turns them into
 * compact per-shot summaries and the output's reserved areas.
 */

import { BASE_CAPTION_FONT_PX, getCaptionPreset } from './caption-presets';
import { resolveCaptionStyle, resolveSubCaptionStyle, type Composition } from './composition-core';

/** Picture cells per sampled frame: 3 columns × 5 rows suits portrait frames and stays small. */
export const FACT_GRID = { cols: 3, rows: 5 } as const;

export interface RegionCell {
  /** Mean perceived brightness, 0–1. */
  bright: number;
  /** Edge density, 0–1: low is calm, empty space; high is detail (faces, leaves, text). */
  busy: number;
  /** Mean colour of the cell, #rrggbb. */
  color: string;
}

/** One sampled frame's region grid, rows top to bottom, each row left to right. */
export type RegionGrid = RegionCell[][];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Measure one frame's cells from raw RGBA pixels (any size; a small decode is enough). */
export function regionGridFromRgba(rgba: ArrayLike<number>, width: number, height: number, cols: number = FACT_GRID.cols, rows: number = FACT_GRID.rows): RegionGrid {
  const luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i++) {
    const o = i * 4;
    luma[i] = ((rgba[o] ?? 0) * 0.2126 + (rgba[o + 1] ?? 0) * 0.7152 + (rgba[o + 2] ?? 0) * 0.0722) / 255;
  }
  const grid: RegionGrid = [];
  for (let r = 0; r < rows; r++) {
    const row: RegionCell[] = [];
    const y0 = Math.floor((r * height) / rows);
    const y1 = Math.max(y0 + 1, Math.floor(((r + 1) * height) / rows));
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor((c * width) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((c + 1) * width) / cols));
      let sum = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      let edges = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * width + x;
          const o = i * 4;
          sum += luma[i] ?? 0;
          red += rgba[o] ?? 0;
          green += rgba[o + 1] ?? 0;
          blue += rgba[o + 2] ?? 0;
          // Gradient magnitude against the right and lower neighbours (inside the frame).
          const right = x + 1 < width ? luma[i + 1] ?? 0 : luma[i] ?? 0;
          const down = y + 1 < height ? luma[i + width] ?? 0 : luma[i] ?? 0;
          edges += Math.abs((luma[i] ?? 0) - right) + Math.abs((luma[i] ?? 0) - down);
          count++;
        }
      }
      const n = Math.max(1, count);
      row.push({
        bright: round2(sum / n),
        // Scaled so ordinary detail lands mid-range and flat sky or walls read near 0.
        busy: round2(clamp01((edges / n) / 0.12)),
        color: hex(red / n, green / n, blue / n),
      });
    }
    grid.push(row);
  }
  return grid;
}

export interface ShotRegions {
  /** Source seconds, [start, end). */
  start: number;
  end: number;
  /** Cells averaged over the shot's samples. */
  grid: RegionGrid;
  /** Darkest and brightest sampled frame mean in the shot: how much the ground changes under a graphic. */
  brightRange: [number, number];
}

/** Summarize per-second grids into shots (split at cuts), so the report stays small for long sources. */
export function regionsByShot(samples: ReadonlyArray<{ t: number; grid: RegionGrid }>, cuts: readonly number[], duration: number): ShotRegions[] {
  if (!samples.length) return [];
  const edges = [0, ...cuts.filter((cut) => cut > 0 && cut < duration).sort((a, b) => a - b), duration];
  const shots: ShotRegions[] = [];
  for (let s = 0; s < edges.length - 1; s++) {
    const start = edges[s]!;
    const end = edges[s + 1]!;
    let inShot = samples.filter((sample) => sample.t >= start && sample.t < end);
    if (!inShot.length) {
      // A shot shorter than the sampling step borrows its nearest sample.
      const nearest = [...samples].sort((a, b) => Math.abs(a.t - (start + end) / 2) - Math.abs(b.t - (start + end) / 2))[0]!;
      inShot = [nearest];
    }
    const rows = inShot[0]!.grid.length;
    const cols = inShot[0]!.grid[0]?.length ?? 0;
    const grid: RegionGrid = [];
    for (let r = 0; r < rows; r++) {
      const row: RegionCell[] = [];
      for (let c = 0; c < cols; c++) {
        const cells = inShot.map((sample) => sample.grid[r]?.[c]).filter((cell): cell is RegionCell => !!cell);
        const avg = (pick: (cell: RegionCell) => number) => cells.reduce((acc, cell) => acc + pick(cell), 0) / Math.max(1, cells.length);
        const channel = (i: number) => avg((cell) => parseInt(cell.color.slice(1 + i * 2, 3 + i * 2), 16));
        row.push({ bright: round2(avg((cell) => cell.bright)), busy: round2(avg((cell) => cell.busy)), color: hex(channel(0), channel(1), channel(2)) });
      }
      grid.push(row);
    }
    const frameMeans = inShot.map((sample) => {
      const all = sample.grid.flat();
      return all.reduce((acc, cell) => acc + cell.bright, 0) / Math.max(1, all.length);
    });
    shots.push({ start: round2(start), end: round2(end), grid, brightRange: [round2(Math.min(...frameMeans)), round2(Math.max(...frameMeans))] });
  }
  return shots;
}

export interface CanvasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where the managed captions sit, in canvas px: a line band for the main caption (sized for
 * `lines` lines) and, when translations are shown, the translation band under it. Mirrors the
 * caption editor's own box (font = base × scale, line height, row gap, plate padding).
 */
export function captionBandRects(
  comp: Pick<Composition, 'captionStyle' | 'blocks' | 'width' | 'height'>,
  options: { lines?: number; withTranslation?: boolean } = {},
): { main: CanvasRect; translation?: CanvasRect } {
  const lines = Math.max(1, options.lines ?? 2);
  const band = (style: ReturnType<typeof resolveCaptionStyle>, lineCount: number): CanvasRect => {
    const fs = Math.max(10, Math.round(BASE_CAPTION_FONT_PX * style.scale));
    const preset = getCaptionPreset(style.preset);
    const plate = style.bg !== undefined ? style.bg != null : !!preset.bg;
    const pad = plate ? Math.round(fs * 0.22) * 2 : 0;
    const textH = fs * 1.2 * lineCount + Math.round(fs * 0.12) * (lineCount - 1) + pad;
    const h = Math.max(textH, ((style.hPct ?? 0) / 100) * comp.height);
    const w = ((style.wPct ?? 56) / 100) * comp.width;
    const bottom = (style.yPct / 100) * comp.height;
    return { x: Math.round(((style.xPct ?? 50) / 100) * comp.width - w / 2), y: Math.round(bottom - h), w: Math.round(w), h: Math.round(h) };
  };
  const main = band(resolveCaptionStyle(comp), lines);
  if (!options.withTranslation) return { main };
  return { main, translation: band(resolveSubCaptionStyle(comp as Composition), 1) };
}

/** Screen areas a platform draws over the video, as fractions of the frame (approximate, portrait). */
export const PLATFORM_UI_ZONES: Record<string, { label: string; zones: Array<{ name: string; x: number; y: number; w: number; h: number }> }> = {
  douyin: {
    label: 'Douyin',
    zones: [
      { name: 'top bar (tabs, search)', x: 0, y: 0, w: 1, h: 0.09 },
      { name: 'right action column (avatar, like, comment, share)', x: 0.84, y: 0.4, w: 0.16, h: 0.45 },
      { name: 'bottom caption area (account name, description, music)', x: 0, y: 0.8, w: 0.82, h: 0.2 },
    ],
  },
  channels: {
    label: 'WeChat Channels',
    zones: [
      { name: 'top bar', x: 0, y: 0, w: 1, h: 0.08 },
      { name: 'bottom area (author, description, actions)', x: 0, y: 0.8, w: 1, h: 0.2 },
    ],
  },
  xiaohongshu: {
    label: 'Xiaohongshu',
    zones: [
      { name: 'top bar', x: 0, y: 0, w: 1, h: 0.08 },
      { name: 'bottom area (title, author, actions)', x: 0, y: 0.82, w: 1, h: 0.18 },
    ],
  },
};

/** Platform zones in canvas px for a given canvas. */
export function platformZonesPx(width: number, height: number): Record<string, { label: string; zones: Array<{ name: string } & CanvasRect> }> {
  return Object.fromEntries(Object.entries(PLATFORM_UI_ZONES).map(([id, platform]) => [id, {
    label: platform.label,
    zones: platform.zones.map((zone) => ({ name: zone.name, x: Math.round(zone.x * width), y: Math.round(zone.y * height), w: Math.round(zone.w * width), h: Math.round(zone.h * height) })),
  }]));
}
