import { describe, expect, it, vi } from 'vitest';
import { emptyComposition, type EditorMediaAsset } from '@pireel/studio-engine/composition';
import { applyDocumentToLiveProject, createLiveProjectDocumentSession, rememberLiveAssetUrl } from './live-project-document';
import { LocalAssetRuntime } from './local-asset-runtime';

const asset = (id: string): EditorMediaAsset => ({ id, kind: 'video', locator: { localSig: `${id}.mp4:4:0`, cloudKey: `studio-src/${id}` }, metadata: {} });
const file = new File(['data'], 'source.mp4', { type: 'video/mp4' });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('local asset runtime recovery', () => {
  it('publishes a downloaded source into the render projection while a slower source is still pending', async () => {
    const first = deferred<File>();
    const slow = deferred<File>();
    const load = vi.fn((a: EditorMediaAsset) => a.id === 'first' ? first.promise : slow.promise);
    const session = createLiveProjectDocumentSession('restore-project', emptyComposition());
    const document = session.state.document;
    document.assets = { first: asset('first'), slow: asset('slow') };
    document.timeline.tracks = [{
      id: 'primary', type: 'visual', role: 'primaryNarrative', stackOrder: 0,
      muted: false, hidden: false, locked: false, syncLocked: true,
      clips: ['first', 'slow'].map((id, index) => ({
        id: `clip-${id}`, kind: 'narrative', assetId: id, startFrame: index * 60,
        durationFrames: 60, enabled: true, sourceInSec: 0, sourceOutSec: 2, properties: { treatment: 'full' },
      })),
    }];
    document.semantics.primaryNarrativeTrackId = 'primary';
    applyDocumentToLiveProject(session, document);
    const runtime = new LocalAssetRuntime({
      load, remoteIsLive: () => false,
      install: (a) => rememberLiveAssetUrl(session, a.id, `blob:restored-${a.id}`),
      changed: (_id, status) => {
        if (status === 'ready') applyDocumentToLiveProject(session, session.state.document);
      },
    });
    const batch = runtime.prepareAll([asset('first'), asset('slow')]);
    const same = runtime.prepare(asset('first'));
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(2);
    expect(runtime.status(asset('first'))).toBe('loading');
    first.resolve(file);
    await same;
    expect(runtime.status(asset('first'))).toBe('ready');
    expect(runtime.status(asset('slow'))).toBe('loading');
    expect(session.state.composition.shots?.map((shot) => shot.src)).toEqual([
      'blob:restored-first', 'blob:pireel-offline/slow',
    ]);
    slow.resolve(file);
    await batch;
    expect(session.state.composition.shots?.[1]?.src).toBe('blob:restored-slow');
  });

  it('limits automatic downloads to three and admits the next as a slot becomes free', async () => {
    const downloads = Array.from({ length: 5 }, () => deferred<File>());
    const load = vi.fn((a: EditorMediaAsset) => downloads[Number(a.id)]!.promise);
    const runtime = new LocalAssetRuntime({ load, install: vi.fn(), changed: vi.fn(), remoteIsLive: () => false });
    const batch = runtime.prepareAll(downloads.map((_, i) => asset(String(i))));
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(3);
    downloads[1]!.resolve(file);
    await runtime.prepare(asset('1'));
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(4);
    downloads.forEach((download) => download.resolve(file));
    await batch;
    expect(runtime.ready.size).toBe(5);
  });

  it('reports missing only after recovery fails and does not retry on unrelated renders', async () => {
    const load = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(file);
    const runtime = new LocalAssetRuntime({ load, install: vi.fn(), changed: vi.fn(), remoteIsLive: () => false });
    expect(runtime.status(asset('a'))).toBe('loading');
    await runtime.prepareAll([asset('a')]);
    expect(runtime.status(asset('a'))).toBe('missing');
    await runtime.prepareAll([asset('a')]);
    expect(load).toHaveBeenCalledTimes(1);
    await runtime.prepare(asset('a'));
    expect(runtime.status(asset('a'))).toBe('ready');
  });

  it('can retry after a synchronous loader error', async () => {
    const load = vi.fn().mockImplementationOnce(() => { throw new Error('cache failed'); }).mockResolvedValue(file);
    const runtime = new LocalAssetRuntime({ load, install: vi.fn(), changed: vi.fn(), remoteIsLive: () => false });
    expect((await runtime.prepare(asset('a'))).ok).toBe(false);
    expect((await runtime.prepare(asset('a'))).ok).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('retries a failed source when its cloud locator changes', async () => {
    const load = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(file);
    const runtime = new LocalAssetRuntime({ load, install: vi.fn(), changed: vi.fn(), remoteIsLive: () => false });
    await runtime.prepareAll([asset('a')]);
    const updated = { ...asset('a'), locator: { ...asset('a').locator, cloudKey: 'studio-src/new' } };
    await runtime.prepareAll([updated]);
    expect(runtime.status(updated)).toBe('ready');
  });

  it('discards old output results without removing the new output request for the same id', async () => {
    const old = deferred<File>();
    const current = deferred<File>();
    const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const install = vi.fn();
    const runtime = new LocalAssetRuntime({ load, install, changed: vi.fn(), remoteIsLive: () => false });
    const stale = runtime.prepare(asset('a'));
    runtime.reset();
    const active = runtime.prepare(asset('a'));
    old.resolve(file);
    expect((await stale).ok).toBe(false);
    expect(install).not.toHaveBeenCalled();
    expect(runtime.prepare(asset('a'))).toBe(active);
    current.resolve(file);
    await active;
    expect(install).toHaveBeenCalledTimes(1);
  });
});
