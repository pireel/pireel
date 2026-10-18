/**
 * Reference media for hosted generation. The agent (and the composer's @ mentions) speak in project
 * asset ids; the generation service needs URLs it can fetch. Resolve each reference to a fetchable
 * URL from the project media directory: public-CDN objects by bare key, private rendezvous objects
 * through a presigned read. Anything that cannot be fetched server-side (unknown ids, blob: URLs) is
 * reported back instead of silently dropped.
 */

import { imageThumb } from '@pireel/ui/image-url';
import type { EditorMediaAsset } from '@pireel/studio-engine/editor-document';
import type { LocalAssetIndexEntry } from '@pireel/studio-engine/project-dto';
import { resolveLocalAssetReference } from '@pireel/studio-ui/studio-tool-input-references';

export interface GenerationReferenceDeps {
  localAssets: readonly LocalAssetIndexEntry[];
  documentAssets: Readonly<Record<string, EditorMediaAsset>>;
  /** Presigned read URL for a private rendezvous key (studio-src/…); null when unavailable. */
  presign: (key: string) => Promise<string | null>;
}

const FETCHABLE = /^(https?:|data:)/i;

async function keyToUrl(key: string, deps: GenerationReferenceDeps): Promise<string | null> {
  if (key.startsWith('studio-src/')) return deps.presign(key);
  return imageThumb(key, 'original');
}

export async function resolveGenerationReferences(
  refs: unknown,
  deps: GenerationReferenceDeps,
  max: number,
): Promise<{ urls: string[]; unresolved: string[] }> {
  const urls: string[] = [];
  const unresolved: string[] = [];
  const list = Array.isArray(refs) ? refs.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).slice(0, max) : [];
  for (const raw of list) {
    const ref = raw.trim();
    if (FETCHABLE.test(ref)) {
      urls.push(ref);
      continue;
    }
    const local = resolveLocalAssetReference(ref, deps.localAssets);
    if (local?.cloudKey) {
      const url = await keyToUrl(local.cloudKey, deps);
      if (url) {
        urls.push(url);
        continue;
      }
    }
    const bare = ref.startsWith('local:') ? ref.slice('local:'.length) : ref.replace(/^@/, '');
    const asset = deps.documentAssets[bare] ?? (local ? deps.documentAssets[local.assetId] : undefined);
    if (asset?.locator.cloudKey) {
      const url = await keyToUrl(asset.locator.cloudKey, deps);
      if (url) {
        urls.push(url);
        continue;
      }
    }
    if (asset?.locator.remoteUrl && FETCHABLE.test(asset.locator.remoteUrl)) {
      urls.push(asset.locator.remoteUrl);
      continue;
    }
    unresolved.push(ref);
  }
  return { urls, unresolved };
}

/** Decode a clean source frame locally; no caption/time label and no paid frame-picking model. */
export async function resolveGenerationSourceFrame(
  value: unknown,
  deps: {
    assets: Readonly<Record<string, EditorMediaAsset>>;
    load: (asset: EditorMediaAsset) => Promise<{ file: File | null; reason?: string }>;
    capture: (file: File, sourceSec: number, width: number) => Promise<Blob | null>;
    upload: (blob: Blob) => Promise<string | null>;
    signal?: AbortSignal;
  },
): Promise<{ url: string; assetId: string; sourceSec: number }> {
  const frame = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const assetId = typeof frame.assetId === 'string' ? frame.assetId : '';
  const asset = deps.assets[assetId];
  const sourceSec = frame.sourceSec;
  if (!asset || asset.kind !== 'video') throw new Error('sourceFrame needs an actual project video assetId.');
  if (typeof sourceSec !== 'number' || !Number.isFinite(sourceSec) || sourceSec < 0 || asset.metadata.durationSec !== undefined && sourceSec >= asset.metadata.durationSec) throw new Error('sourceFrame.sourceSec must be within the video source, not timeline frames.');
  deps.signal?.throwIfAborted();
  const source = await deps.load(asset);
  if (!source.file) throw new Error(source.reason || 'Source video bytes are unavailable; restore this file before generating its cover.');
  const blob = await deps.capture(source.file, sourceSec, Math.min(1920, asset.metadata.width || 1280));
  deps.signal?.throwIfAborted();
  if (!blob) throw new Error('Could not decode the selected source frame. No generation was started.');
  const url = await deps.upload(blob);
  deps.signal?.throwIfAborted();
  if (!url || !/^https?:\/\//i.test(url)) throw new Error('Could not prepare a fetchable source frame. No generation was started.');
  return { url, assetId, sourceSec };
}
