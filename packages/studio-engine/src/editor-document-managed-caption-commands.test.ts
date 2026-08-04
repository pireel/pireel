import { describe, expect, it } from 'vitest';
import {
  applyEditorCommand,
  emptyEditorDocumentV2,
  type CaptionTimelineClip,
  type EditorDocumentV2,
  type NarrativeTimelineClip,
} from './editor-document';

const transcript = [{
  start: 0,
  end: 6,
  text: 'hello world',
  words: [
    { text: 'hello', start: 0, end: 1 },
    { text: 'world', start: 4, end: 5 },
  ],
}];

function narrative(overrides: Partial<NarrativeTimelineClip> = {}): NarrativeTimelineClip {
  return {
    id: 'talk-a',
    kind: 'narrative',
    assetId: 'main-asset',
    startFrame: 0,
    durationFrames: 60,
    enabled: true,
    sourceInSec: 0,
    sourceOutSec: 2,
    properties: { treatment: 'full' },
    ...overrides,
  };
}

function oldCaption(overrides: Partial<CaptionTimelineClip> = {}): CaptionTimelineClip {
  return {
    id: 'capd_main_0_0',
    kind: 'caption',
    startFrame: 0,
    durationFrames: 180,
    enabled: false,
    managed: true,
    block: { templateId: 'caption', slots: {} },
    anchor: { type: 'timeline' },
    ...overrides,
  };
}

function documentWithCaptions(): EditorDocumentV2 {
  const document = emptyEditorDocumentV2({ fps: 30 });
  document.assets['main-asset'] = {
    id: 'main-asset', kind: 'video', locator: { localSig: 'main-sig' }, metadata: { durationSec: 6 },
  };
  document.semantics.primaryNarrativeAssetId = 'main-asset';
  document.semantics.transcripts['main-asset'] = transcript;
  document.timeline.tracks[0]!.clips = [
    narrative(),
    narrative({ id: 'talk-b', startFrame: 120, durationFrames: 30, sourceInSec: 4, sourceOutSec: 6 }),
  ];
  document.timeline.tracks.push({
    id: 'managed-captions',
    type: 'caption',
    role: 'managedCaptions',
    name: 'Captions',
    muted: true,
    hidden: true,
    locked: false,
    syncLocked: true,
    stackOrder: 8,
    clips: [oldCaption()],
  });
  document.semantics.managedCaptionTrackId = 'managed-captions';
  return document;
}

describe('EditorDocument V2 managed caption command', () => {
  it('derives through native gaps and retiming while preserving track and clip flags', () => {
    const document = documentWithCaptions();
    const result = applyEditorCommand(document, { type: 'captions.relay' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const track = result.document.timeline.tracks.find((candidate) => candidate.id === 'managed-captions')!;
    expect(track).toMatchObject({ muted: true, hidden: true, stackOrder: 8 });
    expect(track.clips).toMatchObject([
      { id: 'capd_main_0_0', startFrame: 0, durationFrames: 39, enabled: false, sourceRef: { assetId: 'main-asset' } },
      { id: 'capd_main_0_1', startFrame: 120, durationFrames: 24, enabled: true, sourceRef: { assetId: 'main-asset' } },
    ]);
    expect(result.receipt).toMatchObject({ affectedTrackIds: ['managed-captions'], createdClipIds: ['capd_main_0_1'] });
  });

  it('clears stale managed captions when the primary lane is deliberately empty', () => {
    const document = documentWithCaptions();
    document.timeline.tracks[0]!.clips = [];
    const result = applyEditorCommand(document, { type: 'captions.relay' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks.find((track) => track.id === 'managed-captions')!.clips).toEqual([]);
    expect(result.receipt.removedClipIds).toEqual(['capd_main_0_0']);
  });

  it('rejects a derived write to a locked managed-caption lane', () => {
    const document = documentWithCaptions();
    document.timeline.tracks.find((track) => track.id === 'managed-captions')!.locked = true;
    const result = applyEditorCommand(document, { type: 'captions.relay' });
    expect(result).toMatchObject({ ok: false, error: { code: 'track-locked', trackIds: ['managed-captions'] } });
    expect(result.document).toBe(document);
  });
});
