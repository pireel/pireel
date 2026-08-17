import { afterEach, describe, expect, it, vi } from 'vitest';
import { durableFileSig, fileSig } from './media';
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
  it('gives different content distinct durable identities even when file metadata is identical', async () => {
    const first = new File(['AAAA'], 'clip.mp4', { type: 'video/mp4', lastModified: 7 });
    const second = new File(['BBBB'], 'clip.mp4', { type: 'video/mp4', lastModified: 7 });
    expect(await durableFileSig(first)).not.toBe(await durableFileSig(second));
  });

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

  it('keeps distinct non-ASCII locators separate even when size and mtime match', async () => {
    const dir = new MemoryDirectoryHandle();
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: async () => ({ getDirectoryHandle: async () => dir }),
        persist: async () => true,
      },
    });

    const first = new File(['甲'], '中文.png', { type: 'image/png', lastModified: 9 });
    const second = new File(['乙'], '日文.png', { type: 'image/png', lastModified: 9 });
    expect(first.size).toBe(second.size);
    await saveLocalVideo(first, fileSig(first));
    await saveLocalVideo(second, fileSig(second));

    expect(await (await loadLocalVideo(fileSig(first)))?.text()).toBe('甲');
    expect(await (await loadLocalVideo(fileSig(second)))?.text()).toBe('乙');
  });

  it('reads and migrates the legacy sanitized OPFS key used by existing projects', async () => {
    const dir = new MemoryDirectoryHandle();
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: async () => ({ getDirectoryHandle: async () => dir }),
        persist: async () => true,
      },
    });
    const original = new File(['legacy-bytes'], '旧素材.mp4', { type: 'video/mp4', lastModified: 23 });
    const sig = fileSig(original);
    const legacyKey = sig.replace(/[^a-zA-Z0-9._-]/g, '_');
    dir.files.set(legacyKey, new File([original], legacyKey));
    dir.files.set(`${legacyKey}.meta.json`, new File([JSON.stringify({
      name: original.name,
      type: original.type,
      lastModified: original.lastModified,
    })], `${legacyKey}.meta.json`));

    expect(await (await loadLocalVideo(sig))?.text()).toBe('legacy-bytes');
    expect(dir.files.has(legacyKey)).toBe(false);
  });

  it('reports persistence failure instead of pretending the local file was saved', async () => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('navigator', { storage: {} });
    const file = new File(['bytes'], 'offline.mp4', { type: 'video/mp4', lastModified: 1 });
    await expect(saveLocalVideo(file, fileSig(file))).resolves.toBe(false);
  });
});
