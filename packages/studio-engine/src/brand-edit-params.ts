import type { BrandSnapshot } from './brand-kit';
import type { AsrSegment } from './build-blocks';
import { ZOOM_PRESETS, type ShotZoom, type ZoomPreset } from './composition-core';
import type { NarrativeClipPatchUpdate } from './editor-document/commands/types';
import type { EditorDocumentV2, NarrativeTimelineClip } from './editor-document/types';
import type { SilenceMode } from './brand-edit-spec';

/**
 * The edit parameters a one-click edit takes from a brand, each executed by the engine as is
 * (docs/brand-spec-layers.md, layer A). Per-video variables stay switches and caps: a punch-in has a
 * trigger and a minimum spacing, never a fixed rate; loudness is the brand's target, not a copy of
 * one video's level.
 */
export interface CaptionEditParams {
  /** How long a pause must be before it is cut, and how much air stays around speech. */
  pause?: { minimumPauseSec: number; speechPaddingSec: number };
  /** Integrated loudness the mix is brought to (LUFS). */
  targetLufs?: number;
  /** Push in on a sentence's highlighted word until the sentence ends, at most once per `minGapSec`. */
  punchIn?: { preset: ZoomPreset; scale: number; minGapSec: number };
}

/** Pause thresholds per measured trimming habit (the research's aggressive ≈ 150–250 ms kept gaps). */
export const PAUSE_BY_MODE: Record<SilenceMode, NonNullable<CaptionEditParams['pause']>> = {
  aggressive: { minimumPauseSec: 0.25, speechPaddingSec: 0.08 },
  moderate: { minimumPauseSec: 0.4, speechPaddingSec: 0.15 },
  natural: { minimumPauseSec: 1, speechPaddingSec: 0.2 },
};
const LUFS_RANGE = [-24, -9] as const;
const MIN_PUNCH_SEC = 0.6;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** What of the brand this edit executes. A brand without measurements leaves each part to the scene default. */
export function brandEditParams(brand: BrandSnapshot): CaptionEditParams {
  const spec = brand.spec;
  const params: CaptionEditParams = {};
  if (spec) params.pause = PAUSE_BY_MODE[spec.cutting.silence.value.mode];
  if (spec && Number.isFinite(spec.audio.targetLufs.value)) params.targetLufs = Math.round(clamp(spec.audio.targetLufs.value, ...LUFS_RANGE) * 2) / 2;
  const zoom = brand.pacing.zoom;
  if (zoom) params.punchIn = { preset: zoom.preset, scale: ZOOM_PRESETS.find(item => item.id === zoom.preset)?.scale ?? 1.2, minGapSec: clamp(zoom.everySec, 3, 60) };
  else if (spec?.cutting.punchIn?.value.enabled) params.punchIn = { preset: 'punch', scale: 1.2, minGapSec: 8 };
  return params;
}

/** Whether the brand marks key words in its captions (the research's keyword accent rule). */
export function brandHighlightsKeywords(brand: BrandSnapshot): boolean {
  return brand.spec?.captions.accentRule?.value === 'keywords';
}

/**
 * Punch-ins for a cut document: in each sentence with a highlighted word, the clip holding that word
 * zooms from the word to the sentence's end (or the clip's end, whichever comes first). One zoom per
 * clip, none shorter than 0.6 s, none closer than `minGapSec` to the previous one; clips that already
 * carry a zoom are left alone. Times in the transcript are source seconds.
 */
export function punchInUpdates(document: EditorDocumentV2, transcript: readonly AsrSegment[], punch: NonNullable<CaptionEditParams['punchIn']>): NarrativeClipPatchUpdate[] {
  const fps = document.canvas.fps;
  const track = document.timeline.tracks.find(item => item.id === document.semantics.primaryNarrativeTrackId);
  const clips = (track?.clips.filter((clip): clip is NarrativeTimelineClip => clip.kind === 'narrative') ?? []).sort((a, b) => a.startFrame - b.startFrame);
  const updates: NarrativeClipPatchUpdate[] = [];
  const used = new Set<string>();
  let last = -Infinity;
  for (const segment of transcript) {
    const decorated = Object.entries(segment.wordDecorations ?? {}).filter(([, decoration]) => decoration.highlight).map(([index]) => Number(index)).sort((a, b) => a - b);
    const word = decorated.length ? segment.words?.[decorated[0]!] : undefined;
    if (!word) continue;
    const clip = clips.find(item => word.start >= item.sourceInSec && word.start < item.sourceOutSec);
    if (!clip || used.has(clip.id) || clip.properties.zoom) continue;
    const clipSec = clip.durationFrames / fps;
    const rate = (clip.sourceOutSec - clip.sourceInSec) / clipSec;
    const atSec = (word.start - clip.sourceInSec) / rate;
    const endSec = (Math.min(segment.end, clip.sourceOutSec) - clip.sourceInSec) / rate;
    const startOnTimeline = clip.startFrame / fps + atSec;
    if (endSec - atSec < MIN_PUNCH_SEC || startOnTimeline - last < punch.minGapSec) continue;
    const zoom: ShotZoom = { preset: punch.preset, atSec: Math.round(atSec * 1000) / 1000, durationSec: Math.round((endSec - atSec) * 1000) / 1000, scale: punch.scale };
    updates.push({ clipId: clip.id, patch: { properties: { zoom } } });
    used.add(clip.id); last = startOnTimeline;
  }
  return updates;
}
