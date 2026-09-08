// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ probe: vi.fn(), user: vi.fn(), cache: vi.fn(), save: vi.fn(), cover: vi.fn() }));
vi.mock('./caption-project-cover', () => ({ captureCaptionCover: mocks.cover }));
vi.mock('./caption-effect-showcase', () => ({ CaptionEffectShowcase: () => null }));
vi.mock('./media', () => ({ probeVideoFile: mocks.probe, fileSig: () => 'source-sig' }));
vi.mock('./current-user', () => ({ loadCurrentUser: mocks.user }));
vi.mock('./local-media', () => ({ saveLocalVideo: mocks.cache }));
vi.mock('./caption-task-store', () => ({ saveCaptionTask: mocks.save }));
vi.mock('@pireel/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? children : null,
  DialogContent: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  DialogHeader: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  DialogTitle: ({ children }: { children: ReactNode }) => createElement('h1', null, children),
}));
import { CaptionUploadDialog } from './caption-upload-dialog';
let root: Root;
let container: HTMLDivElement;
const continued = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.probe.mockResolvedValue({ durationSec: 3, width: 1080, height: 1920, hasAudio: true });
  mocks.user.mockResolvedValue({ user_id: 'account', auth_method: 'session' });
  mocks.cache.mockResolvedValue(true); mocks.save.mockResolvedValue(undefined);
  mocks.cover.mockResolvedValue('data:image/jpeg;base64,cover');
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(scene: 'captions' | 'dubbing' = 'captions') { await act(async () => root.render(createElement(CaptionUploadDialog, { open: true, scene, locale: 'zh', onOpenChange: () => {}, onContinue: continued }))); }
async function upload() {
  const input = container.querySelector('input[type=file]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['video'], 'demo.mp4', { type: 'video/mp4' })] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
describe('automatic caption upload transition', () => {
  it('opens the project automatically only after the source and project are saved', async () => {
    let finishSave!: () => void;
    mocks.save.mockReturnValueOnce(new Promise<void>((resolve) => { finishSave = resolve; }));
    await render(); await upload();
    expect(mocks.cache).toHaveBeenCalledOnce(); expect(continued).not.toHaveBeenCalled();
    await act(async () => finishSave());
    expect(continued).toHaveBeenCalledOnce();
    expect(mocks.save.mock.calls[0]![0]).toMatchObject({ scope: 'account', sourceSig: 'source-sig', stage: 'ready', coverThumb: 'data:image/jpeg;base64,cover' });
  });
  it('still imports the video when thumbnail decoding fails', async () => {
    mocks.cover.mockRejectedValueOnce(new Error('Decoder unavailable'));
    await render(); await upload();
    expect(mocks.save).toHaveBeenCalledOnce(); expect(continued).toHaveBeenCalledOnce();
  });
  it('creates a dubbing project with explicit scene metadata and enforces the first-release limit', async () => {
    await render('dubbing');
    mocks.probe.mockResolvedValueOnce({ durationSec: 121, width: 1080, height: 1920, hasAudio: true });
    await upload(); expect(mocks.save).not.toHaveBeenCalled();
    await upload();
    expect(mocks.save.mock.calls[0]![0]).toMatchObject({ scene: 'dubbing', options: { dubbing: { language: 'English', voiceId: '', lipSync: false } } });
    expect(continued).toHaveBeenCalledOnce();
  });
  it('stays on upload if the video is silent or cannot be cached', async () => {
    await render();
    mocks.probe.mockResolvedValueOnce({ durationSec: 3, width: 1080, height: 1920, hasAudio: false });
    await upload(); expect(continued).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
    mocks.cache.mockResolvedValueOnce(false);
    await upload(); expect(continued).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
    expect(container.querySelector('[role=alert]')).not.toBeNull();
  });
  it('does not navigate after the dialog unmounts during source preparation', async () => {
    let finishCache!: (value: boolean) => void;
    mocks.cache.mockReturnValueOnce(new Promise<boolean>((resolve) => { finishCache = resolve; }));
    await render(); await upload();
    await act(async () => root.render(null));
    await act(async () => finishCache(true));
    expect(continued).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
});
