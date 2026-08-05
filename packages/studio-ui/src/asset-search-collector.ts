'use client';

import { bgmSearchTags, officialStickerSearchTags, type AssetSearchDocument } from '@pireel/studio-engine/asset-search';
import { kitComponents } from '@pireel/studio-engine/kit-templates';
import type { LocalAssetIndexEntry } from '@pireel/studio-engine/project-dto';
import { studioProviders } from '@pireel/studio-engine/providers';
import { imageThumb } from '@pireel/ui/image-url';
import { loadElementEntries } from './element-history';
import { listStudioGens } from './gen-api';
import { ELEMENT_TEMPLATES, localizedTemplatePrompt } from './gen-templates';
import { studioLocale, t } from './i18n';
import type { OfficialAssetsResponse } from './official-assets-types';

interface MaterialItem {
  id: string;
  url: string;
  thumb_url: string | null;
  label: string | null;
  kind: 'image' | 'video' | 'audio';
  width: number | null;
  height: number | null;
  created_at: number;
}

export { searchOfficialAssetDocuments } from './official-asset-search-client';

const validDims = (w: number | null | undefined, h: number | null | undefined) =>
  w && h && w > 0 && h > 0 ? { w, h } : undefined;

/** Gather all searchable library metadata available to an open Studio tab. Every request is
 * fail-soft so the local/kit portions still work in the zero-backend OSS shell. */
export async function collectAssetSearchDocuments(projectId: string, localAssets: readonly LocalAssetIndexEntry[]): Promise<AssetSearchDocument[]> {
  const getUploads = (kind: 'image' | 'video' | 'audio') =>
    fetch(`/api/me/materials?tab=global&kind=${kind}&limit=200`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { items?: MaterialItem[] } | null) => body?.items ?? [])
      .catch(() => [] as MaterialItem[]);

  const [images, videos, audio, genImages, genVideos, genAudio, syncedElements, official] = await Promise.all([
    getUploads('image'),
    getUploads('video'),
    getUploads('audio'),
    listStudioGens(projectId, 'image', 100).catch(() => []),
    listStudioGens(projectId, 'video', 100).catch(() => []),
    listStudioGens(projectId, 'audio', 100).catch(() => []),
    studioProviders().elements?.list(projectId).catch(() => null) ?? Promise.resolve(null),
    fetch('/api/studio/official-assets')
      .then((response): Promise<OfficialAssetsResponse> => (response.ok ? (response.json() as Promise<OfficialAssetsResponse>) : Promise.resolve({})))
      .catch(() => ({} as OfficialAssetsResponse)),
  ]);

  const docs: AssetSearchDocument[] = localAssets.map((entry) => ({
    assetId: `local:${entry.sig}`,
    scope: 'mine',
    kind: entry.kind ?? 'video',
    origin: entry.folder ? 'local-folder' : 'local-file',
    label: entry.label,
    createdAt: entry.createdAt,
    ...(validDims(entry.w, entry.h) ? { dimensions: validDims(entry.w, entry.h) } : {}),
    availability: 'metadata-only',
    ...(entry.folder ? { fields: { description: `${entry.folder.name} ${entry.folder.path}` } } : {}),
    locator: { sig: entry.sig },
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

  const localElements = loadElementEntries(projectId);
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

  for (const sticker of official.stickers ?? []) {
    docs.push({
      assetId: `sticker:${sticker.id}`,
      scope: 'official',
      kind: 'image',
      origin: 'sticker',
      label: sticker.label || sticker.categoryLabel,
      ...(validDims(sticker.width, sticker.height) ? { dimensions: validDims(sticker.width, sticker.height) } : {}),
      fields: {
        category: `${sticker.categoryLabel} ${sticker.categoryLabelEn}`,
        tags: officialStickerSearchTags(sticker.label || sticker.categoryLabel, sticker.tags),
        source: sticker.source,
        license: sticker.license,
      },
      availability: 'ready',
      locator: { url: imageThumb(sticker.key, 'original'), thumbUrl: imageThumb(sticker.key, 'strip') },
    });
  }
  for (const bgm of official.bgm ?? []) {
    docs.push({
      assetId: `bgm:${bgm.id}`,
      scope: 'official',
      kind: 'audio',
      origin: 'bgm',
      label: bgm.label,
      ...(bgm.durationSec ? { durationSec: bgm.durationSec } : {}),
      fields: {
        category: `${bgm.categoryLabel} ${bgm.categoryLabelEn}`,
        tags: bgmSearchTags(bgm.narrationFit, bgm.moods, bgm.useCases),
        artist: bgm.artist,
        moods: bgm.moods,
        useCases: bgm.useCases,
        description: `energy:${bgm.energy} narration:${bgm.narrationFit}`,
        source: bgm.source,
        license: bgm.license,
      },
      availability: 'ready',
      locator: { url: bgm.url, thumbUrl: imageThumb(bgm.coverKey, 'strip') },
    });
  }

  for (const component of Object.keys(kitComponents)) {
    docs.push({
      assetId: `kit:${component}`,
      scope: 'official',
      kind: 'element',
      origin: 'kit',
      label: t(`engine.kit.${component}`),
      fields: { tags: ['kit', 'component', '组件'] },
      availability: 'ready',
      locator: { component },
    });
  }
  const locale = studioLocale();
  for (const template of ELEMENT_TEMPLATES) {
    const prompt = localizedTemplatePrompt(template, locale);
    docs.push({
      assetId: `template:${template.id}`,
      scope: 'official',
      kind: 'element',
      origin: 'template',
      label: template.title ? t(template.title) : template.id,
      fields: { category: template.category, prompt },
      availability: 'ready',
      locator: { templateId: template.id, prompt },
    });
  }
  return docs;
}
