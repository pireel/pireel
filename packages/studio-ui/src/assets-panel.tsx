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
import { ChevronLeft, ChevronRight, Clapperboard, Image as ImageIcon, LayoutGrid, List, Loader2, Plus, Search, Sparkles, Trash2, Upload } from 'lucide-react';
import { imageThumb } from '@pireel/ui/image-url';
import { studioProviders } from '@pireel/studio-engine/providers';
import { toast } from '@pireel/ui/toast';
import { confirm } from '@pireel/ui/confirm';
import type { Composition, MediaRef } from '@pireel/studio-engine/composition';
import { type GenJob, listStudioGens, pollCreation } from './gen-api';
import { type ElementEntry, type GenElementResult, loadElementEntries, removeElementEntry, syncElementEntries } from './element-history';
import { framePack } from '@pireel/studio-frames/locales';
import { overlayElements } from '@pireel/studio-frames/overlay-elements';
import { getTheme, themeVarsCss } from '@pireel/studio-engine/theme';
import { presetElements } from './preset-elements';
import { useFrameCatalog } from './use-frame-catalog';
import { BlockPreviewFrame } from './block-preview-card';
import { studioLocale, t } from './i18n';

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
  kind: 'image' | 'video' | 'element';
  origin: 'upload' | 'gen' | 'preset';
  /** Elements only: preset category (data/structure/…); user elements lack this = "Mine". */
  category?: string;
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

type KindFilter = 'all' | 'image' | 'video' | 'element';

/** Drag payload from the panel: image/video = MediaRef + dims; element = the element itself (seedId re-scoped on insert). */
export type PanelDragAsset =
  | (MediaRef & { label?: string; dims?: { w: number; h: number } })
  | { type: 'element'; element: GenElementResult; prompt: string; label?: string };
type ViewMode = 'grid' | 'list';
export type GenType = 'image' | 'video' | 'element';

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
  if (it.kind !== 'image' && it.kind !== 'video') return null;
  return {
    id: `up:${it.id}`,
    kind: it.kind,
    origin: 'upload',
    insertUrl: imageThumb(it.url, 'original'),
    thumbSrc: it.thumb_url ?? (it.kind === 'image' ? it.url : null),
    label: it.label ?? (it.kind === 'video' ? t('未命名视频') : t('未命名图片')),
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
    label: job.prompt.slice(0, 60) || (kind === 'video' ? t('生成视频') : t('生成图片')),
    createdAt: job.createdAt,
    deletable: false,
  }));
}

function elementToItem(e: ElementEntry): LibraryItem {
  return {
    id: `el:${e.id}`,
    kind: 'element',
    origin: 'gen',
    label: e.element.label || e.prompt.slice(0, 60) || t('组件'),
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
  onDragAsset,
  onOpenGen,
  genRefreshTick = 0,
}: {
  /** Element live preview needs theme/canvas (BlockPreviewFrame). */
  comp: Composition;
  onInsert: (asset: MediaRef, label?: string, dims?: { w: number; h: number }) => void;
  /** Insert an element (seedId re-scoping and empty-slot backfill happen on the insert side). */
  onInsertElement: (el: GenElementResult, prompt: string) => void;
  /** Drag out an asset (asset on dragstart, null on dragend) — workbench uses this to overlay a drop layer on stage/timeline. */
  onDragAsset?: (asset: PanelDragAsset | null) => void;
  /** Open the generate popover (owned by workbench; anchor = trigger button rect, popover pops out nearby). */
  onOpenGen: (type: GenType, anchor?: DOMRect) => void;
  /** Bumped when the generate popover closes → refetch gen history/elements. */
  genRefreshTick?: number;
}) {
  const [kind, setKind] = useState<KindFilter>('all');
  // Element category browsing ("Mine" first; each category shows one row of two cards, header right-arrow opens detail)
  const [elCat, setElCat] = useState<string | null>(null);
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
    const get = (k: 'image' | 'video') =>
      fetch(`/api/me/materials?tab=global&kind=${k}&limit=200`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { items?: MaterialItem[] } | null) => j?.items ?? [])
        .catch(() => [] as MaterialItem[]);
    return Promise.all([get('image'), get('video')]).then(([imgs, vids]) => {
      if (seq !== reqSeq.current) return; // superseded by a newer load
      setUploads([...imgs, ...vids].map(materialToItem).filter((x): x is LibraryItem => !!x));
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
  const frames = useFrameCatalog();
  const themeGroups = useMemo(() => {
    const loc = studioLocale();
    const base = presetElements();
    return frames.map((fr) => ({
      id: fr.id,
      title: framePack(loc, fr.id)?.title ?? fr.title,
      items: (() => {
        const vars = themeVarsCss(getTheme('general'), fr.palette ?? undefined);
        // Prefer a dedicated overlay set (hand-crafted per dialect, character lives in the piece); themes without one fall back to generic structure × skin
        const own = overlayElements(fr.id);
        if (own) {
          return own.map(({ kind: kd, make }): LibraryItem => {
            const b = make();
            const slots = b.slots as { innerHtml: string; timelineBody: string };
            return {
              id: `th:${fr.id}:${kd}`,
              kind: 'element' as const,
              origin: 'preset' as const,
              category: fr.id,
              label: t(kd),
              prompt: t(kd),
              createdAt: 0,
              deletable: false,
              element: { seedId: b.id, innerHtml: `${slots.innerHtml}\n<style data-hf-baked>#${b.id}{${vars}}</style>`, timelineBody: slots.timelineBody, label: t(kd), designW: 1920, designH: 1080 },
            };
          });
        }
        return base.map((p): LibraryItem => {
          const baked = `${p.element.innerHtml}\n<style data-hf-baked>#${p.element.seedId}{${vars}}</style>`;
          return {
            id: `th:${fr.id}:${p.id}`,
            kind: 'element' as const,
            origin: 'preset' as const,
            category: fr.id,
            label: p.label,
            prompt: p.label,
            createdAt: 0,
            deletable: false,
            element: { ...p.element, innerHtml: baked },
          };
        });
      })(),
    }));
  }, [frames]);
  const themeItemsAll = useMemo(() => themeGroups.flatMap((g) => g.items), [themeGroups]);
  const mineItems = useMemo(() => elements.map(elementToItem).sort((a, b) => b.createdAt - a.createdAt), [elements]);
  // Overlay preview uses a static 16:9 canvas constant — tokens are baked, so preview has zero dependency
  // on the project comp; chat theme mount/swap (comp.palette changes) no longer re-renders the whole element wall
  const presetPreviewComp = STATIC_ELEMENT_PREVIEW_COMP;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // Under the element filter, theme elements join the search pool (createdAt=0 naturally sorts last)
    const pool = kind === 'element' ? [...items, ...themeItemsAll] : items;
    return pool.filter((it) => (kind === 'all' || it.kind === kind) && (!needle || it.label.toLowerCase().includes(needle)));
  }, [items, themeItemsAll, kind, q]);

  const pendingJobs = useMemo(
    () =>
      gens.filter((g) => {
        if (g.status !== 'pending') return false;
        const k = genKindRef.current.get(g.id) ?? 'image';
        return kind === 'all' || kind === k;
      }),
    [gens, kind],
  );

  /** Grid card (shared by masonry / category overview / category detail): click to preview, draggable, hover to insert/delete. */
  const gridCard = (it: LibraryItem) => (
    <div key={it.id} className="border-line hover:border-accent group relative mb-1.5 inline-block w-full break-inside-avoid overflow-hidden rounded-md border align-top transition">
      <button
        type="button"
        title={t('预览：{label}（拖到画面上可插入）', { label: it.label })}
        onClick={() => setPreview(it)}
        {...dragProps(it)}
        className="block w-full cursor-zoom-in text-left"
      >
        {/* Preset card thumbnails are uniformly 16:9 (true ratio would leave big gaps on a vertical canvas); lightbox/insert still use the real canvas */}
        {it.kind === 'element' ? <ElementTile item={it} comp={it.origin === 'preset' ? presetPreviewComp : comp} /> : <TileThumb item={it} />}
        <div className="text-ink-3 truncate px-1.5 py-1 text-[10px]">{it.label}</div>
      </button>
      <span className="pointer-events-none absolute left-1 top-1 flex items-center gap-0.5 rounded bg-black/55 px-1 py-0.5 text-[9px] text-white">
        {it.kind === 'video' ? <Clapperboard size={9} /> : it.kind === 'element' ? <Sparkles size={9} /> : <ImageIcon size={9} />}
        {it.origin === 'preset' ? (studioLocale() === 'en' ? 'Theme' : '主题') : it.kind === 'element' ? t('组件') : it.origin === 'gen' ? t('生成') : t('上传')}
      </span>
      {it.deletable && (
        <button
          type="button"
          title={t('删除素材')}
          aria-label={t('删除素材')}
          onClick={() => void doDelete(it)}
          className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded bg-black/55 text-white hover:bg-red-600 group-hover:inline-flex"
        >
          <Trash2 size={11} />
        </button>
      )}
      <button
        type="button"
        title={t('插入到画面')}
        onClick={() => insertOf(it)}
        className="bg-accent absolute bottom-1 right-1 hidden items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-white group-hover:inline-flex"
      >
        <Plus size={9} /> {t('插入')}
      </button>
    </div>
  );

  const doUpload = async () => {
    if (uploading) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const k = f.type.startsWith('video/') ? 'video' : 'image';
      setUploading(true);
      try {
        const dims = await fileDims(f, k); // measured locally, persisted along with the upload
        const { url } = await studioProviders().uploads.upload(f, { contentType: f.type || 'application/octet-stream', filename: f.name });
        await fetch('/api/me/uploads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: k, url, label: f.name, role: 'general', mime: f.type, byte_size: f.size, ...(dims ? { width: dims.w, height: dims.h } : {}) }),
        });
        setReloadTick((n) => n + 1);
        setQ('');
        toast.success(t('已上传到素材库'));
      } catch {
        toast.error(t('上传失败'));
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
        title: t('删除这个组件?'),
        description: t('组件历史里会移除它,已经插进片子的不受影响。'),
        tone: 'danger',
        confirmLabel: t('删除'),
      });
      if (!ok) return;
      removeElementEntry(it.id.slice(3)); // strip 'el:' prefix
      setElements(loadElementEntries());
      toast.success(t('已删除'));
      return;
    }
    if (!it.uploadId) return;
    const ok = await confirm({
      title: t('删除这个素材?'),
      description: t('素材库里会移除它,已经用进片子的不受影响。'),
      tone: 'danger',
      confirmLabel: t('删除'),
    });
    if (!ok) return;
    const prev = uploads;
    setUploads((cur) => cur.filter((x) => x.id !== it.id));
    if (preview?.id === it.id) setPreview(null);
    try {
      const r = await fetch(`/api/me/uploads/${encodeURIComponent(it.uploadId)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(String(r.status));
      toast.success(t('已删除'));
    } catch {
      setUploads(prev); // roll back on failure so the asset doesn't vanish
      toast.error(t('删除失败,稍后再试'));
    }
  };

  const insertOf = (it: LibraryItem) => {
    if (it.kind === 'element') {
      if (it.element) onInsertElement(it.element, it.prompt ?? it.label);
      return;
    }
    if (it.insertUrl) onInsert({ type: it.kind, url: it.insertUrl }, it.label, dimsOf(it));
  };
  const dragProps = (it: LibraryItem) => {
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
    onOpenGen(kind === 'all' ? 'image' : kind === 'element' ? 'element' : kind, e.currentTarget.getBoundingClientRect());

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="border-line border-b px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <div className="border-line bg-panel focus-within:border-ink-4 flex min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 py-1">
            <Search size={12} className="text-ink-4 shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('搜素材…')}
              aria-label={t('搜索素材')}
              className="text-ink placeholder:text-ink-4 min-w-0 flex-1 bg-transparent text-[12px] outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => void doUpload()}
            disabled={uploading}
            title={t('上传素材')}
            aria-label={t('上传素材')}
            className="border-line text-ink-2 hover:text-ink inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border disabled:opacity-40"
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          </button>
          <button
            type="button"
            onClick={openGen}
            title={t('生成素材(图片/视频/组件)')}
            className="bg-ink text-bg inline-flex h-[26px] shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium hover:opacity-90"
          >
            <Sparkles size={11} /> {t('生成')}
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <div className="flex gap-1">
            {(
              [
                { v: 'all', label: '全部' },
                { v: 'image', label: '图片' },
                { v: 'video', label: '视频' },
                { v: 'element', label: '组件' },
              ] as { v: KindFilter; label: string }[]
            ).map((k) => (
              <button
                key={k.v}
                type="button"
                onClick={() => {
                  setKind(k.v);
                  setElCat(null); // switching filter returns to the category overview
                }}
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
                { v: 'grid', icon: LayoutGrid, title: '卡片式' },
                { v: 'list', icon: List, title: '列表式' },
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
                  <div className="text-ink-3 truncate text-[11px]">{g.prompt || t('生成中…')}</div>
                  <div className="text-ink-4 text-[10px]">{(genKindRef.current.get(g.id) ?? 'image') === 'video' ? t('生成视频中') : t('生成图片中')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {loading && items.length === 0 ? (
          <div className="text-ink-4 flex items-center justify-center gap-2 pt-10 text-[11.5px]">
            <Loader2 size={13} className="animate-spin" /> {t('加载素材…')}
          </div>
        ) : shown.length === 0 && pendingJobs.length === 0 ? (
          <div className="text-ink-4 pt-10 text-center text-[11.5px]">
            {items.length === 0 ? (
              <>
                {t('素材库还是空的')}
                <br />
                {t('上传图片/视频,或点「生成」造一个')}
              </>
            ) : (
              t('没有匹配的素材，换个词试试')
            )}
          </div>
        ) : kind === 'element' && !q.trim() ? (
          // Element category browsing: "Mine" first; overview shows one row of two cards per category, header right-arrow opens detail
          elCat ? (
            <div>
              <button
                type="button"
                onClick={() => setElCat(null)}
                className="text-ink-2 hover:text-ink mb-2 flex items-center gap-1 text-[12px] font-medium"
              >
                <ChevronLeft size={13} /> {elCat === '我的' ? t('我的') : (themeGroups.find((g) => g.id === elCat)?.title ?? elCat)}
                <span className="text-ink-4 font-normal">
                  · {(elCat === '我的' ? mineItems : (themeGroups.find((g) => g.id === elCat)?.items ?? [])).length}
                </span>
              </button>
              {elCat === '我的' && mineItems.length === 0 ? (
                <div className="text-ink-4 border-line rounded-md border border-dashed px-3 py-6 text-center text-[10.5px]">
                  {t('还没有自己的组件')}
                  <br />
                  {t('画布选中组件「存为组件」,或点「生成」做一个')}
                </div>
              ) : (
                <div className="columns-2 gap-1.5">
                  {(elCat === '我的' ? mineItems : (themeGroups.find((g) => g.id === elCat)?.items ?? [])).map(gridCard)}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3.5">
              {[{ id: '我的', title: t('我的'), items: mineItems }, ...themeGroups].map((g) => (
                <section key={g.id}>
                  <button
                    type="button"
                    onClick={() => setElCat(g.id)}
                    className="text-ink-2 hover:text-ink mb-1.5 flex w-full items-center justify-between text-[12px] font-medium"
                  >
                    <span>
                      {g.title}
                      <span className="text-ink-4 ml-1 font-normal">{g.items.length}</span>
                    </span>
                    <ChevronRight size={13} />
                  </button>
                  {g.items.length === 0 ? (
                    <div className="text-ink-4 border-line rounded-md border border-dashed px-3 py-4 text-center text-[10.5px]">
                      {t('画布选中组件「存为组件」,或点「生成」做一个')}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 items-start gap-1.5">{g.items.slice(0, 2).map(gridCard)}</div>
                  )}
                </section>
              ))}
            </div>
          )
        ) : view === 'grid' ? (
          // Masonry: CSS columns, cards laid out by true aspect ratio, two staggered columns
          <div className="columns-2 gap-1.5">{shown.map(gridCard)}</div>
        ) : (
          <div className="divide-line divide-y">
            {shown.map((it) => (
              <div key={it.id} className="hover:bg-panel-2 group flex w-full items-center gap-2 px-3 py-1.5 transition">
                <button
                  type="button"
                  title={t('预览：{label}（拖到画面上可插入）', { label: it.label })}
                  onClick={() => setPreview(it)}
                  {...dragProps(it)}
                  className="flex min-w-0 flex-1 cursor-zoom-in items-center gap-2 text-left"
                >
                  <RowThumb item={it} />
                  <div className="min-w-0 flex-1">
                    <div className="text-ink truncate text-[11px]">{it.label}</div>
                    <div className="text-ink-4 flex items-center gap-1 text-[10px]">
                      {it.kind === 'video' ? <Clapperboard size={9} /> : it.kind === 'element' ? <Sparkles size={9} /> : <ImageIcon size={9} />}
                      {it.origin === 'preset' ? (studioLocale() === 'en' ? 'Theme' : '主题') : it.kind === 'element' ? t('组件') : it.origin === 'gen' ? t('生成') : t('上传')}
                      {it.createdAt ? ` · ${new Date(it.createdAt).toLocaleDateString()}` : ''}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  title={t('插入到画面')}
                  onClick={() => insertOf(it)}
                  className="bg-accent hidden shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-white group-hover:inline-flex"
                >
                  <Plus size={9} /> {t('插入')}
                </button>
                {it.deletable && (
                  <button
                    type="button"
                    title={t('删除素材')}
                    aria-label={t('删除素材')}
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
          onInsert={() => {
            insertOf(preview);
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}

/** Large asset preview: click backdrop / Esc to close; bottom has an "Insert into canvas" shortcut.
 *  Full-res URLs aren't small, so show a "Loading" placeholder until ready. */
function AssetLightbox({ item, comp, onClose, onInsert }: { item: LibraryItem; comp: Composition; onClose: () => void; onInsert: () => void }) {
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
      aria-label={t('关闭预览')}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex cursor-zoom-out flex-col items-center justify-center gap-3 bg-black/70 p-6"
    >
      <div
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        className="relative cursor-default overflow-hidden rounded-lg bg-black/60 shadow-2xl"
        // width = min(viewport margin, 78vh×ratio) → height stays ≤78vh, placeholder matches final size
        style={{ aspectRatio: ar, width: `min(calc(100vw - 6rem), calc(78vh * ${ar}))` }}
      >
        {!ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/85">
            <Loader2 size={26} className="animate-spin" />
            <span className="text-[12px]">{t('加载中…')}</span>
          </div>
        )}
        {item.kind === 'element' && item.element ? (
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
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onInsert();
        }}
        className="bg-accent inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-medium text-white"
      >
        <Plus size={13} /> {t('插入到画面')}
      </button>
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

/** List row thumbnail (small square); elements use an icon placeholder (an iframe shrunk to 36px is pointless). */
function RowThumb({ item: it }: { item: LibraryItem }) {
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
