import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileSig } from './media';
import {
  localAssetIndexEntry,
  localAssetKindOf,
  loopbackImportUrl,
  newLocalAssetId,
  runLocalImportSession,
} from './local-import-session';
import { loadLocalVideo } from './local-media';

afterEach(() => vi.unstubAllGlobals());

class MemoryFileHandle {
  readonly kind = 'file' as const;

  constructor(
    readonly name: string,
    private readonly files: Map<string, File>,
    private readonly recordWrite: () => void,
    private readonly nextMtime: () => number,
  ) {}

  async getFile(): Promise<File> {
    const file = this.files.get(this.name);
    if (!file) throw new DOMException('Not found', 'NotFoundError');
    return file;
  }

  async createWritable() {
    const body: BlobPart[] = [];
    return {
      write: async (value: BlobPart) => {
        this.recordWrite();
        body.push(value);
      },
      close: async () => {
        this.files.set(
          this.name,
          new File(body, this.name, { lastModified: this.nextMtime() }),
        );
      },
      abort: async () => {},
    };
  }
}

class MemoryDirectoryHandle {
  readonly kind = 'directory' as const;
  readonly name = 'local-videos';
  readonly files = new Map<string, File>();
  writeCount = 0;
  private mtime = 0;

  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name) && !options?.create)
      throw new DOMException('Not found', 'NotFoundError');
    return new MemoryFileHandle(
      name,
      this.files,
      () => {
        this.writeCount += 1;
      },
      () => ++this.mtime,
    );
  }

  async removeEntry(name: string) {
    if (!this.files.delete(name))
      throw new DOMException('Not found', 'NotFoundError');
  }

  async *values() {
    for (const name of this.files.keys())
      yield new MemoryFileHandle(
        name,
        this.files,
        () => {
          this.writeCount += 1;
        },
        () => ++this.mtime,
      );
  }
}

function installMemoryOpfs(): MemoryDirectoryHandle {
  const dir = new MemoryDirectoryHandle();
  vi.stubGlobal('indexedDB', undefined);
  vi.stubGlobal('navigator', {
    storage: {
      getDirectory: async () => ({ getDirectoryHandle: async () => dir }),
      persist: async () => true,
    },
  });
  return dir;
}

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

  it('mints short fixed-width asset ids that stay unique within a project', () => {
    const ids = Array.from({ length: 2_000 }, () => newLocalAssetId());
    expect(ids.every((id) => /^local_[0-9a-z]{10}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
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
    installMemoryOpfs();
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

  it('pins a folder-handle image in OPFS so a refresh does not require permission again', async () => {
    installMemoryOpfs();
    const image = new File(['image-pixels'], 'traffic.png', {
      type: 'image/png',
      lastModified: 17,
    });
    const handle = { getFile: async () => image } as FileSystemFileHandle;
    const session = await runLocalImportSession([{
      type: 'browser',
      file: image,
      handle,
      folder: { id: 'folder-data', name: '数据图', path: 'traffic.png' },
    }]);

    expect(session.rejected).toEqual([]);
    expect(await (await loadLocalVideo(session.imported[0]!.sig))?.text()).toBe('image-pixels');
  });

  it('streams loopback response chunks into OPFS without materializing a Blob', async () => {
    const dir = installMemoryOpfs();
    const encoder = new TextEncoder();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('vi'));
          controller.enqueue(encoder.encode('deo'));
          controller.close();
        },
      }),
      { headers: { 'content-type': 'video/mp4' } },
    );
    const blob = vi
      .spyOn(response, 'blob')
      .mockRejectedValue(new Error('response.blob() must not be called'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    );

    const session = await runLocalImportSession([
      {
        type: 'skill-loopback',
        localUrl: 'http://127.0.0.1:43123/abcdefgh',
        sig: 'clip.mp4:5:11',
        filename: 'clip.mp4',
        fallbackType: 'video/mp4',
      },
    ]);

    expect(session.rejected).toEqual([]);
    expect(session.imported[0]?.file.size).toBe(5);
    expect(blob).not.toHaveBeenCalled();
    expect(dir.writeCount).toBe(3);
  });

  it('reports browser loopback isolation instead of a generic fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const session = await runLocalImportSession([{
      type: 'skill-loopback',
      localUrl: 'http://127.0.0.1:43123/abcdefgh',
      sig: 'voice.wav:5:11',
      filename: 'voice.wav',
      fallbackType: 'audio/wav',
    }]);

    expect(session.imported).toEqual([]);
    expect(session.rejected[0]?.error).toContain(
      'local loopback is unreachable from this browser',
    );
  });

  it('rejects truncated loopback bytes without aborting the rest of a batch', async () => {
    installMemoryOpfs();
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
    expect(await loadLocalVideo('broken.mp4:999:1')).toBeNull();
  });

  it('keeps an already-complete OPFS copy when a retry is truncated', async () => {
    installMemoryOpfs();
    const sig = 'clip.mp4:5:11';
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('video', {
            headers: { 'content-type': 'video/mp4' },
          }),
      ),
    );
    expect(
      (
        await runLocalImportSession([
          {
            type: 'skill-loopback',
            localUrl: 'http://127.0.0.1:43123/abcdefgh',
            sig,
            filename: 'clip.mp4',
          },
        ])
      ).rejected,
    ).toEqual([]);

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('bad', {
            headers: { 'content-type': 'video/mp4' },
          }),
      ),
    );
    const retry = await runLocalImportSession([
      {
        type: 'skill-loopback',
        localUrl: 'http://127.0.0.1:43123/abcdefgh',
        sig,
        filename: 'clip.mp4',
      },
    ]);

    expect(retry.rejected[0]?.error).toContain('size mismatch');
    expect(await (await loadLocalVideo(sig))?.text()).toBe('video');
  });
});
