import { whiteboardToolBlock } from '@pireel/studio-engine/whiteboard-workflow';
import { readWhiteboardEntities, type WhiteboardEntity } from '@pireel/studio-ui/whiteboard-entities';
import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { isWhiteboardDirectorTask, unfinishedRoughCut, type ChatTask } from '@pireel/studio-ui/chat-task';

/** Source-time anchors survive ripple cuts and reordering. Directions stay authored prose. */
export interface EditingDirectorPlan {
  revision: number;
  direction: string;
  brandTreatment?: string;
  entities?: WhiteboardEntity[];
  beats: { id: string; assetId: string; sourceInSec: number; sourceOutSec: number; quote: string; direction: string }[];
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
    if (!directorBeatWindows(b, document).length) return { ok: false, error: `Beat ${b.id} is absent from the retained footage. Use the current source transcript and timeline.` };
    const transcript = document.semantics.transcripts[b.assetId] ?? [];
    const passage = transcript.filter(segment => segment.end > b.sourceInSec && segment.start < b.sourceOutSec).map(segment => segment.text).join('');
    if (!compactText(passage).includes(compactText(b.quote)) || !compactText(b.quote)) return { ok: false, error: `Beat ${b.id} must quote actual transcript text at its source range; read get_transcript first.` };
    ids.add(b.id);
    beats.push({ id: b.id, assetId: b.assetId, sourceInSec: b.sourceInSec, sourceOutSec: b.sourceOutSec, quote: b.quote.trim(), direction: b.direction.trim() });
  }
  const media = isWhiteboardDirectorTask(task) || input.entities !== undefined
    ? readWhiteboardEntities(input.entities, ids, new Set(Object.keys(document.assets))) : undefined;
  if (media?.error) return { ok: false, error: media.error };
  return { ok: true, plan: { ...(media ? { entities: media.entities } : {}), revision: (task.directorPlan?.revision ?? 0) + 1, direction: input.direction.trim(),
    ...(task.config?.brand ? { brandTreatment: (input.brandTreatment as string).trim() } : {}), beats } };
}

/** Completed claims reference real clips at that passage, not just a global MG count. */
export function reviewDirectorPlan(task: ChatTask, input: Record<string, unknown>, document?: EditorDocumentV2): { ok: true; beats: DirectorBeatResult[]; summary: string; completed: boolean } | { ok: false; error: string } {
  const plan = task.directorPlan;
  if (!plan || !document) return { ok: false, error: 'Save the current task’s director plan and review the timeline before finishing.' };
  if (input.planRevision !== plan.revision) return { ok: false, error: 'Review the current director plan revision.' };
  if (!prose(input.editorialReview, 12)) return { ok: false, error: 'Review the actual opening, progression, pacing and brand coherence, and fix defects before finishing.' };
  if (!Array.isArray(input.beats) || input.beats.length !== plan.beats.length) return { ok: false, error: 'Report the result of every planned beat.' };
  const clips = visibleClips(document);
  const beats: DirectorBeatResult[] = [];
  for (const beat of plan.beats) {
    const matches = input.beats.filter((value: DirectorBeatResult | null) => value?.beatId === beat.id);
    const row = matches[0] as DirectorBeatResult | undefined;
    if (matches.length !== 1 || !row || !['applied', 'kept', 'changed', 'blocked'].includes(row.status) || !prose(row.result) || !Array.isArray(row.clipIds)) return { ok: false, error: `Account for beat ${beat.id} with a concrete outcome and any changed decision.` };
    const windows = directorBeatWindows(beat, document);
    const atPassage = clips.filter(clip => windows.some(w => clip.startFrame < w.endFrame && clip.startFrame + clip.durationFrames > w.startFrame)).map(clip => clip.id);
    const elsewhere = row.clipIds.filter(id => !atPassage.includes(id));
    // Name the ids that miss and the clips that are there: a bare refusal leaves the model guessing which of its ids is wrong.
    if (row.status !== 'blocked' && (!row.clipIds.length || elsewhere.length)) return { ok: false, error: `Beat ${beat.id} needs real enabled clips at its current source-anchored placement.${elsewhere.length ? ` Not at that passage: ${elsewhere.join(', ')}.` : ''} Clips there now: ${atPassage.join(', ') || 'none'}. If removed or unresolved, revise the plan or report blocked.` };
    beats.push({ beatId: beat.id, status: row.status, result: row.result.trim(), clipIds: row.clipIds.filter(id => typeof id === 'string') });
  }
  return { ok: true, beats, summary: input.editorialReview.trim(), completed: beats.every(beat => beat.status !== 'blocked') };
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
