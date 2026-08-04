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
});
