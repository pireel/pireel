/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';

const backup = vi.fn();
vi.mock('./cloud-media', () => ({ cloudBackupMedia: (...args: unknown[]) => backup(...args) }));
vi.mock('./media', () => ({ durableFileSig: async () => 'pireel2:abc:3' }));

import { cloudToolFrame } from './agent-frame-upload';

const DATA_URL = 'data:image/jpeg;base64,QUJD';

describe('cloudToolFrame', () => {
  afterEach(() => backup.mockReset());

  it('stores the frame and returns only its key and size', async () => {
    backup.mockResolvedValue({ key: 'studio-src/u/deadbeef' });
    const frame = await cloudToolFrame(DATA_URL, { width: 405, height: 720 });
    expect(frame).toEqual({ mimeType: 'image/jpeg', key: 'studio-src/u/deadbeef', width: 405, height: 720 });
    const [file, sig] = backup.mock.calls[0]!;
    expect((file as File).type).toBe('image/jpeg');
    expect((file as File).size).toBe(3);
    expect(sig).toBe('pireel2:abc:3');
  });

  it('keeps the picture inline when the store is unreachable', async () => {
    backup.mockResolvedValue(null);
    expect(await cloudToolFrame(DATA_URL)).toEqual({ mimeType: 'image/jpeg', data: 'QUJD' });
    backup.mockRejectedValue(new Error('offline'));
    expect(await cloudToolFrame(DATA_URL)).toEqual({ mimeType: 'image/jpeg', data: 'QUJD' });
  });
});
