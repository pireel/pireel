import { moveOf, type PlaybookSnapshot, type TextBand } from './brand-playbook';
import type { AsrSegment } from './build-blocks';
import type { CutTransitionEffect, ShotZoom, ZoomPreset } from './composition-core';
import type { NarrativeClipPatchUpdate } from './editor-document/commands/types';
import type { EditorDocumentV2, NarrativeTimelineClip } from './editor-document/types';

/**
 * How a scene edits from a creator's playbook (B). Fixed habits become parameters the engine runs as
 * is; the moves the scene can execute become a repertoire with caps, and the edit planner decides —
 * per moment of the new video — where each lands and in which variant.
 */
export interface CaptionEditParams {
  /** How long a pause must be before it is cut, and how much air stays around speech. */
  pause?: { minimumPauseSec: number; speechPaddingSec: number };
  /** Integrated loudness the mix is brought to (LUFS). */
  targetLufs?: number;
  /** The moves this edit may draw on, each with its variants and a per-minute cap. */
  moves?: {
    punchIn?: { variants: ZoomPreset[]; scale: number; maxPerMin: number };
    transition?: { variants: CutTransitionEffect[]; maxPerMin: number };
  };
  /** Text bands from the playbook, their words written for this video. */
  texts?: { header?: boolean; hookLabel?: boolean };
}

/** Pause thresholds per trimming habit (the research's tight ≈ 150–250 ms kept gaps). */
export const PAUSE_BY_MODE = {
  tight: { minimumPauseSec: 0.25, speechPaddingSec: 0.08 },
  moderate: { minimumPauseSec: 0.4, speechPaddingSec: 0.15 },
  natural: { minimumPauseSec: 1, speechPaddingSec: 0.2 },
} as const;

/** The engine's effect for each transition the playbook names (a sound hit has no picture effect). */
const TRANSITION_EFFECT: Record<string, CutTransitionEffect | undefined> = { whip: 'directional', zoom: 'crosszoom', flash: 'fadeblack', glitch: 'glitch', fade: 'fade' };
const ZOOM_VARIANTS = new Set<string>(['punch', 'instant', 'slow-push', 'in-out']);

/** What of the playbook a scene executes. */
export function playbookEditParams(playbook: PlaybookSnapshot): CaptionEditParams {
  const fixed = playbook.fixed;
  const params: CaptionEditParams = {};
  if (fixed.pauses) params.pause = { ...PAUSE_BY_MODE[fixed.pauses.mode] };
  if (fixed.loudness) params.targetLufs = fixed.loudness.lufs;
  const moves: NonNullable<CaptionEditParams['moves']> = {};
  const punch = moveOf(playbook, 'punch_in');
  if (punch) moves.punchIn = { variants: punch.variants.filter(v => ZOOM_VARIANTS.has(v)) as ZoomPreset[], scale: Number(punch.settings?.scale ?? 1.2), maxPerMin: punch.maxPerMin ?? 2 };
  const transition = moveOf(playbook, 'transition');
  const effects = transition ? [...new Set(transition.variants.flatMap(v => TRANSITION_EFFECT[v] ? [TRANSITION_EFFECT[v]!] : []))] : [];
  if (transition && effects.length) moves.transition = { variants: effects, maxPerMin: transition.maxPerMin ?? 1 };
  if (moves.punchIn && !moves.punchIn.variants.length) delete moves.punchIn;
  if (Object.keys(moves).length) params.moves = moves;
  const header = !!fixed.bands?.header; const hookLabel = !!fixed.bands?.hookLabel;
  if (header || hookLabel) params.texts = { ...(header ? { header } : {}), ...(hookLabel ? { hookLabel } : {}) };
  return params;
}

/** Whether the playbook marks key words in its captions. */
export const playbookHighlightsKeywords = (playbook: PlaybookSnapshot) => playbook.fixed.captions?.accent === 'keywords';

/** The playbook as the edit planner reads it: the style, the triggers of the moves it may place, and how
 *  the creator builds a video. */
export function playbookEditGuide(playbook: PlaybookSnapshot): string {
  const lines = [
    playbook.portrait.en,
    ...playbook.moves.filter(move => move.kind === 'punch_in' || move.kind === 'transition').map(move => `${move.kind} (${move.frequency}): ${move.trigger.en}`),
    ...(playbook.structure.opening ? [`opening: ${playbook.structure.opening.en}`] : []),
    ...(playbook.structure.closing ? [`closing: ${playbook.structure.closing.en}`] : []),
    ...playbook.structure.rules.map(rule => `structure: ${rule.en}`),
  ];
  return lines.filter(Boolean).join('\n');
}

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

export type PlanMoveKind = 'punch_in' | 'transition';
/** One planned move: the word it lands on (its sentence's start for a transition) and the variant. */
export interface PlanPick { kind: PlanMoveKind; sentenceIndex: number; wordIndex: number; variant: string }

/** The planner's view of a cut video: each kept sentence with its start on the timeline, the cut length,
 *  and each move's variants and the count its cap allows over this length. */
export function editPlanInput(document: EditorDocumentV2, transcript: readonly AsrSegment[], moves: NonNullable<CaptionEditParams['moves']>) {
  const clips = narrativeClips(document);
  const last = clips.at(-1);
  const durationSec = last ? (last.startFrame + last.durationFrames) / document.canvas.fps : 0;
  const rows = transcript.flatMap((segment, index) => {
    const startSec = timelineSecOf(document, segment.words?.[0]?.start ?? segment.start);
    return startSec !== null && segment.text.trim() ? [{ index, text: segment.text.trim(), startSec: Math.round(startSec * 10) / 10 }] : [];
  });
  const allow = (perMin: number) => Math.max(1, Math.floor(durationSec / 60 * perMin));
  const available = [
    ...(moves.punchIn ? [{ kind: 'punch_in' as const, variants: moves.punchIn.variants as string[], max: allow(moves.punchIn.maxPerMin) }] : []),
    ...(moves.transition ? [{ kind: 'transition' as const, variants: moves.transition.variants as string[], max: allow(moves.transition.maxPerMin) }] : []),
  ];
  return { rows, durationSec, moves: available };
}

const MIN_PUNCH_SEC = 0.6;

/**
 * Punch-ins for the planned picks: the clip holding the word zooms from it to the sentence's end (or
 * the clip's end). One zoom per clip, none shorter than 0.6 s, none closer than the cap's spacing;
 * clips that already carry a zoom are left alone. Transcript times are source seconds.
 */
export function punchInUpdates(document: EditorDocumentV2, transcript: readonly AsrSegment[], punch: NonNullable<NonNullable<CaptionEditParams['moves']>['punchIn']>, picks: readonly PlanPick[]): NarrativeClipPatchUpdate[] {
  const fps = document.canvas.fps;
  const clips = narrativeClips(document);
  const minGapSec = 60 / punch.maxPerMin;
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
    const preset = (punch.variants as string[]).includes(pick.variant) ? pick.variant as ZoomPreset : punch.variants[0]!;
    const zoom: ShotZoom = { preset, atSec: Math.round(atSec * 1000) / 1000, durationSec: Math.round((endSec - atSec) * 1000) / 1000, scale: punch.scale };
    updates.push({ clipId: clip.id, patch: { properties: { zoom } } });
    used.add(clip.id); last = startOnTimeline;
  }
  return updates;
}

/** Transition accents for the planned picks: at the start of the picked sentence, in its variant,
 *  as add_transition inputs (frames on the cut timeline). */
export function transitionItems(document: EditorDocumentV2, transcript: readonly AsrSegment[], transition: NonNullable<NonNullable<CaptionEditParams['moves']>['transition']>, picks: readonly PlanPick[]) {
  const fps = document.canvas.fps;
  const minGapSec = 60 / transition.maxPerMin;
  const items: { atFrame: number; effect: CutTransitionEffect }[] = [];
  let last = -Infinity;
  for (const pick of [...picks].filter(item => item.kind === 'transition').sort((a, b) => a.sentenceIndex - b.sentenceIndex)) {
    const segment = transcript[pick.sentenceIndex];
    const at = segment ? timelineSecOf(document, segment.words?.[0]?.start ?? segment.start) : null;
    if (at === null || at < 1 || at - last < minGapSec) continue;
    const effect = (transition.variants as string[]).includes(pick.variant) ? pick.variant as CutTransitionEffect : transition.variants[0]!;
    items.push({ atFrame: Math.round(at * fps), effect }); last = at;
  }
  return items;
}

const BRIEF_MAX = 3500;

/** The playbook as the editing agent reads it: the style, the fixed habits scenes already apply, the
 *  moves with their triggers, the structure, and how generated material should look — context for the
 *  choices the user leaves open, never a checklist. */
export function playbookAgentBrief(playbook: PlaybookSnapshot): string {
  const f = playbook.fixed;
  const fixed = [
    f.captions ? (f.captions.on ? `captions on${f.captions.perScreen ? `, ~${f.captions.perScreen} per screen` : ''}${f.captions.upper ? ', all caps' : ''}${f.captions.accent ? `, ${f.captions.accent} marked` : ''}` : 'no burned-in captions') : '',
    f.pauses ? `pauses ${f.pauses.mode}` : '', f.loudness ? `loudness ${f.loudness.lufs} LUFS` : '',
    f.bands?.header ? 'held headline band' : '', f.bands?.hookLabel ? 'opening label' : '',
    f.logo ? 'logo' : '', f.intro ? 'intro clip' : '', f.outro ? 'outro clip' : '',
  ].filter(Boolean);
  const brief = [
    playbook.portrait.en ? `Style: ${playbook.portrait.en}` : '',
    fixed.length ? `Fixed habits: ${fixed.join('; ')}.` : '',
    playbook.moves.length ? `Moves they use (variants, how often, when):\n${playbook.moves.map(move => `- ${move.kind} [${move.variants.join('/')}, ${move.frequency}]: ${move.trigger.en}`).join('\n')}` : '',
    playbook.structure.pace ? `Body pace: ${playbook.structure.pace.cutsPerMin[0]}–${playbook.structure.pace.cutsPerMin[1]} cuts per minute.` : '',
    playbook.structure.opening ? `Opening: ${playbook.structure.opening.en}` : '',
    playbook.structure.closing ? `Closing: ${playbook.structure.closing.en}` : '',
    ...playbook.structure.rules.map(rule => `Structure: ${rule.en}`),
    ...(playbook.generation.elements ?? []).map(rule => `Generated elements: ${rule.en}`),
  ].filter(Boolean).join('\n');
  return brief.length > BRIEF_MAX ? brief.slice(0, BRIEF_MAX) + '…' : brief;
}

/** How many display characters fit a text band: a CJK character is one, a Latin letter about half. */
export function bandCapacity(band: TextBand, canvas: { width: number; height: number }, lines: number): { fontSize: number; maxChars: number } {
  const fontSize = Math.round(Math.min(180, Math.max(24, band.sizePct * canvas.height * 0.85)));
  return { fontSize, maxChars: Math.max(4, Math.floor(band.box.w * canvas.width / fontSize) * lines) };
}
/** Display width of text in CJK-character units. */
export const displayChars = (text: string) => [...text].reduce((n, ch) => n + (/[⺀-鿿豈-﫿＀-￯]/.test(ch) ? 1 : 0.55), 0);

/** The set_texts item that puts a text band on the timeline, styled as measured: a plate becomes a label
 *  plate in its colour, otherwise plain text in the measured colour. */
export function bandTextItem(id: string, text: string, band: TextBand, canvas: { width: number; height: number; fps: number }, startSec: number, durationSec: number, lines: number) {
  const { fontSize } = bandCapacity(band, canvas, lines);
  return {
    id, text, startFrame: Math.round(startSec * canvas.fps), durationFrames: Math.max(1, Math.round(durationSec * canvas.fps)),
    preset: band.plate ? 'label' : 'clean', animation: 'none', color: band.color, ...(band.plate ? { accentColor: band.plate } : {}),
    fontSize, fontWeight: 800, align: 'center',
    placement: { xPct: band.box.x * 100, yPct: band.box.y * 100, widthPct: band.box.w * 100, heightPct: Math.max(band.box.h * lines, band.box.h) * 100 },
  };
}
