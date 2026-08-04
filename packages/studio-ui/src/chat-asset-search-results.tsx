'use client';

/** Compact visual results for the search_assets receipt. Search metadata is untrusted: media uses
 * browser-native previews, while components resolve only through the audited local kit/template
 * catalogs. Supplied metadata is never rendered as HTML. */

import { useState } from 'react';
import { FileQuestion, ImageIcon, Music2, Shapes, Video } from 'lucide-react';
import type { StudioToolResult } from '@pireel/studio-engine/prompts';
import { getTheme, themeVarsCss } from '@pireel/studio-engine/theme';
import { kitComponents, kitElement } from '@pireel/studio-engine/kit-templates';
import { AudioTile, ElementTile, TileThumb, type LibraryItem, useAudioPreview } from './asset-card';
import { ELEMENT_TEMPLATES } from './gen-templates';
import { ElementTemplatePreview } from './gen-templates/element-card';
import { kitSampleProps } from './kit-ui';
import { t } from './i18n';

type AssetKind = 'image' | 'video' | 'audio' | 'element';
type AssetScope = 'mine' | 'cloud' | 'official';

export interface AssetSearchCardItem {
  assetId: string;
  label: string;
  kind: AssetKind;
  scope: AssetScope;
  origin?: string;
  locator?: { url?: string; thumbUrl?: string; component?: string; templateId?: string; elementId?: string };
}

const kinds = new Set<AssetKind>(['image', 'video', 'audio', 'element']);
const scopes = new Set<AssetScope>(['mine', 'cloud', 'official']);

/** Parse only the display-safe subset of a search receipt. Exported for cheap shape tests. */
export function assetSearchCardItems(output: unknown): AssetSearchCardItem[] {
  const data = (output as StudioToolResult | undefined)?.data as { results?: unknown } | undefined;
  if (!Array.isArray(data?.results)) return [];
  return data.results.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string, unknown>;
    if (typeof row.assetId !== 'string' || typeof row.label !== 'string' || !kinds.has(row.kind as AssetKind) || !scopes.has(row.scope as AssetScope)) return [];
    const rawLocator = row.locator && typeof row.locator === 'object' ? (row.locator as Record<string, unknown>) : null;
    const locator = rawLocator
      ? {
          ...(typeof rawLocator.url === 'string' ? { url: rawLocator.url } : {}),
          ...(typeof rawLocator.thumbUrl === 'string' ? { thumbUrl: rawLocator.thumbUrl } : {}),
          ...(typeof rawLocator.component === 'string' ? { component: rawLocator.component } : {}),
          ...(typeof rawLocator.templateId === 'string' ? { templateId: rawLocator.templateId } : {}),
          ...(typeof rawLocator.elementId === 'string' ? { elementId: rawLocator.elementId } : {}),
        }
      : undefined;
    return [{
      assetId: row.assetId,
      label: row.label,
      kind: row.kind as AssetKind,
      scope: row.scope as AssetScope,
      ...(typeof row.origin === 'string' ? { origin: row.origin } : {}),
      ...(locator && Object.keys(locator).length ? { locator } : {}),
    }];
  });
}

function KindIcon({ kind, size = 18 }: { kind: AssetKind; size?: number }) {
  if (kind === 'image') return <ImageIcon size={size} />;
  if (kind === 'video') return <Video size={size} />;
  if (kind === 'audio') return <Music2 size={size} />;
  if (kind === 'element') return <Shapes size={size} />;
  return <FileQuestion size={size} />;
}

function FallbackPreview({ kind }: { kind: AssetKind }) {
  return (
    <div className="text-ink-4 grid aspect-video w-full place-items-center bg-gradient-to-br from-accent/10 to-panel">
      <KindIcon kind={kind} size={22} />
    </div>
  );
}

function ImagePreview({ item }: { item: AssetSearchCardItem }) {
  const [failed, setFailed] = useState(false);
  const preview = item.locator?.thumbUrl || item.locator?.url;
  if (preview && !failed) {
    return (
      <img
        src={preview}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="aspect-video w-full object-contain"
      />
    );
  }
  return <FallbackPreview kind="image" />;
}

function mediaLibraryItem(item: AssetSearchCardItem): LibraryItem {
  return {
    id: item.assetId,
    kind: item.kind,
    origin: item.scope === 'official' ? 'preset' : 'upload',
    insertUrl: item.locator?.url,
    thumbSrc: item.locator?.thumbUrl ?? null,
    label: item.label,
    createdAt: 0,
    deletable: false,
  };
}

function kitLibraryItem(item: AssetSearchCardItem): LibraryItem | null {
  const component = item.locator?.component;
  if (!component || !Object.prototype.hasOwnProperty.call(kitComponents, component)) return null;
  const seedId = `chatkit_${item.assetId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const rendered = kitElement(component, seedId, kitSampleProps(component), { w: 1920, h: 1080 });
  const vars = themeVarsCss(getTheme('general'));
  return {
    id: item.assetId,
    kind: 'element',
    origin: 'preset',
    label: item.label,
    prompt: item.label,
    createdAt: 0,
    deletable: false,
    kit: component,
    element: {
      seedId,
      innerHtml: `${rendered.innerHtml}\n<style data-hf-baked>#${seedId}{${vars}}</style>`,
      timelineBody: rendered.timelineBody,
      label: item.label,
      designW: 1920,
      designH: 1080,
    },
  };
}

function ElementPreview({ item }: { item: AssetSearchCardItem }) {
  const templateId = item.locator?.templateId;
  if (templateId && ELEMENT_TEMPLATES.some((template) => template.id === templateId)) {
    return <ElementTemplatePreview id={templateId} />;
  }
  const kit = kitLibraryItem(item);
  if (kit) return <ElementTile item={kit} />;
  return <FallbackPreview kind="element" />;
}

function AssetPreview({ item, playing, onToggleAudio }: { item: AssetSearchCardItem; playing: boolean; onToggleAudio: (url: string) => void }) {
  if (item.kind === 'image') return <ImagePreview item={item} />;
  if (item.kind === 'video') {
    if (!item.locator?.url) return <FallbackPreview kind="video" />;
    return <TileThumb item={mediaLibraryItem(item)} />;
  }
  if (item.kind === 'audio') {
    const url = item.locator?.url;
    if (!url) return <FallbackPreview kind="audio" />;
    return (
      <button
        type="button"
        title={item.label}
        aria-label={playing ? t('panels.pauseAudio') : t('panels.playAudio')}
        onClick={() => onToggleAudio(url)}
        className="block w-full"
      >
        <AudioTile playing={playing} url={url} coverSrc={item.locator?.thumbUrl} />
      </button>
    );
  }
  return <ElementPreview item={item} />;
}

export function AssetSearchResultsBody({ output }: { output: unknown }) {
  const items = assetSearchCardItems(output);
  const { playingUrl, toggle } = useAudioPreview();
  if (!items.length) return null;
  return (
    <div className="border-line/70 max-h-64 overflow-y-auto border-t p-2">
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((item) => (
          <div key={item.assetId} className="border-line/70 bg-panel min-w-0 overflow-hidden rounded border">
            <div className="bg-panel-2 w-full overflow-hidden">
              <AssetPreview item={item} playing={item.kind === 'audio' && playingUrl === item.locator?.url} onToggleAudio={toggle} />
            </div>
            <div className="border-line/60 border-t px-1.5 py-1.5">
              <div title={item.label} className="text-ink-2 truncate text-[11px] font-medium">{item.label}</div>
              <div className="text-ink-4 mt-0.5 flex min-w-0 items-center gap-1 text-[10px]">
                <KindIcon kind={item.kind} size={10} />
                <span className="truncate">{t(`chatGen.assetScope.${item.scope}`)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
