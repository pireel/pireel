import { describe, expect, it } from 'vitest';
import type { AsrSegment } from './build-blocks';
import { applyCaptionDocumentEdit } from './caption-document-edit';
import { emptyComposition } from './composition-core';
import { normalizeProjectDocument, projectDocumentToLegacyComposition } from './project-document';

const transcript: AsrSegment[] = [{
  start: 0,
  end: 4,
  text: 'one two three four',
  words: [
    { text: 'one', start: 0, end: 0.7 },
    { text: 'two', start: 0.8, end: 1.5 },
    { text: 'three', start: 1.6, end: 2.5 },
    { text: 'four', start: 2.6, end: 3.5 },
  ],
}];

function captionFixture() {
  const composition = {
    ...emptyComposition(),
    video: { url: 'blob:main', durationSec: 5 },
    shots: [{ id: 'main', srcStart: 0, srcEnd: 5, treatment: 'full' as const }],
    captionStyle: { color: '#ff0000', bg: '#000000' },
  };
  const document = normalizeProjectDocument({
    projectId: 'captions-test', value: composition, context: { asr: transcript }, videoSig: 'main-sig',
  }).document;
  document.timeline.tracks.push({
    id: 'empty-graphics', type: 'graphics', muted: false, hidden: true, locked: false,
    syncLocked: false, stackOrder: 9, clips: [],
  });
  return document;
}

describe('native caption lifecycle transaction', () => {
  it('creates and relays a managed lane while applying one complete sparse style patch', () => {
    const document = captionFixture();
    const result = applyCaptionDocumentEdit({
      document,
      patch: { on: true, preset: 'ln-clean', yPct: 82, scale: 1.2, color: undefined, bg: undefined },
      mainTranscript: transcript,
      clipTranscripts: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const captionTrack = result.document.timeline.tracks.find((track) => track.id === result.document.semantics.managedCaptionTrackId)!;
    expect(captionTrack).toMatchObject({ type: 'caption', role: 'managedCaptions', locked: false });
    expect(captionTrack.clips.length).toBeGreaterThan(0);
    expect(result.document.appearance.captionStyle).toMatchObject({ on: true, preset: 'ln-clean', yPct: 82, scale: 1.2 });
    expect(result.document.appearance.captionStyle).not.toHaveProperty('color');
    expect(result.document.appearance.captionStyle).not.toHaveProperty('bg');
    expect(result.document.timeline.tracks.find((track) => track.id === 'empty-graphics')).toMatchObject({
      hidden: true, syncLocked: false, stackOrder: 9, clips: [],
    });
    const rerun = applyCaptionDocumentEdit({
      document: result.document,
      mainTranscript: [...transcript],
      clipTranscripts: {},
    });
    expect(rerun.ok).toBe(true);
    if (rerun.ok) expect(rerun.document).toBe(result.document);
  });

  it('turns captions off without deleting their lane or remembered style', () => {
    const enabled = applyCaptionDocumentEdit({
      document: captionFixture(), patch: { on: true, preset: 'ln-clean' }, mainTranscript: transcript, clipTranscripts: {},
    });
    expect(enabled.ok).toBe(true);
    if (!enabled.ok) return;
    const disabled = applyCaptionDocumentEdit({
      document: enabled.document, patch: { on: false }, mainTranscript: transcript, clipTranscripts: {},
    });
    expect(disabled.ok).toBe(true);
    if (!disabled.ok) return;
    expect(disabled.document.appearance.captionStyle).toMatchObject({ on: false, preset: 'ln-clean' });
    expect(disabled.document.timeline.tracks.find((track) => track.id === disabled.document.semantics.managedCaptionTrackId)).toMatchObject({ clips: [] });
    expect(projectDocumentToLegacyComposition({ projectId: 'captions-test', value: disabled.document }).blocks).toEqual([]);
  });

  it('returns the original document when the managed lane is locked', () => {
    const enabled = applyCaptionDocumentEdit({
      document: captionFixture(), patch: { on: true, preset: 'ln-clean' }, mainTranscript: transcript, clipTranscripts: {},
    });
    expect(enabled.ok).toBe(true);
    if (!enabled.ok) return;
    const document = enabled.document;
    document.timeline.tracks.find((track) => track.id === document.semantics.managedCaptionTrackId)!.locked = true;
    const result = applyCaptionDocumentEdit({
      document, patch: { yPct: 70 }, mainTranscript: transcript, clipTranscripts: {},
    });
    expect(result).toMatchObject({ ok: false, document, error: { code: 'track-locked' } });
    expect(document.appearance.captionStyle?.yPct).toBeUndefined();
  });
});
