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
});
