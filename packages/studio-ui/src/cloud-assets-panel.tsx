'use client';

/**
 * Cloud assets — the user's personal CLOUD library: uploads (/api/me/materials) + generated
 * images/videos (/api/create studio space history) + saved elements (element-history), merged
 * into one reverse-chronological grid distinguished by origin. Pending gens hold a placeholder
 * at the top and turn into assets in place after 4s polling.
 *
 * Official/curated content (kit components, stickers, BGM) lives in OfficialAssetsPanel;
 * the current project's local, never-uploaded media lives in MyAssetsPanel.
 *
 * Generation isn't a separate panel — the header has one "Generate" entry (the popover
 * lives in workbench, raised via onOpenGen); closing it bumps genRefreshTick to refetch.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Image as ImageIcon, LayoutGrid, List, Loader2, Music, Plus, Search, Sparkles, Trash2, Upload } from 'lucide-react';
import { imageThumb } from '@pireel/ui/image-url';
import { studioProviders } from '@pireel/studio-engine/providers';
import { toast } from '@pireel/ui/toast';
import { confirm } from '@pireel/ui/confirm';
import type { Composition, MediaRef } from '@pireel/studio-engine/composition';
import { type GenJob, listStudioGens, pollCreation } from './gen-api';
import { type ElementEntry, type GenElementResult, loadElementEntries, removeElementEntry, syncElementEntries } from './element-history';
import {
  AssetCard,
  AssetLightbox,
  type LibraryItem,
  type PanelDragAsset,
  type PanelMediaAsset,
  RowThumb,
  dimsOf,
  dragPropsFor,
  useAudioPreview,
} from './asset-card';
import type { GenType } from './assets-panel';
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

type KindFilter = 'all' | 'image' | 'video' | 'audio' | 'element';
type ViewMode = 'grid' | 'list';

const VIEW_KEY = 'studio.assetsPanel.view';

/** Measure a local file's natural dims before upload (instant, no network) → persist so the grid/insert can reuse. */
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

export function CloudAssetsPanel({
  comp,
  onInsert,
  onInsertClip,
  onInsertElement,
  onDragAsset,
  onOpenGen,
  onUseAudio,
  genRefreshTick = 0,
}: {
  /** Element lightbox live preview needs theme/canvas (BlockPreviewFrame). */
  comp: Composition;
  onInsert: (asset: MediaRef, label?: string, dims?: { w: number; h: number }) => void;
  /** Click-insert default for image/video: MAIN TRACK at the playhead (drag targets the stage). */
  onInsertClip?: (asset: PanelMediaAsset) => void;
  /** Insert an element (seedId re-scoping and empty-slot backfill happen on the insert side). */
  onInsertElement: (el: GenElementResult, prompt: string) => void;
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
  const { playingUrl: audioPlaying, toggle: toggleAudio } = useAudioPreview();
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

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => (kind === 'all' || it.kind === kind) && (!needle || it.label.toLowerCase().includes(needle)));
  }, [items, kind, q]);

  const pendingJobs = useMemo(
    () =>
      gens.filter((g) => {
        if (g.status !== 'pending') return false;
        const k = genKindRef.current.get(g.id) ?? 'image';
        return kind === 'all' || kind === k;
      }),
    [gens, kind],
  );

  /** Kind icon + origin label: same badge vocabulary in the list row meta line. */
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

  const insertOf = (it: LibraryItem) => {
    if (it.kind === 'element') {
      if (it.element) onInsertElement(it.element, it.prompt ?? it.label);
      return;
    }
    if (it.kind === 'audio') {
      if (it.insertUrl) onUseAudio?.(it.insertUrl, it.label);
      return;
    }
    if (!it.insertUrl) return;
    // Click-insert default = MAIN TRACK (video whole-segment, image still-frame clip); drag targets the stage.
    if (onInsertClip) onInsertClip({ type: it.kind as 'image' | 'video', url: it.insertUrl, label: it.label, dims: dimsOf(it) });
    else onInsert({ type: it.kind as 'image' | 'video', url: it.insertUrl }, it.label, dimsOf(it));
  };

  const gridCard = (it: LibraryItem) => (
    <AssetCard
      key={it.id}
      item={it}
      playing={it.kind === 'audio' && audioPlaying === it.insertUrl}
      onActivate={() => activate(it)}
      onInsert={() => insertOf(it)}
      onDelete={it.deletable ? () => void doDelete(it) : undefined}
      dragProps={dragPropsFor(it, onDragAsset)}
      insertLabel={insertLabel(it)}
    />
  );

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
        ) : view === 'grid' ? (
          // Uniform grid: fixed 120×68 cards (the rail's DEFAULT width is computed to fit whole
          // columns); thumbnails letterbox non-16:9 media centered and fully visible.
          <div className="grid grid-cols-[repeat(auto-fill,120px)] gap-2.5">{shown.map(gridCard)}</div>
        ) : (
          <div className="divide-line divide-y">
            {shown.map((it) => (
              <div key={it.id} className="hover:bg-panel-2 group flex w-full items-center gap-2 px-3 py-1.5 transition">
                <button
                  type="button"
                  title={it.kind === 'audio' ? it.label : t('panels.previewLabelDragOnto', { label: it.label })}
                  aria-label={it.kind === 'audio' ? (audioPlaying === it.insertUrl ? t('panels.pauseAudio') : t('panels.playAudio')) : undefined}
                  onClick={() => activate(it)}
                  {...dragPropsFor(it, onDragAsset)}
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
          onInsert={() => {
            insertOf(preview);
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}
