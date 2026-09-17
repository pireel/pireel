import { describe, expect, it } from 'vitest';
import { compositionToEditorDocument, type Composition } from '@pireel/studio-engine/composition';
import { runtimeTranscriptsFollowingDocument } from './runtime-transcripts';

const main = [{ start: 0, end: 2, text: 'main line' }];
const insert = [{ start: 0, end: 3, text: 'inserted line' }];

function project() {
  const composition: Composition = {
    width: 1080,
    height: 1920,
    theme: 'general',
    video: null,
    blocks: [],
    shots: [
      { id: 'main-shot', srcStart: 0, srcEnd: 4, treatment: 'full' },
      { id: 'insert-shot', src: 'https://media.example/insert.mp4', srcStart: 0, srcEnd: 3, treatment: 'full' },
    ],
  };
  const document = compositionToEditorDocument({ projectId: 'p', composition }).document;
  const clips = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId)!.clips;
  const mainAssetId = (clips[0] as { assetId: string }).assetId;
  const insertAssetId = (clips[1] as { assetId: string }).assetId;
  // The runtime composition: the main shot has no src, inserted sources keep their session URL.
  expect(clips.map((clip) => clip.id)).toEqual(['main-shot', 'insert-shot']);
  return { document, composition, mainAssetId, insertAssetId };
}

describe('runtimeTranscriptsFollowingDocument', () => {
  it('adopts a main transcript the document gained while the runtime copy was empty', () => {
    const p = project();
    p.document.semantics.transcripts = { [p.mainAssetId]: main };
    const next = runtimeTranscriptsFollowingDocument(p.document, p.composition, { main: null, clips: {} });
    expect(next?.main).toEqual(main);
  });

  it('seeds an inserted source under its projected src and follows content changes', () => {
    const p = project();
    const src = p.composition.shots!.find((shot) => shot.src)!.src!;
    p.document.semantics.transcripts = { [p.insertAssetId]: insert };
    const seeded = runtimeTranscriptsFollowingDocument(p.document, p.composition, { main: null, clips: {} });
    expect(seeded?.clips).toEqual({ [src]: insert });

    const edited = [{ start: 0, end: 3, text: 'inserted line (edited)' }];
    p.document.semantics.transcripts = { [p.insertAssetId]: edited };
    const followed = runtimeTranscriptsFollowingDocument(p.document, p.composition, { main: null, clips: { [src]: insert, [p.insertAssetId]: insert } });
    expect(followed?.clips).toEqual({ [src]: edited, [p.insertAssetId]: edited });
  });

  it('reports no change when the runtime copies already match the document by content', () => {
    const p = project();
    const src = p.composition.shots!.find((shot) => shot.src)!.src!;
    p.document.semantics.transcripts = { [p.mainAssetId]: main, [p.insertAssetId]: insert };
    const same = runtimeTranscriptsFollowingDocument(p.document, p.composition, {
      main: [{ text: 'main line', end: 2, start: 0 }],
      // A src-less narrative clip is seeded under its asset id, as the session metadata keys it.
      clips: { [src]: [{ end: 3, text: 'inserted line', start: 0 }], [p.mainAssetId]: main },
    });
    expect(same).toBeNull();
  });
});
