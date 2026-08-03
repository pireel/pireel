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
import { ChevronDown, Loader2, Music, Pause, Play, Plus, Search } from 'lucide-react';
import { imageThumb } from '@pireel/ui/image-url';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@pireel/ui/dropdown-menu';
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
import { studioLocale, t } from './i18n';

interface OfficialCategory {
  id: string;
  label: string;
  labelEn: string;
  count: number;
}

interface OfficialSticker {
  id: string;
  /** Bare storage key — display always goes through imageThumb. */
  key: string;
  label?: string;
  category: string;
  categoryLabel: string;
  categoryLabelEn: string;
  source: string;
  license: string;
  format: 'png' | 'svg';
  tags?: string[];
  width?: number;
  height?: number;
}
interface OfficialBgm {
  id: string;
  url: string;
  coverKey: string;
  label: string;
  artist: string;
  category: string;
  categoryLabel: string;
  categoryLabelEn: string;
  moods: string[];
  useCases: string[];
  energy: string;
  narrationFit: string;
  loopHint: boolean;
  source: string;
  license: string;
  durationSec?: number;
}

interface OfficialAssetsResponse {
  stickers?: OfficialSticker[];
  bgm?: OfficialBgm[];
  stickerCategories?: OfficialCategory[];
  bgmCategories?: OfficialCategory[];
  summary?: { deferredAnimatedStickers?: number };
}

type OfficialSection = 'components' | 'stickers' | 'audio';

function CategorySelect({ value, categories, onChange }: { value: string; categories: OfficialCategory[]; onChange: (value: string) => void }) {
  const english = !studioLocale().toLowerCase().startsWith('zh');
  const selected = categories.find((category) => category.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="border-line text-ink-3 hover:text-ink inline-flex h-5 max-w-[132px] items-center gap-1 rounded border px-1.5 text-[9.5px]">
          <span className="truncate">{selected ? (english ? selected.labelEn : selected.label) : t('panels.all')}</span>
          <ChevronDown size={9} className="shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="max-h-[360px] min-w-[180px] overflow-auto">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          <DropdownMenuRadioItem value="all">{t('panels.all')}</DropdownMenuRadioItem>
          {categories.map((category) => (
            <DropdownMenuRadioItem key={category.id} value={category.id}>
              {english ? category.labelEn : category.label}
              <span className="text-ink-4 ml-auto pl-3 text-[10px]">{category.count}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
  const [catalog, setCatalog] = useState<OfficialAssetsResponse | null>(null);
  const [activeSection, setActiveSection] = useState<OfficialSection>('components');
  const [query, setQuery] = useState('');
  const [stickerCategory, setStickerCategory] = useState('all');
  const [bgmCategory, setBgmCategory] = useState('all');
  const [stickerLimit, setStickerLimit] = useState(80);
  const [bgmLimit, setBgmLimit] = useState(40);
  useEffect(() => {
    let gone = false;
    fetch('/api/studio/official-assets')
      .then((r) => (r.ok ? (r.json() as Promise<OfficialAssetsResponse>) : null))
      .then((j) => {
        if (gone) return;
        setCatalog(j ?? {});
      })
      .catch(() => {
        if (gone) return;
        setCatalog({});
      });
    return () => {
      gone = true;
    };
  }, []);

  const stickers = catalog === null ? null : (catalog.stickers ?? []);
  const bgm = catalog === null ? null : (catalog.bgm ?? []);
  const stickerCategories = catalog?.stickerCategories ?? [];
  const bgmCategories = catalog?.bgmCategories ?? [];

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

  const needle = query.trim().toLocaleLowerCase();
  const includesQuery = (values: (string | undefined)[]) => !needle || values.some((value) => value?.toLocaleLowerCase().includes(needle));
  const visibleKitItems = kitItems.filter((item) => includesQuery([item.label]));
  const filteredStickers = (stickers ?? []).filter(
    (item) =>
      (stickerCategory === 'all' || item.category === stickerCategory) &&
      includesQuery([item.label, item.categoryLabel, item.categoryLabelEn, item.source, item.license, ...(item.tags ?? [])]),
  );
  const filteredBgm = (bgm ?? []).filter(
    (item) =>
      (bgmCategory === 'all' || item.category === bgmCategory) &&
      includesQuery([
        item.label,
        item.artist,
        item.categoryLabel,
        item.categoryLabelEn,
        item.source,
        item.license,
        item.energy,
        item.narrationFit,
        ...item.moods,
        ...item.useCases,
      ]),
  );

  useEffect(() => setStickerLimit(80), [query, stickerCategory]);
  useEffect(() => setBgmLimit(40), [query, bgmCategory]);

  const stickerItems = useMemo(
    () =>
      filteredStickers.slice(0, stickerLimit).map(
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
    [filteredStickers, stickerLimit],
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

  const section = (title: string, count: number | null, body: React.ReactNode, action?: React.ReactNode) => (
    <section>
      <div className="text-ink-2 mb-1.5 flex items-center text-[12px] font-medium">
        {title}
        {count != null && <span className="text-ink-4 ml-1 font-normal">{count}</span>}
        {action && <span className="ml-auto">{action}</span>}
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
  const noMatches = (
    <div className="text-ink-4 border-line rounded-md border border-dashed px-3 py-4 text-center text-[10.5px]">
      {t('panels.noMatchingAssetsTry')}
    </div>
  );
  const searchPlaceholder =
    activeSection === 'components'
      ? t('panels.searchOfficialComponents')
      : activeSection === 'stickers'
        ? t('panels.searchOfficialStickers')
        : t('panels.searchOfficialAudio');

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="border-line flex border-b px-2.5 pt-1.5" role="tablist" aria-label={t('panels.officialAssets')}>
        {(
          [
            { value: 'components', label: 'panels.officialComponents' },
            { value: 'stickers', label: 'panels.stickers' },
            { value: 'audio', label: 'panels.music' },
          ] as { value: OfficialSection; label: string }[]
        ).map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={activeSection === item.value}
            onClick={() => setActiveSection(item.value)}
            className={`-mb-px flex-1 border-b-2 px-2 py-1.5 text-[11px] transition active:translate-y-px ${
              activeSection === item.value
                ? 'border-accent text-ink font-medium'
                : 'text-ink-4 hover:text-ink-2 border-transparent'
            }`}
          >
            {t(item.label)}
          </button>
        ))}
      </div>
      <div className="border-line border-b px-2.5 py-1.5">
        <label className="border-line bg-panel-2 focus-within:border-accent relative block min-w-0 rounded-md border transition">
          <Search size={11} className="text-ink-4 pointer-events-none absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="text-ink placeholder:text-ink-4 h-[24px] w-full bg-transparent pl-6 pr-2 text-[11px] outline-none"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {activeSection === 'components' && section(
          t('panels.kitComponents'),
          visibleKitItems.length,
          visibleKitItems.length === 0 ? noMatches : (
            <div className="grid grid-cols-[repeat(auto-fill,120px)] gap-2.5">
              {visibleKitItems.map((it) => (
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
        {activeSection === 'stickers' && section(
          t('panels.stickers'),
          stickers == null ? null : filteredStickers.length,
          stickers == null ? loadingBox : stickers.length === 0 ? preparing : stickerItems.length === 0 ? noMatches : (
            <>
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
              {stickerItems.length < filteredStickers.length && (
                <button
                  type="button"
                  onClick={() => setStickerLimit((value) => value + 80)}
                  className="border-line text-ink-3 hover:text-ink mt-2 w-full rounded-md border py-1.5 text-[10.5px]"
                >
                  {t('panels.showMoreAssets', { n: Math.min(80, filteredStickers.length - stickerItems.length) })}
                </button>
              )}
            </>
          ),
          stickerCategories.length ? <CategorySelect value={stickerCategory} categories={stickerCategories} onChange={setStickerCategory} /> : null,
        )}
        {activeSection === 'audio' && section(
          t('panels.music'),
          bgm == null ? null : filteredBgm.length,
          bgm == null ? loadingBox : bgm.length === 0 ? preparing : filteredBgm.length === 0 ? noMatches : (
            <>
              <div className="border-line divide-line divide-y overflow-hidden rounded-md border">
                {filteredBgm.slice(0, bgmLimit).map((b) => {
                  const playing = playingUrl === b.url;
                  const item: LibraryItem = {
                    id: `bgm:${b.id}`,
                    kind: 'audio',
                    origin: 'preset',
                    insertUrl: b.url,
                    thumbSrc: b.coverKey,
                    label: b.label,
                    createdAt: 0,
                    deletable: false,
                  };
                  return (
                    <div key={b.id} className="hover:bg-panel-2 group flex w-full items-center gap-2 px-2 py-1.5 transition">
                      <button
                        type="button"
                        title={b.label}
                        aria-label={playing ? t('panels.pauseAudio') : t('panels.playAudio')}
                        onClick={() => toggle(b.url)}
                        {...dragPropsFor(item, onDragAsset)}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                      >
                        <span className="bg-panel-2 relative size-9 shrink-0 overflow-hidden rounded-md">
                          <img src={imageThumb(b.coverKey, 'thumb')} alt="" className="size-full object-cover" loading="lazy" />
                          <span className={`absolute inset-0 flex items-center justify-center ${playing ? 'bg-accent/75 text-white' : 'bg-black/20 text-white'}`}>
                            {playing ? <Pause size={12} /> : <Play size={12} />}
                          </span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-ink truncate text-[11px]">{b.label}</div>
                          <div className="text-ink-4 flex min-w-0 items-center gap-1 text-[9.5px]">
                            <Music size={9} className="shrink-0" />
                            <span className="truncate">{!studioLocale().toLowerCase().startsWith('zh') ? b.categoryLabelEn : b.categoryLabel}</span>
                            <span>·</span>
                            <span className="shrink-0">{b.durationSec ? fmtDur(b.durationSec) : t('panels.music')}</span>
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
              {bgmLimit < filteredBgm.length && (
                <button
                  type="button"
                  onClick={() => setBgmLimit((value) => value + 40)}
                  className="border-line text-ink-3 hover:text-ink mt-2 w-full rounded-md border py-1.5 text-[10.5px]"
                >
                  {t('panels.showMoreAssets', { n: Math.min(40, filteredBgm.length - bgmLimit) })}
                </button>
              )}
            </>
          ),
          bgmCategories.length ? <CategorySelect value={bgmCategory} categories={bgmCategories} onChange={setBgmCategory} /> : null,
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
