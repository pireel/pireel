import { sfxSound, type SfxSoundId, type SfxIntensity } from './sfx-library';
import type { AsrSegment } from './build-blocks';
import { SFX_STYLES, type SfxDensity } from './sfx-task';
export interface SfxCue { id: number; start: number; end: number; text: string; anchors?: { id: number; start: number; text: string }[] }
export interface SfxGenerationRequest { prompt: string; durationSec: number; reason: string }
export function validSfxGeneration(value: unknown): value is SfxGenerationRequest {
  const row = value as SfxGenerationRequest | null;
  return !!row && typeof row.prompt === 'string' && !!row.prompt.trim() && row.prompt.length <= 500 && typeof row.reason === 'string' && !!row.reason.trim() && row.reason.length <= 300 && Number.isFinite(row.durationSec) && row.durationSec >= .5 && row.durationSec <= 5;
}
/** `after`: the hit sits in the pause right after its cue (start = cue end) instead of on a word.
 *  `reason`: the matcher's short note on why this moment gets this sound (kept for review, not shown). */
export interface SfxPlacement { cueId: number; start: number; style: typeof SFX_STYLES[number]['id']; volumeDb: number; soundId?: SfxSoundId; intensity?: SfxIntensity; wordId?: number; after?: boolean; reason?: string; generate?: SfxGenerationRequest }
export const SFX_DENSITIES = [
  { id: 'low', zh: '低', en: 'Low', description: { zh: '只强调少数重点', en: 'Highlight only key moments' } },
  { id: 'medium', zh: '中', en: 'Medium', description: { zh: '兼顾重点与节奏', en: 'Balance emphasis and rhythm' } },
  { id: 'high', zh: '高', en: 'High', description: { zh: '更丰富的节奏变化', en: 'Add more rhythmic accents' } },
] as const;
/** Density is an editorial preference for the model, never a numeric post-processing quota. */
export function sfxDensityGuidance(density: SfxDensity) {
  return {
    low: 'Sparse: add sound only where it clearly helps; most of the narration stays quiet.',
    medium: 'Moderate: support the content and its rhythm without crowding the speech.',
    high: 'Rich: follow the narration\'s rhythm actively while keeping the speech clear.',
  }[density];
}
export function sfxCues(transcript: readonly AsrSegment[], durationSec: number): SfxCue[] {
  return transcript.filter(row => row.text.trim() && Number.isFinite(row.start) && Number.isFinite(row.end) && row.start >= 0 && row.end > row.start && row.start < durationSec)
    .map((row, id) => ({ id, start: row.start, end: Math.min(row.end, durationSec), text: row.text.slice(0, 2000), ...((row.words?.length ?? 0) > 0 ? { anchors: row.words!.map((word, index) => ({ id: index, start: word.start, text: word.text.slice(0, 64) })).filter(word => word.start >= row.start && word.start < Math.min(row.end, durationSec)).slice(0, 48) } : {}) }));
}
/** Validate source references and playback bounds; preserve valid creative timing and repetition. */
export function validateSfxPlan(raw: unknown, cues: SfxCue[], durationSec: number): SfxPlacement[] {
  if (!Array.isArray(raw)) throw new Error('音效匹配结果无效，请重试。');
  const seen = new Set<string>();
  const rows = raw.map(row => {
    const cue = cues.find(cue => cue.id === row?.cueId);
    if (row?.generate !== undefined && (!validSfxGeneration(row.generate) || row.soundId !== undefined || !['gentle', 'normal', 'emphasis'].includes(row.intensity))) throw new Error('生成音效参数无效。');
    if ((row?.soundId !== undefined && (!sfxSound(row.soundId) || !['gentle', 'normal', 'emphasis'].includes(row.intensity))) || !cue || !SFX_STYLES.some(style => style.id === row.style) || !Number.isFinite(row.start) || row.start < cue.start || (row.after === true ? Math.abs(row.start - cue.end) > 1e-6 : row.start >= cue.end) || row.start + .2 > durationSec || !Number.isFinite(row.volumeDb) || row.volumeDb < -30 || row.volumeDb > -10) throw new Error('音效匹配结果无效，请重试。');
    if (row.wordId !== undefined && (row.after === true || !cue.anchors?.some(word => word.id === row.wordId && word.start === row.start))) throw new Error('音效匹配引用了无效词位。');
    if (row.reason !== undefined && (typeof row.reason !== 'string' || row.reason.length > 200)) throw new Error('音效匹配结果无效，请重试。');
    const identity = JSON.stringify([cue.id, row.start, row.generate ? [row.generate.prompt.trim(), row.generate.durationSec] : row.soundId ?? row.style, row.intensity ?? row.volumeDb]);
    if (seen.has(identity)) throw new Error('音效匹配包含完全重复的事件。');
    seen.add(identity);
    return { cueId: cue.id, start: row.start, style: row.style, volumeDb: row.volumeDb, ...(row.soundId ? { soundId: row.soundId, intensity: row.intensity } : {}), ...(row.generate ? { generate: { prompt: row.generate.prompt.trim(), durationSec: row.generate.durationSec, reason: row.generate.reason.trim() }, intensity: row.intensity } : {}), ...(row.wordId !== undefined ? { wordId: row.wordId } : {}), ...(row.after === true ? { after: true } : {}), ...(typeof row.reason === 'string' && row.reason.trim() ? { reason: row.reason.trim() } : {}) } as SfxPlacement;
  }).sort((a, b) => a.start - b.start);
  return rows;
}
