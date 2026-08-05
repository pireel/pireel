'use client';

/**
 * Official assets — curated content shared by every account, in three sections:
 *  - Components: the kit library plus the same reusable presets that seed component Remix.
 *  - Stickers: transparent images from the official manifest (bare keys via imageThumb).
 *  - BGM: licensed music beds from the manifest, rendered as rows (audio has no picture;
 *    a row carries play/duration/use-as-BGM better than a card).
 * Stickers/BGM come from /api/studio/official-assets; when the route is absent (the
 * zero-backend OSS shell) or empty, those sections show a "coming soon" note. Kit
 * components need no network and are always there.
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Loader2, Music, Pause, Play, Plus, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import { imageThumb } from '@pireel/ui/image-url';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pireel/ui/dropdown-menu';
import type { Composition, MediaRef } from '@pireel/studio-engine/composition';
import { getTheme, themeVarsCss } from '@pireel/studio-engine/theme';
import { kitComponents, kitElement } from '@pireel/studio-engine/kit-templates';
import { kitSampleProps } from './kit-ui';
import { ELEMENT_TEMPLATES } from './gen-templates';
import type { GenElementResult } from './element-history';
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
import { officialComponentTemplateItem } from './official-component-templates';
import type { OfficialAssetsResponse, OfficialBgm, OfficialCategory, OfficialSticker } from './official-assets-types';

type OfficialCategorySection = 'stickers' | 'audio';
type OfficialSection = 'all' | 'components' | OfficialCategorySection;
type OfficialDetail = { section: OfficialCategorySection; categoryId: string; label: string };
type OfficialGenerationType = 'image' | 'video' | 'element' | 'audio';

const GROUP_GRID_PREVIEW = 8;
const GROUP_GRID_TWO_ROWS_PX = 196;
const HIDDEN_STICKER_CATEGORY_IDS = new Set(['03_decorative-symbols/01_kenney-emotes']);
const FILTER_ITEM_CLASS = 'pl-2 text-[10.5px] data-[state=checked]:bg-panel-2 data-[state=checked]:text-ink [&>span:first-child]:hidden';

export function OfficialAssetsPanel({
  comp,
  onInsert,
  onInsertKit,
  onInsertElement,
  onDragAsset,
  onOpenGeneration,
  onUseAudio,
}: {
  /** Lightbox live preview needs a canvas; kit previews always use the static 16:9 one. */
  comp: Composition;
  onInsert: (asset: MediaRef, label?: string, dims?: { w: number; h: number }) => void;
  /** Insert a kit component as a props-driven block; props override the sample defaults. */
  onInsertKit?: (component: string, props?: Record<string, unknown>) => void;
  /** Insert a bundled component template directly into the current project. */
  onInsertElement: (element: GenElementResult, prompt: string) => void;
  onDragAsset?: (asset: PanelDragAsset | null) => void;
  /** Open generation, optionally seeding a Remix template into its composer. */
  onOpenGeneration?: (type?: OfficialGenerationType, prompt?: string) => void;
  onUseAudio?: (url: string, label?: string) => void;
}) {
  // null = still loading (route fetch in flight); [] = loaded and empty → "coming soon"
  const [catalog, setCatalog] = useState<OfficialAssetsResponse | null>(null);
  const [activeSection, setActiveSection] = useState<OfficialSection>('all');
  const [detail, setDetail] = useState<OfficialDetail | null>(null);
  const [query, setQuery] = useState('');
  const [stickerLimit, setStickerLimit] = useState(80);
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

  const stickers = catalog === null ? null : (catalog.stickers ?? []).filter((item) => !HIDDEN_STICKER_CATEGORY_IDS.has(item.category));
  const bgm = catalog === null ? null : (catalog.bgm ?? []);
  const stickerCategories = (catalog?.stickerCategories ?? []).filter((category) => !HIDDEN_STICKER_CATEGORY_IDS.has(category.id));
  const bgmCategories = catalog?.bgmCategories ?? [];
  const locale = studioLocale();

  // Kit components: same overlay structure × the general theme's skin — theme tokens are baked
  // into innerHtml at block scope (data-hf-baked), so preview/insert/theme-swap all look identical.
  const kitItems = useMemo(() => {
    void locale; // t() reads the injected locale; keep the memo synchronized when it changes.
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
  }, [locale]);
  const componentTemplateItems = useMemo(
    () =>
      ELEMENT_TEMPLATES.map((template) => officialComponentTemplateItem(template, locale)).filter(
        (item): item is LibraryItem => item !== null,
      ),
    [locale],
  );

  const needle = query.trim().toLocaleLowerCase();
  const includesQuery = (values: (string | undefined)[]) => !needle || values.some((value) => value?.toLocaleLowerCase().includes(needle));
  const visibleComponentItems = [...kitItems, ...componentTemplateItems].filter((item) =>
    includesQuery([item.label, item.prompt, item.category]),
  );
  const filteredStickers = (stickers ?? []).filter((item) =>
    includesQuery([item.label, item.categoryLabel, item.categoryLabelEn, item.source, item.license, ...(item.tags ?? [])]),
  );
  const filteredBgm = (bgm ?? []).filter((item) =>
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
  const stickerGroups = stickerCategories
    .map((category) => ({ category, items: filteredStickers.filter((item) => item.category === category.id) }))
    .filter((group) => group.items.length > 0);
  const bgmGroups = bgmCategories
    .map((category) => ({ category, items: filteredBgm.filter((item) => item.category === category.id) }))
    .filter((group) => group.items.length > 0);
  const detailStickers =
    detail?.section === 'stickers' && detail.categoryId
      ? filteredStickers.filter((item) => item.category === detail.categoryId)
      : [];
  const detailBgm =
    detail?.section === 'audio' && detail.categoryId
      ? filteredBgm.filter((item) => item.category === detail.categoryId)
      : [];

  useEffect(() => setStickerLimit(80), [query, detail?.categoryId]);

  const toStickerItem = (s: OfficialSticker): LibraryItem => ({
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
  });

  const { playingUrl, toggle } = useAudioPreview();
  const [preview, setPreview] = useState<LibraryItem | null>(null);

  const insertOf = (it: LibraryItem, kitProps?: Record<string, unknown>) => {
    if (it.kit) {
      onInsertKit?.(it.kit, kitProps);
      return;
    }
    if (it.element) {
      onInsertElement(it.element, it.prompt ?? it.label);
      return;
    }
    if (it.insertUrl) onInsert({ type: 'image', url: it.insertUrl }, it.label, dimsOf(it));
  };

  const english = !locale.toLowerCase().startsWith('zh');
  const categoryTitle = (category: OfficialCategory) => (english ? category.labelEn : category.label);
  const openDetail = (section: OfficialCategorySection, label: string, categoryId: string) => {
    setActiveSection(section);
    setDetail({ section, label, categoryId });
  };
  const showOverview = (section: OfficialSection) => {
    setActiveSection(section);
    setDetail(null);
  };
  const filterValue = detail ? `${detail.section}:${detail.categoryId}` : activeSection;
  const pickFilter = (value: string) => {
    if (value === 'all' || value === 'components' || value === 'stickers' || value === 'audio') {
      showOverview(value);
      return;
    }
    const separator = value.indexOf(':');
    if (separator < 1) return;
    const section = value.slice(0, separator) as OfficialCategorySection;
    const categoryId = value.slice(separator + 1);
    const category = (section === 'stickers' ? stickerCategories : bgmCategories).find((item) => item.id === categoryId);
    if (category) openDetail(section, categoryTitle(category), category.id);
  };

  const section = (title: string, count: number | null, body: React.ReactNode, onMore?: () => void, key?: string) => (
    <section key={key} className="mb-4 last:mb-0">
      <div className="text-ink-2 mb-1.5 flex min-h-5 items-center text-[12px] font-medium">
        <span className="truncate">{title}</span>
        {count != null && <span className="text-ink-4 ml-1 shrink-0 font-normal">{count}</span>}
        {onMore && (
          <button
            type="button"
            onClick={onMore}
            className="text-ink-4 hover:text-ink ml-auto inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-normal transition active:translate-y-px"
          >
            {t('panels.more')} <ChevronRight size={10} />
          </button>
        )}
      </div>
      {body}
    </section>
  );

  const kitGrid = (items: LibraryItem[], previewOnly = false) => {
    const shown = previewOnly ? items.slice(0, GROUP_GRID_PREVIEW) : items;
    return (
      <div className={previewOnly ? 'overflow-hidden' : undefined} style={previewOnly ? { maxHeight: GROUP_GRID_TWO_ROWS_PX } : undefined}>
        <div className="grid grid-cols-[repeat(auto-fill,120px)] gap-2.5">
          {shown.map((it) => (
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
      </div>
    );
  };

  const stickerGrid = (rows: OfficialSticker[], previewOnly = false) => {
    const items = (previewOnly ? rows.slice(0, GROUP_GRID_PREVIEW) : rows).map(toStickerItem);
    return kitGrid(items, previewOnly);
  };

  const audioRows = (rows: OfficialBgm[], previewOnly = false) => (
    <div className="divide-line divide-y">
      {(previewOnly ? rows.slice(0, 2) : rows).map((b) => {
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
                  <span className="truncate">{english ? b.categoryLabelEn : b.categoryLabel}</span>
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
  const componentsOverview = visibleComponentItems.length === 0 ? noMatches : kitGrid(visibleComponentItems);
  const stickersOverview =
    stickers == null
      ? loadingBox
      : stickers.length === 0
        ? preparing
        : stickerGroups.length === 0
          ? noMatches
          : stickerGroups.map(({ category, items }) =>
              section(
                categoryTitle(category),
                items.length,
                stickerGrid(items, true),
                items.length > 4 ? () => openDetail('stickers', categoryTitle(category), category.id) : undefined,
                category.id,
              ),
            );
  const audioOverview =
    bgm == null
      ? loadingBox
      : bgm.length === 0
        ? preparing
        : bgmGroups.length === 0
          ? noMatches
          : bgmGroups.map(({ category, items }) =>
              section(
                categoryTitle(category),
                items.length,
                audioRows(items, true),
                items.length > 2 ? () => openDetail('audio', categoryTitle(category), category.id) : undefined,
                category.id,
              ),
            );
  const searchPlaceholder =
    activeSection === 'all'
      ? t('panels.searchOfficialAssets')
      : activeSection === 'components'
        ? t('panels.searchOfficialComponents')
        : activeSection === 'stickers'
          ? t('panels.searchOfficialStickers')
          : t('panels.searchOfficialAudio');
  const detailCount =
    detail?.section === 'stickers'
      ? detailStickers.length
      : detail?.section === 'audio'
        ? detailBgm.length
        : null;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="border-line flex items-center gap-1.5 border-b px-2.5 py-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={t('panels.filterOfficialAssets')}
              aria-label={t('panels.filterOfficialAssets')}
              className={`border-line hover:text-ink inline-flex size-[26px] shrink-0 items-center justify-center rounded-md border transition active:translate-y-px ${
                activeSection === 'all' && !detail ? 'text-ink-4' : 'bg-panel-2 text-ink'
              }`}
            >
              <SlidersHorizontal size={12} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={5} className="max-h-[420px] min-w-[220px] overflow-auto">
            <DropdownMenuRadioGroup value={filterValue} onValueChange={pickFilter}>
              {(
                [
                  ['all', t('panels.all')],
                  ['components', t('panels.officialComponents')],
                  ['stickers', t('panels.stickers')],
                  ['audio', t('panels.music')],
                ] as const
              ).map(([value, label]) => (
                <DropdownMenuRadioItem key={value} value={value} className={FILTER_ITEM_CLASS}>
                  <span className="truncate">{label}</span>
                  {filterValue === value && <Check size={10} className="ml-auto shrink-0" />}
                </DropdownMenuRadioItem>
              ))}
              {activeSection === 'stickers' && stickerCategories.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  {stickerCategories.map((category) => (
                    <DropdownMenuRadioItem key={category.id} value={`stickers:${category.id}`} className={FILTER_ITEM_CLASS}>
                      <span className="truncate">{categoryTitle(category)}</span>
                      {filterValue === `stickers:${category.id}` && <Check size={10} className="ml-auto shrink-0" />}
                    </DropdownMenuRadioItem>
                  ))}
                </>
              )}
              {activeSection === 'audio' && bgmCategories.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  {bgmCategories.map((category) => (
                    <DropdownMenuRadioItem key={category.id} value={`audio:${category.id}`} className={FILTER_ITEM_CLASS}>
                      <span className="truncate">{categoryTitle(category)}</span>
                      {filterValue === `audio:${category.id}` && <Check size={10} className="ml-auto shrink-0" />}
                    </DropdownMenuRadioItem>
                  ))}
                </>
              )}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <label className="border-line bg-panel-2 focus-within:border-accent relative block min-w-0 flex-1 rounded-md border transition">
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
        {onOpenGeneration && (
          <button
            type="button"
            onClick={() => onOpenGeneration('image')}
            title={t('workbench.aiGenerate')}
            aria-label={t('workbench.aiGenerate')}
            className="border-line text-ink-2 hover:text-ink inline-flex h-[26px] shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] transition"
          >
            <Sparkles size={11} /> {t('workbench.aiGenerate')}
          </button>
        )}
      </div>
      <div className={`min-h-0 flex-1 overflow-auto px-2 pb-2 ${detail ? '' : 'pt-2'}`}>
        {detail && (
          <div className="border-line bg-panel sticky top-0 z-10 -mx-2 mb-2 flex min-h-9 items-center gap-1.5 border-b px-2 py-1.5">
            <button
              type="button"
              onClick={() => setDetail(null)}
              className="text-ink-3 hover:text-ink inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10.5px] transition active:translate-y-px"
            >
              <ChevronLeft size={11} /> {t('panels.backList')}
            </button>
            <span className="bg-line h-3 w-px shrink-0" />
            <span className="text-ink-2 min-w-0 truncate text-[11.5px] font-medium">{detail.label}</span>
            {detailCount != null && <span className="text-ink-4 shrink-0 text-[10px]">{detailCount}</span>}
          </div>
        )}

        {activeSection === 'all' && (
          <>
            {section(t('panels.officialComponents'), null, componentsOverview, undefined, 'all-components')}
            {section(t('panels.stickers'), null, stickersOverview, undefined, 'all-stickers')}
            {section(t('panels.music'), null, audioOverview, undefined, 'all-audio')}
          </>
        )}

        {activeSection === 'components' && componentsOverview}

        {activeSection === 'stickers' &&
          (stickers == null
            ? loadingBox
            : stickers.length === 0
              ? preparing
              : detail?.section === 'stickers'
                ? detailStickers.length === 0
                  ? noMatches
                  : (
                    <>
                      {stickerGrid(detailStickers.slice(0, stickerLimit))}
                      {stickerLimit < detailStickers.length && (
                        <button
                          type="button"
                          onClick={() => setStickerLimit((value) => value + 80)}
                          className="border-line text-ink-3 hover:text-ink mt-2 w-full rounded-md border py-1.5 text-[10.5px]"
                        >
                          {t('panels.showMoreAssets', { n: Math.min(80, detailStickers.length - stickerLimit) })}
                        </button>
                      )}
                    </>
                  )
                : stickersOverview)}

        {activeSection === 'audio' &&
          (bgm == null
            ? loadingBox
            : bgm.length === 0
              ? preparing
              : detail?.section === 'audio'
                ? detailBgm.length === 0 ? noMatches : audioRows(detailBgm)
                : audioOverview)}
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
