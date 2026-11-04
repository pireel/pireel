import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2 } from '@pireel/studio-engine/editor-document';
import { runAgentTimelineTool } from '@pireel/studio-engine/agent-timeline';
import { keepStorySpineWhole, packStorySpine, storySpineIntact } from './story-spine';

function project() {
  let document = emptyEditorDocumentV2({ fps: 30 });
  document = runAgentTimelineTool(document, 'register_media', { assets: [
    { id: 'v', kind: 'video', url: 'https://cdn.example/v.mp4', durationSec: 30 },
    { id: 'voice', kind: 'audio', url: 'https://cdn.example/voice.mp3', durationSec: 10 },
  ] }).document!;
  return runAgentTimelineTool(document, 'add_clips', { clips: [
    { id: 's1', role: 'primary', assetId: 'v', startFrame: 0, source: [0, 2] },
    { id: 's2', role: 'primary', assetId: 'v', startFrame: 60, source: [2, 4] },
    { id: 's3', role: 'primary', assetId: 'v', startFrame: 120, source: [4, 6] },
    { id: 'n1', role: 'narration', assetId: 'voice', startFrame: 0, source: [0, 6] },
  ] }).document!;
}
const spineOf = (document: ReturnType<typeof project>) => document.timeline.tracks
  .find((track) => track.id === document.semantics.primaryNarrativeTrackId)!.clips
  .map((clip) => [clip.id, clip.startFrame, clip.durationFrames]);
const withSpine = (document: ReturnType<typeof project>, edit: (clips: { id: string; startFrame: number; linkGroupId?: string }[]) => void) => {
  const copy = structuredClone(document);
  edit(copy.timeline.tracks.find((track) => track.id === copy.semantics.primaryNarrativeTrackId)!.clips as never);
  return copy;
};

describe('story spine', () => {
  it('packs gaps and overlaps from frame 0 in start order, moving linked partners along', () => {
    const base = project();
    const broken = withSpine(base, (clips) => {
      clips[1]!.startFrame = 90; // a gap of 30 before s2
      clips[2]!.startFrame = 100; // s3 overlaps s2
      clips[1]!.linkGroupId = 'g';
    });
    const voice = broken.timeline.tracks.find((track) => track.role === 'narration')!.clips[0]!;
    voice.linkGroupId = 'g';
    voice.startFrame = 90;
    expect(storySpineIntact(broken)).toBe(false);
    const packed = packStorySpine(broken);
    expect(spineOf(packed)).toEqual([['s1', 0, 60], ['s2', 60, 60], ['s3', 120, 60]]);
    expect(packed.timeline.tracks.find((track) => track.role === 'narration')!.clips[0]!.startFrame).toBe(60);
    expect(storySpineIntact(packed)).toBe(true);
  });

  it('leaves a gap alone when an edit does not change the spine layout, and closes it when one does', () => {
    const gapped = withSpine(project(), (clips) => { clips[1]!.startFrame = 90; clips[2]!.startFrame = 150; });
    const styled = runAgentTimelineTool(gapped, 'set_clip_properties', { items: [{ clipId: 's1', filter: { contrast: 1.2 } }] });
    expect(spineOf(styled.document!)).toEqual([['s1', 0, 60], ['s2', 90, 60], ['s3', 150, 60]]);
    const trimmed = runAgentTimelineTool(gapped, 'set_clip_properties', { items: [{ clipId: 's1', source: [0, 1.5] }] });
    expect(storySpineIntact(trimmed.document!)).toBe(true);
    expect(keepStorySpineWhole(gapped, gapped)).toMatchObject({ ok: true, document: gapped });
  });
});
