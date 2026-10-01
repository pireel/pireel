import { normalizeErasureOptions } from './subtitle-removal';
import { normalizeSfxOptions } from './sfx-task';
import type { CaptionTaskRecord } from './scene-project';
import type { CaptionTaskOptions } from './caption-task';

export interface SceneCreditInput {
  /** Set for fixed-price scenes: the quote is the scene's per-minute price, not usage. */
  scene?: 'captions' | 'dubbing' | 'sfx';
  /** Auto SFX density, which sets its per-minute price. */
  density?: import('./sfx-task').SfxDensity;
  durationSec: number; asr: boolean; translation: boolean; emphasis: boolean; lipSync: boolean;
  subtitleRemoval?: boolean; erasureKind?: import('./subtitle-removal').ErasureKind; erasureTier?: import('./erasure-pricing').ErasureTier; erasureWidth?: number; erasureHeight?: number; sfxPlanning?: boolean; brollFrames?: number; sourceTokens?: number; asrPasses?: number;
  speech: { voiceId: string; minUnits: number; maxUnits: number; maxChunks: number; estimatedUnits?: number; estimatedChunks?: number }[];
}
export interface SceneCreditEstimate {
  min: number; max: number; estimate: number; durationBased: boolean;
  sfxGenerationUnitCredits?: number;
  /** A fixed-price scene: credits per minute of source, and lip sync's with its minimum billed seconds. */
  fixed?: { perMinute: number; lipSync?: { perMinute: number; minSec: number; credits: number } };
  /** Fixed erasure price: `perMinute` credits per minute of source for the chosen tier. */
  erasure?: { tier: import('./erasure-pricing').ErasureTier; credits: number; perMinute: number };
  items: { kind: 'asr' | 'translation' | 'emphasis' | 'speech' | 'lipSync' | 'visual' | 'matching' | 'sfx' | 'subtitleRemoval'; min: number; max: number; estimate: number }[];
}
/** Compact usage hints for a read-only estimate, never authorization or actual billing input. */
export function sceneCreditInput(task: CaptionTaskRecord, options: CaptionTaskOptions, reuseCompleted = true): SceneCreditInput {
  const transcript = task.transcript ?? [];
  const source = transcript.map((segment) => segment.text).join('\n');
  const input: SceneCreditInput = { durationSec: task.durationSec, asr: !reuseCompleted || !transcript.length, translation: false, emphasis: false, lipSync: false, speech: [], ...(source ? { sourceTokens: Math.max([...source].length, Math.ceil(new TextEncoder().encode(source).byteLength / 2)) } : {}) };
  if (task.scene === 'subtitle-removal') { input.asr = false; input.subtitleRemoval = true; input.erasureKind = options.subtitleRemoval?.kind ?? 'subtitles'; input.erasureTier = normalizeErasureOptions(options.subtitleRemoval).tier; input.erasureWidth = task.width; input.erasureHeight = task.height; return input; }
  // Auto SFX is fixed-price per minute by density, whether sounds come from the library or are generated.
  if (task.scene === 'sfx') { input.asr = false; input.scene = 'sfx'; input.density = normalizeSfxOptions(options.sfx).density; delete input.sourceTokens; return input; }
  if ((task.scene === 'broll' || task.scene === 'pip' || task.scene === 'ugc-ad')) {
    input.brollFrames = (options.broll?.assets ?? []).reduce((sum, a) => sum + (a.kind === 'image' ? 1 : 8), 0);
    input.emphasis = !!options.broll?.captions && !!options.highlights;
    return input;
  }
  // Captions and dubbing are fixed-price per minute of source (every generation, cached or not).
  input.asr = false; input.scene = task.scene === 'dubbing' ? 'dubbing' : 'captions'; delete input.sourceTokens;
  input.lipSync = input.scene === 'dubbing' && !!options.dubbing?.lipSync;
  return input;
}
