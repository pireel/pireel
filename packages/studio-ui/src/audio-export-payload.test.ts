import { describe, expect, it, vi } from 'vitest';
import type { AudioClip } from '@pireel/studio-engine/composition';
import { audioExportPayload } from './audio-export-payload';

const clip = (overrides: Partial<AudioClip> = {}): AudioClip => ({
  id: 'foley-1',
  src: 'https://cdn.example.com/foley.mp3',
  startSec: 0,
  inSec: 0,
  outSec: 2,
  ...overrides,
});

describe('audio export payload', () => {
  it('materializes a remotely playable clip instead of silently dropping it from export', async () => {
    const file = new File(['audio'], 'foley.mp3', { type: 'audio/mpeg' });
    const materialize = vi.fn(async () => ({ file, sig: 'foley.mp3:5:0' }));
    const files = new Map<string, File>();

    const result = await audioExportPayload([clip()], files, materialize);

    expect(result).toEqual([{ clip: clip(), file }]);
    expect(materialize).toHaveBeenCalledWith(
      'https://cdn.example.com/foley.mp3',
      expect.objectContaining({ type: 'audio/mpeg' }),
    );
    expect(files.get('https://cdn.example.com/foley.mp3')).toBe(file);
  });

  it('fails explicitly when an enabled blob clip has lost its bytes', async () => {
    await expect(audioExportPayload(
      [clip({ src: 'blob:missing', sig: 'foley.mp3:5:0' })],
      new Map(),
      vi.fn(),
    )).rejects.toThrow('foley-1');
  });

  it('does not block export for a muted clip whose bytes are unavailable', async () => {
    const materialize = vi.fn();
    await expect(audioExportPayload(
      [clip({ muted: true })],
      new Map(),
      materialize,
    )).resolves.toBeNull();
    expect(materialize).not.toHaveBeenCalled();
  });
});
