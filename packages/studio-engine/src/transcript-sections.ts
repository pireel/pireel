import type { AudioTimelineClip, MediaTimelineClip, NarrativeTimelineClip, TimelineClip } from './editor-document/types';

export type TranscriptSourceClip = NarrativeTimelineClip | MediaTimelineClip | AudioTimelineClip;

export function isTranscriptSourceClip(clip: TimelineClip): clip is TranscriptSourceClip {
  return clip.kind === 'narrative' || clip.kind === 'media' || clip.kind === 'audio';
}

/** One compatibility default, without attempting to reconstruct historical editing intent. */
export function transcriptSectionId(clip: Pick<TimelineClip, 'id' | 'transcriptSectionId'>): string {
  return typeof clip.transcriptSectionId === 'string' && clip.transcriptSectionId.trim() ? clip.transcriptSectionId : clip.id;
}

export function seedTranscriptSection<T extends TimelineClip>(clip: T): T {
  if (!isTranscriptSourceClip(clip) || clip.transcriptSectionId === transcriptSectionId(clip)) return clip;
  return { ...clip, transcriptSectionId: transcriptSectionId(clip) };
}

export function transcriptSourceEnd(clip: TranscriptSourceClip, fps: number): number {
  return clip.sourceOutSec ?? clip.sourceInSec + clip.durationFrames / fps * (clip.kind === 'audio' ? clip.properties.speed ?? 1 : 1);
}

/** Timeline adjacency plus forward source order; removed source-time holes are intentional. */
function continuesTranscriptSection(previous: TranscriptSourceClip, next: TranscriptSourceClip, fps: number): boolean {
  return transcriptSectionId(previous) === transcriptSectionId(next)
    && previous.assetId === next.assetId
    && next.startFrame === previous.startFrame + previous.durationFrames
    && next.sourceInSec >= transcriptSourceEnd(previous, fps) - 0.001;
}

export interface TranscriptSectionRun {
  /** Stable within this displayed occurrence, even if another run shares sectionId. */
  id: string;
  sectionId: string;
  clipIds: string[];
  startSec: number;
  endSec: number;
}

/** One linear grouping pass after ordering. A reordered or repeated source range starts a new
 * displayed run, even when it carries the same persistent section identity. */
export function transcriptSectionRuns(clips: readonly TranscriptSourceClip[], fps: number): TranscriptSectionRun[] {
  const runs: TranscriptSectionRun[] = [];
  let previous: TranscriptSourceClip | undefined;
  for (const clip of [...clips].sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id))) {
    const run = runs.at(-1);
    if (run && previous && continuesTranscriptSection(previous, clip, fps)) {
      run.clipIds.push(clip.id);
      run.endSec = (clip.startFrame + clip.durationFrames) / fps;
    } else {
      runs.push({ id: clip.id, sectionId: transcriptSectionId(clip), clipIds: [clip.id], startSec: clip.startFrame / fps, endSec: (clip.startFrame + clip.durationFrames) / fps });
    }
    previous = clip;
  }
  return runs;
}

/** Explicit Split changes the right-hand section, including already-cleaned fragments following
 * it in the same source-ordered run. Technical insertion splits use the geometry helper only. */
export function splitTranscriptSections(clips: TimelineClip[], rightIds: ReadonlySet<string>, fps: number): TimelineClip[] {
  let active: { sectionId: string; previous: TranscriptSourceClip } | undefined;
  const changed = new Map<string, TimelineClip>();
  for (const clip of [...clips].sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id))) {
    if (!isTranscriptSourceClip(clip)) { active = undefined; continue; }
    if (rightIds.has(clip.id)) {
      active = { sectionId: clip.id, previous: clip };
    } else if (active && continuesTranscriptSection(active.previous, clip, fps)) {
      active.previous = clip;
    } else active = undefined;
    if (active) changed.set(clip.id, { ...clip, transcriptSectionId: active.sectionId });
  }
  return changed.size ? clips.map((clip) => changed.get(clip.id) ?? clip) : clips;
}
