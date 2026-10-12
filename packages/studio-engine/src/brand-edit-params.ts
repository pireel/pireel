import { brandPreferences } from './brand-preferences';
import { BLOCK_IDS, hasText, renderBrandPrompt, upgradeBlocks, type PlaybookSnapshot } from './brand-playbook';
import type { AsrSegment } from './build-blocks';
import { CUT_TRANSITION_EFFECTS, ZOOM_PRESETS, type CutTransitionEffect, type ShotZoom, type ZoomPreset } from './composition-core';
import type { NarrativeClipPatchUpdate } from './editor-document/commands/types';
import type { EditorDocumentV2, NarrativeTimelineClip } from './editor-document/types';

/**
 * How a scene edits from a creator's brand. Fixed blocks become parameters the engine runs as they are
 * (pauses, loudness; captions, logo and media elsewhere). The platform's editing moves are available to
 * every brand: the edit planner reads the brand's prompt and decides, per moment of the new video,
 * where a move serves and in which form. Titles are written and styled for the video from the brand's
 * layout prompt.
 */
export interface CaptionEditParams {
  /** How long a pause must be before it is cut, and how much air stays around speech. */
  pause?: { minimumPauseSec: number; speechPaddingSec: number };
  /** Integrated loudness the mix is brought to (LUFS). */
  targetLufs?: number;
  /** Platform moves this edit may place. */
  moves?: { punchIn?: boolean; transition?: boolean };
  /** Titles and labels following the brand's layout prompt, written for this video. */
  titles?: boolean;
}

/** Pause thresholds per trimming habit (the research's tight ≈ 150–250 ms kept gaps). */
export const PAUSE_BY_MODE = {
  tight: { minimumPauseSec: 0.25, speechPaddingSec: 0.08 },
  moderate: { minimumPauseSec: 0.4, speechPaddingSec: 0.15 },
  natural: { minimumPauseSec: 1, speechPaddingSec: 0.2 },
} as const;

/**
 * The platform's moves a one-click edit can place, with a ceiling that only guards against overuse
 * (the brand's prompt decides how much a creator uses; the ceiling is the same for everyone).
 */
export const PLATFORM_MOVES = {
  punch_in: { variants: ZOOM_PRESETS.map(item => item.id) as string[], maxPerMin: 8 },
  transition: { variants: CUT_TRANSITION_EFFECTS.map(item => item.id) as string[], maxPerMin: 3 },
} as const;
export type PlanMoveKind = keyof typeof PLATFORM_MOVES;
const PUNCH_SCALE: [number, number] = [1.05, 1.8];

/** What of the brand a one-click edit executes. */
export function playbookEditParams(playbook: PlaybookSnapshot): CaptionEditParams {
  const b = upgradeBlocks(playbook.blocks);
  const params: CaptionEditParams = {};
  const preferences = brandPreferences(playbook);
  if (b.sound?.pauses && playbook.preferences?.pauses !== false) params.pause = { ...PAUSE_BY_MODE[b.sound.pauses] };
  if (b.sound?.lufs !== undefined) params.targetLufs = b.sound.lufs;
  if (preferences.zoom || preferences.transitions) params.moves = { punchIn: preferences.zoom, transition: preferences.transitions };
  if (preferences.headlines) params.titles = true;
  return params;
}

/** Whether the brand marks key words in its captions. */
/** Key-word highlighting on or off (brands made before kept which words; any of them means on). */
export const playbookHighlightsKeywords = (playbook: PlaybookSnapshot) => !!playbook.blocks.captions?.accent;

/** The brand as the edit planner reads it. */
export const playbookEditGuide = (playbook: PlaybookSnapshot) => renderBrandPrompt(playbook, ['portrait', 'layout', 'transitions', 'camera', 'pacing', 'structure', 'sound']);

/** The brand as the editing agent reads it: the editing prompt; cover production reads its own snapshot in the independent scene. */
export const playbookAgentBrief = (playbook: PlaybookSnapshot) => renderBrandPrompt(playbook, BLOCK_IDS.filter(id => id !== 'cover'));

function narrativeClips(document: EditorDocumentV2): NarrativeTimelineClip[] {
  const track = document.timeline.tracks.find(item => item.id === document.semantics.primaryNarrativeTrackId);
  return (track?.clips.filter((clip): clip is NarrativeTimelineClip => clip.kind === 'narrative') ?? []).sort((a, b) => a.startFrame - b.startFrame);
}

/** Where a source second plays on the cut timeline (null when it was cut out). */
export function timelineSecOf(document: EditorDocumentV2, sourceSec: number): number | null {
  const fps = document.canvas.fps;
  const clip = narrativeClips(document).find(item => sourceSec >= item.sourceInSec && sourceSec < item.sourceOutSec);
  if (!clip) return null;
  const rate = (clip.sourceOutSec - clip.sourceInSec) / (clip.durationFrames / fps);
  return clip.startFrame / fps + (sourceSec - clip.sourceInSec) / rate;
}

/** The cut video's length on the timeline. */
export function cutDurationSec(document: EditorDocumentV2): number {
  const last = narrativeClips(document).at(-1);
  return last ? (last.startFrame + last.durationFrames) / document.canvas.fps : 0;
}

/** One planned move: the word it lands on (its sentence's start for a transition), the form, and for a
 *  punch-in how close it goes. */
export interface PlanPick { kind: PlanMoveKind; sentenceIndex: number; wordIndex: number; variant: string; scale?: number }

/** The planner's view of a cut video: each kept sentence with its start on the timeline, the cut length,
 *  and the moves on offer with their forms and the ceiling over this length. */
export function editPlanInput(document: EditorDocumentV2, transcript: readonly AsrSegment[], moves: NonNullable<CaptionEditParams['moves']>) {
  const durationSec = cutDurationSec(document);
  const rows = transcript.flatMap((segment, index) => {
    const startSec = timelineSecOf(document, segment.words?.[0]?.start ?? segment.start);
    return startSec !== null && segment.text.trim() ? [{ index, text: segment.text.trim(), startSec: Math.round(startSec * 10) / 10 }] : [];
  });
  const allow = (perMin: number) => Math.max(1, Math.floor(durationSec / 60 * perMin));
  const available = [
    ...(moves.punchIn ? [{ kind: 'punch_in' as const, variants: [...PLATFORM_MOVES.punch_in.variants], max: allow(PLATFORM_MOVES.punch_in.maxPerMin) }] : []),
    ...(moves.transition ? [{ kind: 'transition' as const, variants: [...PLATFORM_MOVES.transition.variants], max: allow(PLATFORM_MOVES.transition.maxPerMin) }] : []),
  ];
  return { rows, durationSec, moves: available };
}

const MIN_PUNCH_SEC = 0.6;

/**
 * Punch-ins for the planned picks: the clip holding the word zooms from it to the sentence's end (or
 * the clip's end), in the planned form and depth. One zoom per clip, none shorter than 0.6 s, none
 * closer than the platform ceiling's spacing; clips that already carry a zoom are left alone.
 */
export function punchInUpdates(document: EditorDocumentV2, transcript: readonly AsrSegment[], picks: readonly PlanPick[]): NarrativeClipPatchUpdate[] {
  const fps = document.canvas.fps;
  const clips = narrativeClips(document);
  const minGapSec = 60 / PLATFORM_MOVES.punch_in.maxPerMin;
  const updates: NarrativeClipPatchUpdate[] = [];
  const used = new Set<string>();
  let last = -Infinity;
  for (const pick of [...picks].filter(item => item.kind === 'punch_in').sort((a, b) => a.sentenceIndex - b.sentenceIndex || a.wordIndex - b.wordIndex)) {
    const segment = transcript[pick.sentenceIndex]; const word = segment?.words?.[pick.wordIndex];
    if (!segment || !word) continue;
    const clip = clips.find(item => word.start >= item.sourceInSec && word.start < item.sourceOutSec);
    if (!clip || used.has(clip.id) || clip.properties.zoom) continue;
    const rate = (clip.sourceOutSec - clip.sourceInSec) / (clip.durationFrames / fps);
    const atSec = (word.start - clip.sourceInSec) / rate;
    const endSec = (Math.min(segment.end, clip.sourceOutSec) - clip.sourceInSec) / rate;
    const startOnTimeline = clip.startFrame / fps + atSec;
    if (endSec - atSec < MIN_PUNCH_SEC || startOnTimeline - last < minGapSec) continue;
    const preset = ZOOM_PRESETS.find(item => item.id === pick.variant) ?? ZOOM_PRESETS[0]!;
    const scale = pick.scale !== undefined && pick.scale >= PUNCH_SCALE[0] && pick.scale <= PUNCH_SCALE[1] ? pick.scale : preset.scale;
    const zoom: ShotZoom = { preset: preset.id as ZoomPreset, atSec: Math.round(atSec * 1000) / 1000, durationSec: Math.round((endSec - atSec) * 1000) / 1000, scale };
    updates.push({ clipId: clip.id, patch: { properties: { zoom } } });
    used.add(clip.id); last = startOnTimeline;
  }
  return updates;
}

/** Transition accents for the planned picks: at the start of the picked sentence, in its form, as
 *  add_transition inputs (frames on the cut timeline). */
export function transitionItems(document: EditorDocumentV2, transcript: readonly AsrSegment[], picks: readonly PlanPick[]) {
  const fps = document.canvas.fps;
  const minGapSec = 60 / PLATFORM_MOVES.transition.maxPerMin;
  const items: { atFrame: number; effect: CutTransitionEffect }[] = [];
  let last = -Infinity;
  for (const pick of [...picks].filter(item => item.kind === 'transition').sort((a, b) => a.sentenceIndex - b.sentenceIndex)) {
    const segment = transcript[pick.sentenceIndex];
    const at = segment ? timelineSecOf(document, segment.words?.[0]?.start ?? segment.start) : null;
    if (at === null || at < 1 || at - last < minGapSec) continue;
    const effect = (PLATFORM_MOVES.transition.variants as string[]).includes(pick.variant) ? pick.variant as CutTransitionEffect : 'fade';
    items.push({ atFrame: Math.round(at * fps), effect }); last = at;
  }
  return items;
}

/** A title written for the video from the brand's layout prompt: words, when, where and how it looks. */
export interface PlannedTitle {
  text: string;
  startSec: number;
  durationSec: number;
  /** Box in percent of the frame. */
  box: { xPct: number; yPct: number; widthPct: number; heightPct: number };
  color: string;
  /** Plate colour behind the text; null = text straight on the picture. */
  plate: string | null;
  /** Text height in percent of the frame height. */
  sizePct: number;
}

/** The set_texts item for a planned title: a plate becomes a label in its colour, otherwise plain text. */
export function titleTextItem(id: string, title: PlannedTitle, canvas: { width: number; height: number; fps: number }) {
  return {
    id, text: title.text, startFrame: Math.round(title.startSec * canvas.fps), durationFrames: Math.max(1, Math.round(title.durationSec * canvas.fps)),
    preset: title.plate ? 'label' : 'clean', animation: 'none', color: title.color, ...(title.plate ? { accentColor: title.plate } : {}),
    fontSize: Math.round(Math.min(180, Math.max(24, title.sizePct / 100 * canvas.height))), fontWeight: 800, align: 'center',
    placement: title.box,
  };
}
