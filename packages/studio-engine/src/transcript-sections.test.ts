import { describe, expect, it } from 'vitest';
import { applyEditorCommand, emptyEditorDocumentV2, parseEditorDocumentV2, type EditorCommand, type EditorDocumentV2, type NarrativeTimelineClip } from './editor-document';
import { prepareEditorDocumentForPersistence, projectDocumentToComposition } from './project-document';
import { isTranscriptSourceClip, transcriptSectionId, transcriptSectionRuns } from './transcript-sections';
import { insertNarrativeAssetRange } from './narrative-document-edit';

function fixture(): EditorDocumentV2 {
  const document = emptyEditorDocumentV2({ fps: 30 });
  document.assets.voice = { id: 'voice', kind: 'video', locator: { remoteUrl: 'https://media.test/voice.mp4' }, metadata: { durationSec: 10 } };
  document.timeline.tracks[0]!.clips = [{ id: 'take', kind: 'narrative', assetId: 'voice', startFrame: 0, durationFrames: 300, sourceInSec: 0, sourceOutSec: 10, enabled: true, properties: { treatment: 'full' } }];
  return document;
}
const clips = (document: EditorDocumentV2) => document.timeline.tracks[0]!.clips.filter(isTranscriptSourceClip);
const runs = (document: EditorDocumentV2) => transcriptSectionRuns(clips(document), document.canvas.fps);
function edit(document: EditorDocumentV2, command: EditorCommand): EditorDocumentV2 {
  const result = applyEditorCommand(document, command);
  if (!result.ok) throw new Error(result.error.message);
  return result.document;
}
function remove(document: EditorDocumentV2, from: number, to: number): EditorDocumentV2 {
  return edit(document, { type: 'range.remove', trackId: document.semantics.primaryNarrativeTrackId, startFrame: from, endFrame: to, mode: 'ripple' });
}
function split(document: EditorDocumentV2, id: string, at: number): EditorDocumentV2 {
  return edit(document, { type: 'clip.split', trackId: document.semantics.primaryNarrativeTrackId, clipId: id, atFrame: at });
}

describe('transcript section identity', () => {
  it('keeps repeated cleanup cuts in one section without mutating the original', () => {
    const original = fixture();
    const cleaned = remove(remove(original, 30, 60), 150, 180);
    expect(clips(original)).toHaveLength(1);
    expect(clips(original)[0]).not.toHaveProperty('transcriptSectionId');
    expect(clips(cleaned)).toHaveLength(3);
    expect(clips(cleaned).map((clip) => clip.transcriptSectionId)).toEqual(['take', 'take', 'take']);
    expect(runs(cleaned)).toMatchObject([{ sectionId: 'take', startSec: 0, endSec: 8 }]);
  });

  it('explicit Split creates a boundary and carries the following cleanup fragments with its right side', () => {
    const cleaned = remove(remove(fixture(), 30, 60), 150, 180);
    const divided = split(cleaned, 'take', 15);
    const rightId = clips(divided)[1]!.id;
    expect(runs(divided).map((run) => run.clipIds.length)).toEqual([1, 3]);
    expect(clips(divided).map(transcriptSectionId)).toEqual(['take', rightId, rightId, rightId]);
    const cleanedAgain = remove(divided, 75, 90);
    expect(clips(cleanedAgain)).toHaveLength(5);
    expect(runs(cleanedAgain).map((run) => run.clipIds.length)).toEqual([1, 4]);
  });

  it('reorders fragments into separate reading runs and joins them when original order is restored', () => {
    const cleaned = remove(fixture(), 30, 60);
    const ids = clips(cleaned).map((clip) => clip.id);
    const reordered = edit(cleaned, { type: 'narrative.reorder', clipIds: [...ids].reverse() });
    expect(runs(reordered)).toHaveLength(2);
    expect(clips(reordered).map(transcriptSectionId)).toEqual(['take', 'take']);
    expect(runs(edit(reordered, { type: 'narrative.reorder', clipIds: ids }))).toHaveLength(1);
  });

  it('retains an explicit boundary when neighboring clips remain in forward source order', () => {
    const divided = split(fixture(), 'take', 90);
    expect(runs(divided)).toHaveLength(2);
    expect(clips(divided)[0]!.sourceOutSec).toBe(clips(divided)[1]!.sourceInSec);
    expect(runs(remove(divided, 120, 150))).toHaveLength(2);
  });

  it('inserts a new section without turning technical insertion cuts into permanent paragraph breaks', () => {
    const document = fixture();
    const inserted = edit(document, { type: 'clips.insert', trackId: document.semantics.primaryNarrativeTrackId, atFrame: 90, mode: 'ripple', clips: [{
      id: 'inserted', kind: 'narrative', offsetFrames: 0, assetId: 'voice', durationFrames: 30, sourceInSec: 8, sourceOutSec: 9, enabled: true, properties: { treatment: 'full' },
    }] });
    expect(clips(inserted).map(transcriptSectionId)).toEqual(['take', 'inserted', 'take']);
    expect(runs(inserted)).toHaveLength(3);
    const removed = remove(inserted, 90, 120);
    expect(clips(removed)).toHaveLength(2);
    expect(runs(removed)).toHaveLength(1);
  });

  it('uses the same inheritance rules for independent narration audio', () => {
    const document = fixture();
    document.assets.audio = { id: 'audio', kind: 'audio', locator: { remoteUrl: 'https://media.test/voice.wav' }, metadata: { durationSec: 10 } };
    document.timeline.tracks.push({ id: 'narration', type: 'audio', role: 'narration', muted: false, hidden: false, locked: false, syncLocked: false, stackOrder: 2, clips: [{
      id: 'audio-take', kind: 'audio', assetId: 'audio', startFrame: 0, durationFrames: 300, sourceInSec: 0, sourceOutSec: 10, enabled: true, properties: {}, anchor: { type: 'timeline' },
    }] });
    const cleaned = edit(document, { type: 'range.remove', trackId: 'narration', startFrame: 30, endFrame: 60, mode: 'lift', includeLinked: false });
    const audioClips = cleaned.timeline.tracks.find((track) => track.id === 'narration')!.clips;
    expect(audioClips.map(transcriptSectionId)).toEqual(['audio-take', 'audio-take']);
    const divided = edit(cleaned, { type: 'clip.split', trackId: 'narration', clipId: 'audio-take', atFrame: 15, includeLinked: false });
    expect(divided.timeline.tracks.find((track) => track.id === 'narration')!.clips[1]!.transcriptSectionId).not.toBe('audio-take');
  });

  it('keeps old untagged clips readable without guessing history or rewriting the document', () => {
    const document = fixture();
    const original = clips(document)[0] as NarrativeTimelineClip;
    document.timeline.tracks[0]!.clips = [
      { ...original, durationFrames: 30, sourceOutSec: 1 },
      { ...original, id: 'take~split-60', startFrame: 30, durationFrames: 240, sourceInSec: 2 },
    ];
    const before = JSON.stringify(document);
    expect(runs(document)).toHaveLength(2);
    expect(JSON.stringify(document)).toBe(before);
  });

  it('persists the section metadata without changing the render projection', () => {
    const cleaned = remove(fixture(), 30, 60);
    const restored = parseEditorDocumentV2(JSON.parse(JSON.stringify(prepareEditorDocumentForPersistence(cleaned))))!;
    expect(runs(restored)).toEqual(runs(cleaned));
    const without = structuredClone(cleaned);
    for (const track of without.timeline.tracks) for (const clip of track.clips) delete clip.transcriptSectionId;
    expect(projectDocumentToComposition(cleaned)).toEqual(projectDocumentToComposition(without));
  });

  it('restores a cut inside its original section without merging across an explicit Split', () => {
    const divided = split(fixture(), 'take', 150);
    const cleaned = remove(divided, 90, 120);
    const restored = insertNarrativeAssetRange({ document: cleaned, assetId: 'voice', clipId: 'restored-word', atSec: 3, sourceInSec: 3, sourceOutSec: 4, properties: { treatment: 'full' }, coalesceAdjacent: true });
    if (!restored.ok) throw new Error(restored.error.message);
    expect(clips(restored.document)).toHaveLength(2);
    expect(runs(restored.document)).toHaveLength(2);
    expect(clips(restored.document).map((clip) => [clip.sourceInSec, clip.sourceOutSec])).toEqual([[0, 5], [5, 10]]);
  });
});
