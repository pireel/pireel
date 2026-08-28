import { describe, expect, it } from 'vitest';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { emptyEditorDocumentV2 } from '@pireel/studio-engine/composition';
import { captionTranscriptForEdit } from './caption-transcript-bridge';

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
