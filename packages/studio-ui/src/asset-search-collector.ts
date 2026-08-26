'use client';

import { type AssetSearchDocument, type AssetSearchScope } from '@pireel/studio-engine/asset-search';
import type { LocalAssetIndexEntry } from '@pireel/studio-engine/project-dto';
import { studioProviders } from '@pireel/studio-engine/providers';
import { imageThumb } from '@pireel/ui/image-url';
import { loadElementEntries } from './element-history';
import { listStudioGens } from './gen-api';

interface MaterialItem {
  id: string;
  url: string;
  thumb_url: string | null;
  label: string | null;
  kind: 'image' | 'video' | 'audio';
  width: number | null;
  height: number | null;
  description?: string | null;
  source_url?: string | null;
  created_at: number;
}

const validDims = (w: number | null | undefined, h: number | null | undefined) =>
  w && h && w > 0 && h > 0 ? { w, h } : undefined;

/** Gather all searchable library metadata available to an open Studio tab. Every request is
 * fail-soft so local portions still work in the zero-backend OSS shell. Curated content is
 * returned only by an injected host provider. */
export async function collectAssetSearchDocuments(
  projectId: string,
  localAssets: readonly LocalAssetIndexEntry[],
  scope: AssetSearchScope = 'all',
): Promise<AssetSearchDocument[]> {
  const includeMine = scope === 'all' || scope === 'mine';
  const includeCloud = scope === 'all' || scope === 'cloud';
  const includeOfficial = scope === 'all' || scope === 'official';
  const getUploads = (kind: 'image' | 'video' | 'audio') =>
    fetch(`/api/me/materials?tab=global&kind=${kind}&limit=200`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { items?: MaterialItem[] } | null) => body?.items ?? [])
      .catch(() => [] as MaterialItem[]);

  const [images, videos, audio, genImages, genVideos, genAudio, syncedElements, curated] = await Promise.all([
    includeCloud ? getUploads('image') : Promise.resolve([] as MaterialItem[]),
    includeCloud ? getUploads('video') : Promise.resolve([] as MaterialItem[]),
    includeCloud ? getUploads('audio') : Promise.resolve([] as MaterialItem[]),
    includeCloud ? listStudioGens(projectId, 'image', 100).catch(() => []) : Promise.resolve([]),
    includeCloud ? listStudioGens(projectId, 'video', 100).catch(() => []) : Promise.resolve([]),
    includeCloud ? listStudioGens(projectId, 'audio', 100).catch(() => []) : Promise.resolve([]),
    includeCloud ? (studioProviders().elements?.list(projectId).catch(() => null) ?? Promise.resolve(null)) : Promise.resolve(null),
    includeOfficial
      ? (studioProviders().curatedAssets?.listSearchDocuments().catch(() => []) ?? Promise.resolve([]))
      : Promise.resolve([] as AssetSearchDocument[]),
  ]);

  const docs: AssetSearchDocument[] = (includeMine ? localAssets : []).map((entry) => ({
    assetId: `local:${entry.assetId}`,
    scope: 'mine',
    kind: entry.kind ?? 'video',
    origin: entry.folder ? 'local-folder' : 'local-file',
    label: entry.label,
    createdAt: entry.createdAt,
    ...(validDims(entry.w, entry.h) ? { dimensions: validDims(entry.w, entry.h) } : {}),
    availability: 'metadata-only',
    ...(entry.folder ? { fields: { description: `${entry.folder.name} ${entry.folder.path}` } } : {}),
  }));

  for (const item of [...images, ...videos, ...audio]) {
    docs.push({
      assetId: item.id,
      scope: 'cloud',
      kind: item.kind,
      origin: 'upload',
      label: item.label || item.id,
      createdAt: item.created_at,
      ...(validDims(item.width, item.height) ? { dimensions: validDims(item.width, item.height) } : {}),
      ...((item.description || item.source_url) ? { fields: { ...(item.description ? { description: item.description } : {}), ...(item.source_url ? { source: item.source_url } : {}) } } : {}),
      availability: 'ready',
      locator: { url: imageThumb(item.url, 'original'), ...(item.thumb_url ? { thumbUrl: item.thumb_url } : {}) },
    });
  }

  const generated = [
    ...genImages.map((job) => ({ job, kind: 'image' as const })),
    ...genVideos.map((job) => ({ job, kind: 'video' as const })),
    ...genAudio.map((job) => ({ job, kind: 'audio' as const })),
  ];
  for (const { job, kind } of generated) {
    if (job.status !== 'succeeded') continue;
    job.assets.forEach((asset, index) => docs.push({
      assetId: `gen:${job.id}:${index}`,
      scope: 'cloud',
      kind,
      origin: 'generated',
      label: job.prompt || `${kind} ${job.id}`,
      createdAt: job.createdAt,
      fields: { prompt: job.prompt },
      availability: 'ready',
      locator: { url: asset.url },
    }));
  }

  const localElements = includeCloud ? loadElementEntries(projectId) : [];
  const elements = syncedElements
    ? [...syncedElements, ...localElements.filter((local) => !syncedElements.some((cloud) => cloud.id === local.id))]
    : localElements;
  for (const entry of elements) {
    docs.push({
      assetId: `element:${entry.id}`,
      scope: 'cloud',
      kind: 'element',
      origin: 'saved-element',
      label: entry.element.label || entry.prompt || entry.id,
      createdAt: entry.createdAt,
      fields: { prompt: entry.prompt },
      availability: 'ready',
      locator: { elementId: entry.id, prompt: entry.prompt },
    });
  }

  docs.push(...curated);
  return docs;
}
