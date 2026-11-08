import type {CaptionStyle, EditorDocumentV2} from '@pireel/studio-engine/composition';
import type {PlaybookSnapshot} from '@pireel/studio-engine/project-brand-metadata';
import type {WorkflowUsage} from '@pireel/studio-engine/workflow';
import type {EditingRunConfig} from '@pireel/studio-engine/editing-run-config';
import type {studioProviders} from '@pireel/studio-engine/providers';


/**
 * The first pass of an Agent project made from the Studio home: the fixed clean-up a talking-head edit
 * always starts with, run as plain steps before the agent takes over — transcribe, trim pauses, clean up the
 * speech (repeats and fillers cut, sensitive words masked), captions, denoise, then the brand's logo and
 * loudness. A step whose editing skill is off, or
 * that the brand does not ask for, is skipped. The chat shows it as a checklist; the agent is told what
 * was done so it continues from there.
 */

export const FIRST_PASS_STEPS = ['transcribe', 'pauses', 'cleanup', 'captions', 'denoise', 'logo', 'loudness'] as const;

export type FirstPassStepId = typeof FIRST_PASS_STEPS[number];

export type FirstPassStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

export interface FirstPassStep { id: FirstPassStepId; status: FirstPassStepStatus; detail?: string }

/** The skills the agent applies after the first pass, each shown with what it added. */
export const FINE_CUT_SKILLS = ['graphics', 'b-roll', 'sound'] as const;

export type FineCutSkill = typeof FINE_CUT_SKILLS[number];

export type EditingEvidence = Record<FineCutSkill, string[]> & { zoom?: string[]; transitions?: string[]; emptyMusicTracks?: string[] };

export interface FineCutItem { id: FineCutSkill; status: 'running' | 'done' | 'not-needed' | 'not-added' | 'stopped'; count: number }

/** The checklist as the rough cut's card shows it (live progress, then the tool receipt). "stopped": the
 *  creator stopped it; the steps still pending can run again. */
export interface FirstPassReport {
  state: 'running' | 'stopped' | 'done' | 'partial' | 'failed';
  steps: FirstPassStep[];
  /** Credits spent so far. */
  credits: number;
  sourceAssetId?: string;
  /** Selected phrases survive retries; failed application never requires another paid selection. */
  captionHighlights?: { assetId: string; mode: 'keywords' | 'numbers'; signature: string; items: { index: number; text: string }[]; applied: boolean }[];
  /** Checkpoints inside cleanup, per narration source, prevent paid analysis and applied cuts being repeated on resume. */
  cleanup?: Record<string, { analysis?: Awaited<ReturnType<NonNullable<ReturnType<typeof studioProviders>['speechCleanup']>>>; applied: string[] }>;
  /** One sentence on what changed, once done. */
  summary?: string;
}


/** The clips that count towards each fine-cut skill: graphics and on-screen text, pictures over the
 *  speaker (not the brand logo), and sound effects. */
export function fineCutClipIds(document: EditorDocumentV2): EditingEvidence {
  const ids: EditingEvidence = { graphics: [], 'b-roll': [], sound: [], zoom: [], transitions: (document.timeline.transitions ?? []).map(transition => transition.id), emptyMusicTracks: document.timeline.tracks.filter(track => track.role === 'music' && !track.clips.length).map(track => track.id) };
  for (const track of document.timeline.tracks) {
    if (track.role === 'managedCaptions' || track.hidden) continue;
    for (const clip of track.clips) {
      if (!clip.enabled) continue;
      const zoom = clip.kind === 'narrative' ? clip.properties.zoom : clip.kind === 'media' ? clip.video?.zoom : undefined;
      if (zoom && zoom.scale > 1) ids.zoom!.push(clip.id);
      if (clip.kind === 'graphic') ids.graphics.push(clip.id);
      else if ((clip.kind === 'media' || clip.kind === 'narrative') && track.type === 'visual' && track.id !== document.semantics.primaryNarrativeTrackId && clip.assetId !== 'brand-logo') ids['b-roll'].push(clip.id);
      else if (clip.kind === 'audio' && track.role !== 'narration' && track.role !== 'music') ids.sound.push(clip.id);
    }
  }
  return ids;
}


/**
 * Whether a project has been edited past its imported source: the story cut or trimmed, anything placed
 * on another lane, captions, a transition, or audio processing. From then on its brand is fixed and the
 * editing skills are shortcuts, not switches.
 */
export function documentIsEdited(document: EditorDocumentV2): boolean {
  const primary = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId);
  const story = [...(primary?.clips ?? [])].sort((a, b) => a.startFrame - b.startFrame);
  // Imported as given: each story clip a whole source, one after another, no source twice.
  const whole = (clip: (typeof story)[number], index: number) => {
    if (clip.kind !== 'narrative') return false;
    const sourceSec = document.assets[clip.assetId]?.metadata.durationSec;
    const previous = story[index - 1];
    return clip.sourceInSec <= 0.05 && (sourceSec === undefined || clip.sourceOutSec >= sourceSec - 0.05)
      && (!previous || previous.startFrame + previous.durationFrames === clip.startFrame)
      && story.findIndex((other) => other.kind === 'narrative' && other.assetId === clip.assetId) === index;
  };
  return !story.every(whole)
    || document.timeline.tracks.some((track) => track !== primary && track.role !== 'managedCaptions' && track.clips.length > 0)
    || !!document.appearance.captionStyle?.on
    || !!document.timeline.transitions?.length
    || !!document.processing?.audioDenoise || !!document.processing?.loudness;
}


export interface FirstPassToolResult { ok: boolean; summary?: string; error?: string; data?: unknown }

export interface FirstPassHost {
  projectId?: string;
  document(): EditorDocumentV2;
  brand: PlaybookSnapshot | null;
  skills: readonly string[];
  /** Runs one agent tool (the same executor the agent uses, so every step is an undoable edit). A stop
   *  signal ends its analysis early; its edit itself always lands whole or not at all. */
  tool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<FirstPassToolResult>;
  /** Receives the usage of paid calls made inside tools (transcription) while the pass runs. */
  setUsageSink(sink: ((usage: WorkflowUsage) => void) | null): void;
  applyCaptionPreset(preset: string, style: Partial<CaptionStyle>): Promise<void>;
  /** Whether the project's captions are on (the caption preset reports its failures by toast, not by throwing). */
  captionsOn(): boolean;
  /** Commits a whole-document change (the logo) or a command; false when the editor refused it. */
  replaceDocument(document: EditorDocumentV2): boolean;
  patchLoudness(loudness: { targetLufs: number; gainDb: number }): boolean;
  /** Integrated loudness (LUFS) of the timeline's mix as it would export now, before the loudness gain:
   *  voice, music and effects at their own levels. Null when nothing sounds. */
  measureMixLoudness(): Promise<number | null>;
  /** Flush document changes before publishing a completed checkpoint. */
  persist?(): Promise<void>;
}


/** Per-call hooks owned by the originating task, including after its UI unmounts. */
export interface RoughCutExecution {
  config?: EditingRunConfig;
  skills?: readonly string[];
  resume?: FirstPassReport;
  onProgress?(report: FirstPassReport): void;
  onLateUsage?(usage: WorkflowUsage): void;
  persist?(): Promise<void>;
}


/** What the pass hands on: its report (the card), the receipt note for the agent, whether it was stopped
 *  before its steps were through, and the clips each fine-cut skill had when it ended. */
export interface FirstPassOutcome { report: FirstPassReport; note: string; stopped: boolean; baseline: Record<FineCutSkill, string[]> }
let runner: ((...args:Parameters<typeof runFirstPass>)=>Promise<FirstPassOutcome>) | undefined;
let startupHint='';
export function setFirstPassRunner(value: typeof runner, hint='') { runner=value;startupHint=hint; }
export const firstPassStartupHint=()=>startupHint;
export async function runFirstPass(host: FirstPassHost, onUpdate: (report: FirstPassReport) => void, options: { steps?: readonly FirstPassStepId[]; pauses?: 'tight' | 'moderate' | 'natural'; signal?: AbortSignal; onLateUsage?: (usage: WorkflowUsage) => void; resume?: FirstPassReport } = {}): Promise<FirstPassOutcome>{
 if(!runner)throw new Error('This host has not configured an automatic editing workflow.');
 return runner(host,onUpdate,options);
}
