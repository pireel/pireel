import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2, type NarrativeTimelineClip } from '@pireel/studio-engine/composition';
import { inspectCaptionDocument } from './caption-document-state';
import { captionTranscriptsByAsset } from './caption-transcript-bridge';

function documentWithNarrative() {
  const document = emptyEditorDocumentV2();
  document.assets.main = {
    id: 'main',
    kind: 'video',
    locator: { localSig: 'main-sig' },
    metadata: { durationSec: 8 },
  };
  document.semantics.primaryNarrativeAssetId = 'main';
  document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId)!.clips = [{
    id: 'shot-1',
    kind: 'narrative',
    assetId: 'main',
    startFrame: 0,
    durationFrames: 240,
    enabled: true,
    sourceInSec: 0,
    sourceOutSec: 8,
    properties: { treatment: 'full' },
  } satisfies NarrativeTimelineClip];
  return document;
}

describe('caption document state', () => {
  it('recognizes V2 primary-track video without relying on legacy composition.video', () => {
    const document = documentWithNarrative();

    expect(inspectCaptionDocument(document)).toMatchObject({
      hasVideoTrack: true,
      hasNarrativeTranscript: false,
      captionCount: 0,
    });
  });

  it('finds persisted transcripts and managed caption geometry by asset identity', () => {
    const document = documentWithNarrative();
    document.semantics.transcripts.main = [{ start: 1, end: 2, text: 'hello' }];
    document.semantics.managedCaptionTrackId = 'captions';
    document.timeline.tracks.push({
      id: 'captions',
      type: 'caption',
      role: 'managedCaptions',
      muted: false,
      hidden: false,
      locked: false,
      syncLocked: true,
      stackOrder: 1,
      clips: [{
        id: 'caption-1',
        kind: 'caption',
        startFrame: 30,
        durationFrames: 30,
        enabled: true,
        managed: true,
        anchor: { type: 'word', assetId: 'main', segmentIndex: 0, wordIndex: 0, offsetFrames: 0 },
        sourceRef: { assetId: 'main', segmentIndex: 0, wordStart: 0, wordEnd: 0 },
        block: { templateId: 'caption', slots: {} },
      }],
    });

    expect(inspectCaptionDocument(document)).toMatchObject({
      hasVideoTrack: true,
      hasNarrativeTranscript: true,
      captionCount: 1,
      firstCaptionStartSec: 1,
    });
  });

  it('bridges a runtime blob transcript back to the narrative asset through clip identity', () => {
    const document = documentWithNarrative();
    document.assets.inserted = {
      id: 'inserted', kind: 'video', locator: { localSig: 'inserted-sig' }, metadata: { durationSec: 8 },
    };
    const narrative = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId)!;
    narrative.clips = [{ ...(narrative.clips[0] as NarrativeTimelineClip), id: 'inserted-shot', assetId: 'inserted' }];
    const transcript = [{ start: 0, end: 1, text: 'runtime source' }];

    expect(captionTranscriptsByAsset(
      document,
      {
        width: 1080,
        height: 1920,
        theme: 'general',
        video: null,
        blocks: [],
        shots: [{ id: 'inserted-shot', src: 'blob:runtime-source', srcStart: 0, srcEnd: 8, treatment: 'full' }],
      },
      { 'blob:runtime-source': transcript },
    )).toMatchObject({ inserted: transcript });
  });
});
