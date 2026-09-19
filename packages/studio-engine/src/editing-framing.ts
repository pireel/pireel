import type { EditorDocumentV2, EditorTrack, GraphicTimelineClip, MediaTimelineClip } from './editor-document';
import { getTheme } from './theme';
import type { FramingPlan } from './editing-plan';

/** A visual's background and silent presenter seat are linked to it, never global speaker transforms. */
export function applyEditorialFraming(document: EditorDocumentV2, plan: FramingPlan): EditorDocumentV2 {
  const next = structuredClone(document); const fps = next.canvas.fps;
  next.timeline.tracks = next.timeline.tracks.filter(track => !['editorial-ground', 'editorial-presenter'].includes(track.id));
  const backgrounds: GraphicTimelineClip[] = []; const seats: MediaTimelineClip[] = [];
  const primary = next.timeline.tracks.find(track => track.id === next.semantics.primaryNarrativeTrackId);
  for (const beat of plan.beats.filter(beat => beat.visual !== 'speaker')) {
    const visual = beat.visual === 'graphic'
      ? next.timeline.tracks.flatMap(track => track.clips).find(clip => clip.id === 'workflow-graphic-' + beat.id)
      : next.timeline.tracks.filter(track => track.role === 'broll').flatMap(track => track.clips).find(clip => clip.startFrame / fps >= beat.start - 1 / fps && clip.startFrame / fps < beat.end);
    if (!visual) continue; // No matching footage: keep the original, including the speaker's framing.
    const group = 'editorial-' + beat.id; visual.linkGroupId = group;
    const startFrame = visual.startFrame; const durationFrames = visual.durationFrames;
    backgrounds.push({ id: group + '-ground', kind: 'graphic', anchor: { type: 'timeline' }, startFrame, durationFrames, enabled: true, linkGroupId: group,
      block: { templateId: 'custom', label: '画面底色', box: { x: 0, y: 0, w: 1, h: 1 }, slots: { innerHtml: `<div style="position:absolute;inset:0;background:${getTheme(next.appearance.theme).background}"></div>`, timelineBody: '', authoredDurationSec: durationFrames / fps } } });
    if (visual.kind === 'media') { visual.fit = 'contain'; visual.box = beat.payload ?? undefined; }
    if (beat.mode !== 'seat' || !beat.speaker) continue;
    for (const clip of primary?.clips ?? []) {
      if (clip.kind !== 'narrative' || !clip.enabled) continue;
      const start = Math.max(startFrame, clip.startFrame); const end = Math.min(startFrame + durationFrames, clip.startFrame + clip.durationFrames);
      if (end <= start) continue;
      const rate = (clip.sourceOutSec - clip.sourceInSec) / clip.durationFrames;
      seats.push({ id: group + '-seat-' + clip.id, kind: 'media', assetId: clip.assetId, startFrame: start, durationFrames: end - start, sourceInSec: clip.sourceInSec + (start - clip.startFrame) * rate, sourceOutSec: clip.sourceInSec + (end - clip.startFrame) * rate,
        enabled: true, linkGroupId: group, fit: 'contain', box: beat.speaker, video: { treatment: 'full', audioMuted: true } });
    }
  }
  const add = (id: string, name: string, type: EditorTrack['type'], clips: EditorTrack['clips'], stackOrder: number) => {
    if (clips.length) next.timeline.tracks.push({ id, name, type, clips, stackOrder, hidden: false, muted: true, locked: false, syncLocked: true });
  };
  // Grounds sit above the canonical source but below B-roll, graphics and the reserved caption lane.
  for (const track of next.timeline.tracks) if (track.role === 'broll') track.stackOrder = 3;
  add('editorial-ground', '画面底色', 'graphics', backgrounds, 2);
  add('editorial-presenter', '人物画面', 'visual', seats, 3);
  for (const track of next.timeline.tracks) if (track.type === 'caption') track.stackOrder = Math.max(5, track.stackOrder);
  return next;
}
