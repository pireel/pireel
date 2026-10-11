'use client';

/**
 * Shared building blocks for the assets library (My / Official scopes): the LibraryItem
 * shape, the responsive grid card with its tiles (image/video/audio/element), the list-row
 * thumb, drag-out payload wiring, the audio inline-preview hook, and the preview lightbox.
 * Panels own their data sources and handlers; everything visual and draggable lives here.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, Image as ImageIcon, Loader2, MoreHorizontal, Pause, Pencil, Play, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { imageThumb } from '@pireel/ui/image-url';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@pireel/ui/dropdown-menu';
import type { Composition, MediaRef } from '@pireel/studio-engine/composition';
import type { GenElementResult } from './element-history';
import { componentPreviewAspect, componentPreviewModel, LibraryComponentPreview } from './component-preview';
import { t } from './i18n';

/** Compact card grid shared by asset and generation libraries.
 * The 88px floor lets the padded generation panel keep three compact columns at its default width. */
export const RESPONSIVE_ASSET_CARD_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(min(88px,100%),1fr))] gap-1.5';

/** Static 16:9 canvas for previews that must not depend on the project comp (presets/kit). */
export const STATIC_ELEMENT_PREVIEW_COMP: Composition = { width: 1920, height: 1080, theme: 'general', video: null, blocks: [], shots: [] };
/** Unified shape for library entries (uploads / generated media / elements / official items all normalize here). */
export interface LibraryItem {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'element';
  origin: 'upload' | 'gen' | 'preset';
  /** Elements only: preset category (data/structure/…); user elements lack this = "Mine". */
  category?: string;
  /** Kit component id — insertion creates a props-driven kit block, not baked HTML. */
  kit?: string;
  /** Full-res direct URL for insert/preview (elements have none). */
  insertUrl?: string;
  /** Thumbnail source (bare key or URL, through imageThumb); null → video uses <video> first frame or placeholder. */
  thumbSrc?: string | null;
  label: string;
  createdAt: number;
  width?: number | null;
  height?: number | null;
  /** Uploads/elements are deletable; generated media history belongs to the gen space, not deleted here. */
  deletable: boolean;
  uploadId?: string;
  /** Elements only: payload for insertion (seedId re-scoping happens on the insert side). */
  element?: GenElementResult;
  prompt?: string;
  /** Local assets only: fileSig — lets the timeline drop path reuse the on-device file (handle/OPFS) zero-copy. */
  sig?: string | null;
  /** Logical project-local identity; unlike sig, distinct imports of identical bytes do not collide. */
  localAssetId?: string | null;
}

/** Drag payload from the panel: image/video = MediaRef + dims; element = the element itself (seedId re-scoped on insert). */
/** Image/video payload from the panel — same shape whether dragged out or click-inserted. */
export type PanelMediaAsset = MediaRef & { label?: string; dims?: { w: number; h: number }; sig?: string | null; localAssetId?: string | null };

export type PanelDragAsset =
  | PanelMediaAsset
  | { type: 'audio'; url: string; label?: string; sig?: string | null; localAssetId?: string | null }
  | { type: 'element'; element: GenElementResult; prompt: string; label?: string };

export const arOf = (it: LibraryItem): number | undefined =>
  it.width && it.height && it.width > 0 && it.height > 0 ? it.width / it.height : undefined;
export const dimsOf = (it: LibraryItem): { w: number; h: number } | undefined =>
  it.width && it.height && it.width > 0 && it.height > 0 ? { w: it.width, h: it.height } : undefined;

export const fmtDur = (s: number) => {
  const v = Math.round(s);
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};

/** Drag-out props for an item (kit components aren't draggable — they insert with props).
 *  The payload goes through onDragAsset; drop semantics live in workbench. */
export function dragPropsFor(it: LibraryItem, onDragAsset?: (asset: PanelDragAsset | null) => void) {
  if (it.kit) return {};
  if (it.kind === 'element') {
    if (!it.element) return {};
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = 'copy';
        onDragAsset?.({ type: 'element', element: it.element!, prompt: it.prompt ?? it.label, label: it.label });
      },
      onDragEnd: () => onDragAsset?.(null),
    };
  }
  if (!it.insertUrl) return {};
  if (it.kind === 'audio') {
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = 'copy';
        onDragAsset?.({ type: 'audio', url: it.insertUrl!, label: it.label, sig: it.sig, localAssetId: it.localAssetId });
      },
      onDragEnd: () => onDragAsset?.(null),
    };
  }
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'copy';
      onDragAsset?.({
        type: it.kind as 'image' | 'video',
        url: it.insertUrl!,
        label: it.label,
        dims: dimsOf(it),
        sig: it.sig,
        localAssetId: it.localAssetId,
      });
    },
    onDragEnd: () => onDragAsset?.(null),
  };
}

/** Audio inline preview: one shared element, click toggles (no lightbox for sound). */
export function useAudioPreview() {
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const toggle = (url: string) => {
    if (!audioElRef.current) {
      audioElRef.current = new Audio();
      audioElRef.current.onended = () => setPlayingUrl(null);
    }
    const a = audioElRef.current;
    if (playingUrl === url) {
      a.pause();
      setPlayingUrl(null);
      return;
    }
    a.src = url;
    a.play().catch(() => {});
    setPlayingUrl(url);
  };
  useEffect(
    () => () => {
      audioElRef.current?.pause();
      audioElRef.current = null;
    },
    [],
  );
  return { playingUrl, toggle };
}

/** Duration chip in the thumb's top-right corner (video/audio). The API stores no duration, so
 *  it arrives from client-side metadata and stays hidden until known. */
export function DurBadge({ sec, menuOffset = false }: { sec: number | null; menuOffset?: boolean }) {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  return (
    <span className={`pointer-events-none absolute top-1 rounded bg-black/55 px-1 py-0.5 text-[9px] tabular-nums text-white ${menuOffset ? 'right-7' : 'right-1'}`}>{fmtDur(sec)}</span>
  );
}

/** Grid thumbnail: uniform 120×68 16:9 slot; non-16:9 media is letterboxed — centered and fully
 *  visible (object-contain), never cropped. Generated video has no extracted frame → <video> metadata first frame fills in. */
export function TileThumb({ item: it, menuOffset = false }: { item: LibraryItem; menuOffset?: boolean }) {
  if (it.kind === 'video') {
    return <VideoTile item={it} menuOffset={menuOffset} />;
  }
  if (it.thumbSrc) {
    return (
      <div className="bg-panel-2 aspect-video w-full overflow-hidden">
        <img src={imageThumb(it.thumbSrc, 'strip')} alt={it.label} className="h-full w-full object-contain" loading="lazy" />
      </div>
    );
  }
  return (
    <div className="bg-panel-2 flex aspect-video items-center justify-center">
      <ImageIcon size={20} className="text-ink-4" />
    </div>
  );
}

/** A media-fragment start makes browsers that otherwise paint nothing for preload="metadata" (Safari)
 *  decode and show the opening frame as the cover. */
function firstFrameUrl(url: string | undefined): string | undefined {
  return url && !url.includes('#') ? `${url}#t=0.001` : url;
}

/** Video tile: poster frame (or metadata first frame) letterboxed in the 16:9 slot + duration badge.
 *  Even when a poster image exists, a metadata-only <video> is the duration source. */
function VideoTile({ item: it, menuOffset = false }: { item: LibraryItem; menuOffset?: boolean }) {
  const [dur, setDur] = useState<number | null>(null);
  return (
    <div className="bg-panel-2 relative aspect-video w-full overflow-hidden">
      {it.thumbSrc ? (
        <img src={imageThumb(it.thumbSrc, 'strip')} alt={it.label} className="h-full w-full object-contain" loading="lazy" />
      ) : null}
      <video
        src={firstFrameUrl(it.insertUrl)}
        preload="metadata"
        muted
        playsInline
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        className={it.thumbSrc ? 'hidden' : 'h-full w-full object-contain'}
      />
      <DurBadge sec={dur} menuOffset={menuOffset} />
    </div>
  );
}

/** A fixed waveform-like bar pattern seeded by the file, so every audio card looks like sound (not a
 *  paused video) and different files look different. Decorative only — not the real peaks. */
function waveformPattern(seed: string, count = 28): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out: number[] = [];
  let prev = 0.5;
  for (let i = 0; i < count; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const r = ((h >>> 0) % 1000) / 1000;
    prev = prev * 0.45 + r * 0.55;
    const envelope = 0.55 + 0.45 * Math.sin((Math.PI * (i + 0.5)) / count);
    out.push(Math.round(Math.max(0.18, prev * envelope) * 100));
  }
  return out;
}

/** Audio grid tile: its own look in the shared 16:9 slot — a tinted panel with a waveform and an
 *  audio badge, play control bottom-left — so it never reads as a video. Embedded cover art (music
 *  files) shows behind the same chrome. Duration comes from an off-DOM metadata-only Audio element. */
export function AudioTile({ playing, url, coverSrc, menuOffset = false }: { playing: boolean; url?: string; coverSrc?: string | null; menuOffset?: boolean }) {
  const [dur, setDur] = useState<number | null>(null);
  const bars = useMemo(() => waveformPattern(url ?? ''), [url]);
  useEffect(() => {
    if (!url) return;
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => setDur(a.duration);
    a.src = url;
    return () => {
      a.onloadedmetadata = null;
      a.removeAttribute('src');
    };
  }, [url]);
  return (
    <div className={`relative aspect-video overflow-hidden ${coverSrc ? 'bg-panel-2' : 'from-accent/15 via-panel-2 bg-gradient-to-br to-panel-2'}`}>
      {coverSrc ? <img src={coverSrc} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" /> : (
        <div aria-hidden className="absolute inset-x-3 inset-y-[28%] flex items-center gap-[2px]">
          {bars.map((height, index) => <span key={index} className={`flex-1 rounded-full transition-colors ${playing ? 'bg-accent' : 'bg-ink-4/55'}`} style={{ height: `${height}%` }} />)}
        </div>
      )}
      <span className="pointer-events-none absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-black/45 px-1 py-0.5 text-[9px] text-white">
        <AudioLines size={9} />{t('panels.audioBadge')}
      </span>
      <span className={`absolute bottom-1 left-1 flex size-6 items-center justify-center rounded-full ${playing ? 'bg-accent text-white' : 'bg-black/55 text-white'}`}>
        {playing ? <Pause size={11} /> : <Play size={11} />}
      </span>
      <DurBadge sec={dur} menuOffset={menuOffset} />
    </div>
  );
}

/** Element card preview shared by Assets and Generation. Curated components use their generated
 * R2 poster; user/generated elements without a poster keep the sandboxed live-preview fallback. */
export function ElementTile({ item, width, height }: { item: LibraryItem; width?: number; height?: number }) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState(width ?? 120);
  useEffect(() => {
    if (width != null) return;
    const shell = shellRef.current;
    if (!shell) return;
    const update = () => setMeasuredWidth(Math.max(1, Math.round(shell.getBoundingClientRect().width)));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [width]);
  const tileWidth = width ?? measuredWidth;
  const tileHeight = height ?? Math.round((tileWidth * 9) / 16);
  const model = useMemo(() => componentPreviewModel(item), [item]);
  return (
    <div ref={shellRef} className="bg-panel-2 w-full overflow-hidden">
      {item.thumbSrc ? (
        <img
          src={imageThumb(item.thumbSrc, 'strip')}
          alt={item.label}
          loading="lazy"
          className="w-full object-contain"
          style={{ height: tileHeight }}
        />
      ) : model ? (
        <LibraryComponentPreview model={model} width={tileWidth} height={tileHeight} />
      ) : (
        <div className="bg-panel-2" style={{ width: tileWidth, height: tileHeight }} />
      )}
    </div>
  );
}

/** List row thumbnail (small square); elements use an icon placeholder (an iframe shrunk to 36px is pointless),
 *  audio shows its play/pause state in the same square. */
export function RowThumb({ item: it, playing }: { item: LibraryItem; playing?: boolean }) {
  if (it.kind === 'audio') {
    return (
      <div className={`flex size-9 shrink-0 items-center justify-center overflow-hidden rounded ${playing ? 'bg-accent text-white' : 'bg-panel-2 text-ink-3'}`}>
        {playing ? <Pause size={13} /> : <AudioLines size={14} />}
      </div>
    );
  }
  if (it.kind === 'element' && it.thumbSrc) {
    return <img src={imageThumb(it.thumbSrc, 'thumb')} alt={it.label} className="size-9 shrink-0 rounded object-cover" loading="lazy" />;
  }
  if (it.kind === 'element') {
    return (
      <div className="bg-panel-2 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded">
        <Sparkles size={14} className="text-ink-4" />
      </div>
    );
  }
  if (it.thumbSrc) {
    return <img src={imageThumb(it.thumbSrc, 'thumb')} alt={it.label} className="size-9 shrink-0 rounded object-cover" loading="lazy" />;
  }
  if (it.kind === 'video') {
    return <video src={firstFrameUrl(it.insertUrl)} preload="metadata" muted playsInline className="size-9 shrink-0 rounded object-cover" />;
  }
  return (
    <div className="bg-panel-2 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded">
      <ImageIcon size={14} className="text-ink-4" />
    </div>
  );
}

/** Grid card: responsive 16:9 thumb + 24px title row; click to preview (audio: toggle playback),
 *  draggable, with insert (+) and a compact rename/delete menu when the source supports it. */
export function AssetCard({
  item: it,
  playing = false,
  onActivate,
  onInsert,
  onRename,
  onDelete,
  onUseAsReference,
  dragProps,
  insertLabel,
}: {
  item: LibraryItem;
  playing?: boolean;
  onActivate: () => void;
  onInsert: () => void;
  /** Arm image generation with this asset as a reference (image/video assets). */
  onUseAsReference?: () => void;
  /** Semantic rename. When present, rename/delete live in one compact menu. */
  onRename?: () => void;
  /** Absent = no delete affordance (deletable items pass a handler). */
  onDelete?: () => void;
  dragProps: ReturnType<typeof dragPropsFor>;
  insertLabel: string;
}) {
  const audio = it.kind === 'audio';
  const hasOptionsMenu = Boolean(onRename || onUseAsReference);
  return (
    <div className="bg-panel ring-line hover:ring-line-2 group relative w-full overflow-hidden rounded-lg ring-1 transition-shadow hover:shadow-[0_4px_14px_rgb(0_0_0/0.08)]">
      <button
        type="button"
        title={audio ? it.label : t('panels.previewLabelDragOnto', { label: it.label })}
        aria-label={audio ? (playing ? t('panels.pauseAudio') : t('panels.playAudio')) : undefined}
        onClick={onActivate}
        {...dragProps}
        className={`block w-full text-left ${audio ? 'cursor-pointer' : 'cursor-zoom-in'}`}
      >
        {it.kind === 'element' ? (
          <ElementTile item={it} />
        ) : audio ? (
          <AudioTile playing={playing} url={it.insertUrl} coverSrc={it.thumbSrc} menuOffset={hasOptionsMenu} />
        ) : (
          <TileThumb item={it} menuOffset={hasOptionsMenu} />
        )}
        <div className="text-ink-2 border-line h-6 truncate border-t px-2 py-1 text-[11px] leading-4">{it.label}</div>
      </button>
      {/* Action chrome sits inside the thumb area (label strip is h-6 below). Video/audio move the
          duration badge left when the top-right options menu is present. */}
      {hasOptionsMenu ? (
        <AssetCardMoreMenu onRename={onRename} onDelete={onDelete} onUseAsReference={onUseAsReference} />
      ) : onDelete ? (
        <button
          type="button"
          title={t('panels.deleteAsset')}
          aria-label={t('panels.deleteAsset')}
          onClick={onDelete}
          className="absolute left-1 top-1 hidden h-5 w-5 items-center justify-center rounded bg-black/55 text-white hover:bg-red-600 group-hover:inline-flex"
        >
          <Trash2 size={11} />
        </button>
      ) : null}
      <button
        type="button"
        title={insertLabel}
        aria-label={insertLabel}
        onClick={onInsert}
        className="bg-accent absolute bottom-7 right-1 hidden h-5 w-5 items-center justify-center rounded text-white group-hover:inline-flex"
      >
        <Plus size={12} />
      </button>
    </div>
  );
}

/** Compact card action menu. The trigger appears with the card's hover/focus state and offsets
 * duration metadata so the two controls never overlap. */
export function AssetCardMoreMenu({
  onRename,
  onDelete,
  onUseAsReference,
  optionsLabel,
  renameLabel,
  deleteLabel,
}: {
  onRename?: () => void;
  onDelete?: () => void;
  /** Arm the chat's image generation with this asset as a reference. */
  onUseAsReference?: () => void;
  optionsLabel?: string;
  renameLabel?: string;
  deleteLabel?: string;
}) {
  if (!onRename && !onDelete && !onUseAsReference) return null;
  const resolvedOptionsLabel = optionsLabel ?? t('panels.assetOptions');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={resolvedOptionsLabel}
          aria-label={resolvedOptionsLabel}
          onClick={(event) => event.stopPropagation()}
          className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded bg-black/55 text-white/90 opacity-0 transition-opacity hover:bg-black/75 hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/80 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal size={12} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="min-w-[132px] text-[11px]">
        {onUseAsReference ? (
          <DropdownMenuItem onSelect={onUseAsReference}>
            <Sparkles size={13} /> {t('panels.useAsReference')}
          </DropdownMenuItem>
        ) : null}
        {onRename ? (
          <DropdownMenuItem onSelect={onRename} className="text-[11px]">
            <Pencil size={12} />
            {renameLabel ?? t('panels.renameAsset')}
          </DropdownMenuItem>
        ) : null}
        {onDelete ? (
          <DropdownMenuItem onSelect={onDelete} variant="destructive" className="text-[11px]">
            <Trash2 size={12} />
            {deleteLabel ?? t('panels.deleteAsset')}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A component box reads at about phone scale; a wider lightbox only blows the type up. */
const COMPONENT_LIGHTBOX_MAX_W = 760;

/** Large asset preview: click backdrop / Esc to close; bottom has an "Insert into canvas" shortcut.
 *  Full-res URLs aren't small, so show a "Loading" placeholder until ready. */
export function AssetLightbox({
  item,
  comp,
  onClose,
  onInsert,
}: {
  item: LibraryItem;
  comp: Composition;
  onClose: () => void;
  /** Kit items pass their preview props; everything else inserts as-is. */
  onInsert: (kitProps?: Record<string, unknown>) => void;
}) {
  const [replayKey, setReplayKey] = useState(0);
  const componentModel = useMemo(
    () => (item.kind === 'element' ? componentPreviewModel(item, comp) : null),
    [comp, item],
  );
  const [ready, setReady] = useState(false);
  // Size the placeholder box to what is shown: a component's own box (or its canvas), else the asset's ratio (16:9 when unknown)
  const ar = componentModel ? componentPreviewAspect(componentModel) : (arOf(item) ?? 16 / 9);
  const componentWidth = componentModel
    ? Math.max(240, Math.min(COMPONENT_LIGHTBOX_MAX_W, window.innerWidth - 96, Math.round(window.innerHeight * 0.78 * ar)))
    : 0;
  useEffect(() => {
    setReady(false);
  }, [item.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label={t('common.closePreview')}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex cursor-zoom-out flex-col items-center justify-center gap-3 bg-black/70 p-6"
    >
      <div className="flex max-w-full items-stretch gap-3">
        <div
          role="presentation"
          onClick={(e) => e.stopPropagation()}
          className="relative cursor-default overflow-hidden rounded-lg bg-black/60 shadow-2xl"
          // width = min(viewport margin, 78vh×ratio) → height stays ≤78vh, placeholder matches final size
          style={{ aspectRatio: ar, width: componentModel ? componentWidth : `min(calc(100vw - 6rem), calc(78vh * ${ar}))` }}
        >
          {!ready && (
            <div className={`absolute inset-0 z-20 flex items-center justify-center ${item.thumbSrc ? 'bg-black/10' : ''}`}>
              <div className="flex items-center gap-2 rounded-md bg-black/60 px-3 py-2 text-white/90 shadow-lg backdrop-blur-sm">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-[11px]">{t('panels.loading')}</span>
              </div>
            </div>
          )}
          {componentModel ? (
            <>
              {item.thumbSrc && (
                <img
                  src={imageThumb(item.thumbSrc, 'preview')}
                  alt={item.label}
                  fetchPriority="high"
                  className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-150 ${ready ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
                />
              )}
              <div className={`transition-opacity duration-150 ${ready ? 'opacity-100' : 'opacity-0'}`}>
                <LibraryComponentPreview
                  model={componentModel}
                  width={componentWidth}
                  height={Math.round(componentWidth / ar)}
                  animate="manual"
                  replayKey={replayKey}
                  playOnReady
                  onReady={() => setReady(true)}
                />
              </div>
            </>
          ) : item.kind === 'video' ? (
            <video
              src={item.insertUrl}
              controls
              autoPlay
              playsInline
              onLoadedData={() => setReady(true)}
              className={`h-full w-full object-contain ${ready ? '' : 'invisible'}`}
            />
          ) : (
            <img
              src={item.thumbSrc ? imageThumb(item.thumbSrc, 'preview') : item.insertUrl}
              alt={item.label}
              onLoad={() => setReady(true)}
              onError={() => setReady(true)}
              className={`h-full w-full object-contain ${ready ? '' : 'invisible'}`}
            />
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {componentModel && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setReplayKey((k) => k + 1);
            }}
            className="inline-flex items-center gap-1 rounded-md bg-white/15 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-white/25"
          >
            <RotateCcw size={13} /> {t('panels.replayAnimation')}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onInsert(componentModel?.insertProps);
          }}
          className="bg-accent inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-medium text-white"
        >
          <Plus size={13} /> {t('panels.insertOntoCanvas')}
        </button>
      </div>
    </div>
  );
}
