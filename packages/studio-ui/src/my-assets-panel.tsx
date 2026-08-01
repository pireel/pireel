'use client';

/**
 * My assets — the CURRENT PROJECT's local media (video / image / audio), never uploaded.
 *
 * STATE MODEL (two pieces, everything else is derived):
 *  - `reg` — the per-project import registry ({sig, label, dims, createdAt}[]), mirrored to
 *    localStorage through ONE writer (updateReg). It remembers WHICH files, never bytes.
 *  - `links` — sig → live blob URL for registry entries whose bytes are currently reachable
 *    (native handle / OPFS via loadLocalVideo). Rehydrated on mount; a registry entry without
 *    a link renders as a "click to restore" card (the click is the permission re-grant gesture).
 *  Track sources are derived from comp every render and never stored. One file = one card, and the
 *  IMPORT card represents the asset (an inserted image stays an image card — its derived 5s still
 *  clip is an implementation detail); track cards only show for sources without a live import twin,
 *  and an on-track import's delete also runs the track surgery (trackSrcBySig).
 *
 * ONE add path (addEntries: native picker handle = zero-copy, <input> fallback = OPFS copy),
 * ONE removal path (evict: handle + OPFS bytes + registry entry + link; doDelete = confirm +
 * track surgery + evict), ONE insert payload (mediaOf: click-insert defaults to the MAIN
 * TRACK via onInsertClip, dragging is what targets the stage/other lanes).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, FolderOpen, Image as ImageIcon, Loader2, Music, Trash2, Upload } from 'lucide-react';
import { toast } from '@pireel/ui/toast';
import { confirm } from '@pireel/ui/confirm';
import type { Composition, MediaRef } from '@pireel/studio-engine/composition';
import {
  AssetCard,
  AssetLightbox,
  type LibraryItem,
  type PanelDragAsset,
  type PanelMediaAsset,
  dimsOf,
  dragPropsFor,
  useAudioPreview,
} from './asset-card';
import { audioCoverUrl, fileSig } from './media';
import { deleteLocalVideo, loadLocalVideo, saveLocalVideo } from './local-media';
import { t } from './i18n';

type KindFilter = 'all' | 'image' | 'video' | 'audio';

/** File System Access picker (Chromium) — typed minimally; absence = fall back to <input type=file>. */
type ShowOpenFilePicker = (opts?: {
  multiple?: boolean;
  types?: { description?: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle[]>;

type LocalKind = 'video' | 'image' | 'audio';
const EXT_KIND: [RegExp, LocalKind][] = [
  [/\.(mp4|mov|webm|m4v|mkv|avi)$/i, 'video'],
  [/\.(jpe?g|png|webp|gif|avif|bmp)$/i, 'image'],
  [/\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i, 'audio'],
];
/** MIME first, extension fallback: the OS hands over an EMPTY type for plenty of real files (.mov
 *  is the notorious one) — the main-video picker has always had this fallback, imports get it too. */
const kindOf = (f: File): LocalKind | null => {
  for (const k of ['video', 'image', 'audio'] as const) if (f.type.startsWith(`${k}/`)) return k;
  for (const [re, k] of EXT_KIND) if (re.test(f.name)) return k;
  return null;
};

/** srcSig = name:size:lastModified — recover the filename part (it may itself contain colons). */
const sigName = (sig: string) => sig.split(':').slice(0, -2).join(':') || sig;

/** One import-registry entry: WHICH file (identity + display facts), never bytes. */
interface RegEntry {
  sig: string;
  label: string;
  /** Absent on legacy entries = video. */
  kind?: LocalKind;
  w?: number | null;
  h?: number | null;
  createdAt: number;
}
const regKey = (pid: string) => `studio.localAssets.${pid}`;
const readReg = (pid?: string): RegEntry[] => {
  if (!pid || typeof window === 'undefined') return [];
  try {
    const v = JSON.parse(window.localStorage.getItem(regKey(pid)) ?? '[]') as RegEntry[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

/** Missing-source card (per-asset, dashed): click = restore access (permission re-grant / vault / re-pick), hover ✕ = drop. */
function RestoreTile({ label, kind = 'video', onRestore, onDelete }: { label: string; kind?: LocalKind; onRestore: () => void; onDelete: () => void }) {
  const Icon = kind === 'image' ? ImageIcon : kind === 'audio' ? Music : Clapperboard;
  return (
    <div className="border-line hover:border-accent group relative w-full overflow-hidden rounded-md border border-dashed transition">
      <button type="button" onClick={onRestore} title={t('panels.localReconnect')} className="block w-full text-left">
        <div className="bg-panel-2 flex aspect-video flex-col items-center justify-center gap-1">
          <Icon size={16} className="text-ink-4" />
          <span className="text-ink-4 text-[10px]">{t('panels.localReconnect')}</span>
        </div>
        <div className="text-ink-3 h-6 truncate px-1.5 py-1 text-[10px] leading-4">{label}</div>
      </button>
      <button
        type="button"
        onClick={onDelete}
        title={t('panels.deleteAsset')}
        aria-label={t('panels.deleteAsset')}
        className="absolute left-1 top-1 hidden h-5 w-5 items-center justify-center rounded bg-black/55 text-white hover:bg-red-600 group-hover:inline-flex"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}

/** Measure local media's natural dims (instant, no network) so cards/insert get a real AR. */
const mediaDims = (url: string, kind: LocalKind): Promise<{ w: number; h: number } | null> =>
  new Promise((res) => {
    if (kind === 'audio') return res(null);
    if (kind === 'image') {
      const im = new Image();
      im.onload = () => res(im.naturalWidth > 0 && im.naturalHeight > 0 ? { w: im.naturalWidth, h: im.naturalHeight } : null);
      im.onerror = () => res(null);
      im.src = url;
      return;
    }
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => res(v.videoWidth > 0 && v.videoHeight > 0 ? { w: v.videoWidth, h: v.videoHeight } : null);
    v.onerror = () => res(null);
    v.src = url;
  });

export function MyAssetsPanel({
  comp,
  projectId,
  videoSig,
  onDeleteAsset,
  isSrcLive,
  onReconnectSource,
  onInsert,
  onInsertClip,
  onUseAudio,
  onDragAsset,
}: {
  /** Lightbox preview needs theme/canvas context. */
  comp: Composition;
  /** Scopes the import registry (imports persist per project across refreshes). */
  projectId?: string;
  /** First-loaded source's fileSig (workbench-held, not in comp) — labels it by filename + keys its eviction. */
  videoSig?: string | null;
  /** Delete a source from the TRACK too (workbench-side comp surgery: every shot cut from it goes). null = the main source. */
  onDeleteAsset?: (src: string | null) => void;
  /** Per-asset liveness of a track source's bytes in this session (workbench-held Files). */
  isSrcLive?: (url: string) => boolean;
  /** Per-asset reconnect for a track source whose bytes are missing (handle/OPFS/vault → re-pick). null = main. */
  onReconnectSource?: (src: string | null, sig?: string | null) => void;
  /** Stage-side insert (media block) — fallback when no onInsertClip is wired. */
  onInsert: (asset: MediaRef, label?: string, dims?: { w: number; h: number }) => void;
  /** Click-insert default: MAIN TRACK at the playhead (drag is what targets the stage/other lanes). */
  onInsertClip?: (asset: PanelMediaAsset) => void;
  /** Audio asset's primary action: mount on the music lane (workbench → use-bgm). sig = local byte identity. */
  onUseAudio?: (url: string, label?: string, sig?: string | null) => void;
  onDragAsset?: (asset: PanelDragAsset | null) => void;
}) {
  const [kind, setKind] = useState<KindFilter>('all');
  const [reg, setReg] = useState<RegEntry[]>(() => readReg(projectId));
  const [links, setLinks] = useState<ReadonlyMap<string, string>>(new Map());
  /** sig → embedded cover art object URL (audio only) — derived whenever the File is in hand. */
  const [covers, setCovers] = useState<ReadonlyMap<string, string>>(new Map());
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<LibraryItem | null>(null);
  const { playingUrl: audioPlaying, toggle: toggleAudio } = useAudioPreview();
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  /** THE registry writer: ref mirror → storage → state, in that order, outside any React updater
   *  (updaters must stay pure). Nobody else touches storage. */
  const regRef = useRef(reg);
  const updateReg = (fn: (r: RegEntry[]) => RegEntry[]) => {
    const next = fn(regRef.current);
    regRef.current = next;
    if (projectId) {
      try {
        window.localStorage.setItem(regKey(projectId), JSON.stringify(next));
      } catch {
        /* private mode: imports just stay session-scoped */
      }
    }
    setReg(next);
  };

  const link = (sig: string, url: string) => setLinks((prev) => new Map(prev).set(sig, url));
  const noteCover = (sig: string, f: File, k: LocalKind) => {
    if (k !== 'audio') return;
    void audioCoverUrl(f).then((u) => u && setCovers((prev) => new Map(prev).set(sig, u)));
  };
  const unlink = (sig: string) =>
    setLinks((prev) => {
      const url = prev.get(sig);
      if (!url) return prev;
      URL.revokeObjectURL(url);
      const next = new Map(prev);
      next.delete(sig);
      return next;
    });

  // Refresh rehydrate: try every registry entry once (non-gesture — permission-pending handles
  // simply stay unlinked and render as restore cards). blob URL over the File is a reference, not a copy.
  useEffect(() => {
    let dead = false;
    const entries = readReg(projectId);
    regRef.current = entries;
    setReg(entries);
    setLinks(new Map());
    void (async () => {
      for (const e of entries) {
        const f = await loadLocalVideo(e.sig);
        if (dead) return;
        if (f) {
          link(e.sig, URL.createObjectURL(f));
          noteCover(e.sig, f, e.kind ?? 'video');
        }
      }
    })();
    return () => {
      dead = true;
    };
  }, [projectId]);

  // ---- derived ---------------------------------------------------------------------------------

  // Loaded track sources, all equal footing — one card per unique source, labeled by filename, each
  // carrying ITS OWN liveness (missing source = per-asset restore card, never a project-level state).
  // The main source is addressed as src=null and listed even when its bytes are gone (sig anchor +
  // src-less shots still referencing it).
  interface TrackCard {
    it: LibraryItem;
    src: string | null;
    live: boolean;
  }
  const trackCards = useMemo<TrackCard[]>(() => {
    const out: TrackCard[] = [];
    if (comp.video || (videoSig && (comp.shots ?? []).some((s) => !s.src))) {
      const url = comp.video?.url;
      out.push({
        src: null,
        live: url ? (isSrcLive?.(url) ?? true) : false,
        it: {
          id: 'src:main',
          kind: 'video',
          origin: 'upload',
          insertUrl: url,
          thumbSrc: null,
          label: videoSig ? sigName(videoSig) : t('panels.video'),
          createdAt: 0,
          deletable: true,
          sig: videoSig,
        },
      });
    }
    const seen = new Set<string>();
    for (const s of comp.shots ?? []) {
      if (!s.src) continue;
      // One card per FILE, not per insert: the same asset inserted N times gets N object URLs, so
      // dedupe by sig first (src only for sig-less remote sources).
      const key = s.srcSig ?? s.src;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        src: s.src,
        live: isSrcLive?.(s.src) ?? true,
        it: {
          id: `src:${s.src}`,
          kind: 'video',
          origin: 'upload',
          insertUrl: s.src,
          thumbSrc: null,
          label: s.srcSig ? sigName(s.srcSig) : t('panels.video'),
          createdAt: 0,
          deletable: true,
          sig: s.srcSig,
        },
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp.video, comp.shots, videoSig]);

  /** sig → the track src it appears as (null = the main source). Lets an IMPORT card represent an
   *  on-track asset: its delete also does the track surgery via this mapping. */
  const trackSrcBySig = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const c of trackCards) if (c.it.sig) m.set(c.it.sig, c.src);
    return m;
  }, [trackCards]);
  /** Imports, split by whether their bytes are reachable right now. THE IMPORT CARD REPRESENTS the
   *  asset even when it's on the track (an inserted image must stay an image card — the derived 5s
   *  still is an implementation detail); the matching track card is hidden instead. Restore cards
   *  only show for sigs the track doesn't already present. */
  const { liveImports, restoreCards } = useMemo(() => {
    const live: LibraryItem[] = [];
    const restore: RegEntry[] = [];
    for (const e of reg) {
      const url = links.get(e.sig);
      if (url)
        live.push({
          id: `import:${e.sig}`,
          kind: e.kind ?? 'video',
          origin: 'upload',
          insertUrl: url,
          thumbSrc: (e.kind ?? 'video') === 'image' ? url : (e.kind === 'audio' ? (covers.get(e.sig) ?? null) : null),
          label: e.label,
          createdAt: e.createdAt,
          width: e.w ?? null,
          height: e.h ?? null,
          deletable: true,
          sig: e.sig,
        });
      else if (!trackSrcBySig.has(e.sig)) restore.push(e); // on-track: the track card presents it (incl. its missing state)
    }
    return { liveImports: live, restoreCards: restore };
  }, [reg, links, covers, trackSrcBySig]);

  const kindShows = (k: LocalKind) => kind === 'all' || kind === k;
  const hasAny = liveImports.length > 0 || trackCards.length > 0 || restoreCards.length > 0;

  // ---- add -------------------------------------------------------------------------------------

  const addEntries = async (entries: { file: File; handle?: FileSystemFileHandle }[]) => {
    if (!entries.length || importing) return;
    setImporting(true);
    try {
      for (const { file: f, handle } of entries) {
        const k = kindOf(f);
        if (!k) {
          toast.error(t('panels.localVideoOnly'));
          continue;
        }
        const sig = fileSig(f);
        const url = URL.createObjectURL(f);
        const dims = await mediaDims(url, k);
        // Handle present (Chromium picker) = zero-copy: only the handle is persisted, reads come
        // straight from disk. Handle-less (input fallback) = byte copy into the OPFS library.
        // AWAITED: an insert right after import must find the sig lane warm — a miss silently
        // degrades it to the fetch lane, which used to mint a second identity (duplicate cards).
        await saveLocalVideo(f, sig, handle).catch(() => {});
        updateReg((r) => [
          { sig, label: f.name, kind: k, w: dims?.w ?? null, h: dims?.h ?? null, createdAt: Date.now() },
          ...r.filter((x) => x.sig !== sig),
        ]);
        link(sig, url);
        noteCover(sig, f, k);
      }
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  /** Import: native picker first (handle = read the user's folder in place, no copy); <input> fallback elsewhere. */
  const pickImport = async () => {
    const picker = (window as { showOpenFilePicker?: ShowOpenFilePicker }).showOpenFilePicker;
    if (!picker) {
      inputRef.current?.click();
      return;
    }
    let handles: FileSystemFileHandle[];
    try {
      handles = await picker({
        multiple: true,
        types: [
          { description: 'Media', accept: {
            'video/*': ['.mp4', '.mov', '.webm', '.m4v', '.mkv'],
            'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'],
            'audio/*': ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'],
          } },
        ],
      });
    } catch {
      return; // cancelled (or picker unavailable in this context)
    }
    await addEntries(await Promise.all(handles.map(async (h) => ({ file: await h.getFile(), handle: h }))));
  };

  /** Folder import: authorize a directory (Chromium), import its top-level media files — each file
   *  gets its own native handle, so persistence/restore work exactly like single-file imports.
   *  Fallback elsewhere: <input webkitdirectory> (files only, OPFS copies). */
  const FOLDER_CAP = 50;
  const pickFolder = async () => {
    const picker = (window as { showDirectoryPicker?: (o?: { mode?: 'read' }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
    if (!picker) {
      folderInputRef.current?.click();
      return;
    }
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await picker({ mode: 'read' });
    } catch {
      return; // cancelled
    }
    const entries: { file: File; handle?: FileSystemFileHandle }[] = [];
    try {
      const iter = (dir as unknown as { values: () => AsyncIterable<FileSystemFileHandle & { kind: string }> }).values();
      for await (const h of iter) {
        if (h.kind !== 'file') continue;
        const f = await h.getFile().catch(() => null);
        if (f && kindOf(f)) entries.push({ file: f, handle: h });
        if (entries.length >= FOLDER_CAP) break;
      }
    } catch {
      /* iteration failed: import whatever was collected */
    }
    if (!entries.length) {
      toast.info(t('panels.folderNoMedia'));
      return;
    }
    if (entries.length >= FOLDER_CAP) toast.info(t('panels.folderCapped', { n: FOLDER_CAP }));
    await addEntries(entries);
  };

  /** Click-to-restore (user gesture): the handle may prompt for permission here. */
  const reconnect = async (e: RegEntry) => {
    const f = await loadLocalVideo(e.sig);
    if (!f) {
      toast.error(t('panels.localReconnectFailed'));
      return;
    }
    link(e.sig, URL.createObjectURL(f));
    noteCover(e.sig, f, e.kind ?? 'video');
  };

  // ---- remove ----------------------------------------------------------------------------------

  /** THE removal core: drop every local trace of a sig — native handle + OPFS bytes (forced cache
   *  eviction; other projects referencing the same file degrade to re-import/cloud), registry
   *  entry, and the live link (blob revoked). Deleted assets never resurface as restore cards. */
  const evict = (sig: string) => {
    void deleteLocalVideo(sig).catch(() => {});
    updateReg((r) => r.filter((x) => x.sig !== sig));
    unlink(sig);
    setCovers((prev) => {
      const u = prev.get(sig);
      if (!u) return prev;
      URL.revokeObjectURL(u);
      const next = new Map(prev);
      next.delete(sig);
      return next;
    });
  };

  /** Card delete: confirm, then track surgery for track members (src !== undefined; null = main —
   *  works even when its bytes are missing) + evict. Sig-less remote sources have no local traces. */
  const doDelete = async (it: LibraryItem, src?: string | null) => {
    const ok = await confirm({
      title: t('panels.deleteAssetConfirm'),
      description: t('panels.localDeleteBody'),
      tone: 'danger',
      confirmLabel: t('tools.delete_block.label'),
    });
    if (!ok) return;
    if (src !== undefined) onDeleteAsset?.(src);
    if (it.sig) evict(it.sig);
    toast.success(t('panels.deleted'));
  };

  // ---- insert ----------------------------------------------------------------------------------

  const mediaOf = (it: LibraryItem): PanelMediaAsset => ({
    type: it.kind as 'image' | 'video',
    url: it.insertUrl!,
    label: it.label,
    dims: dimsOf(it),
    sig: it.sig,
  });
  /** Primary action by kind: audio → the music lane; image/video → main-track clip (still-frame for images). */
  const insertOf = (it: LibraryItem) => {
    if (!it.insertUrl) return;
    if (it.kind === 'audio') {
      onUseAudio?.(it.insertUrl, it.label, it.sig);
      return;
    }
    if (onInsertClip) onInsertClip(mediaOf(it));
    else onInsert({ type: it.kind as 'image' | 'video', url: it.insertUrl }, it.label, dimsOf(it));
  };
  /** Card activate: audio toggles inline preview; visual media opens the lightbox. */
  const activate = (it: LibraryItem) => {
    if (it.kind === 'audio') {
      if (it.insertUrl) toggleAudio(it.insertUrl);
    } else setPreview(it);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="border-line border-b px-2.5 py-1.5">
        <div className="flex items-center gap-1">
          {(
            [
              { v: 'all', label: 'panels.all' },
              { v: 'image', label: 'panels.image' },
              { v: 'video', label: 'panels.video' },
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
          {hasAny && (
            <button
              type="button"
              onClick={() => void pickImport()}
              disabled={importing}
              title={t('panels.localOnlyHint')}
              className="border-line text-ink-2 hover:text-ink ml-auto inline-flex h-[24px] shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] disabled:opacity-40"
            >
              {importing ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
              {t('panels.upload')}
            </button>
          )}
          {hasAny && (
            <button
              type="button"
              onClick={() => void pickFolder()}
              disabled={importing}
              title={t('panels.importFolder')}
              aria-label={t('panels.importFolder')}
              className="border-line text-ink-2 hover:text-ink inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-md border disabled:opacity-40"
            >
              <FolderOpen size={12} />
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {!hasAny ? (
          // Empty project: one full-width import card carries the whole panel
          <button
            type="button"
            onClick={() => void pickImport()}
            disabled={importing}
            className="border-line hover:border-accent text-ink-4 hover:text-ink-2 flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed py-10 transition disabled:opacity-40"
          >
            {importing ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
            <div className="text-[11.5px]">{t('panels.upload')}</div>
            <div className="text-ink-4 text-[10.5px]">{t('panels.localOnlyHint')}</div>
            <span
              role="button"
              tabIndex={0}
              onClick={(ev) => {
                ev.stopPropagation();
                void pickFolder();
              }}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') {
                  ev.stopPropagation();
                  void pickFolder();
                }
              }}
              className="text-ink-3 hover:text-ink mt-1 inline-flex items-center gap-1 text-[10.5px] underline-offset-2 hover:underline"
            >
              <FolderOpen size={11} /> {t('panels.importFolder')}
            </span>
          </button>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,120px)] gap-2.5">
            {liveImports
              .filter((it) => kindShows(it.kind as LocalKind))
              .map((it) => (
                <AssetCard
                  key={it.id}
                  item={it}
                  playing={it.kind === 'audio' && audioPlaying === it.insertUrl}
                  onActivate={() => activate(it)}
                  onInsert={() => insertOf(it)}
                  onDelete={() => void doDelete(it, it.sig && trackSrcBySig.has(it.sig) ? trackSrcBySig.get(it.sig)! : undefined)}
                  dragProps={dragPropsFor(it, onDragAsset)}
                  insertLabel={it.kind === 'audio' ? t('panels.useAsBgm') : t('panels.insert')}
                />
              ))}
            {kindShows('video') &&
              trackCards
                .filter((c) => !(c.it.sig && links.has(c.it.sig))) // a live import card represents this asset
                .map((c) =>
                c.live ? (
                  <AssetCard
                    key={c.it.id}
                    item={c.it}
                    onActivate={() => activate(c.it)}
                    onInsert={() => insertOf(c.it)}
                    onDelete={() => void doDelete(c.it, c.src)}
                    dragProps={dragPropsFor(c.it, onDragAsset)}
                    insertLabel={t('panels.insert')}
                  />
                ) : (
                  // Track source whose bytes are missing on this device: per-asset restore card
                  <RestoreTile
                    key={c.it.id}
                    label={c.it.label}
                    onRestore={() => onReconnectSource?.(c.src, c.it.sig)}
                    onDelete={() => void doDelete(c.it, c.src)}
                  />
                ),
              )}
            {/* Registry entries whose bytes need a re-grant gesture (or are gone): click restores access in place */}
            {restoreCards
              .filter((e) => kindShows(e.kind ?? 'video'))
              .map((e) => (
                <RestoreTile key={`restore:${e.sig}`} label={e.label} kind={e.kind ?? 'video'} onRestore={() => void reconnect(e)} onDelete={() => evict(e.sig)} />
              ))}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="video/*,image/*,audio/*"
          multiple
          className="hidden"
          onChange={(e) => void addEntries(Array.from(e.target.files ?? []).map((file) => ({ file })))}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          {...({ webkitdirectory: '' } as Record<string, string>)}
          onChange={(e) =>
            void addEntries(
              Array.from(e.target.files ?? [])
                .filter((f) => kindOf(f))
                .slice(0, FOLDER_CAP)
                .map((file) => ({ file })),
            )
          }
        />
      </div>
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
