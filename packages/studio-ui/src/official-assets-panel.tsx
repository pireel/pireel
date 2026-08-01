'use client';

/**
 * Official assets — curated content shared by every account, in three sections:
 *  - Components: the kit library (props-driven overlay blocks baked into the engine).
 *  - Stickers: transparent images from the official manifest (bare keys via imageThumb).
 *  - BGM: licensed music beds from the manifest, rendered as rows (audio has no picture;
 *    a row carries play/duration/use-as-BGM better than a card).
 * Stickers/BGM come from /api/studio/official-assets; when the route is absent (the
 * zero-backend OSS shell) or empty, those sections show a "coming soon" note. Kit
 * components need no network and are always there.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Music, Pause, Play, Plus } from 'lucide-react';
import { imageThumb } from '@pireel/ui/image-url';
import type { Composition, MediaRef } from '@pireel/studio-engine/composition';
import { getTheme, themeVarsCss } from '@pireel/studio-engine/theme';
import { kitComponents, kitElement } from '@pireel/studio-engine/kit-templates';
import { kitSampleProps } from './kit-ui';
import {
  AssetCard,
  AssetLightbox,
  type LibraryItem,
  type PanelDragAsset,
  dimsOf,
  dragPropsFor,
  fmtDur,
  useAudioPreview,
} from './asset-card';
import { t } from './i18n';

interface OfficialSticker {
  id: string;
  /** Bare storage key — display always goes through imageThumb. */
  key: string;
  label?: string;
  width?: number;
  height?: number;
}
interface OfficialBgm {
  id: string;
  url: string;
  label: string;
  durationSec?: number;
}

export function OfficialAssetsPanel({
  comp,
  onInsert,
  onInsertKit,
  onDragAsset,
  onUseAudio,
}: {
  /** Lightbox live preview needs a canvas; kit previews always use the static 16:9 one. */
  comp: Composition;
  onInsert: (asset: MediaRef, label?: string, dims?: { w: number; h: number }) => void;
  /** Insert a kit component as a props-driven block; props override the sample defaults. */
  onInsertKit?: (component: string, props?: Record<string, unknown>) => void;
  onDragAsset?: (asset: PanelDragAsset | null) => void;
  onUseAudio?: (url: string, label?: string) => void;
}) {
  // null = still loading (route fetch in flight); [] = loaded and empty → "coming soon"
  const [stickers, setStickers] = useState<OfficialSticker[] | null>(null);
  const [bgm, setBgm] = useState<OfficialBgm[] | null>(null);
  useEffect(() => {
    let gone = false;
    fetch('/api/studio/official-assets')
      .then((r) => (r.ok ? (r.json() as Promise<{ stickers?: OfficialSticker[]; bgm?: OfficialBgm[] }>) : null))
      .then((j) => {
        if (gone) return;
        setStickers(j?.stickers ?? []);
        setBgm(j?.bgm ?? []);
      })
      .catch(() => {
        if (gone) return;
        setStickers([]);
        setBgm([]);
      });
    return () => {
      gone = true;
    };
  }, []);

  // Kit components: same overlay structure × the general theme's skin — theme tokens are baked
  // into innerHtml at block scope (data-hf-baked), so preview/insert/theme-swap all look identical.
  const kitItems = useMemo(() => {
    const vars = themeVarsCss(getTheme('general'));
    return Object.keys(kitComponents).map((cid): LibraryItem => {
      const seedId = `kitprev_${cid.replace(/[^a-zA-Z0-9_-]/g, '')}`;
      const r = kitElement(cid, seedId, kitSampleProps(cid), { w: 1920, h: 1080 });
      const label = t(`engine.kit.${cid}`);
      return {
        id: `kit:${cid}`,
        kind: 'element' as const,
        origin: 'preset' as const,
        category: 'kit',
        label,
        prompt: label,
        createdAt: 0,
        deletable: false,
        kit: cid,
        element: { seedId, innerHtml: `${r.innerHtml}\n<style data-hf-baked>#${seedId}{${vars}}</style>`, timelineBody: r.timelineBody, label, designW: 1920, designH: 1080 },
      };
    });
  }, []);

  const stickerItems = useMemo(
    () =>
      (stickers ?? []).map(
        (s): LibraryItem => ({
          id: `st:${s.id}`,
          kind: 'image',
          origin: 'preset',
          insertUrl: imageThumb(s.key, 'original'),
          thumbSrc: s.key,
          label: s.label ?? t('panels.stickers'),
          createdAt: 0,
          width: s.width,
          height: s.height,
          deletable: false,
        }),
      ),
    [stickers],
  );

  const { playingUrl, toggle } = useAudioPreview();
  const [preview, setPreview] = useState<LibraryItem | null>(null);

  const insertOf = (it: LibraryItem, kitProps?: Record<string, unknown>) => {
    if (it.kit) {
      onInsertKit?.(it.kit, kitProps);
      return;
    }
    if (it.insertUrl) onInsert({ type: 'image', url: it.insertUrl }, it.label, dimsOf(it));
  };

  const section = (title: string, count: number | null, body: React.ReactNode) => (
    <section>
      <div className="text-ink-2 mb-1.5 flex items-center text-[12px] font-medium">
        {title}
        {count != null && <span className="text-ink-4 ml-1 font-normal">{count}</span>}
      </div>
      {body}
    </section>
  );

  const preparing = (
    <div className="text-ink-4 border-line rounded-md border border-dashed px-3 py-4 text-center text-[10.5px]">
      {t('panels.officialPreparing')}
    </div>
  );
  const loadingBox = (
    <div className="text-ink-4 flex items-center justify-center gap-2 py-4 text-[11px]">
      <Loader2 size={12} className="animate-spin" /> {t('panels.loading')}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3.5 overflow-auto p-2">
        {section(
          t('panels.kitComponents'),
          kitItems.length,
          <div className="grid grid-cols-[repeat(auto-fill,120px)] gap-2.5">
            {kitItems.map((it) => (
              <AssetCard
                key={it.id}
                item={it}
                onActivate={() => setPreview(it)}
                onInsert={() => insertOf(it)}
                dragProps={dragPropsFor(it, onDragAsset)}
                insertLabel={t('panels.insert')}
              />
            ))}
          </div>,
        )}
        {section(
          t('panels.stickers'),
          stickerItems.length || null,
          stickers == null ? loadingBox : stickerItems.length === 0 ? preparing : (
            <div className="grid grid-cols-[repeat(auto-fill,120px)] gap-2.5">
              {stickerItems.map((it) => (
                <AssetCard
                  key={it.id}
                  item={it}
                  onActivate={() => setPreview(it)}
                  onInsert={() => insertOf(it)}
                  dragProps={dragPropsFor(it, onDragAsset)}
                  insertLabel={t('panels.insert')}
                />
              ))}
            </div>
          ),
        )}
        {section(
          t('panels.bgm'),
          bgm?.length || null,
          bgm == null ? loadingBox : bgm.length === 0 ? preparing : (
            <div className="border-line divide-line divide-y overflow-hidden rounded-md border">
              {bgm.map((b) => {
                const playing = playingUrl === b.url;
                const item: LibraryItem = { id: `bgm:${b.id}`, kind: 'audio', origin: 'preset', insertUrl: b.url, label: b.label, createdAt: 0, deletable: false };
                return (
                  <div key={b.id} className="hover:bg-panel-2 group flex w-full items-center gap-2 px-2.5 py-1.5 transition">
                    <button
                      type="button"
                      title={b.label}
                      aria-label={playing ? t('panels.pauseAudio') : t('panels.playAudio')}
                      onClick={() => toggle(b.url)}
                      {...dragPropsFor(item, onDragAsset)}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                    >
                      <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${playing ? 'bg-accent text-white' : 'bg-panel-2 text-ink-3'}`}>
                        {playing ? <Pause size={12} /> : <Play size={12} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-ink truncate text-[11px]">{b.label}</div>
                        <div className="text-ink-4 flex items-center gap-1 text-[10px]">
                          <Music size={9} />
                          {b.durationSec ? fmtDur(b.durationSec) : t('panels.bgm')}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      title={t('panels.useAsBgm')}
                      onClick={() => onUseAudio?.(b.url, b.label)}
                      className="bg-accent hidden shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-white group-hover:inline-flex"
                    >
                      <Plus size={9} /> {t('panels.useAsBgm')}
                    </button>
                  </div>
                );
              })}
            </div>
          ),
        )}
      </div>

      {/* Kit previews carry designW/H (1920×1080), so the lightbox renders them at design size regardless of the project canvas */}
      {preview && (
        <AssetLightbox
          item={preview}
          comp={comp}
          onClose={() => setPreview(null)}
          onInsert={(kitProps) => {
            insertOf(preview, kitProps);
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}
