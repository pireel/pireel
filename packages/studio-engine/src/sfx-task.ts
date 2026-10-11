export const SFX_STYLES = [
  { id: 'soft', zh: '轻提示', en: 'Soft cue', description: { zh: '柔和地提示重点', en: 'A subtle cue for key points' } },
  { id: 'pop', zh: '强调弹跳', en: 'Pop', description: { zh: '短促、清晰的强调音', en: 'A short, crisp accent' } },
  { id: 'whoosh', zh: '轻转场', en: 'Whoosh', description: { zh: '适合句间转折', en: 'A light transition between ideas' } },
] as const;
export interface LegacySfxOptions { style: typeof SFX_STYLES[number]['id']; maxCount: number; volumeDb: number; captions: boolean }
export type SfxDensity = 'low' | 'medium' | 'high';
export type SfxOptions = { density: SfxDensity } | LegacySfxOptions;
export const DEFAULT_SFX_OPTIONS = { density: 'medium' } as const;
export function normalizeSfxOptions(value: SfxOptions | undefined): { density: SfxDensity } {
  if (value && 'density' in value) return { density: value.density };
  return { density: value ? value.maxCount <= 2 ? 'low' : value.maxCount >= 8 ? 'high' : 'medium' : 'medium' };
}
export function validSfxOptions(value: unknown): value is SfxOptions {
  if (!value || typeof value !== 'object') return false;
  if ('density' in value) return ['low', 'medium', 'high'].includes(String(value.density));
  const row = value as LegacySfxOptions;
  return SFX_STYLES.some(style => style.id === row.style) && Number.isInteger(row.maxCount) && row.maxCount >= 1 && row.maxCount <= 12 && Number.isFinite(row.volumeDb) && row.volumeDb >= -35 && row.volumeDb <= -6 && typeof row.captions === 'boolean';
}
