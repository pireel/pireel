import { describe, expect, it } from 'vitest';
import type { AsrSegment } from './build-blocks';
import { emptyComposition } from './composition';
import { applyNarrationDocumentEdit } from './narration-document-edit';
import { normalizeProjectDocument } from './project-document';

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
    const context = { asr: transcript };
    const document = normalizeProjectDocument({ projectId: 'test', value: composition, context, videoSig: 'main-sig' }).document;
    const result = applyNarrationDocumentEdit({
      projectId: 'test',
      document,
      ranges: [{ fromSec: 0, toSec: 1 }],
      context,
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
    const context = { clipAsr: { 'https://cdn.test/insert.mp4': insertedTranscript } };
    const document = normalizeProjectDocument({ projectId: 'insert-test', value: composition, context: {}, videoSig: 'main-sig' }).document;
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
      context,
      mainTranscript: null,
      clipTranscripts: context.clipAsr,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(insertedAssetId).toBeTruthy();
    expect(result.document.semantics.transcripts[insertedAssetId!]).toEqual(insertedTranscript);
    expect(result.document.timeline.tracks.find((track) => track.id === 'untouched-graphics')).toMatchObject({
      hidden: true, syncLocked: false, stackOrder: 7, clips: [],
    });
    expect(result.document.timeline.tracks.flatMap((track) => track.clips).some((clip) => (
      clip.kind === 'caption' && clip.sourceRef?.assetId === insertedAssetId
    ))).toBe(true);
  });
});
