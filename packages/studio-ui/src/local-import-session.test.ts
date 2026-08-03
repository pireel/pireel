import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileSig } from './media';
import {
  localAssetIndexEntry,
  localAssetKindOf,
  loopbackImportUrl,
  runLocalImportSession,
} from './local-import-session';

afterEach(() => vi.unstubAllGlobals());

describe('unified local import session', () => {
  it('classifies picker and loopback files with the same MIME/extension rules', () => {
    expect(localAssetKindOf({ name: 'camera.MOV', type: '' })).toBe('video');
    expect(localAssetKindOf({ name: 'cover.bin', type: 'image/png' })).toBe(
      'image',
    );
    expect(
      localAssetKindOf({ name: 'notes.txt', type: 'text/plain' }),
    ).toBeNull();
  });

  it('accepts only one-time IPv4 loopback capability URLs', () => {
    expect(loopbackImportUrl('http://127.0.0.1:43123/abcdefgh')).not.toBeNull();
    expect(loopbackImportUrl('http://localhost:43123/abcdefgh')).toBeNull();
    expect(loopbackImportUrl('https://127.0.0.1:43123/abcdefgh')).toBeNull();
    expect(loopbackImportUrl('http://127.0.0.1:43123/short')).toBeNull();
    expect(
      loopbackImportUrl('http://127.0.0.1:43123/abcdefgh?file=x'),
    ).toBeNull();
  });

  it('normalizes browser and Skill sources into the same indexed asset shape', async () => {
    const browserFile = new File(['image'], 'cover.png', {
      type: 'image/png',
      lastModified: 7,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(new Blob(['video'], { type: 'video/mp4' })),
      ),
    );

    const session = await runLocalImportSession([
      { type: 'browser', file: browserFile },
      {
        type: 'skill-loopback',
        localUrl: 'http://127.0.0.1:43123/abcdefgh',
        sig: 'clip.mp4:5:11',
        filename: 'clip.mp4',
        fallbackType: 'video/mp4',
        folder: { id: 'folder-1', name: '测试素材', path: 'clip.mp4' },
      },
    ]);

    expect(session.rejected).toEqual([]);
    expect(
      session.imported.map((asset) => [asset.source, asset.kind, asset.sig]),
    ).toEqual([
      ['browser', 'image', fileSig(browserFile)],
      ['skill-loopback', 'video', 'clip.mp4:5:11'],
    ]);
    expect(
      localAssetIndexEntry(session.imported[1]!, {
        width: 1920,
        height: 1080,
        createdAt: 3,
      }),
    ).toMatchObject({
      sig: 'clip.mp4:5:11',
      label: 'clip.mp4',
      kind: 'video',
      w: 1920,
      h: 1080,
      createdAt: 3,
      folder: { id: 'folder-1', name: '测试素材', path: 'clip.mp4' },
    });
  });

  it('rejects truncated loopback bytes without aborting the rest of a batch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(new Blob(['tiny'], { type: 'video/mp4' })),
      ),
    );
    const good = new File(['ok'], 'ok.wav', {
      type: 'audio/wav',
      lastModified: 2,
    });
    const session = await runLocalImportSession([
      {
        type: 'skill-loopback',
        localUrl: 'http://127.0.0.1:43123/abcdefgh',
        sig: 'broken.mp4:999:1',
        filename: 'broken.mp4',
      },
      { type: 'browser', file: good },
    ]);

    expect(session.rejected[0]?.error).toContain('size mismatch');
    expect(session.imported[0]?.sig).toBe(fileSig(good));
  });
});
