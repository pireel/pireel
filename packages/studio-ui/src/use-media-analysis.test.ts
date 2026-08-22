/** @vitest-environment jsdom */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyEditorDocumentV2, type EditorDocumentV2 } from '@pireel/studio-engine/composition';

const mocks = vi.hoisted(() => ({ transcribe: vi.fn() }));

vi.mock('@pireel/studio-engine/providers', () => ({
  studioProviders: () => ({ transcriber: { transcribe: mocks.transcribe } }),
}));

vi.mock('./visual', () => ({ analyzeVisual: vi.fn() }));

import { useMediaAnalysis } from './use-media-analysis';

describe('media analysis transcript outcomes', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.transcribe.mockReset();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('stores and returns a valid empty transcript instead of reporting the source as unavailable', async () => {
    const initial = emptyEditorDocumentV2({ width: 1920, height: 1080, fps: 30 });
    initial.assets.main = {
      id: 'main',
      kind: 'video',
      locator: { localSig: 'silent.mp4:12:1' },
      metadata: { durationSec: 5, width: 1920, height: 1080, hasAudio: true },
    };
    initial.semantics.primaryNarrativeAssetId = 'main';
    initial.timeline.tracks[0]!.clips = [{
      id: 'main-clip',
      kind: 'narrative',
      assetId: 'main',
      startFrame: 0,
      durationFrames: 150,
      enabled: true,
      sourceInSec: 0,
      sourceOutSec: 5,
      properties: { treatment: 'full' },
    }];
    const documentRef = { current: initial };
    const setDocument = vi.fn((next: EditorDocumentV2) => { documentRef.current = next; });
    const file = new File(['silent-video'], 'silent.mp4', { type: 'video/mp4', lastModified: 1 });
    mocks.transcribe.mockResolvedValue([]);
    let stepAsr: (() => Promise<unknown>) | undefined;

    function Harness() {
      stepAsr = useMediaAnalysis({
        videoFileRef: { current: file },
        asrRef: { current: null },
        visualRef: { current: null },
        setAsrSentences: vi.fn(),
        setVisual: vi.fn(),
        documentRef,
        setDocument,
        speechFileForAsset: async () => file,
        currentVideo: () => ({ url: 'blob:main', durationSec: 5, width: 1920, height: 1080 }),
      }).stepAsr;
      return null;
    }

    await act(async () => root.render(createElement(Harness)));
    await expect(stepAsr!()).resolves.toEqual([]);

    expect(mocks.transcribe).toHaveBeenCalledOnce();
    expect(documentRef.current.semantics.transcripts).toHaveProperty('main', []);
  });

  it('treats a placed video already known to have no audio track as a valid empty transcript', async () => {
    const initial = emptyEditorDocumentV2({ width: 1920, height: 1080, fps: 30 });
    initial.assets.main = {
      id: 'main',
      kind: 'video',
      locator: { localSig: 'silent.mp4:12:1' },
      metadata: { durationSec: 5, width: 1920, height: 1080, hasAudio: false },
    };
    initial.semantics.primaryNarrativeAssetId = 'main';
    initial.timeline.tracks[0]!.clips = [{
      id: 'main-clip',
      kind: 'narrative',
      assetId: 'main',
      startFrame: 0,
      durationFrames: 150,
      enabled: true,
      sourceInSec: 0,
      sourceOutSec: 5,
      properties: { treatment: 'full' },
    }];
    const documentRef = { current: initial };
    const setDocument = vi.fn((next: EditorDocumentV2) => { documentRef.current = next; });
    let stepAsr: (() => Promise<unknown>) | undefined;

    function Harness() {
      stepAsr = useMediaAnalysis({
        videoFileRef: { current: new File(['silent-video'], 'silent.mp4', { type: 'video/mp4' }) },
        asrRef: { current: null },
        visualRef: { current: null },
        setAsrSentences: vi.fn(),
        setVisual: vi.fn(),
        documentRef,
        setDocument,
        speechFileForAsset: async () => null,
        currentVideo: () => ({ url: 'blob:main', durationSec: 5, width: 1920, height: 1080 }),
      }).stepAsr;
      return null;
    }

    await act(async () => root.render(createElement(Harness)));
    await expect(stepAsr!()).resolves.toEqual([]);

    expect(mocks.transcribe).not.toHaveBeenCalled();
    expect(documentRef.current.semantics.transcripts).toHaveProperty('main', []);
  });
});
