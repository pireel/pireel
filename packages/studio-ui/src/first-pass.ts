import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import type { CaptionStyle } from '@pireel/studio-engine/composition-core';
import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';
import type { PlaybookSnapshot } from '@pireel/studio-engine/brand-playbook';
import type { WorkflowUsage } from '@pireel/studio-engine/workflow';
import { DEFAULT_CAPTION_PRESET } from '@pireel/studio-engine/caption-presets';
import { PAUSE_BY_MODE, cutDurationSec } from '@pireel/studio-engine/brand-edit-params';
import { applyPlaybookMedia } from '@pireel/studio-engine/brand-media';
import { loudnessGainDb } from '@pireel/studio-engine/loudness-lufs';
import { isFillerWord } from '@pireel/studio-engine/speech-fillers';
import { firstNarrativeAssetId } from '@pireel/studio-engine/editor-document/read-model';
import { listDocumentAddressedWords } from '@pireel/studio-engine/editor-document/transcript-address';
import { studioProviders } from '@pireel/studio-engine/providers';
import { imageThumb } from '@pireel/ui/image-url';
import { t } from './i18n';

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
export interface FineCutItem { id: FineCutSkill; status: 'running' | 'done' | 'not-needed' | 'stopped'; count: number }
/** The checklist as the rough cut's card shows it (live progress, then the tool receipt). "stopped": the
 *  creator stopped it; the steps still pending can run again. */
export interface FirstPassReport {
  state: 'running' | 'stopped' | 'done';
  steps: FirstPassStep[];
  /** Credits spent so far. */
  credits: number;
  /** One sentence on what changed, once done. */
  summary?: string;
}

/** The clips that count towards each fine-cut skill: graphics and on-screen text, pictures over the
 *  speaker (not the brand logo), and sound effects. */
export function fineCutClipIds(document: EditorDocumentV2): Record<FineCutSkill, string[]> {
  const ids: Record<FineCutSkill, string[]> = { graphics: [], 'b-roll': [], sound: [] };
  for (const track of document.timeline.tracks) {
    if (track.role === 'managedCaptions') continue;
    for (const clip of track.clips) {
      if (clip.kind === 'graphic') ids.graphics.push(clip.id);
      else if (clip.kind === 'media' && track.type === 'visual' && track.id !== document.semantics.primaryNarrativeTrackId && clip.assetId !== 'brand-logo') ids['b-roll'].push(clip.id);
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
  const story = primary?.clips ?? [];
  const only = story[0];
  const sourceSec = only?.kind === 'narrative' ? document.assets[only.assetId]?.metadata.durationSec : undefined;
  const trimmed = only?.kind === 'narrative' && (only.sourceInSec > 0.05 || (sourceSec !== undefined && only.sourceOutSec < sourceSec - 0.05));
  return story.length > 1 || trimmed
    || document.timeline.tracks.some((track) => track !== primary && track.role !== 'managedCaptions' && track.clips.length > 0)
    || !!document.appearance.captionStyle?.on
    || !!document.timeline.transitions?.length
    || !!document.processing?.audioDenoise || !!document.processing?.loudness;
}

export interface FirstPassToolResult { ok: boolean; summary?: string; error?: string; data?: unknown }
export interface FirstPassHost {
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
  /** The main video's bytes, for measuring its loudness. */
  primaryFile(): Promise<Blob | null>;
  measureLoudness(file: Blob): Promise<number | null>;
}

/** The note a one-click edit's first message carries to the agent (it starts with rough_cut). */
export const ONE_CLICK_EDIT_HINT = [
  'This message starts a one-click edit from the Studio home: the creator handed over the whole video.',
  'Start with rough_cut, then apply the editing skills that are on, in the brand\'s style.',
  'Finish the edit in this turn without asking questions: make the reasonable choice and offer the alternatives as next steps.',
  'Talk to the creator in the language of their message.',
].join(' ');

/** Credits billed after a rough cut ended (a transcription it stopped waiting for finished on its own):
 *  the chat adds them to that rough cut's card. */
const lateCreditListeners = new Set<(credits: number) => void>();
export function onLateRoughCutCredits(listener: (credits: number) => void): () => void {
  lateCreditListeners.add(listener);
  return () => { lateCreditListeners.delete(listener); };
}
export function emitLateRoughCutCredits(credits: number): void {
  for (const listener of lateCreditListeners) listener(credits);
}

/** Air kept before the take that stays when a failed attempt and the pause after it are cut. */
const REPEAT_LEAD_SEC = 0.25;

const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const clock = (sec: number) => {
  const whole = Math.max(0, Math.round(sec));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/** What the pass hands on: its report (the card), the receipt note for the agent, whether it was stopped
 *  before its steps were through, and the clips each fine-cut skill had when it ended. */
export interface FirstPassOutcome { report: FirstPassReport; note: string; stopped: boolean; baseline: Record<FineCutSkill, string[]> }

/**
 * Runs the pass. Without steps it does what the project's editing skills and brand ask for; with steps,
 * exactly those (a brand-only step still needs the brand to set it). A stop (the signal) ends a step's
 * analysis at once and takes effect before its edit, so no step is left half applied.
 */
export async function runFirstPass(host: FirstPassHost, onUpdate: (report: FirstPassReport) => void, options: { steps?: readonly FirstPassStepId[]; pauses?: 'tight' | 'moderate' | 'natural'; signal?: AbortSignal; onLateUsage?: (credits: number) => void } = {}): Promise<FirstPassOutcome> {
  const brand = host.brand;
  const on = new Set(host.skills);
  const pauseMode = options.pauses ?? brand?.blocks.sound?.pauses ?? 'moderate';
  const captionBlock = brand?.blocks.captions;
  const asked = options.steps?.length ? new Set(options.steps) : null;
  const byBrand = { logo: !!brand?.blocks.logo, loudness: brand?.blocks.sound?.lufs !== undefined };
  const wanted: Record<FirstPassStepId, boolean> = asked
    ? { transcribe: asked.has('transcribe') || asked.has('cleanup') || asked.has('captions'), pauses: asked.has('pauses'), cleanup: asked.has('cleanup'), captions: asked.has('captions'), denoise: asked.has('denoise'), logo: asked.has('logo') && byBrand.logo, loudness: asked.has('loudness') && byBrand.loudness }
    : {
      transcribe: on.has('rough-cut') || on.has('captions'),
      pauses: on.has('rough-cut') && pauseMode !== 'natural',
      cleanup: on.has('rough-cut'),
      captions: on.has('captions'),
      denoise: on.has('voice-cleanup'),
      ...byBrand,
    };
  const skippedWhy = (id: FirstPassStepId) => (asked?.has(id) && (id === 'logo' || id === 'loudness') ? t('chatGen.firstPass.notInBrand') : t('chatGen.firstPass.notOn'));
  const report: FirstPassReport = { state: 'running', steps: FIRST_PASS_STEPS.map((id) => (wanted[id] ? { id, status: 'pending' } : { id, status: 'skipped', detail: skippedWhy(id) })), credits: 0 };
  const startSec = cutDurationSec(host.document());
  const counts = { pauses: 0, fillers: 0, repeats: 0, sensitive: 0 };
  /** What was done, for the receipt. */
  const done: string[] = [];
  /** Doubtful repeats left in, for the receipt. */
  const unsure: string[] = [];
  const publish = () => onUpdate(structuredClone(report));
  const step = (id: FirstPassStepId) => report.steps.find((item) => item.id === id)!;
  const set = (id: FirstPassStepId, status: FirstPassStepStatus, detail?: string) => {
    Object.assign(step(id), { status, ...(detail ? { detail } : {}) });
    publish();
  };
  let ended = false;
  const addUsage = (usage: WorkflowUsage) => {
    if (typeof usage.credits !== 'number' || !Number.isFinite(usage.credits)) return;
    // Billed after the pass ended: the chat adds it to the card it belongs to.
    if (ended) { options.onLateUsage?.(usage.credits); return; }
    report.credits = Math.round((report.credits + usage.credits) * 100) / 100;
    publish();
  };
  const stopped = () => !!options.signal?.aborted;
  // The card says "stopped" at once; the step under way still finishes and records what it did.
  const onStop = () => { report.state = 'stopped'; publish(); };
  options.signal?.addEventListener('abort', onStop, { once: true });
  publish();

  const attempt = async (id: FirstPassStepId, body: () => Promise<string | null>) => {
    if (!wanted[id] || stopped()) return;
    set(id, 'running');
    try {
      const detail = await body();
      set(id, detail === null ? 'skipped' : 'done', detail ?? t('chatGen.firstPass.nothingToDo'));
    } catch (error) {
      // Stopped mid-step: nothing of it was applied after the stop, so it waits to run again.
      if (stopped()) { const current = step(id); current.status = 'pending'; delete current.detail; publish(); return; }
      set(id, 'failed', error instanceof Error ? error.message.slice(0, 120) : String(error));
    }
  };
  /** Ends a step's waiting at once when the pass is stopped (its result, if any, is then not used). */
  const abortable = <T,>(work: Promise<T>): Promise<T> => {
    const signal = options.signal;
    if (!signal) return work;
    if (signal.aborted) return Promise.reject(new DOMException('Stopped', 'AbortError'));
    return Promise.race([work, new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true }))]);
  };
  /** Before each edit a step makes: a stop since its analysis means the edit is not made. */
  const checkpoint = () => { if (stopped()) throw new DOMException('Stopped', 'AbortError'); };
  const toolOk = async (name: string, args: Record<string, unknown>) => {
    checkpoint();
    const result = await host.tool(name, args, options.signal);
    if (!result.ok) throw new Error(result.error ?? name);
    return result;
  };
  const mainTranscript = (): { assetId: string; segments: AsrSegment[] } | null => {
    const document = host.document();
    const assetId = firstNarrativeAssetId(document);
    const segments = assetId ? (document.semantics.transcripts[assetId] ?? []) as AsrSegment[] : [];
    return assetId && segments.length ? { assetId, segments } : null;
  };

  await attempt('transcribe', async () => {
    host.setUsageSink(addUsage);
    try { await toolOk('get_transcript', {}); } finally { host.setUsageSink(null); }
    const main = mainTranscript();
    if (!main) {
      if (wanted.cleanup) { wanted.cleanup = false; set('cleanup', 'skipped', t('chatGen.firstPass.noSpeech')); }
      return t('chatGen.firstPass.noSpeech');
    }
    done.push('transcribed the narration');
    return t('chatGen.firstPass.lines', { n: main.segments.length });
  });

  await attempt('pauses', async () => {
    const result = await toolOk('remove_silence', { ...PAUSE_BY_MODE[pauseMode] });
    const cuts = (result.data as { cuts?: unknown[] } | undefined)?.cuts?.length ?? 0;
    counts.pauses = cuts;
    if (!cuts) return null;
    done.push(`trimmed ${cuts} pauses (${pauseMode} pacing)`);
    return t('chatGen.firstPass.pausesCut', { n: cuts });
  });

  // One clean-up of the speech: repeats cut (found by the model over the whole transcript), filler sounds
  // cut, sensitive words masked. Repeats go first so a filler or sensitive word inside one is not touched twice.
  await attempt('cleanup', async () => {
    const main = mainTranscript();
    if (!main) return null;
    const clean = studioProviders().speechCleanup;
    let found: Awaited<ReturnType<NonNullable<typeof clean>>> | null = null;
    let modelError = '';
    if (clean) {
      try { found = await clean(main.segments, { onUsage: addUsage, ...(options.signal ? { signal: options.signal } : {}) }); } catch (error) { checkpoint(); modelError = error instanceof Error ? error.message : String(error); }
    }
    unsure.push(...(found?.unsure ?? []).map((item) => `segment ${item.seg} "${item.text}": ${item.note}`));
    if (found?.cuts.length) {
      // Each failed attempt goes with the pause after it, up to a breath before what follows.
      const starts = main.segments.flatMap((segment) => (segment.words?.length ? segment.words : [segment]).map((word) => word.start)).sort((a, b) => a - b);
      const ranges = found.cuts.map((cut) => {
        const next = starts.find((start) => start >= cut.range[1]);
        return [cut.range[0], next !== undefined ? Math.max(cut.range[1], next - REPEAT_LEAD_SEC) : cut.range[1]];
      });
      await toolOk('remove_words', { assetId: main.assetId, ranges });
      counts.repeats = found.cuts.length;
      done.push(`removed ${found.cuts.length} repeats (${found.cuts.map((cut) => `"${cut.text === '*' ? main.segments[cut.seg]?.text.slice(0, 20) : cut.text.slice(0, 20)}"`).join(', ')})`);
    }
    const playing = () => {
      const listed = listDocumentAddressedWords(host.document(), { assetId: main.assetId, limit: 1000 });
      if ('error' in listed) return [];
      const words = [...listed.words];
      for (let offset = words.length; listed.hasMore && offset < listed.total; offset = words.length) {
        const page = listDocumentAddressedWords(host.document(), { assetId: main.assetId, limit: 1000, offset });
        if ('error' in page || !page.words.length) break;
        words.push(...page.words);
      }
      return words;
    };
    const fillers = playing().filter((word) => isFillerWord(word.text)).map((word) => word.id);
    if (fillers.length) {
      await toolOk('remove_words', { wordIds: fillers });
      counts.fillers = fillers.length;
      done.push(`cut ${fillers.length} filler sounds`);
    }
    if (found?.sensitive.length) {
      const words = playing();
      const ids = found.sensitive.flatMap((item) => words.filter((word) => word.start >= item.range[0] - 0.01 && word.end <= item.range[1] + 0.01).map((word) => word.id));
      if (ids.length) {
        await toolOk('mask_words', { wordIds: [...new Set(ids)] });
        counts.sensitive = found.sensitive.length;
        done.push(`masked ${found.sensitive.length} sensitive words with a beep and ** in the captions (${found.sensitive.map((item) => `"${item.text}"`).join(', ')})`);
      }
    }
    const detail = [
      counts.fillers ? t('chatGen.firstPass.fillers', { n: counts.fillers }) : '',
      counts.repeats ? t('chatGen.firstPass.repeats', { n: counts.repeats }) : '',
      counts.sensitive ? t('chatGen.firstPass.sensitive', { n: counts.sensitive }) : '',
    ].filter(Boolean).join(' · ');
    // Fillers still go when the model call fails; the step says what did not happen.
    if (modelError) throw new Error([detail, t('chatGen.firstPass.repeatsFailed', { error: modelError })].filter(Boolean).join(' · '));
    return detail || null;
  });

  await attempt('captions', async () => {
    const style = captionBlock?.on ? { ...(captionBlock.style ?? {}) } : {};
    checkpoint();
    await host.applyCaptionPreset(style.preset ?? DEFAULT_CAPTION_PRESET, style);
    if (!host.captionsOn()) throw new Error(t('chatGen.firstPass.captionsFailed'));
    done.push(captionBlock?.on ? 'captions on in the brand caption style' : 'captions on in the default style');
    return t(captionBlock?.on ? 'chatGen.firstPass.captionsBrand' : 'chatGen.firstPass.captionsDefault');
  });

  await attempt('denoise', async () => {
    await toolOk('denoise_audio', {});
    done.push('narration denoised');
    return t('chatGen.firstPass.denoised');
  });

  await attempt('logo', async () => {
    const logo = brand!.blocks.logo!;
    const withLogo = applyPlaybookMedia(host.document(), brand!);
    const asset = withLogo.assets['brand-logo'];
    // The live editor plays assets by URL; the brand stores the logo by its key.
    const document = asset ? { ...withLogo, assets: { ...withLogo.assets, 'brand-logo': { ...asset, locator: { ...asset.locator, remoteUrl: imageThumb(logo.key, 'original') } } } } : withLogo;
    checkpoint();
    if (!host.replaceDocument(document)) throw new Error(t('chatGen.firstPass.editRefused'));
    done.push(`brand logo in the ${logo.corner} corner`);
    return t('chatGen.firstPass.logoPlaced');
  });

  await attempt('loudness', async () => {
    const targetLufs = brand!.blocks.sound!.lufs!;
    const file = await abortable(host.primaryFile());
    if (!file) throw new Error(t('chatGen.firstPass.noSource'));
    const measured = await abortable(host.measureLoudness(file));
    checkpoint();
    if (measured === null) throw new Error(t('chatGen.firstPass.noSource'));
    const gainDb = loudnessGainDb(measured, targetLufs);
    if (gainDb === null) return null;
    if (!host.patchLoudness({ targetLufs, gainDb })) throw new Error(t('chatGen.firstPass.editRefused'));
    done.push(`loudness brought to ${targetLufs} LUFS`);
    return t('chatGen.firstPass.loudnessSet', { lufs: targetLufs });
  });

  options.signal?.removeEventListener('abort', onStop);
  const baseline = fineCutClipIds(host.document());
  const failed = report.steps.filter((item) => item.status === 'failed').map((item) => `${item.id} (${item.detail ?? 'failed'})`);
  const pending = report.steps.filter((item) => item.status === 'pending').map((item) => item.id);
  const facts = [
    failed.length ? `Failed and not applied: ${failed.join('; ')}.` : '',
    unsure.length ? `Possible repeats left in because they were unclear (judge them only if the edit needs it): ${unsure.join(' | ')}` : '',
    wanted.cleanup && !studioProviders().speechCleanup ? 'Repeat and sensitive-word detection is not available here; only filler sounds were cut — find repeats in the transcript and cut them with remove_words.' : '',
  ];
  if (stopped()) {
    report.state = 'stopped';
    publish();
    ended = true;
    const note = [
      `Rough cut stopped by the user. Done: ${done.length ? done.join('; ') : 'nothing'}.`,
      pending.length ? `Not run: ${pending.join(', ')} — call rough_cut with steps ${JSON.stringify(pending)} to finish them.` : '',
      ...facts,
    ].filter(Boolean).join('\n');
    return { report: structuredClone(report), note, stopped: true, baseline };
  }

  const endSec = cutDurationSec(host.document());
  const changes = [
    counts.fillers ? t('chatGen.firstPass.sumFillers', { n: counts.fillers }) : '',
    counts.repeats ? t('chatGen.firstPass.sumRepeats', { n: counts.repeats }) : '',
    counts.pauses ? t('chatGen.firstPass.sumPauses', { n: counts.pauses }) : '',
    counts.sensitive ? t('chatGen.firstPass.sumSensitive', { n: counts.sensitive }) : '',
  ].filter(Boolean);
  report.summary = changes.length
    ? t('chatGen.firstPass.summaryCut', { changes: sentenceCase(changes.join(t('chatGen.firstPass.listJoin'))), from: clock(startSec), to: clock(endSec) })
    : t('chatGen.firstPass.summaryNoCut', { length: clock(endSec) });
  report.state = 'done';
  publish();

  const note = [
    `Rough cut done (${clock(startSec)} → ${clock(endSec)}): ${done.length ? done.join('; ') : 'nothing needed changing'}.`,
    ...facts,
  ].filter(Boolean).join('\n');
  ended = true;
  return { report: structuredClone(report), note, stopped: false, baseline };
}
