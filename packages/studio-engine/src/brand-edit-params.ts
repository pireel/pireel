import type { BrandSnapshot, BrandTextTemplate } from './brand-kit';
import type { AsrSegment } from './build-blocks';
import { ZOOM_PRESETS, type ShotZoom, type ZoomPreset } from './composition-core';
import type { NarrativeClipPatchUpdate } from './editor-document/commands/types';
import type { EditorDocumentV2, NarrativeTimelineClip } from './editor-document/types';
import type { SilenceMode } from './brand-edit-spec';
import type { StyleSystem as BrandStyleSystem } from './brand-style-spec';

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
  /** Text bands from the brand's templates, their words written for this video. */
  texts?: { header?: boolean; hookLabel?: boolean };
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
  const header = !!brand.templates?.header; const hookLabel = !!brand.templates?.hookLabel;
  if (header || hookLabel) params.texts = { ...(header ? { header } : {}), ...(hookLabel ? { hookLabel } : {}) };
  return params;
}

/** The style-guide systems that bear on cutting decisions (layer B, given to the edit planner as context). */
const EDIT_GUIDE_SYSTEMS = ['editing', 'framing', 'motion', 'bookends'] as const;

/** The brand's own editing rules, in English, for the model planning an edit: the overall look and the
 *  recurring rules of the systems that decide cuts and zooms. Empty when the brand was never analyzed. */
export function brandEditGuide(brand: BrandSnapshot): string {
  const style = brand.style;
  if (!style) return '';
  const lines = EDIT_GUIDE_SYSTEMS.flatMap(id => {
    const system = style.systems[id];
    const rules = system.present ? system.rules.map(rule => rule.en.trim()).filter(Boolean) : [];
    return rules.length ? [`${id}:`, ...rules.map(rule => `- ${rule}`)] : [];
  });
  return [style.summaryEn.trim(), ...lines].filter(Boolean).join('\n');
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

/** The edit planner's view of a cut video: each kept sentence with where it starts on the timeline,
 *  the cut length, and how many punch-ins the spacing allows. */
export function editPlanInput(document: EditorDocumentV2, transcript: readonly AsrSegment[], punch: NonNullable<CaptionEditParams['punchIn']>) {
  const clips = narrativeClips(document);
  const last = clips.at(-1);
  const durationSec = last ? (last.startFrame + last.durationFrames) / document.canvas.fps : 0;
  const rows = transcript.flatMap((segment, index) => {
    const startSec = timelineSecOf(document, segment.words?.[0]?.start ?? segment.start);
    return startSec !== null && segment.text.trim() ? [{ index, text: segment.text.trim(), startSec: Math.round(startSec * 10) / 10 }] : [];
  });
  return { rows, durationSec, maxPunches: Math.max(1, Math.floor(durationSec / punch.minGapSec)) };
}

/** A punch-in target from the edit plan: the word in a transcript sentence where the zoom starts. */
export interface PunchTarget { sentenceIndex: number; wordIndex: number }

/** Whether the brand marks key words in its captions (the research's keyword accent rule). */
export function brandHighlightsKeywords(brand: BrandSnapshot): boolean {
  return brand.spec?.captions.accentRule?.value === 'keywords';
}

/**
 * Punch-ins for a cut document: at each target word, the clip holding it zooms from the word to the
 * sentence's end (or the clip's end, whichever comes first). One zoom per clip, none shorter than
 * 0.6 s, none closer than `minGapSec` to the previous one; clips that already carry a zoom are left
 * alone. Transcript times are source seconds. Without targets, each sentence's first highlighted word.
 */
export function punchInUpdates(document: EditorDocumentV2, transcript: readonly AsrSegment[], punch: NonNullable<CaptionEditParams['punchIn']>, targets?: readonly PunchTarget[]): NarrativeClipPatchUpdate[] {
  const fps = document.canvas.fps;
  const clips = narrativeClips(document);
  const updates: NarrativeClipPatchUpdate[] = [];
  const used = new Set<string>();
  let last = -Infinity;
  const picks: { segment: AsrSegment; wordIndex: number }[] = targets
    ? [...targets].sort((a, b) => a.sentenceIndex - b.sentenceIndex || a.wordIndex - b.wordIndex).flatMap(target => transcript[target.sentenceIndex] ? [{ segment: transcript[target.sentenceIndex]!, wordIndex: target.wordIndex }] : [])
    : transcript.flatMap(segment => {
      const decorated = Object.entries(segment.wordDecorations ?? {}).filter(([, decoration]) => decoration.highlight).map(([index]) => Number(index)).sort((a, b) => a - b);
      return decorated.length ? [{ segment, wordIndex: decorated[0]! }] : [];
    });
  for (const { segment, wordIndex } of picks) {
    const word = segment.words?.[wordIndex];
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

const SILENCE_WORDS = { aggressive: 'tight — even breaths are cut', moderate: 'moderate', natural: 'natural pauses kept' } as const;
const BRIEF_MAX = 3500;

/** The brand as the editing agent reads it (layer B): the look in a sentence, the measured habits a
 *  scene already applies, and the creator's recurring rules by system — context for choices the user
 *  leaves open, never a checklist. */
export function brandAgentBrief(brand: BrandSnapshot): string {
  const spec = brand.spec; const style = brand.style;
  const habits = spec ? [
    `cutting ${Math.round(spec.cutting.targetCpm.value[0])}–${Math.round(spec.cutting.targetCpm.value[1])} cuts/min`,
    `pauses ${SILENCE_WORDS[spec.cutting.silence.value.mode]}`,
    `loudness about ${Math.round(spec.audio.targetLufs.value)} LUFS`,
    spec.captions.presence.value === 'never' ? 'usually no captions' : `captions ~${spec.captions.wordsPerPage.value} words on screen${spec.captions.case.value === 'upper' ? ', all caps' : ''}`,
    `face about ${Math.round(spec.framing.faceH.value * 100)}% of frame height`,
    ...(spec.layout ? [`layout ${spec.layout.value.replace(/_/g, ' ')}`] : []),
  ] : [];
  const rules = style ? (Object.entries(style.systems) as [string, BrandStyleSystem][]).flatMap(([id, system]) => {
    const lines = system.present ? system.rules.map(rule => rule.en.trim()).filter(Boolean) : [];
    return lines.length ? [`${id}: ${lines.join(' ')}`] : [];
  }) : [];
  const brief = [
    style?.summaryEn.trim() ? `Look: ${style.summaryEn.trim()}` : '',
    habits.length ? `Measured habits: ${habits.join('; ')}.` : '',
    rules.length ? `Recurring rules from their videos:\n${rules.map(line => `- ${line}`).join('\n')}` : '',
    `Brand assets: ${[brand.logo ? 'logo' : '', brand.intro ? 'intro' : '', brand.outro ? 'outro' : ''].filter(Boolean).join(', ') || 'none'}.`,
  ].filter(Boolean).join('\n');
  return brief.length > BRIEF_MAX ? brief.slice(0, BRIEF_MAX) + '…' : brief;
}

/** How many display characters fit a template band: a CJK character is one, a Latin letter about half. */
export function bandCapacity(template: BrandTextTemplate, canvas: { width: number; height: number }, lines: number): { fontSize: number; maxChars: number } {
  const fontSize = Math.round(Math.min(180, Math.max(24, template.sizePct * canvas.height * 0.85)));
  return { fontSize, maxChars: Math.max(4, Math.floor(template.box.w * canvas.width / fontSize) * lines) };
}
/** Display width of text in CJK-character units. */
export const displayChars = (text: string) => [...text].reduce((n, ch) => n + (/[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch) ? 1 : 0.55), 0);

/** The text-clip items that put a template band on the timeline (set_texts input), styled as measured:
 *  a plate becomes a label plate in its colour, otherwise plain text in the measured colour. */
export function templateTextItem(id: string, text: string, template: BrandTextTemplate, canvas: { width: number; height: number; fps: number }, startSec: number, durationSec: number, lines: number) {
  const { fontSize } = bandCapacity(template, canvas, lines);
  return {
    id, text, startFrame: Math.round(startSec * canvas.fps), durationFrames: Math.max(1, Math.round(durationSec * canvas.fps)),
    preset: template.plate ? 'label' : 'clean', animation: 'none', color: template.color, ...(template.plate ? { accentColor: template.plate } : {}),
    fontSize, fontWeight: 800, align: 'center',
    placement: { xPct: template.box.x * 100, yPct: template.box.y * 100, widthPct: template.box.w * 100, heightPct: Math.max(template.box.h * lines, template.box.h) * 100 },
  };
}
