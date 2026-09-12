import { describe, expect, it, vi } from 'vitest';
import { createAssetUploadQueue } from './asset-upload-queue';

const file = (name: string) => new File([name], name, { type: 'video/mp4' });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('asset upload queue', () => {
  it('uploads in the background, reports progress, and announces the cloud key once', async () => {
    const backup = vi.fn(async (_file: File, sig: string, options: { onProgress: (f: number) => void }) => {
      options.onProgress(0.5);
      return { key: `k:${sig}` };
    });
    const queue = createAssetUploadQueue({ backup, policy: () => 'always' });
    const uploaded = vi.fn();
    queue.onUploaded(uploaded);
    const seen: number[] = [];
    queue.subscribe(() => seen.push(queue.state('sig-a')?.fraction ?? -1));

    queue.enqueue({ sig: 'sig-a', file: file('a') });
    queue.enqueue({ sig: 'sig-a', file: file('a') }); // duplicate collapses
    await flush();

    expect(backup).toHaveBeenCalledTimes(1);
    expect(uploaded).toHaveBeenCalledWith(expect.objectContaining({ sig: 'sig-a', key: 'k:sig-a' }));
    expect(queue.state('sig-a')).toMatchObject({ status: 'done', fraction: 1, key: 'k:sig-a' });
    expect(seen).toContain(0.5);
  });

  it('retries with backoff and ends in failed after the last attempt', async () => {
    const backup = vi.fn(async () => null);
    const delay = vi.fn(async () => {});
    const queue = createAssetUploadQueue({ backup, delay, policy: () => 'always' });
    queue.enqueue({ sig: 'sig-b', file: file('b') });
    await flush();
    await flush();
    expect(backup).toHaveBeenCalledTimes(4);
    expect(delay).toHaveBeenCalledTimes(3);
    expect(queue.state('sig-b')?.status).toBe('failed');
    // A failed sig may be enqueued again (the card's retry affordance).
    backup.mockResolvedValueOnce({ key: 'k' } as never);
    queue.enqueue({ sig: 'sig-b', file: file('b') });
    await flush();
    expect(queue.state('sig-b')?.status).toBe('done');
  });

  it('cancel forgets a queued or running job without announcing a key', async () => {
    let release: (value: { key: string } | null) => void = () => {};
    const backup = vi.fn((_file: File, _sig: string, options: { signal: AbortSignal }) => new Promise<{ key: string } | null>((resolve) => {
      release = resolve;
      options.signal.addEventListener('abort', () => resolve(null));
    }));
    const queue = createAssetUploadQueue({ backup, policy: () => 'always' });
    const uploaded = vi.fn();
    queue.onUploaded(uploaded);
    queue.enqueue({ sig: 'sig-c', file: file('c') });
    await flush();
    queue.cancel('sig-c');
    release({ key: 'late' });
    await flush();
    expect(uploaded).not.toHaveBeenCalled();
    expect(queue.state('sig-c')).toBeUndefined();
  });

  it('does nothing under a lazy upload policy unless the upload is forced (the manual affordance)', async () => {
    const backup = vi.fn(async () => ({ key: 'k' }));
    const queue = createAssetUploadQueue({ backup, policy: () => 'lazy' });
    queue.enqueue({ sig: 'sig-d', file: file('d') });
    await flush();
    expect(backup).not.toHaveBeenCalled();
    expect(queue.state('sig-d')).toBeUndefined();
    expect(queue.policy()).toBe('lazy');
    queue.enqueue({ sig: 'sig-d', file: file('d') }, { force: true });
    await flush();
    expect(queue.state('sig-d')?.status).toBe('done');
  });
  it('retries a rejected or synchronously throwing host backup instead of leaving uploading stuck', async () => {
    const backup = vi.fn()
      .mockImplementationOnce(() => { throw new Error('host offline'); })
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({ key: 'recovered' });
    const queue = createAssetUploadQueue({ backup, delay: async () => {}, policy: () => 'always' });
    queue.enqueue({ sig: 'retry', file: file('retry') });
    await flush();
    expect(backup).toHaveBeenCalledTimes(3);
    expect(queue.state('retry')).toMatchObject({ status: 'done', key: 'recovered' });
  });

  it('replays a completed upload when another project enqueues the same content', async () => {
    const backup = vi.fn(async () => ({ key: 'shared' }));
    const queue = createAssetUploadQueue({ backup, policy: () => 'always' });
    const first = vi.fn();
    const unsubscribe = queue.onUploaded(first);
    queue.enqueue({ sig: 'shared-sig', file: file('first') });
    await flush();
    unsubscribe();
    const second = vi.fn();
    queue.onUploaded(second);
    queue.enqueue({ sig: 'shared-sig', file: file('renamed') });
    expect(backup).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(expect.objectContaining({ sig: 'shared-sig', key: 'shared' }));
  });

  it('ignores cancelled progress and keeps the replacement upload cancellable', async () => {
    const pending: Array<{ signal: AbortSignal; onProgress: (fraction: number) => void; resolve: (value: null) => void }> = [];
    const backup = vi.fn((_file: File, _sig: string, options: { signal: AbortSignal; onProgress: (fraction: number) => void }) =>
      new Promise<null>((resolve) => pending.push({ ...options, resolve })));
    const queue = createAssetUploadQueue({ backup, policy: () => 'always' });
    queue.enqueue({ sig: 'same', file: file('old') });
    await flush();
    queue.cancel('same');
    pending[0]!.onProgress(0.9);
    expect(queue.state('same')).toBeUndefined();
    queue.enqueue({ sig: 'same', file: file('new') });
    await flush();
    pending[0]!.resolve(null);
    await flush();
    queue.cancel('same');
    expect(pending[1]!.signal.aborted).toBe(true);
    pending[1]!.resolve(null);
    await flush();
    expect(queue.state('same')).toBeUndefined();
  });

  it('persists completion to the original project after the workbench unsubscribes', async () => {
    let release!: (result: { key: string }) => void;
    const backup = vi.fn(() => new Promise<{ key: string }>((resolve) => { release = resolve; }));
    const confirmUpload = vi.fn(async () => true);
    const queue = createAssetUploadQueue({ backup, confirmUpload, policy: () => 'always' });
    const unsubscribe = queue.onUploaded(vi.fn());
    queue.enqueue({ sig: 'sig', file: file('clip'), projectId: 'project-a' });
    await flush();
    unsubscribe();
    release({ key: 'cloud/key' });
    await flush();
    expect(confirmUpload).toHaveBeenCalledWith('project-a', 'sig', 'cloud/key');
    queue.enqueue({ sig: 'sig', file: file('clip'), projectId: 'project-b' });
    await flush();
    expect(confirmUpload).toHaveBeenCalledWith('project-b', 'sig', 'cloud/key');
    expect(backup).toHaveBeenCalledTimes(1);
  });

  it('deleting an asset in one project does not cancel another project upload', async () => {
    let signal!: AbortSignal;
    let release!: (result: { key: string }) => void;
    const backup = vi.fn((_file: File, _sig: string, options: { signal: AbortSignal }) => new Promise<{ key: string }>((resolve) => { signal = options.signal; release = resolve; }));
    const confirmUpload = vi.fn(async () => true);
    const queue = createAssetUploadQueue({ backup, confirmUpload, policy: () => 'always' });
    queue.enqueue({ sig: 'sig', file: file('clip'), projectId: 'project-a' });
    queue.enqueue({ sig: 'sig', file: file('clip'), projectId: 'project-b' });
    await flush();
    queue.cancel('sig', 'project-b');
    expect(signal.aborted).toBe(false);
    release({ key: 'cloud/key' });
    await flush();
    expect(confirmUpload).toHaveBeenCalledWith('project-a', 'sig', 'cloud/key');
    expect(confirmUpload).not.toHaveBeenCalledWith('project-b', 'sig', 'cloud/key');
  });

  it('retries failed metadata confirmation and offers retry if the project remains unavailable', async () => {
    const confirmUpload = vi.fn(async () => false);
    const queue = createAssetUploadQueue({ backup: async () => ({ key: 'cloud/key' }), confirmUpload, delay: async () => {}, policy: () => 'always' });
    queue.enqueue({ sig: 'sig', file: file('clip'), projectId: 'project-a' });
    await flush();
    expect(confirmUpload).toHaveBeenCalledTimes(4);
    expect(queue.state('sig')).toMatchObject({ status: 'failed', key: 'cloud/key' });
    confirmUpload.mockResolvedValue(true);
    queue.enqueue({ sig: 'sig', file: file('clip'), projectId: 'project-a' });
    await flush();
    expect(queue.state('sig')).toMatchObject({ status: 'done', key: 'cloud/key' });
  });

});
