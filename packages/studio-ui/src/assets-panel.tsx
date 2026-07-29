'use client';

/**
 * Assets library — aggregates images/videos/elements/uploads (categorized by asset,
 * origin shown as a badge). Sits right of the preview, above the timeline (not in the
 * right rail; the right side is reserved for chat).
 *
 * Data: uploads (/api/me/materials) + generated images/videos (/api/create studio space
 * history) + elements (generated overlay HTML blocks, see element-history in localStorage),
 * merged into one reverse-chronological grid distinguished by origin badge. Pending gens
 * hold a placeholder at the top and turn into assets in place after 4s polling.
 *
 * Generation isn't a separate panel — the header has one "Generate" entry (the popover
 * lives in workbench, raised via onOpenGen); closing it bumps genRefreshTick to refetch.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clapperboard, Image as ImageIcon, LayoutGrid, List, Loader2, Music, Pause, Play, Plus, RotateCcw, Search, Sparkles, Trash2, Upload } from 'lucide-react';
import { imageThumb } from '@pireel/ui/image-url';
import { studioProviders } from '@pireel/studio-engine/providers';
import { toast } from '@pireel/ui/toast';
import { confirm } from '@pireel/ui/confirm';
import type { Block, Composition, MediaRef } from '@pireel/studio-engine/composition';
import { type GenJob, listStudioGens, pollCreation } from './gen-api';
import { type ElementEntry, type GenElementResult, loadElementEntries, removeElementEntry, syncElementEntries } from './element-history';
import { getTheme, themeVarsCss } from '@pireel/studio-engine/theme';
import { kitComponents, kitElement } from '@pireel/studio-engine/kit-templates';
import { KitPropsPanel } from './kit-props-panel';
import { KIT_INSERT_DURATION, kitSampleProps } from './kit-ui';
import { BlockPreviewFrame } from './block-preview-card';
import { t } from './i18n';

interface MaterialItem {
  id: string;
  url: string;
  thumb_url: string | null;
  label: string | null;
  kind: 'image' | 'video' | 'audio';
  source: string;
  width?: number | null;
  height?: number | null;
  created_at?: number;
}

/** Unified shape for library entries (uploads / generated media / elements all normalize here). */
const STATIC_ELEMENT_PREVIEW_COMP: Composition = { width: 1920, height: 1080, theme: 'general', video: null, blocks: [], shots: [] };

interface LibraryItem {
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
}

type KindFilter = 'all' | 'image' | 'video' | 'audio' | 'element';

/** Drag payload from the panel: image/video = MediaRef + dims; element = the element itself (seedId re-scoped on insert). */
export type PanelDragAsset =
  | (MediaRef & { label?: string; dims?: { w: number; h: number } })
  | { type: 'audio'; url: string; label?: string }
  | { type: 'element'; element: GenElementResult; prompt: string; label?: string };
type ViewMode = 'grid' | 'list';
export type GenType = 'image' | 'video' | 'element' | 'audio';

const VIEW_KEY = 'studio.assetsPanel.view';

const arOf = (it: LibraryItem): number | undefined =>
  it.width && it.height && it.width > 0 && it.height > 0 ? it.width / it.height : undefined;
const dimsOf = (it: LibraryItem): { w: number; h: number } | undefined =>
  it.width && it.height && it.width > 0 && it.height > 0 ? { w: it.width, h: it.height } : undefined;

/** Measure a local file's natural dims before upload (instant, no network) → persist so masonry/insert can reuse. */
const fileDims = (f: File, kind: 'image' | 'video'): Promise<{ w: number; h: number } | null> =>
  new Promise((res) => {
    const url = URL.createObjectURL(f);
    const done = (d: { w: number; h: number } | null) => {
      URL.revokeObjectURL(url);
      res(d);
    };
    if (kind === 'video') {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.onloadedmetadata = () => done(v.videoWidth > 0 && v.videoHeight > 0 ? { w: v.videoWidth, h: v.videoHeight } : null);
      v.onerror = () => done(null);
      v.src = url;
    } else {
      const im = new Image();
      im.onload = () => done(im.naturalWidth > 0 && im.naturalHeight > 0 ? { w: im.naturalWidth, h: im.naturalHeight } : null);
      im.onerror = () => done(null);
      im.src = url;
    }
  });

function materialToItem(it: MaterialItem): LibraryItem | null {
  if (it.kind !== 'image' && it.kind !== 'video' && it.kind !== 'audio') return null;
  return {
    id: `up:${it.id}`,
    kind: it.kind,
    origin: 'upload',
    insertUrl: it.kind === 'audio' ? it.url : imageThumb(it.url, 'original'),
    thumbSrc: it.thumb_url ?? (it.kind === 'image' ? it.url : null),
    label: it.label ?? (it.kind === 'video' ? t('panels.untitledVideo') : t('panels.untitledImage')),
    createdAt: it.created_at ?? 0,
    width: it.width,
    height: it.height,
    deletable: true,
    uploadId: it.id,
  };
}

function genToItems(job: GenJob, kind: 'image' | 'video'): LibraryItem[] {
  if (job.status !== 'succeeded') return [];
  return job.assets.map((a, i) => ({
    id: `gen:${job.id}:${i}`,
    kind,
    origin: 'gen' as const,
    insertUrl: a.url, // gen-api already returns a full-res direct URL
    thumbSrc: kind === 'image' ? a.key : null, // generated video has no extracted frame; thumbnail uses <video> first frame
    label: job.prompt.slice(0, 60) || (kind === 'video' ? t('common.videoGeneration') : t('common.imageGeneration')),
    createdAt: job.createdAt,
    deletable: false,
  }));
}

function elementToItem(e: ElementEntry): LibraryItem {
  return {
    id: `el:${e.id}`,
    kind: 'element',
    origin: 'gen',
    label: e.element.label || e.prompt.slice(0, 60) || t('panels.element'),
    createdAt: e.createdAt,
    deletable: true,
    element: e.element,
    prompt: e.prompt,
  };
}

export function AssetsPanel({
  comp,
  onInsert,
  onInsertElement,
  onInsertKit,
  onDragAsset,
  onOpenGen,
  onUseAudio,
  genRefreshTick = 0,
}: {
  /** Element live preview needs theme/canvas (BlockPreviewFrame). */
  comp: Composition;
  onInsert: (asset: MediaRef, label?: string, dims?: { w: number; h: number }) => void;
  /** Insert an element (seedId re-scoping and empty-slot backfill happen on the insert side). */
  onInsertElement: (el: GenElementResult, prompt: string) => void;
  /** Insert a kit component as a props-driven block; props override the sample defaults
   *  (the preview lightbox lets you tune them before inserting). */
  onInsertKit?: (component: string, props?: Record<string, unknown>) => void;
  /** Drag out an asset (asset on dragstart, null on dragend) — workbench uses this to overlay a drop layer on stage/timeline. */
  onDragAsset?: (asset: PanelDragAsset | null) => void;
  /** Open the generate popover (owned by workbench; anchor = trigger button rect, popover pops out nearby). */
  onOpenGen: (type: GenType, anchor?: DOMRect) => void;
  /** Audio asset's primary action: mount as the background-music bed (workbench → use-bgm). */
  onUseAudio?: (url: string, label?: string) => void;
  /** Bumped when the generate popover closes → refetch gen history/elements. */
  genRefreshTick?: number;
}) {
  const [kind, setKind] = useState<KindFilter>('all');
  // Audio inline preview: one shared element, click toggles (no lightbox for sound)
  const [audioPlaying, setAudioPlaying] = useState<string | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const toggleAudio = (url: string) => {
    if (!audioElRef.current) {
      audioElRef.current = new Audio();
      audioElRef.current.onended = () => setAudioPlaying(null);
    }
    const a = audioElRef.current;
    if (audioPlaying === url) {
      a.pause();
      setAudioPlaying(null);
      return;
    }
    a.src = url;
    a.play().catch(() => {});
    setAudioPlaying(url);
  };
  useEffect(
    () => () => {
      audioElRef.current?.pause();
      audioElRef.current = null;
    },
    [],
  );
  const [view, setView] = useState<ViewMode>(() =>
    typeof window !== 'undefined' && window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid',
  );
  const [q, setQ] = useState('');
  const [uploads, setUploads] = useState<LibraryItem[]>([]);
  const [gens, setGens] = useState<GenJob[]>([]); // image+video stored together, tagged by kind when itemized
  const [elements, setElements] = useState<ElementEntry[]>([]);
  const genKindRef = useRef<Map<string, 'image' | 'video'>>(new Map());
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<LibraryItem | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Uploads: fetch images/videos in parallel and merge (the API requires a single kind value).
  // reqSeq guards against races: a slower in-flight load can't overwrite a newer one.
  const reqSeq = useRef(0);
  const loadUploads = useCallback((silent = false) => {
    const seq = ++reqSeq.current;
    if (!silent) setLoading(true);
    const get = (k: 'image' | 'video' | 'audio') =>
      fetch(`/api/me/materials?tab=global&kind=${k}&limit=200`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { items?: MaterialItem[] } | null) => j?.items ?? [])
        .catch(() => [] as MaterialItem[]);
    return Promise.all([get('image'), get('video'), get('audio')]).then(([imgs, vids, auds]) => {
      if (seq !== reqSeq.current) return; // superseded by a newer load
      setUploads([...imgs, ...vids, ...auds].map(materialToItem).filter((x): x is LibraryItem => !!x));
      if (!silent) setLoading(false);
    });
  }, []);

  useEffect(() => {
    void loadUploads();
  }, [reloadTick, loadUploads]);

  // Agent uploads (import_media helper → /api/studio/media) land server-side with NO signal to this
  // tab, so the library would stay stale until a full reload. Silently refetch when the tab regains
  // focus/visibility, plus a light poll while visible, so agent-added media shows up on its own.
  useEffect(() => {
    const refresh = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') void loadUploads(true);
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = setInterval(refresh, 20_000);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      clearInterval(timer);
    };
  }, [loadUploads]);

  // Gen history + elements: refetch on mount / popover close. Elements: read cache synchronously
  // for instant open, then fetch and merge cloud (cloud wins; local-only entries backfill to cloud, see element-history)
  useEffect(() => {
    let gone = false;
    setElements(loadElementEntries());
    void syncElementEntries().then((merged) => {
      if (merged && !gone) setElements(merged);
    });
    void Promise.all([listStudioGens('image').catch(() => []), listStudioGens('video').catch(() => [])]).then(
      ([imgs, vids]) => {
        for (const j of imgs) genKindRef.current.set(j.id, 'image');
        for (const j of vids) genKindRef.current.set(j.id, 'video');
        setGens([...imgs, ...vids]);
      },
    );
    return () => {
      gone = true;
    };
  }, [genRefreshTick]);

  const gensRef = useRef(gens);
  gensRef.current = gens;
  useEffect(() => {
    const pending = gens.filter((g) => g.status === 'pending');
    if (pending.length === 0) return;
    let stopped = false;
    const tick = async () => {
      const ids = gensRef.current.filter((g) => g.status === 'pending').map((g) => g.id);
      if (ids.length === 0) return;
      const fresh = await Promise.all(ids.map((id) => pollCreation(id).catch(() => null)));
      if (stopped) return;
      setGens((cur) =>
        cur.map((g) => {
          const f = fresh.find((x) => x?.id === g.id);
          return f && f.status !== g.status ? f : g;
        }),
      );
    };
    const timer = setInterval(() => void tick(), 4000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [gens]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const switchView = (v: ViewMode) => {
    setView(v);
    scrollRef.current?.scrollTo(0, 0); // the two views have different row heights, so old scrollTop lands randomly
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode can't write; ignore */
    }
  };

  const items = useMemo(() => {
    const genItems = gens.flatMap((j) => {
      const k = genKindRef.current.get(j.id);
      return k ? genToItems(j, k) : [];
    });
    return [...uploads, ...genItems, ...elements.map(elementToItem)].sort((a, b) => b.createdAt - a.createdAt);
  }, [uploads, gens, elements]);

  // Element library = "Mine" + grouped by theme. Contents are voiceover overlay pieces (card-scale,
  // centered, self-contained — not full-page PPT; full-page designs live on the theme wall as AI scene
  // reference). Same overlay structure × each theme's skin: theme tokens are baked into innerHtml at block
  // scope (data-hf-baked) — preview, insert, and theme-swap all look identical, and once inserted the piece
  // is unaffected by the project theme or other elements (independence).
  // Kit components: the abstraction of the theme elements — insert = a props-driven block
  // (templateId 'kit:*'), preview = a defaults+sample render with the general theme baked.
  const kitGroup = useMemo(() => {
    const vars = themeVarsCss(getTheme('general'));
    return {
      id: 'kit',
      title: t('panels.kitComponents'),
      items: Object.keys(kitComponents).map((cid): LibraryItem => {
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
      }),
    };
  }, []);
  const mineItems = useMemo(() => elements.map(elementToItem).sort((a, b) => b.createdAt - a.createdAt), [elements]);
  // Overlay preview uses a static 16:9 canvas constant — tokens are baked, so preview has zero dependency
  // on the project comp; chat theme mount/swap (comp.palette changes) no longer re-renders the whole element wall
  const presetPreviewComp = STATIC_ELEMENT_PREVIEW_COMP;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // Under the element filter, kit components join the search pool (createdAt=0 naturally sorts last)
    const pool = kind === 'element' ? [...items, ...kitGroup.items] : items;
    return pool.filter((it) => (kind === 'all' || it.kind === kind) && (!needle || it.label.toLowerCase().includes(needle)));
  }, [items, kitGroup, kind, q]);

  const pendingJobs = useMemo(
    () =>
      gens.filter((g) => {
        if (g.status !== 'pending') return false;
        const k = genKindRef.current.get(g.id) ?? 'image';
        return kind === 'all' || kind === k;
      }),
    [gens, kind],
  );

  /** Kind icon + origin label: same badge vocabulary in the card badge and the list row meta line. */
  const kindIcon = (it: LibraryItem) =>
    it.kind === 'video' ? <Clapperboard size={9} /> : it.kind === 'element' ? <Sparkles size={9} /> : it.kind === 'audio' ? <Music size={9} /> : <ImageIcon size={9} />;
  const originLabel = (it: LibraryItem) =>
    it.kind === 'element' ? t('panels.element') : it.origin === 'gen' ? t('common.generate') : t('panels.upload');
  /** Body click: audio toggles inline playback (its "preview"), everything else opens the lightbox. */
  const activate = (it: LibraryItem) => {
    if (it.kind === 'audio') {
      if (it.insertUrl) toggleAudio(it.insertUrl);
      return;
    }
    setPreview(it);
  };
  const insertLabel = (it: LibraryItem) => (it.kind === 'audio' ? t('panels.useAsBgm') : t('panels.insert'));

  /** Grid card (shared by masonry / category overview / category detail): click to preview, draggable, hover to insert/delete. */
  const gridCard = (it: LibraryItem) => {
    const audio = it.kind === 'audio';
    const playing = audio && audioPlaying === it.insertUrl;
    return (
      <div key={it.id} className="border-line hover:border-accent group relative mb-1.5 inline-block w-full break-inside-avoid overflow-hidden rounded-md border align-top transition">
        <button
          type="button"
          title={audio ? it.label : t('panels.previewLabelDragOnto', { label: it.label })}
          aria-label={audio ? (playing ? t('panels.pauseAudio') : t('panels.playAudio')) : undefined}
          onClick={() => activate(it)}
          {...dragProps(it)}
          className={`block w-full text-left ${audio ? 'cursor-pointer' : 'cursor-zoom-in'}`}
        >
          {/* Preset card thumbnails are uniformly 16:9 (true ratio would leave big gaps on a vertical canvas); lightbox/insert still use the real canvas */}
          {it.kind === 'element' ? (
            <ElementTile item={it} comp={it.origin === 'preset' ? presetPreviewComp : comp} />
          ) : audio ? (
            <AudioTile playing={playing} />
          ) : (
            <TileThumb item={it} />
          )}
          <div className="text-ink-3 truncate px-1.5 py-1 text-[10px]">{it.label}</div>
        </button>
        {/* Origin badge: only where it disambiguates. Elements live under their own section heading,
            so a label on every card was pure noise. */}
        {it.kind !== 'element' && (
          <span className="pointer-events-none absolute left-1 top-1 flex items-center gap-0.5 rounded bg-black/55 px-1 py-0.5 text-[9px] text-white">
            {kindIcon(it)}
            {originLabel(it)}
          </span>
        )}
        {it.deletable && (
          <button
            type="button"
            title={t('panels.deleteAsset')}
            aria-label={t('panels.deleteAsset')}
            onClick={() => void doDelete(it)}
            className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded bg-black/55 text-white hover:bg-red-600 group-hover:inline-flex"
          >
            <Trash2 size={11} />
          </button>
        )}
        <button
          type="button"
          title={audio ? t('panels.useAsBgm') : t('panels.insertOntoCanvas')}
          onClick={() => insertOf(it)}
          className="bg-accent absolute bottom-1 right-1 hidden items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-white group-hover:inline-flex"
        >
          <Plus size={9} /> {insertLabel(it)}
        </button>
      </div>
    );
  };

  const doUpload = async () => {
    if (uploading) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*,audio/*';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const k = f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : 'image';
      setUploading(true);
      try {
        const dims = k === 'audio' ? null : await fileDims(f, k); // measured locally, persisted along with the upload
        const { url } = await studioProviders().uploads.upload(f, { contentType: f.type || 'application/octet-stream', filename: f.name });
        await fetch('/api/me/uploads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: k, url, label: f.name, role: 'general', mime: f.type, byte_size: f.size, ...(dims ? { width: dims.w, height: dims.h } : {}) }),
        });
        setReloadTick((n) => n + 1);
        setQ('');
        toast.success(t('panels.uploadedAssets'));
      } catch {
        toast.error(t('panels.uploadFailedTryAgain'));
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  /** Delete: uploads use a soft-delete API (optimistic remove, roll back on failure); elements are removed from local history. */
  const doDelete = async (it: LibraryItem) => {
    if (it.kind === 'element') {
      const ok = await confirm({
        title: t('panels.deleteElement'),
        description: t('panels.removedFromElementHistory'),
        tone: 'danger',
        confirmLabel: t('tools.delete_block.label'),
      });
      if (!ok) return;
      removeElementEntry(it.id.slice(3)); // strip 'el:' prefix
      setElements(loadElementEntries());
      toast.success(t('panels.deleted'));
      return;
    }
    if (!it.uploadId) return;
    const ok = await confirm({
      title: t('panels.deleteAssetConfirm'),
      description: t('panels.removedFromAssetsCopies'),
      tone: 'danger',
      confirmLabel: t('tools.delete_block.label'),
    });
    if (!ok) return;
    const prev = uploads;
    setUploads((cur) => cur.filter((x) => x.id !== it.id));
    if (preview?.id === it.id) setPreview(null);
    try {
      const r = await fetch(`/api/me/uploads/${encodeURIComponent(it.uploadId)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(String(r.status));
      toast.success(t('panels.deleted'));
    } catch {
      setUploads(prev); // roll back on failure so the asset doesn't vanish
      toast.error(t('panels.deleteFailedTryAgain'));
    }
  };

  const insertOf = (it: LibraryItem, kitProps?: Record<string, unknown>) => {
    if (it.kit) {
      onInsertKit?.(it.kit, kitProps);
      return;
    }
    if (it.kind === 'element') {
      if (it.element) onInsertElement(it.element, it.prompt ?? it.label);
      return;
    }
    if (it.kind === 'audio') {
      if (it.insertUrl) onUseAudio?.(it.insertUrl, it.label);
      return;
    }
    if (it.insertUrl) onInsert({ type: it.kind as 'image' | 'video', url: it.insertUrl }, it.label, dimsOf(it));
  };
  const dragProps = (it: LibraryItem) => {
    if (it.kit) return {};
    // Elements are draggable on par with images (unified): payload carries the element itself, drop semantics live in workbench
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
          onDragAsset?.({ type: 'audio', url: it.insertUrl!, label: it.label });
        },
        onDragEnd: () => onDragAsset?.(null),
      };
    }
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = 'copy';
        onDragAsset?.({ type: it.kind as 'image' | 'video', url: it.insertUrl!, label: it.label, dims: dimsOf(it) });
      },
      onDragEnd: () => onDragAsset?.(null),
    };
  };

  const openGen = (e: React.MouseEvent<HTMLButtonElement>) =>
    onOpenGen(kind === 'all' ? 'image' : kind, e.currentTarget.getBoundingClientRect());

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="border-line border-b px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <div className="border-line bg-panel focus-within:border-ink-4 flex min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 py-1">
            <Search size={12} className="text-ink-4 shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('panels.searchAssets')}
              aria-label={t('panels.searchAssetsLabel')}
              className="text-ink placeholder:text-ink-4 min-w-0 flex-1 bg-transparent text-[12px] outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => void doUpload()}
            disabled={uploading}
            title={t('panels.uploadAsset')}
            aria-label={t('panels.uploadAsset')}
            className="border-line text-ink-2 hover:text-ink inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border disabled:opacity-40"
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          </button>
          <button
            type="button"
            onClick={openGen}
            title={t('panels.generateAssetsImageVideo')}
            className="bg-ink text-bg inline-flex h-[26px] shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium hover:opacity-90"
          >
            <Sparkles size={11} /> {t('common.generate')}
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <div className="flex gap-1">
            {(
              [
                { v: 'all', label: 'panels.all' },
                { v: 'image', label: 'panels.image' },
                { v: 'video', label: 'panels.video' },
                { v: 'element', label: 'panels.element' },
                { v: 'audio', label: 'panels.music' },
              ] as { v: KindFilter; label: string }[]
            ).map((k) => (
              <button
                key={k.v}
                type="button"
                onClick={() => setKind(k.v)}
                className={`rounded-md px-2 py-0.5 text-[11px] transition ${
                  kind === k.v ? 'bg-panel-2 text-ink font-medium' : 'text-ink-4 hover:text-ink-2'
                }`}
              >
                {t(k.label)}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5">
            {(
              [
                { v: 'grid', icon: LayoutGrid, title: 'panels.cardView' },
                { v: 'list', icon: List, title: 'panels.listView' },
              ] as { v: ViewMode; icon: typeof LayoutGrid; title: string }[]
            ).map((m) => (
              <button
                key={m.v}
                type="button"
                title={t(m.title)}
                aria-label={t(m.title)}
                onClick={() => switchView(m.v)}
                className={`rounded p-1 transition ${view === m.v ? 'bg-panel-2 text-ink' : 'text-ink-4 hover:text-ink-2'}`}
              >
                <m.icon size={13} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid view has content padding; list view is full-bleed with padding inside each row */}
      <div ref={scrollRef} className={`min-h-0 flex-1 overflow-auto ${view === 'grid' ? 'p-2' : ''}`}>
        {/* Pending gens: placeholder card pinned to top, turns into an asset in place when ready */}
        {pendingJobs.length > 0 && (
          <div className={view === 'grid' ? 'mb-1.5 space-y-1.5' : 'space-y-0'}>
            {pendingJobs.map((g) => (
              <div key={g.id} className={`border-line flex items-center gap-2 border ${view === 'grid' ? 'rounded-md p-2' : 'border-x-0 border-t-0 px-3 py-2'}`}>
                <Loader2 size={13} className="text-ink-4 shrink-0 animate-spin" />
                <div className="min-w-0 flex-1">
                  <div className="text-ink-3 truncate text-[11px]">{g.prompt || t('panels.generating')}</div>
                  <div className="text-ink-4 text-[10px]">{(genKindRef.current.get(g.id) ?? 'image') === 'video' ? t('panels.generatingVideo') : t('panels.generatingImage')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {loading && items.length === 0 ? (
          <div className="text-ink-4 flex items-center justify-center gap-2 pt-10 text-[11.5px]">
            <Loader2 size={13} className="animate-spin" /> {t('panels.loadingAssets')}
          </div>
        ) : shown.length === 0 && pendingJobs.length === 0 ? (
          <div className="text-ink-4 pt-10 text-center text-[11.5px]">
            {items.length === 0 ? (
              <>
                {t('panels.noAssetsYet')}
                <br />
                {t('panels.uploadImageVideoClick')}
              </>
            ) : (
              t('panels.noMatchingAssetsTry')
            )}
          </div>
        ) : kind === 'element' && !q.trim() ? (
          // Elements laid out flat: "Mine" then the component library, every card visible — the
          // library is small enough to browse in one pass, and a click-through level only hid it.
          <div className="space-y-3.5">
            {[{ id: 'mine', title: t('common.mine'), items: mineItems }, kitGroup].map((g) => (
              <section key={g.id}>
                <div className="text-ink-2 mb-1.5 flex items-center text-[12px] font-medium">
                  {g.title}
                  <span className="text-ink-4 ml-1 font-normal">{g.items.length}</span>
                </div>
                {g.items.length === 0 ? (
                  <div className="text-ink-4 border-line rounded-md border border-dashed px-3 py-4 text-center text-[10.5px]">
                    {t('panels.selectElementCanvasSave')}
                  </div>
                ) : (
                  <div className="columns-2 gap-1.5">{g.items.map(gridCard)}</div>
                )}
              </section>
            ))}
          </div>
        ) : view === 'grid' ? (
          // Masonry: CSS columns, cards laid out by true aspect ratio, two staggered columns.
          // Audio rides along as a fixed-ratio card (same card chrome, play/pause tile instead of a thumbnail).
          <div className="columns-2 gap-1.5">{shown.map(gridCard)}</div>
        ) : (
          <div className="divide-line divide-y">
            {shown.map((it) => (
              <div key={it.id} className="hover:bg-panel-2 group flex w-full items-center gap-2 px-3 py-1.5 transition">
                <button
                  type="button"
                  title={it.kind === 'audio' ? it.label : t('panels.previewLabelDragOnto', { label: it.label })}
                  aria-label={it.kind === 'audio' ? (audioPlaying === it.insertUrl ? t('panels.pauseAudio') : t('panels.playAudio')) : undefined}
                  onClick={() => activate(it)}
                  {...dragProps(it)}
                  className={`flex min-w-0 flex-1 items-center gap-2 text-left ${it.kind === 'audio' ? 'cursor-pointer' : 'cursor-zoom-in'}`}
                >
                  <RowThumb item={it} playing={it.kind === 'audio' && audioPlaying === it.insertUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="text-ink truncate text-[11px]">{it.label}</div>
                    <div className="text-ink-4 flex items-center gap-1 text-[10px]">
                      {kindIcon(it)}
                      {originLabel(it)}
                      {it.createdAt ? ` · ${new Date(it.createdAt).toLocaleDateString()}` : ''}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  title={it.kind === 'audio' ? t('panels.useAsBgm') : t('panels.insertOntoCanvas')}
                  onClick={() => insertOf(it)}
                  className="bg-accent hidden shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-white group-hover:inline-flex"
                >
                  <Plus size={9} /> {insertLabel(it)}
                </button>
                {it.deletable && (
                  <button
                    type="button"
                    title={t('panels.deleteAsset')}
                    aria-label={t('panels.deleteAsset')}
                    onClick={() => void doDelete(it)}
                    className="text-ink-4 hidden shrink-0 items-center rounded p-1 hover:bg-red-600 hover:text-white group-hover:inline-flex"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview lightbox: click an asset to see it large; insert still goes through the card's "Insert" button (this one is a handy shortcut) */}
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

/** Large asset preview: click backdrop / Esc to close; bottom has an "Insert into canvas" shortcut.
 *  Full-res URLs aren't small, so show a "Loading" placeholder until ready. */
function AssetLightbox({
  item,
  comp,
  onClose,
  onInsert,
}: {
  item: LibraryItem;
  comp: Composition;
  onClose: () => void;
  /** Kit items pass the props tuned in the lightbox; everything else inserts as-is. */
  onInsert: (kitProps?: Record<string, unknown>) => void;
}) {
  // Kit preview is a real kit block on the same render path as the canvas — what you tune here is
  // exactly what lands. Edits live in this state only: the library entry is never touched.
  const [draft, setDraft] = useState<Record<string, unknown>>(() => (item.kit ? kitSampleProps(item.kit) : {}));
  const [replayKey, setReplayKey] = useState(0);
  useEffect(() => setDraft(item.kit ? kitSampleProps(item.kit) : {}), [item.id, item.kit]);
  const kitBlock = useMemo(
    () =>
      item.kit
        ? {
            id: `lb_${item.kit}`,
            templateId: `kit:${item.kit}`,
            slots: { props: draft },
            startSec: 0,
            durationSec: KIT_INSERT_DURATION,
            trackIndex: 2,
            box: { x: 0, y: 0, w: 1, h: 1 },
            label: item.label,
          }
        : null,
    [item.kit, item.label, draft],
  );
  // Elements get a local iframe live preview, available immediately (no network load), so skip the ready placeholder
  const [ready, setReady] = useState(item.kind === 'element');
  // Size the placeholder box to the asset's true aspect ratio (element = canvas ratio; unknown dims default to 16:9)
  const ar = item.kind === 'element' ? (item.element?.designW && item.element.designH ? item.element.designW / item.element.designH : comp.width / comp.height) : (arOf(item) ?? 16 / 9);
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
        // (kit items reserve room for the props panel beside them)
        style={{ aspectRatio: ar, width: `min(calc(100vw - ${kitBlock ? '22rem' : '6rem'}), calc(78vh * ${ar}))` }}
      >
        {!ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/85">
            <Loader2 size={26} className="animate-spin" />
            <span className="text-[12px]">{t('panels.loading')}</span>
          </div>
        )}
        {kitBlock ? (
          <LightboxKit block={kitBlock} replayKey={replayKey} />
        ) : item.kind === 'element' && item.element ? (
          // Element live preview: auto-loops (same render as card hover, just always playing + larger)
          <LightboxElement item={item} comp={comp} />
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
      {kitBlock && (
        <div
          role="presentation"
          onClick={(e) => e.stopPropagation()}
          className="bg-panel cursor-default overflow-y-auto rounded-lg shadow-2xl"
        >
          <KitPropsPanel block={kitBlock} onPatch={setDraft} />
        </div>
      )}
      </div>
      <div className="flex items-center gap-2">
        {kitBlock && (
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
            onInsert(kitBlock ? draft : undefined);
          }}
          className="bg-accent inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-medium text-white"
        >
          <Plus size={13} /> {t('panels.insertOntoCanvas')}
        </button>
      </div>
    </div>
  );
}

/** Element card live preview: same render as the gen panel (freeze on the stable frame after entrance, loops only on hover).
 *  Column width follows masonry (~145px); feed the measured container width to BlockPreviewFrame to avoid horizontal overflow. */
function ElementTile({ item, comp }: { item: LibraryItem; comp: Composition }) {
  const el = item.element!;
  // Static HTML output: no GSAP (from-animations don't apply = frozen end state), zero iframe,
  // zero rasterization; the #seedId selector scope lands directly in the main document without leaking styles
  // (same technique as InlineBlockPreview). After mount, measure the content's true rect once (including rotate)
  // to scale and center the piece in the card.
  const holderRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<{ scale: number; dx: number; dy: number } | null>(null);
  const TILE_W = 144;
  const TILE_H = Math.round((144 * 9) / 16);
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const base = holder.getBoundingClientRect();
    if (base.width < 2) return;
    // Is holder pre-scaled to 0? No — measurement happens at scale(1) in a hidden state: see the visibility strategy below
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const n of Array.from(holder.querySelectorAll('*')) as HTMLElement[]) {
      if (n.tagName === 'STYLE') continue;
      const r = n.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      // Near-full-bleed containers (#seed inset:0 / root .w fill layer) don't count as content, else the union always equals the whole canvas
      if (r.width > base.width * 0.95 && r.height > base.height * 0.95) continue;
      if (r.left < x0) x0 = r.left;
      if (r.top < y0) y0 = r.top;
      if (r.right > x1) x1 = r.right;
      if (r.bottom > y1) y1 = r.bottom;
    }
    if (!Number.isFinite(x0) || x1 - x0 < 8) {
      setFit({ scale: TILE_W / 1920, dx: 0, dy: (TILE_H - 1080 * (TILE_W / 1920)) / 2 });
      return;
    }
    const pad = 24;
    const bx = x0 - base.left - pad;
    const by = y0 - base.top - pad;
    const bw = x1 - x0 + pad * 2;
    const bh = y1 - y0 + pad * 2;
    const scale = Math.min((TILE_W * 0.9) / bw, (TILE_H * 0.9) / bh);
    setFit({ scale, dx: TILE_W / 2 - (bx + bw / 2) * scale, dy: TILE_H / 2 - (by + bh / 2) * scale });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);
  return (
    <div className="w-full overflow-hidden">
      <div
        className="relative overflow-hidden"
        style={{
          width: TILE_W,
          height: TILE_H,
          backgroundColor: '#ffffff',
          backgroundImage:
            'linear-gradient(45deg,#d7dbe0 25%,transparent 25%,transparent 75%,#d7dbe0 75%),linear-gradient(45deg,#d7dbe0 25%,transparent 25%,transparent 75%,#d7dbe0 75%)',
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0,8px 8px',
        }}
      >
        <div
          ref={holderRef}
          style={{
            position: 'absolute',
            left: fit ? fit.dx : -100000,
            top: fit ? fit.dy : 0,
            width: 1920,
            height: 1080,
            transform: `scale(${fit ? fit.scale : 1})`,
            transformOrigin: 'top left',
            pointerEvents: 'none',
          }}
        >
          <div id={el.seedId} style={{ position: 'absolute', inset: 0 }} dangerouslySetInnerHTML={{ __html: el.innerHtml }} />
        </div>
      </div>
    </div>
  );
}

/** Lightbox element live preview: same render as ElementTile, larger + always looping (local iframe, available immediately). */
/** Large kit preview: the block renders through the same assembler path the canvas uses, so the
 *  tuned result is exactly what gets inserted. Sized to the 16:9 component design canvas. */
function LightboxKit({ block, replayKey }: { block: Block; replayKey: number }) {
  const pc = STATIC_ELEMENT_PREVIEW_COMP;
  const width = Math.max(240, Math.min(window.innerWidth - 352, Math.round(window.innerHeight * 0.78 * (pc.width / pc.height))));
  // Frozen on the stable frame: prop edits re-render in place, and the entrance replays only when asked
  return <BlockPreviewFrame comp={pc} block={block} width={width} animate="manual" replayKey={replayKey} />;
}

function LightboxElement({ item, comp }: { item: LibraryItem; comp: Composition }) {
  const el = item.element!;
  // Render theme elements at their design size (1920×1080): a vertical project canvas would make text large and box small (px is relative to canvas width)
  const pc = el.designW && el.designH ? { ...comp, width: el.designW, height: el.designH } : comp;
  const width = Math.max(240, Math.min(window.innerWidth - 96, Math.round(window.innerHeight * 0.78 * (pc.width / pc.height))));
  const previewBlock = {
    id: el.seedId,
    templateId: 'custom',
    slots: { innerHtml: el.innerHtml, timelineBody: el.timelineBody },
    startSec: 0,
    durationSec: 3,
    trackIndex: 2,
    label: el.label,
  };
  return <BlockPreviewFrame comp={pc} block={previewBlock} width={width} animate />;
}

/** Masonry thumbnail: laid out at true aspect ratio (no crop); generated video has no extracted frame → <video> metadata first frame fills in. */
function TileThumb({ item: it }: { item: LibraryItem }) {
  const ar = arOf(it);
  if (it.thumbSrc) {
    return (
      <img
        src={imageThumb(it.thumbSrc, 'strip')}
        alt={it.label}
        style={ar ? { aspectRatio: ar } : undefined}
        className="block w-full object-cover"
        loading="lazy"
      />
    );
  }
  if (it.kind === 'video') {
    return <VideoTile item={it} ar={ar} />;
  }
  return (
    <div className="bg-panel-2 flex items-center justify-center" style={{ aspectRatio: ar ?? 16 / 9 }}>
      <ImageIcon size={20} className="text-ink-4" />
    </div>
  );
}

/** Audio masonry tile: audio has no picture, so it takes a fixed 16:9 slot (keeps the two columns even)
 *  with the play/pause state as the whole subject. */
function AudioTile({ playing }: { playing: boolean }) {
  return (
    <div className="bg-panel-2 flex items-center justify-center" style={{ aspectRatio: 16 / 9 }}>
      <span className={`flex size-8 items-center justify-center rounded-full ${playing ? 'bg-accent text-white' : 'bg-panel text-ink-3'}`}>
        {playing ? <Pause size={13} /> : <Play size={13} />}
      </span>
    </div>
  );
}

/** Video masonry card: laid out at true ratio like images (no crop). For entries stored without dims
 *  (generated video / old uploads) → pin the ratio from videoWidth/Height once metadata arrives (vertical
 *  videos no longer hard-cropped to 16:9); before that, 16:9 placeholder with one small jump on arrival
 *  (preload=metadata is fast, acceptable). */
function VideoTile({ item: it, ar }: { item: LibraryItem; ar: number | undefined }) {
  const [metaAr, setMetaAr] = useState<number | null>(null);
  return (
    <video
      src={it.insertUrl}
      preload="metadata"
      muted
      playsInline
      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        if (!ar && v.videoWidth > 0 && v.videoHeight > 0) setMetaAr(v.videoWidth / v.videoHeight);
      }}
      className="block w-full object-cover"
      style={{ aspectRatio: ar ?? metaAr ?? 16 / 9 }}
    />
  );
}

/** List row thumbnail (small square); elements use an icon placeholder (an iframe shrunk to 36px is pointless),
 *  audio shows its play/pause state in the same square. */
function RowThumb({ item: it, playing }: { item: LibraryItem; playing?: boolean }) {
  if (it.kind === 'audio') {
    return (
      <div className={`flex size-9 shrink-0 items-center justify-center overflow-hidden rounded ${playing ? 'bg-accent text-white' : 'bg-panel-2 text-ink-3'}`}>
        {playing ? <Pause size={13} /> : <Play size={13} />}
      </div>
    );
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
