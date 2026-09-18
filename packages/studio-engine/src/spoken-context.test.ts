import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2 } from './editor-document/create';
import type { EditorDocumentV2, NarrativeTimelineClip } from './editor-document/types';
import { documentTranscriptContextAt } from './spoken-context';

function narrative(id: string, assetId: string, startFrame: number, sourceInSec: number, sourceOutSec: number, fps = 30): NarrativeTimelineClip {
  return {
    id,
    kind: 'narrative',
    assetId,
    startFrame,
    durationFrames: Math.round((sourceOutSec - sourceInSec) * fps),
    enabled: true,
    sourceInSec,
    sourceOutSec,
    properties: { treatment: 'full' },
  };
}

function project(clips: NarrativeTimelineClip[], transcripts: EditorDocumentV2['semantics']['transcripts']): EditorDocumentV2 {
  const document = emptyEditorDocumentV2({ width: 1920, height: 1080, fps: 30 });
  for (const assetId of Object.keys(transcripts)) {
    document.assets[assetId] = { id: assetId, kind: 'video', locator: { remoteUrl: `https://media.example/${assetId}.mp4` }, metadata: { durationSec: 800 } };
  }
  document.timeline.tracks[0]!.clips = clips;
  document.semantics.transcripts = transcripts;
  return document;
}

describe('documentTranscriptContextAt', () => {
  it('maps an edited moment through cuts instead of returning the transcript prefix', () => {
    const transcript = Array.from({ length: 80 }, (_, index) => ({
      start: index * 10,
      end: index * 10 + 8,
      text: index === 0 ? 'INTRO ONLY' : index === 60 ? 'LATE TARGET PHRASE' : `segment-${index}`,
    }));
    const document = project(
      [narrative('intro', 'main', 0, 0, 10), narrative('late', 'main', 300, 590, 620)],
      { main: transcript },
    );
    const script = documentTranscriptContextAt(document, 20, 120);
    expect(script).toContain('LATE TARGET PHRASE');
    expect(script).not.toContain('INTRO ONLY');
  });

  it('reads the inserted source transcript at that timeline moment by asset id', () => {
    const document = project(
      [narrative('main-clip', 'main', 0, 0, 5), narrative('insert-clip', 'broll', 150, 20, 30)],
      { main: [{ start: 0, end: 5, text: 'main narration' }], broll: [{ start: 20, end: 30, text: 'inserted source topic' }] },
    );
    expect(documentTranscriptContextAt(document, 8)).toBe('inserted source topic');
  });

  it('resolves a moment in a gap to the nearest speech clip and returns nothing without transcripts', () => {
    const document = project(
      [narrative('a', 'main', 0, 0, 5), narrative('b', 'main', 300, 80, 85)],
      { main: [{ start: 0, end: 5, text: 'opening' }, { start: 80, end: 85, text: 'closing' }] },
    );
    expect(documentTranscriptContextAt(document, 9.9)).toBe('closing');
    expect(documentTranscriptContextAt(project([narrative('a', 'main', 0, 0, 5)], { main: [] }), 1)).toBe('');
  });
});
