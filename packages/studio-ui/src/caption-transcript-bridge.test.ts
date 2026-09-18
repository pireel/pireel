import { describe, expect, it } from 'vitest';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { emptyEditorDocumentV2 } from '@pireel/studio-engine/composition';
import { captionTranscriptForEdit, captionTranslationSources } from './caption-transcript-bridge';

const stored: AsrSegment[] = [{ start: 0, end: 1, text: '已保存的口播稿' }];

describe('captionTranscriptForEdit', () => {
  it('recovers the durable transcript after browser runtime refs are lost', () => {
    const document = emptyEditorDocumentV2();
    document.semantics.transcripts['voice-1'] = stored;
    expect(captionTranscriptForEdit(document, 'voice-1', null)).toBe(stored);
  });

  it('prefers the current runtime transcript when it exists', () => {
    const document = emptyEditorDocumentV2();
    document.semantics.transcripts['voice-1'] = stored;
    const runtime: AsrSegment[] = [{ start: 0, end: 1, text: '当前口播稿' }];
    expect(captionTranscriptForEdit(document, 'voice-1', runtime)).toBe(runtime);
  });
});

describe('captionTranslationSources', () => {
  const documentWithMain = () => {
    const document = emptyEditorDocumentV2();
    document.assets['voice-1'] = { id: 'voice-1', kind: 'video', locator: {}, metadata: {} };
    document.timeline.tracks[0]!.clips.push({
      id: 'shot-1', kind: 'narrative', assetId: 'voice-1', startFrame: 0, durationFrames: 30, sourceStartFrame: 0, enabled: true,
    } as never);
    document.semantics.transcripts['voice-1'] = stored;
    return document;
  };

  it('reads the main script from the document when the browser refs are empty (restored project)', () => {
    const composition = { shots: [{ id: 'shot-1', srcStart: 0, srcEnd: 1 }] } as never;
    const sources = captionTranslationSources(documentWithMain(), composition, null, {});
    expect(sources.main).toBe(stored);
    expect(sources.clips).toEqual({});
  });

  it('serves sourced shots by src from the document and supplies no main copy', () => {
    const composition = { shots: [{ id: 'shot-1', src: 'blob:a', srcStart: 0, srcEnd: 1 }] } as never;
    const runtimeMain: AsrSegment[] = [{ start: 0, end: 1, text: '旧的运行时副本' }];
    const sources = captionTranslationSources(documentWithMain(), composition, runtimeMain, {});
    expect(sources.main).toBeNull();
    expect(sources.clips).toEqual({ 'blob:a': stored });
  });
});
