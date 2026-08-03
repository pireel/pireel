import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileSig } from './media';
import { loadLocalVideo, saveLocalVideo } from './local-media';

class MemoryFileHandle {
  readonly kind = 'file' as const;

  constructor(
    readonly name: string,
    private readonly files: Map<string, File>,
    private readonly nextMtime: () => number,
  ) {}

  async getFile(): Promise<File> {
    const file = this.files.get(this.name);
    if (!file) throw new DOMException('Not found', 'NotFoundError');
    return file;
  }

  async createWritable() {
    let body: BlobPart = '';
    return {
      write: async (value: BlobPart) => {
        body = value;
      },
      close: async () => {
        this.files.set(this.name, new File([body], this.name, { lastModified: this.nextMtime() }));
      },
    };
  }
}

class MemoryDirectoryHandle {
  readonly kind = 'directory' as const;
  readonly name = 'local-videos';
  readonly files = new Map<string, File>();
  private mtime = 0;

  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name) && !options?.create) throw new DOMException('Not found', 'NotFoundError');
    return new MemoryFileHandle(name, this.files, () => ++this.mtime);
  }

  async removeEntry(name: string) {
    if (!this.files.delete(name)) throw new DOMException('Not found', 'NotFoundError');
  }

  async *values() {
    for (const name of this.files.keys()) yield new MemoryFileHandle(name, this.files, () => ++this.mtime);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('local media persistence', () => {
  it('keeps an OPFS fallback for a native single-file picker handle', async () => {
    const dir = new MemoryDirectoryHandle();
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: async () => ({ getDirectoryHandle: async () => dir }),
        persist: async () => true,
      },
    });

    const file = new File(['single-file'], 'single.png', { type: 'image/png', lastModified: 7 });
    const sig = fileSig(file);
    await saveLocalVideo(file, sig, {} as FileSystemFileHandle, { fallbackCopy: true });

    expect(await loadLocalVideo(sig)).not.toBeNull();
  });

  it('keeps every retained folder copy when the ordinary 12-file LRU is pruned', async () => {
    const dir = new MemoryDirectoryHandle();
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: async () => ({ getDirectoryHandle: async () => dir }),
        persist: async () => true,
      },
    });

    const folderFiles = Array.from(
      { length: 13 },
      (_, i) => new File([`folder-${i}`], `folder-${i}.png`, { type: 'image/png', lastModified: i + 1 }),
    );
    for (const file of folderFiles) await saveLocalVideo(file, fileSig(file), undefined, { pinned: true });

    const ordinaryFiles = Array.from(
      { length: 13 },
      (_, i) => new File([`ordinary-${i}`], `ordinary-${i}.png`, { type: 'image/png', lastModified: 100 + i }),
    );
    for (const file of ordinaryFiles) await saveLocalVideo(file, fileSig(file));

    const retained = await Promise.all(folderFiles.map((file) => loadLocalVideo(fileSig(file))));
    const ordinary = await Promise.all(ordinaryFiles.map((file) => loadLocalVideo(fileSig(file))));
    expect(retained.every(Boolean)).toBe(true);
    expect(ordinary.filter(Boolean)).toHaveLength(12);
  });
});
