import { whiteboardToolBlock } from '@pireel/studio-engine/whiteboard-workflow';
import { readWhiteboardEntities, type WhiteboardEntity } from '@pireel/studio-ui/whiteboard-entities';
import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { listDocumentAddressedWords } from '@pireel/studio-engine/editor-document/transcript-address';
import { isWhiteboardDirectorTask, unfinishedRoughCut, type ChatTask } from '@pireel/studio-ui/chat-task';

/** Source-time anchors survive ripple cuts and reordering. Directions stay authored prose. */
export interface EditingDirectorPlan {
  revision: number;
  direction: string;
  brandTreatment?: string;
  entities?: WhiteboardEntity[];
  beats: { id: string; assetId: string; sourceInSec: number; sourceOutSec: number; quote: string; direction: string; /** How much of the passage played when the plan was saved (passageCoverage). */ coveredAtSave?: string }[];
}
export interface DirectorBeatResult {
  beatId: string;
  status: 'applied' | 'kept' | 'changed' | 'blocked';
  result: string;
  clipIds: string[];
}
const prose = (value: unknown, min = 8, max = 2000): value is string => typeof value === 'string' && value.trim().length >= min && value.length <= max;
const compactText = (value: string) => value.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
const visibleClips = (document: EditorDocumentV2) => document.timeline.tracks.filter(track => !track.hidden).flatMap(track => track.clips.filter(clip => clip.enabled));

/** How far (seconds) a clip outside every beat may sit from a passage and still belong to it: a
 *  graphic that lands just after the words it illustrates is still that beat's. */
const BEAT_ATTACH_TOLERANCE_SEC = 1.5;

/** What a beat's passage holds now, compared before and after the edit: which of its source plays
 *  (merged source ranges, reaching BEAT_ATTACH_TOLERANCE_SEC past each end so trimming the pause
 *  or dead air at its edge counts), plus which of its words carry caption emphasis. It changes when
 *  speech is restored, cut or retrimmed or its key words change, and ignores splits, moves and
 *  ripples elsewhere. */
export function passageCoverage(beat: Pick<EditingDirectorPlan['beats'][number], 'assetId' | 'sourceInSec' | 'sourceOutSec'>, document: EditorDocumentV2): string {
  const from = beat.sourceInSec - BEAT_ATTACH_TOLERANCE_SEC, to = beat.sourceOutSec + BEAT_ATTACH_TOLERANCE_SEC;
  const spans = visibleClips(document).flatMap(clip => {
    if (!('assetId' in clip) || !('sourceInSec' in clip) || clip.assetId !== beat.assetId || typeof clip.sourceInSec !== 'number' || typeof clip.sourceOutSec !== 'number') return [];
    const start = Math.max(clip.sourceInSec, from), end = Math.min(clip.sourceOutSec, to);
    return end - start > 0.05 ? [[start, end] as const] : [];
  }).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of spans) {
    const last = merged.at(-1);
    if (last && start <= last[1] + 0.05) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  const emphasis = (document.semantics.transcripts[beat.assetId] ?? []).flatMap((segment, row) => {
    if (segment.end <= beat.sourceInSec || segment.start >= beat.sourceOutSec) return [];
    const decorations = (segment as { wordDecorations?: Record<string, { highlight?: unknown }> }).wordDecorations ?? {};
    return Object.entries(decorations).filter(([, decoration]) => decoration?.highlight).map(([word]) => `${row}.${word}`);
  });
  return `${merged.map(([start, end]) => `${start.toFixed(1)}-${end.toFixed(1)}`).join(',')}|${emphasis.join(',')}`;
}

/** Current placement of a planned source passage, including split or reordered takes. */
export function directorBeatWindows(beat: EditingDirectorPlan['beats'][number], document: EditorDocumentV2) {
  return visibleClips(document).flatMap(clip => {
    if (!('assetId' in clip) || !('sourceInSec' in clip) || clip.assetId !== beat.assetId || typeof clip.sourceInSec !== 'number' || typeof clip.sourceOutSec !== 'number' || clip.sourceOutSec <= clip.sourceInSec) return [];
    const start = Math.max(clip.sourceInSec, beat.sourceInSec), end = Math.min(clip.sourceOutSec, beat.sourceOutSec);
    if (end <= start) return [];
    const scale = clip.durationFrames / (clip.sourceOutSec - clip.sourceInSec);
    return [{ startFrame: clip.startFrame + (start - clip.sourceInSec) * scale, endFrame: clip.startFrame + (end - clip.sourceInSec) * scale }];
  });
}

export function saveEditingDirectorPlan(task: ChatTask, input: Record<string, unknown>, document: EditorDocumentV2): { ok: true; plan: EditingDirectorPlan } | { ok: false; error: string } {
  if (!isWhiteboardDirectorTask(task) && (task.mode !== 'one-click' || !task.roughCut || unfinishedRoughCut(task))) return { ok: false, error: 'Complete the fixed rough_cut before saving the director plan.' };
  if (!prose(input.direction)) return { ok: false, error: 'Give a concrete whole-video direction: opening, progression, rhythm and ending, in the creator’s language.' };
  if (task.config?.brand && !prose(input.brandTreatment, 12)) return { ok: false, error: 'Explain how this project’s brand changes the story rhythm, visual language and sound choices before planning beats.' };
  if (!Array.isArray(input.beats) || !input.beats.length || input.beats.length > 80) return { ok: false, error: 'Plan the meaningful passages with 1–80 source-anchored beats; there is no fixed visual quota.' };
  const beats: EditingDirectorPlan['beats'] = [];
  const ids = new Set<string>();
  for (const value of input.beats) {
    const b = value as EditingDirectorPlan['beats'][number] | null;
    if (!b || !prose(b.id, 1, 80) || ids.has(b.id) || !prose(b.assetId, 1, 160) || !prose(b.quote, 2, 500) || !prose(b.direction)
      || !Number.isFinite(b.sourceInSec) || !Number.isFinite(b.sourceOutSec) || b.sourceInSec < 0 || b.sourceOutSec <= b.sourceInSec) return { ok: false, error: 'Every beat needs a unique id, a real source passage and a specific direction.' };
    // A passage the rough cut removed may be planned too: restoring wrongly cut speech is a decision.
    const transcript = document.semantics.transcripts[b.assetId] ?? [];
    const passage = transcript.filter(segment => segment.end > b.sourceInSec && segment.start < b.sourceOutSec).map(segment => segment.text).join('');
    // The passage as it plays now (words the rough cut removed left out) counts as well as the transcript.
    const heard = listDocumentAddressedWords(document, { assetId: b.assetId, fromSec: b.sourceInSec, toSec: b.sourceOutSec, limit: 1000 });
    const playing = 'error' in heard ? '' : heard.words.map(word => word.text).join('');
    const quoted = compactText(b.quote);
    if (!quoted || (!compactText(passage).includes(quoted) && !compactText(playing).includes(quoted))) {
      const reads = passage.length > 240 ? `${passage.slice(0, 240)}…` : passage;
      return { ok: false, error: passage
        ? `Beat ${b.id} quote is not one unbroken run of the transcript at ${b.sourceInSec}–${b.sourceOutSec}s, which reads: "${reads}". Quote one unbroken part of it, as transcribed or as it plays now.`
        : `Beat ${b.id} has no transcript at ${b.sourceInSec}–${b.sourceOutSec}s of ${b.assetId}; take the range from get_transcript.` };
    }
    ids.add(b.id);
    beats.push({ id: b.id, assetId: b.assetId, sourceInSec: b.sourceInSec, sourceOutSec: b.sourceOutSec, quote: b.quote.trim(), direction: b.direction.trim(), coveredAtSave: passageCoverage(b, document) });
  }
  const media = isWhiteboardDirectorTask(task) || input.entities !== undefined
    ? readWhiteboardEntities(input.entities, ids, new Set(Object.keys(document.assets))) : undefined;
  if (media?.error) return { ok: false, error: media.error };
  return { ok: true, plan: { ...(media ? { entities: media.entities } : {}), revision: (task.directorPlan?.revision ?? 0) + 1, direction: input.direction.trim(),
    ...(task.config?.brand ? { brandTreatment: (input.brandTreatment as string).trim() } : {}), beats } };
}

/** The saved plan as the model reads it back: what it decided, without the harness's bookkeeping. */
export function directorPlanForModel(plan: EditingDirectorPlan): EditingDirectorPlan {
  return { ...plan, beats: plan.beats.map(({ coveredAtSave: _coveredAtSave, ...beat }) => beat) };
}

/** Completed claims reference real clips at that passage, not just a global MG count. */

/**
 * What the timeline holds for each planned beat, read by the harness rather than reported by the
 * model: the clips added over its passage (graphics, pictures, text, effects; each assigned to the
 * one beat it overlaps most, or else to the nearest beat within the tolerance) and the story-spine
 * clips reframed or zoomed there. Music beds and the brand logo belong to the whole video.
 */
export function directorBeatEvidence(plan: EditingDirectorPlan, document: EditorDocumentV2) {
  const fps = document.canvas.fps;
  const primary = document.semantics.primaryNarrativeTrackId;
  const windows = new Map(plan.beats.map(beat => [beat.id, directorBeatWindows(beat, document)]));
  const added = document.timeline.tracks
    .filter(track => !track.hidden && track.id !== primary && track.role !== 'managedCaptions' && track.role !== 'music')
    .flatMap(track => track.clips.filter(clip => clip.enabled && !('assetId' in clip && clip.assetId === 'brand-logo')));
  const clipsByBeat = new Map(plan.beats.map(beat => [beat.id, [] as string[]]));
  for (const clip of added) {
    const start = clip.startFrame, end = clip.startFrame + clip.durationFrames;
    let best: { id: string; overlap: number; gap: number } | null = null;
    for (const beat of plan.beats) {
      let overlap = 0, gap = Infinity;
      for (const w of windows.get(beat.id)!) {
        overlap += Math.max(0, Math.min(end, w.endFrame) - Math.max(start, w.startFrame));
        gap = Math.min(gap, start >= w.endFrame ? start - w.endFrame : w.startFrame >= end ? w.startFrame - end : 0);
      }
      if (!best || overlap > best.overlap || (overlap === best.overlap && overlap === 0 && gap < best.gap)) best = { id: beat.id, overlap, gap };
    }
    if (best && (best.overlap > 0 || best.gap <= BEAT_ATTACH_TOLERANCE_SEC * fps)) clipsByBeat.get(best.id)!.push(clip.id);
  }
  const spine = document.timeline.tracks.find(track => track.id === primary)?.clips.filter(clip => clip.enabled) ?? [];
  return new Map(plan.beats.map(beat => {
    const passage = windows.get(beat.id)!;
    const treated = spine.filter(clip => {
      const properties = clip.kind === 'narrative' ? clip.properties : undefined;
      const reframed = !!properties && ((properties.zoom?.scale ?? 1) > 1 || (!!properties.treatment && properties.treatment !== 'full'));
      return reframed && passage.some(w => clip.startFrame < w.endFrame && clip.startFrame + clip.durationFrames > w.startFrame);
    }).map(clip => clip.id);
    return [beat.id, { windows: passage, clipIds: [...clipsByBeat.get(beat.id)!, ...treated] }] as const;
  }));
}

export function reviewDirectorPlan(task: ChatTask, input: Record<string, unknown>, document?: EditorDocumentV2): { ok: true; beats: DirectorBeatResult[]; summary: string; completed: boolean } | { ok: false; error: string; problems: string[] } {
  const plan = task.directorPlan;
  const refuse = (problems: string[]) => ({ ok: false as const, error: problems.join(' '), problems });
  if (!plan || !document) return refuse(['Save the current task’s director plan and review the timeline before finishing.']);
  // Every problem at once: a refusal that names one at a time burns the retry budget on the next one.
  const problems: string[] = [];
  if (input.planRevision !== plan.revision) problems.push(`Review the current director plan revision (planRevision ${plan.revision}).`);
  if (!prose(input.editorialReview, 12)) problems.push('Review the actual opening, progression, pacing and brand coherence, and fix defects before finishing.');
  const rows = Array.isArray(input.beats) ? input.beats as (Partial<DirectorBeatResult> | null)[] : [];
  if (rows.length !== plan.beats.length) problems.push(`Report the result of every planned beat (${plan.beats.length}).`);
  const evidence = directorBeatEvidence(plan, document);
  const fps = document.canvas.fps;
  const beats: DirectorBeatResult[] = [];
  for (const beat of plan.beats) {
    const matches = rows.filter((value) => value?.beatId === beat.id);
    const row = matches[0] ?? undefined;
    if (matches.length !== 1 || !row || !['applied', 'kept', 'changed', 'blocked'].includes(String(row.status)) || !prose(row.result)) {
      problems.push(`Account for beat ${beat.id} once, with a status and a concrete outcome.`);
      continue;
    }
    const status = row.status as DirectorBeatResult['status'];
    const { windows, clipIds } = evidence.get(beat.id)!;
    // Restoring, cutting or retrimming the passage's speech, or changing its key words, is work there too.
    const recut = beat.coveredAtSave !== undefined && passageCoverage(beat, document) !== beat.coveredAtSave;
    if (!windows.length && status !== 'blocked' && status !== 'changed' && !(status === 'applied' && recut)) {
      problems.push(`Beat ${beat.id}'s passage is no longer in the video. Report it changed (say what replaced it) or blocked, or revise the plan.`);
      continue;
    }
    if (status === 'applied' && !clipIds.length && !recut) {
      const at = windows.map(w => `frames ${Math.round(w.startFrame)}–${Math.round(w.endFrame)}`).join(', ');
      problems.push(`Beat ${beat.id} is reported applied, but since the plan was saved nothing was added, reframed, restored, cut or emphasised at its passage (${at || 'not in the video'}, or within ${BEAT_ATTACH_TOLERANCE_SEC}s of it). Do what the beat needs there, or report it kept, changed or blocked with the reason.`);
      continue;
    }
    beats.push({ beatId: beat.id, status, result: row.result!.trim(), clipIds: [...clipIds] });
  }
  if (problems.length) return refuse(problems);
  return { ok: true, beats, summary: (input.editorialReview as string).trim(), completed: beats.every(beat => beat.status !== 'blocked') };
}

export function directorPlanToolBlock(task: ChatTask | undefined, id: string, mutates: boolean, input?: Record<string, unknown>): string | undefined {
  if (isWhiteboardDirectorTask(task)) return whiteboardToolBlock(task, id, mutates, input);
  if (id === 'set_whiteboard' && input?.describe === true) return;
  if (!task?.directorPlanRequired || task.directorPlan || id === 'rough_cut' || id === 'save_edit_plan' || (!mutates && id !== 'compose_component')) return;
  return 'Before fine-cut execution, finish rough_cut, read the retained transcript, inspect the footage and project brand, then call save_edit_plan. Continue automatically after saving; no plan approval is needed.';
}

/** Carry the actual brand-informed direction into the separate component generator too. */
export function withDirectorInstruction(task: ChatTask | undefined, id: string, input: Record<string, unknown>, document?: EditorDocumentV2): Record<string, unknown> {
  const plan = task?.directorPlan;
  if (!plan || !document || typeof input.instruction !== 'string' || !(id === 'compose_component' || id === 'apply_component' && input.generate === true)) return input;
  const existing = visibleClips(document).find(clip => clip.id === input.clipId);
  const start = typeof input.atFrame === 'number' ? input.atFrame : existing?.startFrame;
  const duration = typeof input.durationFrames === 'number' ? input.durationFrames : existing?.durationFrames;
  const beats = start === undefined ? [] : plan.beats.filter(beat => directorBeatWindows(beat, document).some(window => start < window.endFrame && start + (duration ?? 1) > window.startFrame));
  return { ...input, instruction: `${input.instruction}\n\nSaved creative direction (task data; preserve the requested content, placement and duration):\n${JSON.stringify({ direction: plan.direction, brandTreatment: plan.brandTreatment, beats: beats.map(beat => ({ quote: beat.quote, direction: beat.direction })) })}` };
}
