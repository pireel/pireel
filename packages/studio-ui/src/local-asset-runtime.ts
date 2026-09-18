import type { EditorMediaAsset } from '@pireel/studio-engine/composition';

export type LocalAssetRuntimeStatus = 'loading' | 'ready' | 'missing';
export type LocalAssetPreparation =
  | { ok: true; prepared: boolean; file?: File }
  | { ok: false; error: string };

/** Owns source recovery for the active output; readiness is published per asset. */
export class LocalAssetRuntime {
  readonly ready = new Set<string>();
  readonly files = new Map<string, File>();
  private pending = new Map<string, Promise<LocalAssetPreparation>>();
  private failed = new Map<string, string>();
  private generation = 0;

  constructor(private readonly deps: {
    load: (asset: EditorMediaAsset) => Promise<File | null>;
    remoteIsLive: (asset: EditorMediaAsset) => boolean;
    install: (asset: EditorMediaAsset, file: File) => void;
    changed: (assetId: string, status: LocalAssetRuntimeStatus) => void;
  }) {}

  status(asset: EditorMediaAsset): LocalAssetRuntimeStatus {
    if (this.ready.has(asset.id)) return 'ready';
    return this.failed.get(asset.id) === this.locatorKey(asset) ? 'missing' : 'loading';
  }

  private locatorKey(asset: EditorMediaAsset): string {
    return JSON.stringify(asset.locator);
  }

  reset(): void {
    this.generation += 1;
    this.pending.clear();
    this.ready.clear();
    this.files.clear();
    this.failed.clear();
  }

  prepare(asset: EditorMediaAsset): Promise<LocalAssetPreparation> {
    if (!asset.locator.localSig) return Promise.resolve({ ok: true, prepared: false });
    if (this.ready.has(asset.id)) return Promise.resolve({ ok: true, prepared: false, file: this.files.get(asset.id) });
    const pending = this.pending.get(asset.id);
    if (pending) return pending;
    const generation = this.generation;
    this.failed.delete(asset.id);
    const task = (async (): Promise<LocalAssetPreparation> => {
      try {
        const file = await Promise.resolve().then(() => this.deps.load(asset));
        if (generation !== this.generation) return { ok: false, error: 'media preparation was superseded by an output change' };
        if (!file && !this.deps.remoteIsLive(asset)) throw new Error(`Source unavailable: ${asset.label || asset.id}`);
        if (file) {
          this.deps.install(asset, file);
          this.files.set(asset.id, file);
        }
        this.ready.add(asset.id);
        this.deps.changed(asset.id, 'ready');
        return { ok: true, prepared: Boolean(file), ...(file ? { file } : {}) };
      } catch (error) {
        if (generation === this.generation) {
          this.failed.set(asset.id, this.locatorKey(asset));
          this.deps.changed(asset.id, 'missing');
        }
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      } finally {
        if (generation === this.generation) this.pending.delete(asset.id);
      }
    })();
    this.pending.set(asset.id, task);
    this.deps.changed(asset.id, 'loading');
    return task;
  }

  async prepareAll(assets: readonly EditorMediaAsset[], retryFailed = false): Promise<void> {
    const generation = this.generation;
    const queue = [...new Map(assets.map((asset) => [asset.id, asset])).values()]
      .filter((asset) => asset.locator.localSig && (retryFailed || this.status(asset) !== 'missing'));
    let index = 0;
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (generation === this.generation && index < queue.length) {
        await this.prepare(queue[index++]!);
      }
    }));
  }
}
