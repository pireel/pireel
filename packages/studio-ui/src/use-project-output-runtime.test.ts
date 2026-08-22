/** @vitest-environment jsdom */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { emptyEditorDocumentV2, type Composition } from '@pireel/studio-engine/composition';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useProjectOutputRuntime } from './use-project-output-runtime';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: ReturnType<typeof createRoot>; host: HTMLDivElement }> = [];

afterEach(() => {
  for (const item of mounted.splice(0)) {
    act(() => item.root.unmount());
    item.host.remove();
  }
});

describe('project output runtime', () => {
  it('uses the live active output when chained agent tools switch before React rerenders', async () => {
    const editorDocument = emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 });
    const composition: Composition = {
      width: 1080,
      height: 1920,
      theme: 'general',
      video: null,
      blocks: [],
      shots: [],
    };
    let liveActiveId = 'output-main';
    const switchTo = vi.fn((id: string) => {
      liveActiveId = id;
      return {
        id,
        title: id,
        order: 0,
        createdAt: 1,
        updatedAt: 1,
        document: editorDocument,
        videoSig: null,
        videoDurationSec: null,
        coverThumb: null,
      };
    });
    let runtime!: ReturnType<typeof useProjectOutputRuntime>;
    const deps = {
      projectId: 'project-1',
      // Read through the same synchronous source that create_output updates before React rerenders.
      getActiveId: () => liveActiveId,
      switchTo,
      create: vi.fn(),
      listOutputIds: () => ['output-main', 'output-three'],
      remove: vi.fn(),
      setDocument: vi.fn(),
      getComposition: () => composition,
      videoFileRef: { current: null },
      videoSigRef: { current: null },
      coverThumbRef: { current: null },
      pendingRestoreRef: { current: null },
      setVideoFile: vi.fn(),
      pickVideoFile: vi.fn(),
      recoverLocalClips: vi.fn(),
      resetEditor: vi.fn(),
    } as Parameters<typeof useProjectOutputRuntime>[0];

    function Harness() {
      runtime = useProjectOutputRuntime(deps);
      return null;
    }

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    act(() => root.render(createElement(Harness)));

    // create_output updates the synchronous output ref before this component rerenders.
    liveActiveId = 'output-three';
    let switched = false;
    await act(async () => {
      switched = await runtime.switchOutput('output-main');
    });

    expect(switched).toBe(true);
    expect(switchTo).toHaveBeenCalledWith('output-main');
    expect(liveActiveId).toBe('output-main');
  });
});
