'use client';

/**
 * Library — personal uploads across projects (/api/me/materials) + project components
 * (element-history), merged into one reverse-chronological grid distinguished by origin.
 *
 * Host-curated content is injected separately through StudioShell. The current project's media —
 * imports AND generated outputs — lives in MyAssetsPanel (the project media directory).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Search, SlidersHorizontal, Upload } from 'lucide-react';
import { imageThumb } from '@pireel/ui/image-url';
import { studioProviders } from '@pireel/studio-engine/providers';
import { toast } from '@pireel/ui/toast';
import { confirm } from '@pireel/ui/confirm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@pireel/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pireel/ui/dialog';
import type { Composition, MediaRef } from '@pireel/studio-engine/composition';
import {
  addElementEntry,
  type ElementEntry,
  type GenElementResult,
  loadElementEntries,
  removeElementEntry,
  syncElementEntries,
} from './element-history';
import {
  AssetCard,
  AssetLightbox,
  type LibraryItem,
  type PanelDragAsset,
  type PanelMediaAsset,
  RESPONSIVE_ASSET_CARD_GRID,
  dimsOf,
  dragPropsFor,
  useAudioPreview,
} from './asset-card';
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
const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'panels.all' },
  { value: 'image', label: 'panels.image' },
  { value: 'video', label: 'panels.video' },
  { value: 'element', label: 'panels.element' },
  { value: 'audio', label: 'panels.music' },
];
const CLOUD_FILTER_ITEM_CLASS = 'pl-2 text-[10.5px] data-[state=checked]:bg-panel-2 data-[state=checked]:text-ink [&>span:first-child]:hidden';
const CLOUD_ASSET_LABEL_MAX_LENGTH = 80;

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
    // Rows store BARE keys by convention; every kind resolves through imageThumb ('original'
    // = cdn prefix, no transform) — audio once bypassed it and 404'd as a relative path.
    insertUrl: imageThumb(it.url, 'original'),
    thumbSrc: it.thumb_url ?? (it.kind === 'image' ? it.url : null),
    label: it.label ?? (it.kind === 'video' ? t('panels.untitledVideo') : t('panels.untitledImage')),
    createdAt: it.created_at ?? 0,
    width: it.width,
    height: it.height,
    deletable: true,
    uploadId: it.id,
  };
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
  projectId,
  onInsert,
  onInsertClip,
  onInsertElement,
  onDragAsset,
  onUseAudio,
  genRefreshTick = 0,
}: {
  /** Element lightbox live preview needs theme/canvas (BlockPreviewFrame). */
  comp: Composition;
  /** Generated assets and components are isolated to this Studio project. */
  projectId: string;
  onInsert: (asset: MediaRef, label?: string, dims?: { w: number; h: number }) => void;
  /** Click-insert default for image/video: MAIN TRACK at the playhead (drag targets the stage). */
  onInsertClip?: (asset: PanelMediaAsset) => void;
  /** Insert an element (seedId re-scoping and empty-slot backfill happen on the insert side). */
  onInsertElement: (el: GenElementResult, prompt: string) => void;
  /** Drag out an asset (asset on dragstart, null on dragend) — workbench uses this to overlay a drop layer on stage/timeline. */
  onDragAsset?: (asset: PanelDragAsset | null) => void;
  /** Audio asset's primary action: mount as the background-music bed (workbench → use-bgm). */
  onUseAudio?: (url: string, label?: string) => void;
  /** Bumped when the generate popover closes → refetch gen history/elements. */
  genRefreshTick?: number;
}) {
  const [kind, setKind] = useState<KindFilter>('all');
  const { playingUrl: audioPlaying, toggle: toggleAudio } = useAudioPreview();
  const [q, setQ] = useState('');
  const [uploads, setUploads] = useState<LibraryItem[]>([]);
  const [elements, setElements] = useState<ElementEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<LibraryItem | null>(null);
  const [renaming, setRenaming] = useState<LibraryItem | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
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
    setElements(loadElementEntries(projectId));
    void syncElementEntries(projectId).then((merged) => {
      if (merged && !gone) setElements(merged);
    });
    return () => {
      gone = true;
    };
  }, [genRefreshTick, projectId]);

  const items = useMemo(
    () => [...uploads, ...elements.map(elementToItem)].sort((a, b) => b.createdAt - a.createdAt),
    [uploads, elements],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => (kind === 'all' || it.kind === kind) && (!needle || it.label.toLowerCase().includes(needle)));
  }, [items, kind, q]);


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
      removeElementEntry(projectId, it.id.slice(3)); // strip 'el:' prefix
      setElements(loadElementEntries(projectId));
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

  const beginRename = (it: LibraryItem) => {
    setRenaming(it);
    setRenameDraft(it.label);
  };

  const commitRename = async () => {
    if (!renaming) return;
    const label = renameDraft.trim().slice(0, CLOUD_ASSET_LABEL_MAX_LENGTH);
    if (!label || label === renaming.label) return;

    if (renaming.kind === 'element') {
      const id = renaming.id.slice(3);
      const entry = elements.find((candidate) => candidate.id === id);
      if (!entry) return;
      addElementEntry(projectId, {
        ...entry,
        element: { ...entry.element, label },
      });
      setElements(loadElementEntries(projectId));
      setPreview((current) => (current?.id === renaming.id ? { ...current, label } : current));
      setRenaming(null);
      setRenameDraft('');
      toast.success(t('panels.assetRenamed'));
      return;
    }

    if (!renaming.uploadId) return;
    const uploadId = renaming.uploadId;
    setUploads((current) => current.map((item) => (item.uploadId === uploadId ? { ...item, label } : item)));
    setPreview((current) => (current?.uploadId === uploadId ? { ...current, label } : current));
    setRenaming(null);
    setRenameDraft('');
    try {
      const response = await fetch(`/api/me/uploads/${encodeURIComponent(uploadId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      if (!response.ok) throw new Error(String(response.status));
      toast.success(t('panels.assetRenamed'));
    } catch {
      setUploads((current) =>
        current.map((item) => (item.uploadId === uploadId ? { ...item, label: renaming.label } : item)),
      );
      setPreview((current) => (current?.uploadId === uploadId ? renaming : current));
      toast.error(t('panels.renameAssetFailed'));
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
      onRename={it.deletable && (it.uploadId || it.kind === 'element') ? () => beginRename(it) : undefined}
      onDelete={it.deletable ? () => void doDelete(it) : undefined}
      dragProps={dragPropsFor(it, onDragAsset)}
      insertLabel={insertLabel(it)}
    />
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center px-2.5">
        <div className="flex w-full items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={t('panels.filterAssets')}
                aria-label={t('panels.filterAssets')}
                className={`border-line hover:text-ink inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition ${
                  kind === 'all' ? 'text-ink-3' : 'bg-panel-2 text-ink'
                }`}
              >
                <SlidersHorizontal size={12} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={5} className="min-w-[128px]">
              <DropdownMenuRadioGroup value={kind} onValueChange={(value) => setKind(value as KindFilter)}>
                {KIND_FILTERS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value} className={CLOUD_FILTER_ITEM_CLASS}>
                    {t(option.label)}
                    {kind === option.value && <Check size={10} className="ml-auto shrink-0" />}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <label className="border-line focus-within:border-accent relative min-w-0 flex-1 rounded-md border transition">
            <Search size={11} className="text-ink-4 pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('panels.searchAssets')}
              aria-label={t('panels.searchAssetsLabel')}
              className="text-ink placeholder:text-ink-4 h-[24px] w-full bg-transparent pl-5.5 pr-1.5 text-[11px] outline-none"
            />
          </label>

          <button
            type="button"
            onClick={() => void doUpload()}
            disabled={uploading}
            title={t('panels.uploadAsset')}
            aria-label={t('panels.uploadAsset')}
            className="border-line text-ink-2 hover:text-ink inline-flex h-[24px] shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-[11px] disabled:opacity-40"
          >
            {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
            {t('panels.upload')}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {loading && items.length === 0 ? (
          <div className="text-ink-4 flex items-center justify-center gap-2 pt-10 text-[11.5px]">
            <Loader2 size={13} className="animate-spin" /> {t('panels.loadingAssets')}
          </div>
        ) : shown.length === 0 ? (
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
        ) : (
          // Shared responsive grid (same as Official/Generation): compact 88px floor that
          // stretches to fill the panel; thumbnails letterbox non-16:9 media centered.
          <div className={RESPONSIVE_ASSET_CARD_GRID}>{shown.map(gridCard)}</div>
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
      <Dialog
        open={Boolean(renaming)}
        onOpenChange={(open) => {
          if (!open) {
            setRenaming(null);
            setRenameDraft('');
          }
        }}
      >
        <DialogContent className="bg-panel border-line w-[min(420px,calc(100vw-2rem))] gap-3 p-4">
          <DialogHeader className="pr-7">
            <DialogTitle className="text-ink text-[14px]">{t('panels.renameAsset')}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void commitRename();
            }}
            className="grid gap-3"
          >
            <label className="grid gap-1.5">
              <span className="text-ink-2 text-[11px] font-medium">{t('panels.assetName')}</span>
              <input
                autoFocus
                value={renameDraft}
                maxLength={CLOUD_ASSET_LABEL_MAX_LENGTH}
                onChange={(event) => setRenameDraft(event.target.value)}
                placeholder={t('panels.assetNamePlaceholder')}
                className="border-line bg-panel-2 text-ink placeholder:text-ink-4 focus:border-accent h-8 w-full rounded-md border px-2.5 text-[12px] outline-none transition-colors"
              />
            </label>
            <DialogFooter className="mt-1 flex-row justify-end gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setRenaming(null);
                  setRenameDraft('');
                }}
                className="border-line text-ink-2 hover:bg-panel-2 h-7 rounded-md border px-3 text-[11px]"
              >
                {t('panels.cancel')}
              </button>
              <button
                type="submit"
                disabled={!renameDraft.trim() || renameDraft.trim() === renaming?.label}
                className="bg-ink text-bg h-7 rounded-md px-3 text-[11px] font-medium disabled:pointer-events-none disabled:opacity-35"
              >
                {t('panels.saveName')}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
