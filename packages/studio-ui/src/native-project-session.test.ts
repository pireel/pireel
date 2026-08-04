import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2, type NarrativeTimelineClip } from '@pireel/studio-engine/composition';
import { nativeProjectSessionMetadata } from './native-project-session';

describe('native project session metadata', () => {
  it('hydrates transient UI caches exclusively from V2 assets and semantics', () => {
    const document = emptyEditorDocumentV2();
    document.assets.main = {
      id: 'main', kind: 'video', locator: { localSig: 'main-sig', cloudKey: 'main-key' }, metadata: { durationSec: 3 },
    };
    document.assets.clip = {
      id: 'clip', kind: 'video', label: 'clip.mp4', locator: { localSig: 'clip-sig', cloudKey: 'clip-key' },
      metadata: { width: 100, height: 200 },
      library: { createdAt: 7, folder: { id: 'folder', name: 'Media', path: 'clip.mp4' } },
    };
    document.semantics.primaryNarrativeAssetId = 'main';
    document.semantics.transcripts = {
      main: [{ start: 0, end: 1, text: 'main' }],
      clip: [{ start: 0, end: 1, text: 'clip' }],
    };
    document.semantics.plan = { scenes: 1 };
    const primary = document.timeline.tracks[0]!;
    primary.clips = [{
      id: 'placed', kind: 'narrative', assetId: 'clip', startFrame: 0, durationFrames: 30,
      enabled: true, sourceInSec: 0, sourceOutSec: 1, properties: { treatment: 'full' },
    } satisfies NarrativeTimelineClip];

    const metadata = nativeProjectSessionMetadata(document, {
      width: 1080, height: 1920, theme: 'general', video: null, blocks: [],
      shots: [{ id: 'placed', src: 'blob:runtime', srcStart: 0, srcEnd: 1, treatment: 'full' }],
    });
    expect(metadata.mainTranscript?.[0]?.text).toBe('main');
    expect(metadata.clipTranscripts['blob:runtime']?.[0]?.text).toBe('clip');
    expect(metadata.cloudMedia).toEqual({ video: { sig: 'main-sig', key: 'main-key' }, clips: { 'clip-sig': { key: 'clip-key' } } });
    expect(metadata.localAssets).toEqual([expect.objectContaining({ sig: 'clip-sig', createdAt: 7 })]);
    expect(metadata.plan).toEqual({ scenes: 1 });
  });
});
