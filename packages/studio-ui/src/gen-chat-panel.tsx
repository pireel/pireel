'use client';

/**
 * Generation panel (shared by image / video / element gen, specialized by type —
 * separate entries, single-type panels, consistent interaction). History is a
 * "task card" stream, not a chat: each generation is independent and context-free
 * (deliberately not a chat feed). The only way to carry context: click "reference"
 * on an image card to feed it into the composer's reference slot (reference_images);
 * otherwise it's pure text-to-image.
 * Input = rounded composer, params tucked into a slider popover (ratio/duration/count),
 * Enter to generate. Asset actions: insert (at playhead) / reference (image→reference_images,
 * video→reference_videos, feeds the next generation).
 *
 * Data: image/video go through the /api/create gen stack (server-persisted history,
 * pending polled on mount); elements go through composeBlockChecked (client-side,
 * not auto-added to the film, history in localStorage, re-scoped id on insert).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, ChevronDown, Film, ImagePlus, Loader2, Plus, Sliders, X, ZoomIn } from 'lucide-react';
import { useStudioShell } from './shell-context';
import { useQuote } from '@pireel/ui/use-quote';
import { imageThumb } from '@pireel/ui/image-url';

import { type Composition, type MediaRef, listTemplates } from '@pireel/studio-engine/composition';
import { studioProviders } from '@pireel/studio-engine/providers';
import { toast } from '@pireel/ui/toast';
import { type GenAsset, listStudioGens, pollCreation, startGeneration } from './gen-api';
import { BlockPreviewFrame } from './block-preview-card';
import { KIND_META } from './kind-meta';
import { type GenTemplate, TEMPLATES_BY_TYPE, zhCategory } from './gen-templates';

import { type ElementEntry, type GenElementResult, loadElementEntries as loadStoredElements, pushElementToCloud, saveElementEntries as saveStoredElements } from './element-history';
import { t } from './i18n';

export type { GenElementResult } from './element-history';

type AssetType = 'image' | 'video' | 'element' | 'audio';

interface Entry {
  id: string;
  type: AssetType;
  prompt: string;
  status: 'pending' | 'succeeded' | 'failed';
  createdAt: number;
  /** Ratio at submit time (pending placeholder uses it to size its shape). */
  ratio?: string;
  assets?: GenAsset[];
  element?: GenElementResult;
  error?: string;
}

export interface GenChatPanelProps {
  /** Type this panel generates/shows (one per rail entry, never mixed). */
  type: AssetType;
  comp: Composition; // element card live preview needs theme/canvas
  /** dims: known natural w/h (derived from requested ratio for images) → insert side skips measuring, placeholder is instant. */
  onInsertMedia: (m: MediaRef, label?: string, dims?: { w: number; h: number }) => void;
  /** Drag an asset out of the panel (onto canvas/timeline to insert): report asset on drag start, null on end (same contract as upload panel). */
  onDragAsset?: (asset: (MediaRef & { label?: string; dims?: { w: number; h: number } }) | null) => void;
  /** Set as main video. Video cards currently only show "insert / reference" (like image cards), so this entry is hidden for now; plumbing kept for later. */
  onSetMainVideo: (url: string) => Promise<void>;
  onInsertElement: (el: GenElementResult, prompt: string) => void;
  /** @mention: drop the asset into the right-side agent's input. Currently hidden on video cards; plumbing kept for later. */
  onMention: (text: string) => void;
  /** Generate one element (composeBlockChecked, not added to the film). */
  generateElement: (prompt: string, base?: GenElementResult) => Promise<GenElementResult>;
  /** Element panel only: insert a base block (block-type registry; the old template panel's entry was folded in here). */
  onInsertTemplate?: (templateId: string) => void;
  /** Audio panel only: generate one music track (hosted); resolves to the stored url. */
  generateAudio?: (prompt: string, durationSec: number) => Promise<string>;
  /** Audio panel only: put a generated track on the music lane at the playhead. */
  onInsertAudio?: (url: string, label?: string) => void;
}

/* ---------------- Element history (localStorage; single source in element-history.ts; image/video history lives server-side) ---------------- */

function loadElementEntries(): Entry[] {
  return loadStoredElements().map((e: ElementEntry): Entry => ({ ...e, type: 'element', status: 'succeeded' }));
}
function saveElementEntries(entries: Entry[]) {
  saveStoredElements(
    entries
      .filter((e) => e.type === 'element' && e.status === 'succeeded' && e.element)
      .map((e) => ({ id: e.id, prompt: e.prompt, createdAt: e.createdAt, element: e.element! })),
  );
}

/* ---------------- Small parts (popover/pill/row, matching composer-gen-controls look) ---------------- */

function PopButton({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as HTMLElement)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        title={title}
        onClick={() => setOpen((v) => !v)}
        className="text-ink-3 hover:bg-line hover:text-ink inline-flex h-7 w-7 items-center justify-center rounded-md"
      >
        {icon}
      </button>
      {open && (
        <div className="border-line bg-panel absolute bottom-[calc(100%+6px)] left-0 z-40 min-w-[200px] rounded-lg border p-1.5 shadow-lg">
          {children}
        </div>
      )}
    </div>
  );
}

function Pill({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-[12px] transition-colors ${
        selected ? 'bg-accent/10 text-accent font-medium' : 'text-ink-3 hover:bg-panel-2'
      }`}
    >
      {children}
    </button>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="px-1.5 py-1">
      <div className="text-ink-4 mb-1 text-[11px]">{label}</div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function ratioToCss(size: string | undefined): string {
  const m = (size ?? '').match(/^(\d+):(\d+)$/);
  return m ? `${m[1]} / ${m[2]}` : '9 / 16';
}

/** Requested ratio 'W:H' → w/h (ratio is enough, insert side only uses h/w to size the box). Unparseable = undefined, let insert side measure. */
function ratioDims(size: string | undefined): { w: number; h: number } | undefined {
  const m = (size ?? '').match(/^(\d+):(\d+)$/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : undefined;
}

/**
 * The size sent to image-gen. gpt-image needs a concrete WxH (other models take aspect):
 *  - billing tier_param='image_tier'=`${quality}_${sizeTier}`, sizeTier derived from WxH (see pickGptImageSizeTier);
 *    sending aspect falls back to base and quality is ignored; only WxH lets different quality compute different credits.
 *  - the provider also needs a valid size (gpt doesn't accept '9:16'). 16:9/9:16 default 2K, 1:1 only 1K.
 */
function imageSizeParam(modelId: string, ratio: string): string {
  if (modelId === 'gpt-image' || modelId === 'gpt-image-2') {
    return ratio === '16:9' ? '2560x1440' : ratio === '1:1' ? '1024x1024' : '1440x2560';
  }
  return ratio;
}

const SHIMMER: React.CSSProperties = {
  background: 'linear-gradient(90deg,#ecece8 0%,#f7f7f2 50%,#ecece8 100%)',
  backgroundSize: '200% 100%',
  animation: 'hfgen-shimmer 1.4s infinite linear',
};

/* ---------------- Panel ---------------- */

const TYPE_META: Record<AssetType, { title: string; ph: string; empty: string }> = {
  image: { title: 'panels.image', ph: 'chatGen.describeImageGenerate', empty: '' },
  video: { title: 'panels.video', ph: 'chatGen.describeShotGenerate', empty: '' },
  element: { title: 'panels.element', ph: 'chatGen.describeOverlayElement', empty: 'chatGen.generatedComponentsStayHere' },
  audio: { title: 'panels.music', ph: 'panels.musicPromptPlaceholder', empty: '' },
};

export function GenChatPanel({ type, comp, onInsertMedia, onDragAsset, onInsertElement, generateElement, onInsertTemplate, generateAudio, onInsertAudio }: GenChatPanelProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const [loaded, setLoaded] = useState(false); // don't decide the view from empty entries before history loads (avoids "templates→mine" flash)
  const [input, setInput] = useState('');
  const [ratio, setRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [audioSec, setAudioSec] = useState(60); // music panel only: requested length
  const [count, setCount] = useState(1); // image only
  const shell = useStudioShell();
  const [vidDur, setVidDur] = useState('5'); // video only: duration tier (per model, see videoDurationOptions)
  const [quality, setQuality] = useState(''); // image only: quality/resolution tier (per model, see qualityConfigFor)
  const [vidRes, setVidRes] = useState('720p'); // video only: resolution (per model, see videoResolutionOptions)
  const [busy, setBusy] = useState(false); // momentary submit lock (the generation itself runs concurrently)
  const [credits, setCredits] = useState<{ need: number; balance: number } | null>(null);
  // reference images (image panel only): only explicitly selected images go into the next generation's reference_images — the only context channel
  const [refs, setRefs] = useState<GenAsset[]>([]);
  // element base draft: pick a generated element, next instruction edits on top of it (single, replaceable/removable)
  const [baseEl, setBaseEl] = useState<{ el: GenElementResult; prompt: string } | null>(null);
  const [preview, setPreview] = useState<GenAsset | null>(null); // lightbox: the enlarged image opened from the hover preview lens
  const listRef = useRef<HTMLDivElement | null>(null);
  // model list (user-selectable; list[0] = default, same source as the create route's fallback). The chosen modelId feeds both
  // the submit params (model_id) and useQuote for the "estimated credits next to the button". Elements use client compose, no model.
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [modelId, setModelId] = useState('');
  useEffect(() => {
    // element composes locally; audio has no model choice (one tool, tiered by length) — and asking
    // for a kind the catalog doesn't know returns EVERY model, whose first row then quoted as if the
    // user were generating an image. That's where the wrong price came from.
    if (type === 'element' || type === 'audio') return;
    let cancelled = false;
    void fetch(`/api/models?kind=${type}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { models?: Array<{ id?: string; name?: string }> } | null) => {
        if (cancelled || !Array.isArray(j?.models)) return;
        const list = j.models.filter((m): m is { id: string; name?: string } => typeof m?.id === 'string').map((m) => ({ id: m.id, name: m.name ?? m.id }));
        setModels(list);
        if (list[0]) setModelId((cur) => cur || list[0]!.id); // default to first, only if user hasn't chosen
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [type]);
  // switch model → reset quality tier to the new model's default; clamp video resolution to a tier the new model supports (each differs)
  useEffect(() => {
    if (type === 'image') setQuality(shell.modelParams?.qualityConfigFor(modelId)?.default ?? '');
    else if (type === 'video') {
      const opts = shell.modelParams?.videoResolutionOptions(modelId) ?? [];
      setVidRes((cur) => (opts.includes(cur) ? cur : opts.includes('720p') ? '720p' : (opts[0] ?? '720p')));
      const dopts = shell.modelParams?.videoDurationOptions(modelId) ?? [];
      setVidDur((cur) => (dopts.includes(cur) ? cur : (dopts[0] ?? '5')));
    }
  }, [modelId, type]);
  const qualityCfg = type === 'image' ? (shell.modelParams?.qualityConfigFor(modelId) ?? null) : null;
  const vidResOpts = type === 'video' ? (shell.modelParams?.videoResolutionOptions(modelId) ?? []) : [];
  const vidDurOpts = type === 'video' ? (shell.modelParams?.videoDurationOptions(modelId) ?? []) : [];
  const quoteParams = useMemo<Record<string, unknown>>(() => {
    if (type === 'image') {
      return { n: Math.min(4, Math.max(1, count)), size: imageSizeParam(modelId, ratio), ...(quality ? { quality } : {}) };
    }
    if (type === 'video') {
      return { duration_sec: vidDur, count: 1, resolution: vidRes, aspect_ratio: ratio === '1:1' ? '9:16' : ratio, generate_audio: false };
    }
    if (type === 'audio') return { tier: audioSec < 30 ? 'clip' : 'song' };
    return {};
  }, [type, ratio, count, vidDur, quality, vidRes, modelId, audioSec]);
  // elements: modelId empty → useQuote returns null, no request. Audio quotes its own per-call tool,
  // whose only dimension is which tier the length buys.
  const quoteCredits = useQuote({
    toolId: type === 'video' ? 'video-gen' : type === 'audio' ? 'music-gen' : 'image-gen',
    modelId: type === 'element' || type === 'audio' ? '' : modelId,
    params: quoteParams,
  });
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // templates / mine tabs: only image and video panels have a template library (elements use "base blocks", not here)
  const templates = type === 'element' || type === 'audio' ? [] : (TEMPLATES_BY_TYPE[type] ?? []);
  const [tab, setTab] = useState<'mine' | 'templates'>('mine');
  // remember across sessions whether this panel ever had its own output → get the first frame right (had output → open "mine",
  // otherwise show templates), avoiding the flash of "show templates on empty entries, then switch back to mine once history arrives".
  const hadMineHint = useMemo(() => {
    try {
      return window.localStorage.getItem(`studio:gen-hasmine:${type}`) === '1';
    } catch {
      return false;
    }
  }, [type]);
  // entries are authoritative only after history loads; before that, trust the persisted hint. Decide templates vs "mine" from this.
  const knownHasMine = loaded ? entries.length > 0 : hadMineHint;
  const showTemplates = templates.length > 0 && (tab === 'templates' || !knownHasMine);
  const showTabs = templates.length > 0 && knownHasMine;
  const viewKey: 'mine' | 'templates' = showTemplates ? 'templates' : 'mine';
  const viewKeyRef = useRef(viewKey);
  viewKeyRef.current = viewKey;
  // both views share one scroll container: each remembers its own scroll position, restored on tab switch (default: templates to top, mine to bottom)
  const scrollMemRef = useRef<{ mine?: number; templates?: number }>({});

  /** Template card click: fill the prompt into the input (still editable), focus, and return to the edit state next to "mine". */
  const useTemplate = useCallback((prompt: string) => {
    setInput(prompt);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }, []);

  // on mount: load only this panel type's history (elements from localStorage, image/video from server incl. pending)
  useEffect(() => {
    if (type === 'element') {
      setEntries((cur) => {
        const seen = new Set(cur.map((e) => e.id));
        return [...cur, ...loadElementEntries().filter((e) => !seen.has(e.id))].sort((a, b) => a.createdAt - b.createdAt);
      });
      setLoaded(true);
      return;
    }
    if (type === 'audio') {
      // music generation isn't a create-pipeline job (the route answers inline), so there is no history to list
      setLoaded(true);
      return;
    }
    let cancelled = false;
    void listStudioGens(type)
      .then((jobs) => {
        if (cancelled) return;
        const server: Entry[] = jobs.map((j) => ({ id: j.id, type, prompt: j.prompt, status: j.status, createdAt: j.createdAt, assets: j.assets, ...(j.error ? { error: j.error } : {}) }));
        setEntries((cur) => {
          const seen = new Set(cur.map((e) => e.id));
          return [...cur, ...server.filter((e) => !seen.has(e.id))].sort((a, b) => a.createdAt - b.createdAt);
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  // poll pending jobs (server-side)
  const pendingKey = entries
    .filter((e) => e.status === 'pending' && e.type !== 'element')
    .map((e) => e.id)
    .sort()
    .join(',');
  useEffect(() => {
    if (!pendingKey) return;
    let cancelled = false;
    const tick = async () => {
      const ids = pendingKey.split(',').filter((id) => entriesRef.current.find((e) => e.id === id)?.status === 'pending');
      const fresh = await Promise.all(ids.map((id) => pollCreation(id).catch(() => null)));
      if (cancelled) return;
      const settled = fresh.filter((f): f is NonNullable<typeof f> => !!f && f.status !== 'pending');
      if (!settled.length) return;
      setEntries((cur) =>
        cur.map((e) => {
          const f = settled.find((x) => x.id === e.id);
          return f ? { ...e, status: f.status, assets: f.assets, ...(f.error ? { error: f.error } : {}) } : e;
        }),
      );
    };
    void tick();
    const timer = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pendingKey]);

  // persist the hint: once history is authoritative, set '1' if there's output, clear otherwise — so next open gets the first frame right (see hadMineHint)
  useEffect(() => {
    if (!loaded) return;
    try {
      const k = `studio:gen-hasmine:${type}`;
      if (entries.length > 0) window.localStorage.setItem(k, '1');
      else window.localStorage.removeItem(k);
    } catch {
      /* ignore quota/private-mode errors */
    }
  }, [loaded, entries.length, type]);

  // switch tab (view switch) → restore that view's last scroll position; first entry: templates to top, mine to latest (bottom)
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const saved = scrollMemRef.current[viewKey];
    el.scrollTop = saved != null ? saved : viewKey === 'templates' ? 0 : el.scrollHeight;
  }, [viewKey]);

  // mine: new entry appears → scroll to latest (bottom); don't hijack scroll in template view
  const lastId = entries[entries.length - 1]?.id;
  useEffect(() => {
    if (viewKey !== 'mine') return;
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      scrollMemRef.current.mine = el.scrollTop;
    }
  }, [lastId, viewKey]);

  const submit = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setCredits(null);
    setTab('mine'); // after submit, return to "mine" so the new output is visible
    try {
      if (type === 'element') {
        const id = `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const createdAt = Date.now();
        setEntries((cur) => [...cur, { id, type: 'element', prompt: text, status: 'pending', createdAt }]);
        setInput('');
        setBusy(false); // element gen is slow, unlock input first (generation continues in background)
        try {
          const el = await generateElement(text, baseEl?.el);
          pushElementToCloud({ id, prompt: text, createdAt, element: el }); // element library is cloud-authoritative, new items sync immediately
          setEntries((cur) => {
            const next = cur.map((e) => (e.id === id ? { ...e, status: 'succeeded' as const, element: el } : e));
            saveElementEntries(next);
            return next;
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : t('common.generationFailed');
          setEntries((cur) => cur.map((e) => (e.id === id ? { ...e, status: 'failed' as const, error: msg } : e)));
        }
        return;
      }
      if (type === 'audio') {
        const id = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const createdAt = Date.now();
        setEntries((cur) => [...cur, { id, type: 'audio', prompt: text, status: 'pending', createdAt }]);
        setInput('');
        setBusy(false); // music generation is slow; unlock the input while it runs
        try {
          const url = await generateAudio!(text, audioSec);
          setEntries((cur) => cur.map((e) => (e.id === id ? { ...e, status: 'succeeded' as const, assets: [{ url, key: url, mime: 'audio/mpeg' }] } : e)));
        } catch (err) {
          const msg = err instanceof Error ? err.message : t('common.generationFailed');
          setEntries((cur) => cur.map((e) => (e.id === id ? { ...e, status: 'failed' as const, error: msg } : e)));
        }
        return;
      }
      const model = modelId ? { model_id: modelId } : {};
      const params =
        type === 'image'
          ? { prompt: text, user_prompt: text, size: imageSizeParam(modelId, ratio), n: Math.min(4, Math.max(1, count)), ...(quality ? { quality } : {}), ...model, ...(refs.length ? { reference_images: refs.map((r) => r.url) } : {}) }
          : { prompt: text, user_prompt: text, aspect_ratio: ratio === '1:1' ? '9:16' : ratio, duration_sec: vidDur, resolution: vidRes, count: 1, generate_audio: false, ...model, ...(refs.length ? { reference_videos: refs.map((r) => r.url) } : {}) };
      const res = await startGeneration(type === 'image' ? 'image-gen' : 'video-gen', params);
      if (!res.ok) {
        if (res.kind === 'credits') setCredits({ need: res.need, balance: res.balance });
        else setEntries((cur) => [...cur, { id: `err_${Date.now()}`, type, prompt: text, status: 'failed', error: res.message, createdAt: Date.now() }]);
        return;
      }
      const now = Date.now();
      setEntries((cur) => [...cur, ...res.ids.map((id) => ({ id, type, prompt: text, status: 'pending' as const, createdAt: now, ratio }))]);
      setInput('');
    } finally {
      setBusy(false);
    }
  }, [input, busy, type, ratio, count, vidDur, quality, vidRes, refs, baseEl, modelId, generateElement, generateAudio, audioSec]);

  const meta = TYPE_META[type];

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* shimmer placeholder animation (same as fc-shimmer; studio doesn't import free-create.css, defined locally) */}
      <style>{'@keyframes hfgen-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}@media (prefers-reduced-motion: reduce){[style*="hfgen-shimmer"]{animation:none !important}}'}</style>
      <div className="border-line text-ink flex items-center gap-1.5 border-b px-3 py-2 text-[12px]">
        {showTabs ? (
          <div className="flex items-center gap-1">
            {(['mine', 'templates'] as const).map((tb) => (
              <button
                key={tb}
                type="button"
                onClick={() => setTab(tb)}
                className={`rounded-md px-2 py-0.5 text-[12px] transition-colors ${
                  tab === tb ? 'bg-ink text-bg font-medium' : 'text-ink-3 hover:bg-panel-2'
                }`}
              >
                {tb === 'mine' ? t('common.mine') : t('chatGen.templates')}
              </button>
            ))}
          </div>
        ) : (
          <span className="truncate">{t(meta.title)}</span>
        )}
      </div>


      {/* stream: template library / my output (newest at bottom) */}
      <div
        ref={listRef}
        onScroll={(e) => {
          scrollMemRef.current[viewKeyRef.current] = e.currentTarget.scrollTop;
        }}
        className="min-h-0 flex-1 overflow-auto p-3"
      >
        {showTemplates ? (
          <TemplateGallery templates={templates} onUse={useTemplate} />
        ) : (
          <>
            {entries.length === 0 && meta.empty && (
              <div className="text-ink-4 whitespace-pre-line pt-12 text-center text-[11.5px] leading-[1.9]">{t(meta.empty)}</div>
            )}
            <div className="flex flex-col gap-4">
              {entries.map((e) => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  comp={comp}
                  onInsertMedia={onInsertMedia}
                  onDragAsset={onDragAsset}
                  onInsertElement={onInsertElement}
                  onInsertAudio={onInsertAudio}
                  onUseAsBase={type === 'element' ? (el2, p2) => setBaseEl({ el: el2, prompt: p2 }) : undefined}
                  onAddRef={
                    // only image/video panels take asset references: images → reference_images (≤4), videos → reference_videos (≤3);
                    // the element panel's "reference" = base draft (onUseAsBase), no images
                    type === 'element'
                      ? undefined
                      : (a) => {
                          const cap = type === 'video' ? 3 : 4;
                          setRefs((cur) => (cur.some((x) => x.key === a.key) || cur.length >= cap ? cur : [...cur, a]));
                        }
                  }
                  onPreview={setPreview}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* lightbox: click an image (hover preview lens) to enlarge; click anywhere/Esc to close */}
      {preview && <Lightbox asset={preview} onClose={() => setPreview(null)} />}

      {/* composer: params tucked into a slider popover, the body is just type + send */}
      <div className="px-3 pb-3 pt-1">
        {credits && shell.CreditsCard && (
          <div className="mb-2">
            <shell.CreditsCard need={credits.need} balance={credits.balance} />
          </div>
        )}
        {/* composer look strictly matches the chat panel spec: bg-panel-2 / rounded-md / min-h 64 / text-13 (all three panel inputs unified) */}
        <div className="border-line bg-panel-2 focus-within:border-ink-4 rounded-md border transition-colors">
          {baseEl && (
            <div className="flex items-center gap-1.5 px-3 pt-2.5">
              <span className="border-accent/50 bg-accent/10 text-ink inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10.5px]">
                {t('chatGen.basedOn', { name: baseEl.prompt.slice(0, 16) || baseEl.el.label })}
                <button type="button" aria-label={t('chatGen.removeBase')} onClick={() => setBaseEl(null)} className="text-ink-3 hover:text-ink">
                  <X size={11} />
                </button>
              </span>
            </div>
          )}
          {refs.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">
              {refs.map((r) => (
                <span key={r.key} className="border-line group relative inline-flex overflow-hidden rounded-md border">
                  {type === 'video' ? (
                    // video reference: first frame as thumbnail (preload=metadata), bare key uses 'original' to read the source directly
                    <video src={imageThumb(r.key, 'original')} muted playsInline preload="metadata" className="h-8 w-8 bg-black object-cover" />
                  ) : (
                    <img src={imageThumb(r.key, 'inline')} alt="" className="h-8 w-8 object-cover" />
                  )}
                  {/* delete: appears top-right on hover (no longer occupies the "reference image" label slot) */}
                  <button
                    type="button"
                    aria-label={type === 'video' ? t('chatGen.removeReferenceVideo') : t('chatGen.removeReferenceImage')}
                    onClick={() => setRefs((cur) => cur.filter((x) => x.key !== r.key))}
                    className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl-md bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={2}
            placeholder={t(meta.ph)}
            aria-label={t('chatGen.describeWhatGenerate')}
            className="text-ink placeholder:text-ink-4 max-h-[200px] min-h-[64px] w-full resize-none bg-transparent px-3 pb-1.5 pt-2.5 text-[13px] leading-relaxed outline-none"
          />
          <div className="flex items-center gap-1 px-2 pb-2 pt-1">
            {type === 'audio' && (
              // Reference, not a contract: the model takes it as a wish (see the music route), and it also
              // decides which tier is bought — under 30s is the cheaper short-clip model.
              <label className="text-ink-3 flex items-center gap-1.5 text-[11px]" title={t('panels.musicDurationHint')}>
                {t('panels.musicDurationSec')}
                <input
                  type="number"
                  min={10}
                  max={300}
                  value={audioSec}
                  onChange={(e) => setAudioSec(Math.max(10, Math.min(300, Number(e.target.value) || 60)))}
                  className="border-line bg-paper text-ink w-14 rounded-md border px-1.5 py-0.5 tabular-nums"
                  aria-label={t('panels.musicDurationSec')}
                />
              </label>
            )}
            {type !== 'element' && type !== 'audio' && (
              <>
                {models.length > 1 && (
                  <select
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    aria-label={t('chatGen.chooseModel')}
                    title={t('chatGen.model')}
                    className="border-line bg-panel-2 text-ink-2 focus:border-ink-4 max-w-[140px] shrink truncate rounded-md border py-1 pl-2 pr-1 text-[11px] outline-none"
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}
                <PopButton icon={<Sliders size={15} strokeWidth={2.2} />} title={t('chatGen.generationSettings')}>
                  {/* quality/resolution: varies by model (some have multiple tiers, single tier hidden) — see the /image studio */}
                  {type === 'image' && qualityCfg && qualityCfg.options.length > 1 && (
                    <Row label={t('chatGen.quality')}>
                      {qualityCfg.options.map((o) => (
                        <Pill key={o.value} selected={quality === o.value} onClick={() => setQuality(o.value)}>
                          {o.label}
                        </Pill>
                      ))}
                    </Row>
                  )}
                  {type === 'video' && vidResOpts.length > 1 && (
                    <Row label={t('chatGen.resolution')}>
                      {vidResOpts.map((r) => (
                        <Pill key={r} selected={vidRes === r} onClick={() => setVidRes(r)}>
                          {r}
                        </Pill>
                      ))}
                    </Row>
                  )}
                  <Row label={t('chatGen.aspectRatio')}>
                    {(type === 'image' ? (['9:16', '16:9', '1:1'] as const) : (['9:16', '16:9'] as const)).map((r) => (
                      <Pill key={r} selected={ratio === r} onClick={() => setRatio(r)}>
                        {r}
                      </Pill>
                    ))}
                  </Row>
                  {type === 'image' ? (
                    <Row label={t('chatGen.count')}>
                      {[1, 2, 3, 4].map((n) => (
                        <Pill key={n} selected={count === n} onClick={() => setCount(n)}>
                          {n}
                        </Pill>
                      ))}
                    </Row>
                  ) : (
                    <Row label={t('common.duration')}>
                      {vidDurOpts.map((d) => (
                        <Pill key={d} selected={vidDur === d} onClick={() => setVidDur(d)}>
                          {d}s
                        </Pill>
                      ))}
                    </Row>
                  )}
                </PopButton>
                <span className="text-ink-4 truncate text-[10.5px]">
                  {ratio}
                  {type === 'image' ? (count > 1 ? ` · ${t('chatGen.countImages', { count })}` : '') : ` · ${vidDur}s · ${vidRes}`}
                </span>
              </>
            )}
            <div className="ml-auto flex items-center gap-2">
              {type !== 'element' && quoteCredits != null && (
                <span className="text-ink-4 text-[10.5px] tabular-nums" title={t('chatGen.creditsGenerationUse')}>
                  {t('chatGen.nCredits', { n: quoteCredits })}
                </span>
              )}
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || !input.trim()}
                aria-label={t('common.generate')}
                className="bg-ink text-bg inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
              >
                <ArrowUp size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- In-stream entry: prompt line + output ---------------- */

/** Task card description: max two lines, expand/collapse arrow at the end on overflow. */
function PromptLine({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) setOverflow(el.scrollHeight > el.clientHeight + 1);
  }, [text]);
  return (
    <div className="relative">
      <div ref={ref} className={`text-ink-4 text-[10.5px] leading-relaxed ${expanded ? '' : 'line-clamp-2'} ${overflow && !expanded ? 'pr-5' : ''}`}>
        {text}
      </div>
      {(overflow || expanded) && (
        <button
          type="button"
          aria-label={expanded ? t('chatGen.collapse') : t('chatGen.expand')}
          onClick={() => setExpanded((v) => !v)}
          className="text-ink-4 hover:text-ink absolute bottom-0 right-0"
        >
          <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
}

function ActionChip({ icon: Icon, label, onClick }: { icon: typeof Plus; label: string; onClick: () => void }) {

  return (
    <button
      type="button"
      onClick={onClick}
      className="border-line text-ink-2 hover:border-accent hover:text-accent bg-panel inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px]"
    >
      <Icon size={10} /> {label}
    </button>
  );
}

/** Large-image lightbox: 'preview' preset (1024 wide) for sharpness; click anywhere/Esc to close. */
function Lightbox({ asset, onClose }: { asset: GenAsset; onClose: () => void }) {
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
      className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/70 p-6"
    >
      <img src={imageThumb(asset.key, 'preview')} alt="" className="max-h-full max-w-full rounded-lg shadow-2xl" />
    </div>
  );
}

/* ---------------- Template library: click a card to fill its prompt into the input ---------------- */

function TemplateGallery({ templates, onUse }: { templates: GenTemplate[]; onUse: (prompt: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {templates.map((t) => (
        <TemplateCard key={t.id} t={t} onUse={onUse} />
      ))}
    </div>
  );
}

function TemplateCard({ t: tpl, onUse }: { t: GenTemplate; onUse: (prompt: string) => void }) {
  return (
    <button
      type="button"
      title={tpl.prompt}
      onClick={() => onUse(tpl.prompt)}
      className="border-line group relative block overflow-hidden rounded-lg border text-left"
    >
      {tpl.video ? (
        // video template with a finished clip: looping mini video card (muted, plays on hover to save bandwidth); bare key uses 'original' to read the source directly
        <video
          src={imageThumb(tpl.video, 'original')}
          muted
          loop
          playsInline
          preload="metadata"
          className="aspect-[4/5] w-full bg-black object-cover"
          onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
          onMouseLeave={(e) => {
            e.currentTarget.pause();
            e.currentTarget.currentTime = 0;
          }}
        />
      ) : tpl.image ? (
        <img src={imageThumb(tpl.image, 'list')} alt="" loading="lazy" className="aspect-[4/5] w-full bg-[#f3f3f0] object-cover" />
      ) : (
        // video template with no preview clip: dark gradient card + title + prompt summary
        <div className="flex aspect-[4/5] flex-col justify-between bg-gradient-to-br from-neutral-700 to-neutral-900 p-2.5">
          <Film size={14} className="text-white/60" />
          <div>
            <div className="text-[12px] font-medium leading-tight text-white">{tpl.title ? t(tpl.title) : ''}</div>
            <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-white/60">{tpl.prompt}</div>
          </div>
        </div>
      )}
      <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[9.5px] text-white">
        {t(zhCategory(tpl.category))}
      </span>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
        <span className="text-ink rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium">{t('chatGen.fillEdit')}</span>
      </span>
    </button>
  );
}

function EntryRow({
  entry: e,
  comp,
  onInsertMedia,
  onDragAsset,
  onInsertElement,
  onAddRef,
  onUseAsBase,
  onPreview,
  onInsertAudio,
}: {
  entry: Entry;
  comp: Composition;
  /** image/video panel: pick this output as the next generation's reference (image→reference_images, video→reference_videos) */
  onAddRef?: (a: GenAsset) => void;
  /** element panel: set this element as the base draft — the next instruction edits on top of it. */
  onUseAsBase?: (el: GenElementResult, prompt: string) => void;
  /** click image / hover preview lens → panel-level lightbox to enlarge */
  onPreview: (a: GenAsset) => void;
} & Pick<GenChatPanelProps, 'onInsertMedia' | 'onDragAsset' | 'onInsertElement' | 'onInsertAudio'>) {
  return (
    <div className="flex flex-col gap-1.5">
      {/* task-card framing: the prompt is caption text for this generation, not a chat message (each generation is independent, no context) */}
      <PromptLine text={e.prompt} />

      {/* output (left side) */}
      {e.status === 'pending' && (
        <div
          // self-start: don't let flex-col stretch to full width, otherwise aspectRatio yields to the stretched width → goes full-width
          className="border-line self-start rounded-lg border"
          style={
            e.type === 'element'
              ? { height: 120, width: 180, ...SHIMMER }
              : { height: e.type === 'video' ? 120 : 112, aspectRatio: ratioToCss(e.ratio), ...SHIMMER }
          }
        />
      )}
      {e.status === 'failed' && <div className="text-destructive text-[11.5px]">{t('common.generationFailed')}{e.error ? `:${e.error}` : ''}</div>}

      {e.status === 'succeeded' && e.type === 'element' && e.element && (
        <ElementResult el={e.element} prompt={e.prompt} comp={comp} onInsertElement={onInsertElement} onUseAsBase={onUseAsBase} />
      )}

      {e.status === 'succeeded' && e.type === 'image' && (e.assets?.length ?? 0) > 0 && (
        <div className="flex flex-col items-start gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            {e.assets!.map((a, i) => (
              // thumbnail keeps original ratio (strip preset only caps width, no crop); hover shows the preview lens, click opens the lightbox
              <button
                key={i}
                type="button"
                title={t('chatGen.previewFullSizeAlso')}
                aria-label={t('chatGen.previewFullSize')}
                onClick={() => onPreview(a)}
                draggable
                onDragStart={(ev) => {
                  ev.dataTransfer.effectAllowed = 'copy';
                  onDragAsset?.({ type: 'image', url: a.url, label: e.prompt.slice(0, 12) || t('tools.add_graphics.label'), dims: ratioDims(e.ratio) });
                }}
                onDragEnd={() => onDragAsset?.(null)}
                className="border-line group relative block shrink-0 overflow-hidden rounded-lg border"
                // ratio known at request time: the finished image fills the same ratio box (= placeholder height 112 + aspectRatio), no collapse before bytes load → zero jump
                style={{ background: '#f3f3f0', height: 112, aspectRatio: ratioToCss(e.ratio) }}
              >
                <img src={imageThumb(a.key, 'strip')} alt="" className="h-full w-full object-cover" loading="lazy" />
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white">
                    <ZoomIn size={14} />
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            <ActionChip icon={Plus} label={t('chatGen.insertIntoVideo')} onClick={() => onInsertMedia({ type: 'image', url: e.assets![0]!.url }, e.prompt.slice(0, 12) || t('tools.add_graphics.label'), ratioDims(e.ratio))} />
            {onAddRef && <ActionChip icon={ImagePlus} label={t('chatGen.reference')} onClick={() => onAddRef(e.assets![0]!)} />}
          </div>
        </div>
      )}

      {e.status === 'succeeded' && e.type === 'audio' && (e.assets?.length ?? 0) > 0 && (
        <div className="flex flex-col items-start gap-1.5">
          <audio src={e.assets![0]!.url} controls preload="metadata" className="h-8 w-full max-w-[260px]" />
          <div className="flex flex-wrap gap-1">
            <ActionChip icon={Plus} label={t('panels.useAsBgm')} onClick={() => onInsertAudio?.(e.assets![0]!.url, e.prompt.slice(0, 24))} />
          </div>
        </div>
      )}
      {e.status === 'succeeded' && e.type === 'video' && (e.assets?.length ?? 0) > 0 && (
        <div className="flex flex-col items-start gap-1.5">
          <video
            src={e.assets![0]!.url}
            controls
            muted
            playsInline
            preload="metadata"
            title={t('chatGen.alsoDragOntoCanvas')}
            draggable
            onDragStart={(ev) => {
              ev.dataTransfer.effectAllowed = 'copy';
              onDragAsset?.({ type: 'video', url: e.assets![0]!.url, label: e.prompt.slice(0, 12) || t('chatGen.videoClip'), dims: ratioDims(e.ratio) });
            }}
            onDragEnd={() => onDragAsset?.(null)}
            className="border-line max-h-44 w-fit max-w-full rounded-lg border bg-black"
          />
          <div className="flex flex-wrap gap-1">
            <ActionChip icon={Plus} label={t('chatGen.insertIntoVideo')} onClick={() => onInsertMedia({ type: 'video', url: e.assets![0]!.url }, e.prompt.slice(0, 12) || t('chatGen.videoClip'), ratioDims(e.ratio))} />
            {onAddRef && <ActionChip icon={ImagePlus} label={t('chatGen.reference')} onClick={() => onAddRef(e.assets![0]!)} />}
          </div>
        </div>
      )}
    </div>
  );
}

function ElementResult({ el, prompt, comp, onInsertElement, onUseAsBase }: { el: GenElementResult; prompt: string; comp: Composition; onUseAsBase?: (el: GenElementResult, prompt: string) => void } & Pick<GenChatPanelProps, 'onInsertElement'>) {
  const previewBlock = {
    id: el.seedId,
    templateId: 'custom',
    slots: { innerHtml: el.innerHtml, timelineBody: el.timelineBody },
    startSec: 0,
    durationSec: 3,
    trackIndex: 2,
    label: el.label,
  };
  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="border-line w-fit overflow-hidden rounded-lg border">
        <BlockPreviewFrame comp={comp} block={previewBlock} width={180} />
      </div>
      <div className="flex items-center gap-1.5">
        <ActionChip icon={Plus} label={t('chatGen.insertIntoVideo')} onClick={() => onInsertElement(el, prompt)} />
        {onUseAsBase && <ActionChip icon={ImagePlus} label={t('chatGen.reference')} onClick={() => onUseAsBase(el, prompt)} />}
      </div>
    </div>
  );
}
