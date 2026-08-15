'use client';

/**
 * Shared building blocks for the assets library (My / Official scopes): the LibraryItem
 * shape, the responsive grid card with its tiles (image/video/audio/element), the list-row
 * thumb, drag-out payload wiring, the audio inline-preview hook, and the preview lightbox.
 * Panels own their data sources and handlers; everything visual and draggable lives here.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Pause, Play, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { imageThumb } from '@pireel/ui/image-url';
import type { Composition, MediaRef } from '@pireel/studio-engine/composition';
import type { GenElementResult } from './element-history';
import { componentPreviewModel, LibraryComponentPreview } from './component-preview';
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
}

/** Drag payload from the panel: image/video = MediaRef + dims; element = the element itself (seedId re-scoped on insert). */
/** Image/video payload from the panel — same shape whether dragged out or click-inserted. */
export type PanelMediaAsset = MediaRef & { label?: string; dims?: { w: number; h: number }; sig?: string | null };

export type PanelDragAsset =
  | PanelMediaAsset
  | { type: 'audio'; url: string; label?: string; sig?: string | null }
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
        onDragAsset?.({ type: 'audio', url: it.insertUrl!, label: it.label, sig: it.sig });
      },
      onDragEnd: () => onDragAsset?.(null),
    };
  }
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'copy';
      onDragAsset?.({ type: it.kind as 'image' | 'video', url: it.insertUrl!, label: it.label, dims: dimsOf(it), sig: it.sig });
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
export function DurBadge({ sec }: { sec: number | null }) {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  return (
    <span className="pointer-events-none absolute right-1 top-1 rounded bg-black/55 px-1 py-0.5 text-[9px] tabular-nums text-white">{fmtDur(sec)}</span>
  );
}

/** Grid thumbnail: uniform 120×68 16:9 slot; non-16:9 media is letterboxed — centered and fully
 *  visible (object-contain), never cropped. Generated video has no extracted frame → <video> metadata first frame fills in. */
export function TileThumb({ item: it }: { item: LibraryItem }) {
  if (it.kind === 'video') {
    return <VideoTile item={it} />;
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

/** Video tile: poster frame (or metadata first frame) letterboxed in the 16:9 slot + duration badge.
 *  Even when a poster image exists, a metadata-only <video> is the duration source. */
function VideoTile({ item: it }: { item: LibraryItem }) {
  const [dur, setDur] = useState<number | null>(null);
  return (
    <div className="bg-panel-2 relative aspect-video w-full overflow-hidden">
      {it.thumbSrc ? (
        <img src={imageThumb(it.thumbSrc, 'strip')} alt={it.label} className="h-full w-full object-contain" loading="lazy" />
      ) : null}
      <video
        src={it.insertUrl}
        preload="metadata"
        muted
        playsInline
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        className={it.thumbSrc ? 'hidden' : 'h-full w-full object-contain'}
      />
      <DurBadge sec={dur} />
    </div>
  );
}

/** Audio grid tile: audio has no picture, so it takes the same 16:9 slot with the play/pause state
 *  as the whole subject; duration is read from an off-DOM metadata-only Audio element. */
export function AudioTile({ playing, url, coverSrc }: { playing: boolean; url?: string; coverSrc?: string | null }) {
  const [dur, setDur] = useState<number | null>(null);
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
    <div className="bg-panel-2 relative flex aspect-video items-center justify-center overflow-hidden">
      {coverSrc && <img src={coverSrc} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />}
      <span className={`relative flex size-8 items-center justify-center rounded-full ${playing ? 'bg-accent text-white' : coverSrc ? 'bg-black/50 text-white' : 'bg-panel text-ink-3'}`}>
        {playing ? <Pause size={13} /> : <Play size={13} />}
      </span>
      <DurBadge sec={dur} />
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
        {playing ? <Pause size={13} /> : <Play size={13} />}
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
    return <video src={it.insertUrl} preload="metadata" muted playsInline className="size-9 shrink-0 rounded object-cover" />;
  }
  return (
    <div className="bg-panel-2 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded">
      <ImageIcon size={14} className="text-ink-4" />
    </div>
  );
}

/** Grid card: responsive 16:9 thumb + 24px title row; click to preview (audio: toggle playback),
 *  draggable, hover shows insert (+) inside the thumb area and delete top-left. */
export function AssetCard({
  item: it,
  playing = false,
  onActivate,
  onInsert,
  onDelete,
  dragProps,
  insertLabel,
}: {
  item: LibraryItem;
  playing?: boolean;
  onActivate: () => void;
  onInsert: () => void;
  /** Absent = no delete affordance (deletable items pass a handler). */
  onDelete?: () => void;
  dragProps: ReturnType<typeof dragPropsFor>;
  insertLabel: string;
}) {
  const audio = it.kind === 'audio';
  return (
    <div className="bg-panel-2/55 hover:bg-panel-2 group relative w-full overflow-hidden rounded-md transition-colors">
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
          <AudioTile playing={playing} url={it.insertUrl} coverSrc={it.thumbSrc} />
        ) : (
          <TileThumb item={it} />
        )}
        <div className="text-ink-3 h-6 truncate px-1.5 py-1 text-[10px] leading-4">{it.label}</div>
      </button>
      {/* Hover chrome sits inside the thumb area (label strip is h-6 below): delete top-left, insert "+" bottom-right.
          Video/audio keep the top-right corner for the duration badge (rendered by the tile itself). */}
      {onDelete && (
        <button
          type="button"
          title={t('panels.deleteAsset')}
          aria-label={t('panels.deleteAsset')}
          onClick={onDelete}
          className="absolute left-1 top-1 hidden h-5 w-5 items-center justify-center rounded bg-black/55 text-white hover:bg-red-600 group-hover:inline-flex"
        >
          <Trash2 size={11} />
        </button>
      )}
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
  // Size the placeholder box to the asset's true aspect ratio (element = canvas ratio; unknown dims default to 16:9)
  const ar = componentModel ? componentModel.comp.width / componentModel.comp.height : (arOf(item) ?? 16 / 9);
  const componentWidth = componentModel
    ? Math.max(240, Math.min(window.innerWidth - 96, Math.round(window.innerHeight * 0.78 * ar)))
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
          style={{ aspectRatio: ar, width: `min(calc(100vw - 6rem), calc(78vh * ${ar}))` }}
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
