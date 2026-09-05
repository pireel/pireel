import { afterEach, describe, expect, it, vi } from 'vitest';
import { setStudioProviders, unavailableProviders } from '@pireel/studio-engine/providers';
import { durableFileSig, fileSig } from './media';
import { alignFileToSig, loadLocalVideo, resolveAssetBytes, saveLocalVideo } from './local-media';

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

/** Legacy handle store with ONE file handle whose permission state is scripted. */
function installLegacyHandle(key: string, file: File, permission: PermissionState) {
  const requestPermission = vi.fn(async () => 'granted' as PermissionState);
  const handle = {
    kind: 'file',
    getFile: async () => file,
    queryPermission: async () => permission,
    requestPermission,
  };
  const values = new Map<IDBValidKey, unknown>([[key, handle]]);
  const database = {
    createObjectStore: vi.fn(),
    close: vi.fn(),
    transaction: () => {
      const transaction = {
        oncomplete: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        onabort: null as ((event: Event) => void) | null,
        objectStore: () => ({
          get: (k: IDBValidKey) => {
            const request = { result: values.get(k) } as IDBRequest<unknown>;
            queueMicrotask(() => transaction.oncomplete?.({} as Event));
            return request;
          },
          delete: (k: IDBValidKey) => {
            values.delete(k);
            const request = { result: undefined } as IDBRequest<undefined>;
            queueMicrotask(() => transaction.oncomplete?.({} as Event));
            return request;
          },
        }),
      };
      return transaction;
    },
  };
  vi.stubGlobal('indexedDB', {
    open: () => {
      const request = {
        result: database,
        onupgradeneeded: null as ((event: Event) => void) | null,
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
      };
      queueMicrotask(() => request.onsuccess?.({} as Event));
      return request;
    },
  });
  return { requestPermission };
}

afterEach(() => {
  vi.unstubAllGlobals();
  setStudioProviders(unavailableProviders());
});

describe('device byte cache', () => {
  it('gives different content distinct durable identities even when file metadata is identical', async () => {
    const first = new File(['AAAA'], 'clip.mp4', { type: 'video/mp4', lastModified: 7 });
    const second = new File(['BBBB'], 'clip.mp4', { type: 'video/mp4', lastModified: 7 });
    expect(await durableFileSig(first)).not.toBe(await durableFileSig(second));
  });

  it('keeps every stored file — there is no count-based eviction (a 100-video project must not lose its 13th import)', async () => {
    installMemoryOpfs();
    const files = Array.from(
      { length: 26 },
      (_, i) => new File([`bytes-${i}`], `clip-${i}.png`, { type: 'image/png', lastModified: i + 1 }),
    );
    for (const file of files) await saveLocalVideo(file, fileSig(file));
    const retained = await Promise.all(files.map((file) => loadLocalVideo(fileSig(file))));
    expect(retained.every(Boolean)).toBe(true);
  });

  it('keeps distinct non-ASCII locators separate even when size and mtime match', async () => {
    installMemoryOpfs();
    const first = new File(['甲'], '中文.png', { type: 'image/png', lastModified: 9 });
    const second = new File(['乙'], '日文.png', { type: 'image/png', lastModified: 9 });
    expect(first.size).toBe(second.size);
    await saveLocalVideo(first, fileSig(first));
    await saveLocalVideo(second, fileSig(second));

    expect(await (await loadLocalVideo(fileSig(first)))?.text()).toBe('甲');
    expect(await (await loadLocalVideo(fileSig(second)))?.text()).toBe('乙');
  });

  it('reads and migrates the legacy sanitized OPFS key used by existing projects', async () => {
    const dir = installMemoryOpfs();
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

  it('restores a content-sig file under its label without changing its identity', async () => {
    const original = new File(['hello'], 'talk.mp4', { type: 'video/mp4', lastModified: 5 });
    const sig = await durableFileSig(original);
    const fetched = new File([original], 'cloud-restore.mp4', { type: 'video/mp4', lastModified: 999 });
    const aligned = alignFileToSig(fetched, sig, 'talk.mp4');
    expect(aligned.name).toBe('talk.mp4');
    expect(fileSig(aligned)).toBe(sig);
    // Different bytes must never be re-labelled into the addressed identity.
    const other = new File(['hello!!'], 'x.mp4', { type: 'video/mp4' });
    expect(alignFileToSig(other, sig).name).toBe('x.mp4');
  });
});

describe('byte resolution chain', () => {
  it('reads a legacy handle only while the browser still reports access as granted — never prompting', async () => {
    const file = new File(['handle-bytes'], 'clip.mp4', { type: 'video/mp4', lastModified: 3 });
    const sig = fileSig(file);
    vi.stubGlobal('navigator', { storage: {} });
    const granted = installLegacyHandle(sig, file, 'granted');
    expect(await (await loadLocalVideo(sig))?.text()).toBe('handle-bytes');
    expect(granted.requestPermission).not.toHaveBeenCalled();

    const prompt = installLegacyHandle(sig, file, 'prompt');
    expect(await loadLocalVideo(sig)).toBeNull();
    expect(prompt.requestPermission).not.toHaveBeenCalled();
  });

  it('falls back to the cloud rendezvous by cloudKey and caches the retrieved bytes on the device', async () => {
    installMemoryOpfs();
    const original = new File(['cloud-bytes'], 'broll.mp4', { type: 'video/mp4', lastModified: 1 });
    const sig = await durableFileSig(original);
    const fetch = vi.fn(async (_sig: string, options?: { cloudKey?: string }) =>
      options?.cloudKey === 'studio-src/u/abc' ? new File([original], 'cloud-restore.mp4', { type: 'video/mp4' }) : null,
    );
    setStudioProviders({ ...unavailableProviders(), vault: { backup: async () => null, fetch } });

    const entry = { assetId: 'local_1', contentSig: sig, cloudKey: 'studio-src/u/abc', label: 'broll.mp4' };
    expect(await resolveAssetBytes(entry, { deviceOnly: true })).toBeNull();
    const resolved = await resolveAssetBytes(entry);
    expect(await resolved?.text()).toBe('cloud-bytes');
    expect(resolved?.name).toBe('broll.mp4');
    expect(fetch).toHaveBeenCalledTimes(1);

    // Second resolve is served by the device cache: no second cloud fetch.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await (await resolveAssetBytes(entry))?.text()).toBe('cloud-bytes');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('consults a desktop byte provider before the cloud', async () => {
    installMemoryOpfs();
    const original = new File(['disk-bytes'], 'clip.mp4', { type: 'video/mp4', lastModified: 1 });
    const sig = await durableFileSig(original);
    const fetch = vi.fn(async () => null);
    setStudioProviders({
      ...unavailableProviders(),
      vault: { backup: async () => null, fetch },
      localBytes: { resolve: async (requested) => (requested === sig ? original : null) },
    });
    const resolved = await resolveAssetBytes({ assetId: 'a', contentSig: sig, cloudKey: 'studio-src/u/k', label: 'clip.mp4' });
    expect(await resolved?.text()).toBe('disk-bytes');
    expect(fetch).not.toHaveBeenCalled();
  });
});
