import { describe, expect, it } from 'vitest';
import type { AsrSegment } from './build-blocks';
import { emptyComposition } from './composition';
import { applyNarrationDocumentEdit, removeNarrationClipsWithoutRipple } from './narration-document-edit';
import { compositionToEditorDocument } from './project-document';

describe('semantic V2 narration edit', () => {
  it('re-derives managed captions after the multi-track ripple command', () => {
    const transcript: AsrSegment[] = [{
      start: 0,
      end: 3,
      text: 'hello world',
      words: [
        { text: 'hello', start: 0, end: 0.8 },
        { text: 'world', start: 2, end: 3 },
      ],
    }];
    const composition = {
      ...emptyComposition(),
      video: { url: 'blob:runtime-main', durationSec: 4 },
      shots: [{ id: 'main', srcStart: 0, srcEnd: 4, treatment: 'full' as const }],
      blocks: [{ id: 'old-caption', templateId: 'caption', slots: {}, startSec: 0, durationSec: 3, trackIndex: 1 }],
    };
    const document = compositionToEditorDocument({ projectId: 'test', composition, videoSig: 'main-sig' }).document;
    const result = applyNarrationDocumentEdit({
      projectId: 'test',
      document,
      ranges: [{ fromSec: 0, toSec: 1 }],
      mainTranscript: transcript,
      clipTranscripts: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const captions = result.composition.blocks.filter((block) => block.templateId === 'caption');
    expect(captions.map((block) => block.label)).toEqual(['world']);
    expect(result.document.timeline.tracks.flatMap((track) => track.clips).filter((clip) => clip.kind === 'caption')).toHaveLength(1);
  });

  it('joins inserted-source transcript truth by asset identity without remigrating other tracks', () => {
    const insertedTranscript: AsrSegment[] = [{
      start: 0, end: 2, text: 'insert words',
      words: [{ text: 'insert', start: 0, end: 0.8 }, { text: 'words', start: 1, end: 2 }],
    }];
    const composition = {
      ...emptyComposition(),
      video: { url: 'blob:runtime-main', durationSec: 2 },
      shots: [
        { id: 'main', srcStart: 0, srcEnd: 2, treatment: 'full' as const },
        { id: 'insert', src: 'https://cdn.test/insert.mp4', srcStart: 0, srcEnd: 2, treatment: 'full' as const },
      ],
      blocks: [{
        id: 'old-caption', templateId: 'caption', slots: {}, startSec: 0, durationSec: 4, trackIndex: 1,
      }],
    };
    const clipTranscripts = { 'https://cdn.test/insert.mp4': insertedTranscript };
    const document = compositionToEditorDocument({ projectId: 'insert-test', composition, videoSig: 'main-sig' }).document;
    const insertedClip = document.timeline.tracks[0]!.clips.find((clip) => clip.id === 'insert');
    const insertedAssetId = insertedClip?.kind === 'narrative' ? insertedClip.assetId : undefined;
    document.timeline.tracks.push({
      id: 'untouched-graphics', type: 'graphics', role: 'graphics', muted: false, hidden: true,
      locked: false, syncLocked: false, stackOrder: 7, clips: [],
    });

    const result = applyNarrationDocumentEdit({
      projectId: 'insert-test',
      document,
      ranges: [{ fromSec: 0, toSec: 1 }],
      mainTranscript: null,
      clipTranscripts,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(insertedAssetId).toBeTruthy();
    expect(result.document.semantics.transcripts[insertedAssetId!]).toEqual(insertedTranscript);
    expect(result.document.timeline.tracks.find((track) => track.id === 'untouched-graphics')).toBeUndefined();
    expect(result.document.timeline.tracks.flatMap((track) => track.clips).some((clip) => (
      clip.kind === 'caption' && clip.sourceRef?.assetId === insertedAssetId
    ))).toBe(true);
  });

  it('empties narration without shifting independent lanes and clears only derived captions', () => {
    const transcript: AsrSegment[] = [{ start: 0, end: 2, text: 'keep no speech' }];
    const composition = {
      ...emptyComposition(),
      video: { url: 'blob:runtime-main', durationSec: 2 },
      shots: [{ id: 'only', srcStart: 0, srcEnd: 2, treatment: 'full' as const }],
      blocks: [
        { id: 'caption', templateId: 'caption', slots: {}, startSec: 0, durationSec: 2, trackIndex: 3 },
        { id: 'independent', templateId: 'custom', slots: {}, startSec: 4, durationSec: 2, trackIndex: 5 },
      ],
    };
    const document = compositionToEditorDocument({ projectId: 'empty-test', composition, videoSig: 'sig' }).document;
    const result = removeNarrationClipsWithoutRipple({
      projectId: 'empty-test', document, clipIds: ['only'], mainTranscript: transcript, clipTranscripts: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks.find((track) => track.id === result.document.semantics.primaryNarrativeTrackId)!.clips).toEqual([]);
    expect(result.document.timeline.tracks.find((track) => track.id === result.document.semantics.managedCaptionTrackId)!.clips).toEqual([]);
    expect(result.composition.blocks).toMatchObject([{ id: 'independent', startSec: 4, durationSec: 2, trackIndex: 5 }]);
  });

  it('allows deleting a source whose narration track is already empty', () => {
    const composition = {
      ...emptyComposition(),
      video: { url: 'blob:runtime-main', durationSec: 2 },
      shots: [],
    };
    const document = compositionToEditorDocument({ projectId: 'empty-source-test', composition, videoSig: 'sig' }).document;
    const result = removeNarrationClipsWithoutRipple({
      projectId: 'empty-source-test', document, clipIds: [], mainTranscript: null, clipTranscripts: {},
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.composition.shots).toEqual([]);
    expect(result.receipts[0]).toMatchObject({ commandType: 'clips.remove', removedClipIds: [] });
  });

  it('syncs an inserted-only transcript before removing its final clip', () => {
    const source = 'https://cdn.test/only-insert.mp4';
    const transcript: AsrSegment[] = [{ start: 0, end: 2, text: 'insert only' }];
    const composition = {
      ...emptyComposition(),
      shots: [{ id: 'insert-only', src: source, srcStart: 0, srcEnd: 2, treatment: 'full' as const }],
      blocks: [{
        id: 'insert-caption', templateId: 'caption',
        slots: { ref: { src: source, seg: 0, w0: 0, w1: 1 } },
        startSec: 0, durationSec: 2, trackIndex: 1,
      }],
    };
    const document = compositionToEditorDocument({ projectId: 'insert-only-test', composition }).document;
    const insertedClip = document.timeline.tracks[0]!.clips[0];
    if (insertedClip?.kind !== 'narrative') throw new Error('expected narrative clip');
    const result = removeNarrationClipsWithoutRipple({
      projectId: 'insert-only-test', document, clipIds: ['insert-only'],
      mainTranscript: null, clipTranscripts: { [source]: transcript },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.semantics.transcripts[insertedClip.assetId]).toEqual(transcript);
    expect(result.composition.shots).toEqual([]);
    expect(result.composition.blocks).toEqual([]);
  });
});
