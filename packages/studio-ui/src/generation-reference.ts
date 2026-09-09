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
import { resolveLocalAssetReference } from './studio-tool-input-references';

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
