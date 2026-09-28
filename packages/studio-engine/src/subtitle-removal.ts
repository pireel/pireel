import { ERASURE_TIERS, type ErasureTier } from './erasure-pricing';
export interface SubtitleRegion { x: number; y: number; width: number; height: number }
export type ErasureKind = 'subtitles' | 'watermark' | 'all';
export type ErasureTarget = 'subtitle' | 'watermark';
/** Optional kind preserves saved subtitle-only projects and their request fingerprints. */
export interface SubtitleRemovalOptions { tier?: ErasureTier; kind?: ErasureKind; mode: 'auto' | 'region'; region?: SubtitleRegion; targets?: ErasureTarget[] }
export const DEFAULT_SUBTITLE_REMOVAL: SubtitleRemovalOptions = { mode: 'auto', tier: 'standard' };
export const DEFAULT_SUBTITLE_REGION: SubtitleRegion = { x: .05, y: .72, width: .9, height: .2 };
export const ERASURE_KINDS = ['subtitles', 'watermark', 'all'] as const;
export function erasureKind(value?: SubtitleRemovalOptions): ErasureKind { return value?.kind ?? 'subtitles'; }
export function erasureTargets(value: SubtitleRemovalOptions): ErasureTarget[] {
  const kind = erasureKind(value);
  return kind === 'all' ? [...(value.targets ?? ['subtitle', 'watermark'])].sort() : kind === 'watermark' ? ['watermark'] : kind === 'subtitles' ? ['subtitle'] : [];
}
export function normalizeErasureOptions(value?: SubtitleRemovalOptions): SubtitleRemovalOptions { return { ...(value ?? { mode: 'auto' }), tier: value?.tier ?? 'standard' }; }
export function validSubtitleRemoval(value: unknown): value is SubtitleRemovalOptions {
  const row = value as SubtitleRemovalOptions | null;
  if (!row || !['auto', 'region'].includes(row.mode) || (row.kind !== undefined && !ERASURE_KINDS.includes(row.kind))) return false;
  if (row.tier !== undefined && !ERASURE_TIERS.some(tier => tier.id === row.tier)) return false;
  if (row.targets !== undefined && (row.kind !== 'all' || !Array.isArray(row.targets) || !row.targets.length || row.targets.length > 2 || new Set(row.targets).size !== row.targets.length || row.targets.some(target => !['subtitle', 'watermark'].includes(target)))) return false;
  if (row.mode === 'auto') return row.region === undefined;
  const r = row.region;
  return !!r && [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.x >= 0 && r.y >= 0 && r.width >= .01 && r.height >= .01 && r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001;
}
