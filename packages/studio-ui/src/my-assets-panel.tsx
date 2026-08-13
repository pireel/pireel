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
import { Check, Clapperboard, FolderOpen, Image as ImageIcon, Loader2, MoreHorizontal, Music, Search, SlidersHorizontal, Trash2, Upload } from 'lucide-react';
import { toast } from '@pireel/ui/toast';
import { confirm } from '@pireel/ui/confirm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@pireel/ui/dropdown-menu';
import type { Composition, MediaRef } from '@pireel/studio-engine/composition';
import type { LocalAssetIndexEntry } from '@pireel/studio-engine/project-dto';
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
import { audioCoverUrl, fileSig } from './media';
import {
  deleteLocalFolderHandle,
  deleteLocalVideo,
  getLocalFolderHandle,
  loadLocalFolderFile,
  loadLocalVideo,
  requestLocalFolderAccess,
  saveLocalFolderHandle,
} from './local-media';
import {
  localAssetIndexEntry,
  localAssetKindOf,
  loopbackImportUrl,
  runLocalImportSession,
  type BrowserLocalImportSource,
  type LocalAssetKind,
} from './local-import-session';
import {
  folderImportTriggerProps,
  groupFolderRestoreEntries,
  pendingLocalAssetEntries,
  reconcileLocalAssetRegistry,
  triggerFolderInput,
  type FolderRestoreGroup,
} from './local-asset-folders';
import { useLocalVisualModel } from './local-visual-search-model';
import { t } from './i18n';

type KindFilter = 'all' | 'image' | 'video' | 'audio';
const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'panels.all' },
  { value: 'image', label: 'panels.image' },
  { value: 'video', label: 'panels.video' },
  { value: 'audio', label: 'panels.music' },
];
const LOCAL_FILTER_ITEM_CLASS = 'pl-2 text-[10.5px] data-[state=checked]:bg-panel-2 data-[state=checked]:text-ink [&>span:first-child]:hidden';

/** File System Access picker (Chromium) — typed minimally; absence = fall back to <input type=file>. */
type ShowOpenFilePicker = (opts?: {
  multiple?: boolean;
  types?: { description?: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle[]>;

const MEDIA_PICKER_TYPES = [
  { description: 'Media', accept: {
    'video/*': ['.mp4', '.mov', '.webm', '.m4v', '.mkv'],
    'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'],
    'audio/*': ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'],
  } },
];

type LocalKind = LocalAssetKind;

/** srcSig = name:size:lastModified — recover the filename part (it may itself contain colons). */
const sigName = (sig: string) => sig.split(':').slice(0, -2).join(':') || sig;

/** One import-registry entry: WHICH file (identity + display facts), never bytes. */
type RegEntry = LocalAssetIndexEntry;
type AddEntry = Omit<BrowserLocalImportSource, 'type'>;
const newFolderId = () => globalThis.crypto?.randomUUID?.() ?? `folder-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const regKey = (pid: string) => `studio.localAssets.${pid}`;
const normalizeReg = (value: unknown): RegEntry[] => {
  if (!Array.isArray(value)) return [];
  const out: RegEntry[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Partial<RegEntry>;
    if (typeof e.sig !== 'string' || !e.sig || seen.has(e.sig)) continue;
    const kind = e.kind === 'image' || e.kind === 'audio' || e.kind === 'video' ? e.kind : undefined;
    const rawFolder = e.folder;
    const folder =
      rawFolder &&
      typeof rawFolder.id === 'string' &&
      rawFolder.id &&
      typeof rawFolder.name === 'string' &&
      rawFolder.name &&
      typeof rawFolder.path === 'string' &&
      rawFolder.path
        ? { id: rawFolder.id, name: rawFolder.name, path: rawFolder.path }
        : undefined;
    seen.add(e.sig);
    out.push({
      sig: e.sig,
      label: typeof e.label === 'string' && e.label ? e.label : sigName(e.sig),
      ...(kind ? { kind } : {}),
      ...(typeof e.w === 'number' || e.w === null ? { w: e.w } : {}),
      ...(typeof e.h === 'number' || e.h === null ? { h: e.h } : {}),
      ...(folder ? { folder } : {}),
      createdAt: typeof e.createdAt === 'number' && Number.isFinite(e.createdAt) ? e.createdAt : 0,
    });
  }
  return out;
};
const sameReg = (a: RegEntry[], b: RegEntry[]) => JSON.stringify(a) === JSON.stringify(b);
const readReg = (pid?: string): RegEntry[] => {
  if (!pid || typeof window === 'undefined') return [];
  try {
    return normalizeReg(JSON.parse(window.localStorage.getItem(regKey(pid)) ?? '[]'));
  } catch {
    return [];
  }
};

/** Ephemeral bottom status: mounting this component starts the fail-soft background download. It
 * disappears as soon as the cache is ready (and stays out of the way when storage/network fails). */
function LocalVisualSearchLoading() {
  const model = useLocalVisualModel();
  const downloading = model.phase === 'downloading';
  const checking = model.phase === 'checking';
  if (!downloading && !checking) return null;
  const pct = Math.round(model.progress * 100);

  return (
    <div className="border-line bg-panel/95 shrink-0 border-t px-2.5 py-1.5" data-testid="local-visual-search-loading">
      <div className="text-ink-3 flex items-center gap-1.5 text-[10px]">
        <Loader2 size={11} className="text-accent animate-spin" />
        <span className="min-w-0 flex-1 truncate">{t('panels.localVisualSearchPreparing')}</span>
        {downloading ? <span className="text-ink-4 tabular-nums">{pct}%</span> : null}
      </div>
      {downloading ? (
        <div className="bg-panel-2 mt-1 h-0.5 overflow-hidden rounded-full" aria-label={t('panels.localVisualSearchDownloadProgress')} aria-valuenow={pct} role="progressbar">
          <div className="bg-accent h-full transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

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

/** One restore affordance per imported folder, regardless of how many indexed files are missing. */
function FolderRestoreTile({ name, count, busy, onRestore, onDelete }: { name: string; count: number; busy: boolean; onRestore: () => void; onDelete: () => void }) {
  return (
    <div className="border-line hover:border-accent group relative w-full overflow-hidden rounded-md border border-dashed transition">
      <button type="button" disabled={busy} onClick={onRestore} title={t('panels.restoreFolder')} className="block w-full text-left disabled:opacity-60">
        <div className="bg-panel-2 flex aspect-video flex-col items-center justify-center gap-1">
          {busy ? <Loader2 size={17} className="text-ink-4 animate-spin" /> : <FolderOpen size={17} className="text-ink-4" />}
          <span className="text-ink-4 text-[10px]">{t('panels.restoreFolder')}</span>
          <span className="text-ink-4 text-[9px]">{t('panels.folderAssetCount', { n: count })}</span>
        </div>
        <div className="text-ink-3 h-6 truncate px-1.5 py-1 text-[10px] leading-4">{name}</div>
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
  cloudRegistry,
  registrySyncReady,
  onRegistryChange,
  videoSig,
  mainSourceUrl,
  hasMainSource,
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
  /** Metadata-only registry hydrated from the project cloud context; bytes never ride this prop. */
  cloudRegistry?: LocalAssetIndexEntry[];
  registrySyncReady?: boolean;
  onRegistryChange?: (entries: LocalAssetIndexEntry[]) => void;
  /** First-loaded source's fileSig (workbench-held, not in comp) — labels it by filename + keys its eviction. */
  videoSig?: string | null;
  mainSourceUrl?: string | null;
  hasMainSource?: boolean;
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
  const [query, setQuery] = useState('');
  const [reg, setReg] = useState<RegEntry[]>(() => readReg(projectId));
  const [links, setLinks] = useState<ReadonlyMap<string, string>>(new Map());
  const linksRef = useRef<ReadonlyMap<string, string>>(new Map());
  /** sig → embedded cover art object URL (audio only) — derived whenever the File is in hand. */
  const [covers, setCovers] = useState<ReadonlyMap<string, string>>(new Map());
  const coversRef = useRef<ReadonlyMap<string, string>>(new Map());
  const objectUrlsAliveRef = useRef(true);
  const coverGenerationRef = useRef(0);
  const [importing, setImporting] = useState(false);
  const [restoringFolderId, setRestoringFolderId] = useState<string | null>(null);
  const [preview, setPreview] = useState<LibraryItem | null>(null);
  const [serviceManifestUrl, setServiceManifestUrl] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.hash.slice(1)).get('local-import');
  });
  const { playingUrl: audioPlaying, toggle: toggleAudio } = useAudioPreview();
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const restoreFolderInputRef = useRef<HTMLInputElement>(null);
  const restoreTargetRef = useRef<RegEntry | null>(null);
  const restoreFolderTargetRef = useRef<FolderRestoreGroup | null>(null);
  const loadedProjectRef = useRef<string | undefined>(undefined);
  const normalizedCloudRegistry = useMemo(() => normalizeReg(cloudRegistry), [cloudRegistry]);
  const cloudRegistryKnown = cloudRegistry !== undefined;

  useEffect(() => {
    const sync = () => setServiceManifestUrl(new URLSearchParams(window.location.hash.slice(1)).get('local-import'));
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  useEffect(() => {
    objectUrlsAliveRef.current = true;
    return () => {
      objectUrlsAliveRef.current = false;
      coverGenerationRef.current += 1;
      for (const url of linksRef.current.values()) URL.revokeObjectURL(url);
      for (const url of coversRef.current.values()) URL.revokeObjectURL(url);
      linksRef.current = new Map();
      coversRef.current = new Map();
    };
  }, []);

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
    if (registrySyncReady) onRegistryChange?.(next);
  };

  const link = (sig: string, url: string) => {
    if (!objectUrlsAliveRef.current) {
      URL.revokeObjectURL(url);
      return;
    }
    const previous = linksRef.current.get(sig);
    if (previous && previous !== url) URL.revokeObjectURL(previous);
    const next = new Map(linksRef.current).set(sig, url);
    linksRef.current = next;
    setLinks(next);
  };
  const noteCover = (sig: string, f: File, k: LocalKind) => {
    if (k !== 'audio') return;
    const generation = coverGenerationRef.current;
    void audioCoverUrl(f).then((url) => {
      if (!url) return;
      if (!objectUrlsAliveRef.current || generation !== coverGenerationRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      const previous = coversRef.current.get(sig);
      if (previous && previous !== url) URL.revokeObjectURL(previous);
      const next = new Map(coversRef.current).set(sig, url);
      coversRef.current = next;
      setCovers(next);
    });
  };
  const unlink = (sig: string) => {
    const url = linksRef.current.get(sig);
    if (!url) return;
    URL.revokeObjectURL(url);
    const next = new Map(linksRef.current);
    next.delete(sig);
    linksRef.current = next;
    setLinks(next);
  };

  // Refresh/cloud rehydrate: local cache is an offline bootstrap only. Once project hydration has
  // confirmed a cloud index, that exact list wins so cross-browser deletions stay deleted. Then
  // retry every entry that still lacks a live link; no bytes cross this boundary.
  useEffect(() => {
    let dead = false;
    const projectChanged = loadedProjectRef.current !== projectId;
    loadedProjectRef.current = projectId;
    const previous = projectChanged ? [] : regRef.current;
    const entries = reconcileLocalAssetRegistry(
      projectChanged ? readReg(projectId) : previous,
      cloudRegistryKnown ? normalizedCloudRegistry : undefined,
      Boolean(registrySyncReady),
    );
    if (projectChanged || !sameReg(entries, previous)) {
      regRef.current = entries;
      setReg(entries);
      if (projectId) {
        try {
          window.localStorage.setItem(regKey(projectId), JSON.stringify(entries));
        } catch {
          /* local cache unavailable; the cloud index still survives */
        }
      }
    }
    if (projectChanged) {
      coverGenerationRef.current += 1;
      for (const url of linksRef.current.values()) URL.revokeObjectURL(url);
      for (const url of coversRef.current.values()) URL.revokeObjectURL(url);
      linksRef.current = new Map();
      coversRef.current = new Map();
      setLinks(linksRef.current);
      setCovers(coversRef.current);
    }
    void (async () => {
      for (const e of pendingLocalAssetEntries(entries, new Set(linksRef.current.keys()))) {
        const direct = await loadLocalVideo(e.sig);
        const fromFolder = !direct && e.folder ? await loadLocalFolderFile(e.folder.id, e.folder.path, e.sig) : null;
        const f = direct ?? fromFolder?.file ?? null;
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
  }, [projectId, normalizedCloudRegistry, cloudRegistryKnown, registrySyncReady]);

  // A legacy/offline project with no cloud index can seed it from the browser cache after hydration.
  // A known cloud index is never republished from localStorage; the rehydrate effect adopted it.
  useEffect(() => {
    if (!registrySyncReady || cloudRegistryKnown) return;
    onRegistryChange?.(regRef.current);
  }, [projectId, registrySyncReady, cloudRegistryKnown, onRegistryChange]);

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
    if (hasMainSource || (videoSig && (comp.shots ?? []).some((s) => !s.src))) {
      const url = mainSourceUrl ?? undefined;
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
  }, [comp.shots, videoSig, mainSourceUrl, hasMainSource]);

  /** sig → the track src it appears as (null = the main source). Lets an IMPORT card represent an
   *  on-track asset: its delete also does the track surgery via this mapping. */
  const trackSrcBySig = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const c of trackCards) if (c.it.sig) m.set(c.it.sig, c.src);
    return m;
  }, [trackCards]);
  /** Imports, split by whether their bytes are reachable right now. THE IMPORT CARD REPRESENTS the
   *  asset even when it's on the track (an inserted image must stay an image card — the derived 5s
   *  still is an implementation detail); the matching track card is hidden instead. */
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
      else restore.push(e);
    }
    return { liveImports: live, restoreCards: restore };
  }, [reg, links, covers]);

  const kindShows = (k: LocalKind) => kind === 'all' || kind === k;
  const hasAny = liveImports.length > 0 || trackCards.length > 0 || restoreCards.length > 0;
  const needle = query.trim().toLocaleLowerCase();
  const matchesQuery = (label: string) => !needle || label.toLocaleLowerCase().includes(needle);
  const registrySigs = useMemo(() => new Set(reg.map((e) => e.sig)), [reg]);
  const folderRestoreGroups = useMemo(() => groupFolderRestoreEntries(restoreCards), [restoreCards]);
  const visibleImports = liveImports.filter((it) => kindShows(it.kind as LocalKind) && matchesQuery(it.label));
  const visibleTrackCards = kindShows('video')
    ? trackCards.filter((c) => !(c.it.sig && registrySigs.has(c.it.sig)) && matchesQuery(c.it.label))
    : [];
  const visibleFolderRestoreGroups = folderRestoreGroups.filter((group) =>
    group.entries.some((e) => kindShows(e.kind ?? 'video') && matchesQuery(e.label)),
  );
  const visibleRestoreCards = restoreCards.filter((e) => !e.folder && kindShows(e.kind ?? 'video') && matchesQuery(e.label));
  const hasVisible =
    visibleImports.length > 0 || visibleTrackCards.length > 0 || visibleFolderRestoreGroups.length > 0 || visibleRestoreCards.length > 0;

  // ---- add -------------------------------------------------------------------------------------

  const addEntries = async (entries: AddEntry[]) => {
    if (!entries.length || importing) return;
    setImporting(true);
    try {
      const session = await runLocalImportSession(entries.map((entry) => ({ type: 'browser' as const, ...entry })));
      if (session.rejected.length) toast.error(t('panels.localVideoOnly'));
      for (const asset of session.imported) {
        const url = URL.createObjectURL(asset.file);
        const dims = await mediaDims(url, asset.kind);
        updateReg((r) => [
          localAssetIndexEntry(asset, { width: dims?.w, height: dims?.h }),
          ...r.filter((x) => x.sig !== asset.sig),
        ]);
        link(asset.sig, url);
        noteCover(asset.sig, asset.file, asset.kind);
      }
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  /** Import: native picker first (handle + bounded OPFS fallback); <input> fallback elsewhere. */
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
        types: MEDIA_PICKER_TYPES,
      });
    } catch {
      return; // cancelled (or picker unavailable in this context)
    }
    await addEntries(await Promise.all(handles.map(async (h) => ({ file: await h.getFile(), handle: h }))));
  };

  /** Folder import goes through webkitdirectory on every browser. Some embedded Chromium shells
   *  expose showDirectoryPicker but never complete its native dialog, while their ordinary file-
   *  chooser bridge works. The cloud index still records one logical folder plus relative paths. */
  const FOLDER_CAP = 50;
  const pickFolder = () => triggerFolderInput(folderInputRef.current);

  /** Skill/service handoff entry point. The manifest capability rides in the URL fragment (never
   * sent as a referrer); the signed-in page submits it through the same API → bridge path as the
   * headless helper, so this is also a real end-to-end diagnostic surface. */
  const importFromLocalService = async () => {
    const manifestUrl = serviceManifestUrl ? loopbackImportUrl(serviceManifestUrl) : null;
    if (!manifestUrl || importing) {
      toast.error(t('panels.localServiceInvalid'));
      return;
    }
    setImporting(true);
    try {
      const manifestResponse = await fetch(manifestUrl, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!manifestResponse.ok) throw new Error(`manifest HTTP ${manifestResponse.status}`);
      const manifest = (await manifestResponse.json()) as { entries?: unknown[] };
      if (!Array.isArray(manifest.entries) || !manifest.entries.length) throw new Error('manifest has no entries');
      const response = await fetch('/api/studio/media', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'register-local-assets', entries: manifest.entries }),
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; data?: { imported?: unknown[] } };
      if (!response.ok || !result.ok) throw new Error(result.error ?? `import HTTP ${response.status}`);
      toast.success(t('panels.localServiceImported', { n: result.data?.imported?.length ?? manifest.entries.length }));
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      setServiceManifestUrl(null);
    } catch (error) {
      console.warn('[studio-assets] local import failed', error);
      toast.error(t('panels.localServiceFailed'));
    } finally {
      setImporting(false);
    }
  };

  const finishReconnect = async (e: RegEntry, f: File, handle?: FileSystemFileHandle) => {
    if (fileSig(f) !== e.sig) {
      toast.error(t('workbench.checksumMismatch'));
      return false;
    }
    const session = await runLocalImportSession([{ type: 'browser', file: f, handle, folder: e.folder }]);
    const asset = session.imported[0];
    if (!asset) return false;
    link(e.sig, URL.createObjectURL(asset.file));
    noteCover(e.sig, asset.file, asset.kind);
    if (trackSrcBySig.has(e.sig)) onReconnectSource?.(trackSrcBySig.get(e.sig) ?? null, e.sig);
    return true;
  };

  const reportFolderRestore = (restored: number, total: number) => {
    if (restored === total) toast.success(t('panels.folderRestoreDone', { n: restored }));
    else if (restored > 0) toast.info(t('panels.folderRestorePartial', { restored, total }));
    else toast.error(t('panels.folderRestoreNone'));
  };

  const restoreFolderFromFiles = async (group: FolderRestoreGroup, files: File[]) => {
    setRestoringFolderId(group.folder.id);
    try {
      const byPath = new Map<string, File>();
      for (const file of files) {
        const parts = file.webkitRelativePath.split('/').filter(Boolean);
        byPath.set(parts.length > 1 ? parts.slice(1).join('/') : file.name, file);
      }
      let restored = 0;
      for (const e of group.entries) {
        const file = e.folder ? byPath.get(e.folder.path) : undefined;
        if (file && fileSig(file) === e.sig && (await finishReconnect(e, file))) restored += 1;
      }
      reportFolderRestore(restored, group.entries.length);
    } finally {
      setRestoringFolderId(null);
    }
  };

  const restoreFolderFromHandle = async (group: FolderRestoreGroup, dir: FileSystemDirectoryHandle): Promise<number> => {
    await saveLocalFolderHandle(group.folder.id, dir).catch(() => {});
    let restored = 0;
    for (const entry of group.entries) {
      if (!entry.folder) continue;
      const found = await loadLocalFolderFile(entry.folder.id, entry.folder.path, entry.sig, dir);
      if (found && (await finishReconnect(entry, found.file, found.handle))) restored += 1;
    }
    return restored;
  };

  /** Restore an existing saved root handle first. If it is absent/denied/stale, reselect the folder
   *  once through the portable directory input and reconnect every indexed child as one group. */
  const reconnectFolder = async (group: FolderRestoreGroup) => {
    const previous = await getLocalFolderHandle(group.folder.id);
    if (previous) {
      setRestoringFolderId(group.folder.id);
      try {
        if (await requestLocalFolderAccess(previous)) {
          const restored = await restoreFolderFromHandle(group, previous);
          if (restored > 0) {
            reportFolderRestore(restored, group.entries.length);
            return;
          }
        }
      } finally {
        setRestoringFolderId(null);
      }
    }
    restoreFolderTargetRef.current = group;
    triggerFolderInput(restoreFolderInputRef.current);
  };

  const importFolderInputFiles = async (files: File[]) => {
    const supported = files.filter((file) => localAssetKindOf(file)).slice(0, FOLDER_CAP);
    if (!supported.length) {
      toast.info(t('panels.folderNoMedia'));
      return;
    }
    if (files.filter((file) => localAssetKindOf(file)).length > FOLDER_CAP) toast.info(t('panels.folderCapped', { n: FOLDER_CAP }));
    const folderId = newFolderId();
    const firstParts = supported[0]!.webkitRelativePath.split('/').filter(Boolean);
    const folderName = firstParts.length > 1 ? firstParts[0]! : supported[0]!.name;
    await addEntries(
      supported.map((file) => {
        const parts = file.webkitRelativePath.split('/').filter(Boolean);
        return {
          file,
          folder: {
            id: folderId,
            name: folderName,
            path: parts.length > 1 ? parts.slice(1).join('/') : file.name,
          },
        };
      }),
    );
  };

  /** Click-to-restore (user gesture): existing handle/OPFS first; on a new browser, open a real file
   *  picker and verify the selected file against the cloud-synced sig before reconnecting it. */
  const reconnect = async (e: RegEntry) => {
    const cached = await loadLocalVideo(e.sig);
    if (cached) {
      await finishReconnect(e, cached);
      return;
    }
    const picker = (window as { showOpenFilePicker?: ShowOpenFilePicker }).showOpenFilePicker;
    if (!picker) {
      restoreTargetRef.current = e;
      restoreInputRef.current?.click();
      return;
    }
    let handles: FileSystemFileHandle[];
    try {
      handles = await picker({ multiple: false, types: MEDIA_PICKER_TYPES });
    } catch {
      return;
    }
    const handle = handles[0];
    if (!handle) return;
    await finishReconnect(e, await handle.getFile(), handle);
  };

  // ---- remove ----------------------------------------------------------------------------------

  /** THE removal core: drop every local trace of a sig — native handle + OPFS bytes (forced cache
   *  eviction; other projects referencing the same file degrade to re-import/cloud), registry
   *  entry, and the live link (blob revoked). Deleted assets never resurface as restore cards. */
  const evict = (sig: string) => {
    const entry = regRef.current.find((e) => e.sig === sig);
    if (entry?.folder && regRef.current.filter((e) => e.folder?.id === entry.folder?.id).length === 1) {
      void deleteLocalFolderHandle(entry.folder.id).catch(() => {});
    }
    void deleteLocalVideo(sig).catch(() => {});
    updateReg((r) => r.filter((x) => x.sig !== sig));
    unlink(sig);
    const u = coversRef.current.get(sig);
    if (u) {
      URL.revokeObjectURL(u);
      const next = new Map(coversRef.current);
      next.delete(sig);
      coversRef.current = next;
      setCovers(next);
    }
  };

  const evictRestoreEntry = (entry: RegEntry) => {
    if (trackSrcBySig.has(entry.sig)) onDeleteAsset?.(trackSrcBySig.get(entry.sig) ?? null);
    evict(entry.sig);
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
        <div className="flex items-center gap-1.5">
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
                  <DropdownMenuRadioItem key={option.value} value={option.value} className={LOCAL_FILTER_ITEM_CLASS}>
                    {t(option.label)}
                    {kind === option.value && <Check size={10} className="ml-auto shrink-0" />}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <label className="border-line bg-panel-2 focus-within:border-accent relative min-w-0 flex-1 rounded-md border transition">
            <Search size={11} className="text-ink-4 pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('panels.searchAssets')}
              aria-label={t('panels.searchAssetsLabel')}
              className="text-ink placeholder:text-ink-4 h-[24px] w-full bg-transparent pl-5.5 pr-1.5 text-[11px] outline-none"
            />
          </label>

          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => void pickImport()}
              disabled={importing}
              className="border-line text-ink-2 hover:text-ink inline-flex h-[24px] shrink-0 items-center gap-1 whitespace-nowrap rounded-l-md border px-2 text-[11px] disabled:opacity-40"
            >
              {importing ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
              {t('panels.import')}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={importing}
                  title={t('panels.moreImportOptions')}
                  aria-label={t('panels.moreImportOptions')}
                  className="border-line text-ink-3 hover:text-ink -ml-px inline-flex h-[24px] w-[25px] shrink-0 items-center justify-center rounded-r-md border disabled:opacity-40"
                >
                  <MoreHorizontal size={12} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={5} className="min-w-[132px]">
                <DropdownMenuItem {...folderImportTriggerProps(() => void pickFolder())}>
                  <FolderOpen size={13} /> {t('panels.importFolder')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      {serviceManifestUrl ? (
        <div className="border-accent/30 bg-accent/5 border-b px-2.5 py-2">
          <button
            type="button"
            data-testid="import-local-service"
            disabled={importing}
            onClick={() => void importFromLocalService()}
            className="bg-accent text-accent-foreground inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md px-2 text-[11px] font-medium disabled:opacity-50"
          >
            {importing ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {t('panels.importFromLocalService')}
          </button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {!hasAny ? (
          <button
            type="button"
            onClick={() => void pickImport()}
            disabled={importing}
            aria-label={t('panels.import')}
            className="border-line text-ink-4 hover:border-accent/60 hover:text-ink focus-visible:ring-accent flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed py-10 transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:cursor-wait disabled:opacity-60"
          >
            {importing ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
            <span className="text-[11.5px]">{t('panels.noLocalAssets')}</span>
          </button>
        ) : !hasVisible ? (
          <div className="text-ink-4 flex h-24 items-center justify-center px-4 text-center text-[11px]">{t('panels.noMatchingAssetsTry')}</div>
        ) : (
          <div className={RESPONSIVE_ASSET_CARD_GRID}>
            {visibleImports.map((it) => (
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
            {visibleTrackCards.map((c) =>
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
            {visibleFolderRestoreGroups.map((group) => (
              <FolderRestoreTile
                key={`restore-folder:${group.folder.id}`}
                name={group.folder.name}
                count={group.entries.length}
                busy={restoringFolderId === group.folder.id}
                onRestore={() => void reconnectFolder(group)}
                onDelete={() => group.entries.forEach(evictRestoreEntry)}
              />
            ))}
            {/* Registry entries whose bytes need a re-grant gesture (or are gone): click restores access in place */}
            {visibleRestoreCards.map((e) => (
                <RestoreTile
                  key={`restore:${e.sig}`}
                  label={e.label}
                  kind={e.kind ?? 'video'}
                  onRestore={() => void reconnect(e)}
                  onDelete={() => evictRestoreEntry(e)}
                />
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
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            void importFolderInputFiles(files);
          }}
        />
        <input
          ref={restoreInputRef}
          type="file"
          accept="video/*,image/*,audio/*"
          className="hidden"
          onChange={(event) => {
            const target = restoreTargetRef.current;
            const file = event.target.files?.[0];
            restoreTargetRef.current = null;
            event.target.value = '';
            if (target && file) void finishReconnect(target, file);
          }}
        />
        <input
          ref={restoreFolderInputRef}
          type="file"
          multiple
          className="hidden"
          {...({ webkitdirectory: '' } as Record<string, string>)}
          onChange={(event) => {
            const target = restoreFolderTargetRef.current;
            const files = Array.from(event.target.files ?? []);
            restoreFolderTargetRef.current = null;
            event.target.value = '';
            if (target && files.length) void restoreFolderFromFiles(target, files);
          }}
        />
      </div>
      <LocalVisualSearchLoading />
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
