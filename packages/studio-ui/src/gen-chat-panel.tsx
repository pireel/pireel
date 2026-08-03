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
 * Data: image/video go through the /api/create gen stack (project-scoped server history,
 * pending polled on mount); elements go through composeBlockChecked (client-side,
 * not auto-added to the film, project-scoped cloud history + local cache, re-scoped id on insert).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, Check, ChevronDown, Film, Loader2, Music2, Pause, Play, Plus, RefreshCw, Search, Sliders, SlidersHorizontal, X, ZoomIn } from 'lucide-react';
import { useStudioShell } from './shell-context';
import { useQuote } from '@pireel/ui/use-quote';
import { imageThumb } from '@pireel/ui/image-url';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pireel/ui/dropdown-menu';

import { type Composition, type MediaRef } from '@pireel/studio-engine/composition';
import { type GenAsset, listStudioGens, pollCreation, startGeneration } from './gen-api';
import { BlockPreviewFrame } from './block-preview-card';
import { type GenTemplate, localizedTemplatePrompt, TEMPLATES_BY_TYPE, zhCategory } from './gen-templates';
import { ElementTemplateCard } from './gen-templates/element-card';
import { fmtDur, type PanelDragAsset, useAudioPreview } from './asset-card';
import type { OfficialAssetsResponse, OfficialBgm, OfficialCategory } from './official-assets-types';

import { type ElementEntry, type GenElementResult, loadElementEntries as loadStoredElements, pushElementToCloud, saveElementEntries as saveStoredElements, syncElementEntries as syncStoredElements } from './element-history';
import { studioLocale, t } from './i18n';

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
  /** Generation history belongs to this Studio project. */
  projectId: string;
  /** Type this panel generates/shows (one per rail entry, never mixed). */
  type: AssetType;
  /** External Remix entry (for example Official Assets) can prefill this composer. */
  seedPrompt?: { prompt: string; revision: number };
  comp: Composition; // element card live preview needs theme/canvas
  /** dims: known natural w/h (derived from requested ratio for images) → insert side skips measuring, placeholder is instant. */
  onInsertMedia: (m: MediaRef, label?: string, dims?: { w: number; h: number }) => void;
  /** Drag an asset out of the panel (onto canvas/timeline to insert): report asset on drag start, null on end (same contract as upload panel). */
  onDragAsset?: (asset: PanelDragAsset | null) => void;
  /** Set as main video. Video cards currently only show "insert / reference" (like image cards), so this entry is hidden for now; plumbing kept for later. */
  onSetMainVideo: (url: string) => Promise<void>;
  onInsertElement: (el: GenElementResult, prompt: string) => void;
  /** @mention: drop the asset into the right-side agent's input. Currently hidden on video cards; plumbing kept for later. */
  onMention: (text: string) => void;
  /** Generate one element (composeBlockChecked, not added to the film). */
  generateElement: (prompt: string, base?: GenElementResult) => Promise<GenElementResult>;
  /** Audio panel only: generate one music track (hosted); resolves to its project-history id + stored url. */
  generateAudio?: (prompt: string, durationSec: number) => Promise<{ id: string; url: string }>;
  /** Audio panel only: put a generated track on the music lane at the playhead. */
  onInsertAudio?: (url: string, label?: string) => void;
}

/* ---------------- Element history (localStorage; single source in element-history.ts; image/video history lives server-side) ---------------- */

function loadElementEntries(projectId: string): Entry[] {
  return loadStoredElements(projectId).map((e: ElementEntry): Entry => ({ ...e, type: 'element', status: 'succeeded' }));
}
function saveElementEntries(projectId: string, entries: Entry[]) {
  saveStoredElements(
    projectId,
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

/** Official audio is a semantic generation seed: keep its mood/pacing metadata, never copy the
 * original melody. The current music model is text-to-audio, so this is the faithful Remix input
 * rather than pretending that the source file itself is accepted as an audio reference. */
const AUDIO_META_ZH: Record<string, string> = {
  adventurous: '冒险感', atmospheric: '氛围感', bright: '明亮', calm: '平静', chill: '松弛', compact: '紧凑',
  confident: '自信', dark: '暗黑', dramatic: '戏剧性', emotional: '情绪化', epic: '史诗感', forward: '推进感',
  funny: '幽默', futuristic: '未来感', global: '世界音乐感', happy: '愉快', horror: '惊悚', inspiring: '鼓舞',
  loopable: '适合循环', melancholic: '忧郁', minimal: '极简', modern: '现代', mystery: '神秘', ominous: '不祥',
  optimistic: '乐观', organic: '自然质感', playful: '俏皮', powerful: '有力量', quirky: '古怪有趣', rhythmic: '节奏鲜明',
  romantic: '浪漫', soft: '柔和', suspense: '悬疑', urgent: '紧迫', warm: '温暖',
  low: '低', 'low-medium': '中低', medium: '中等', 'medium-high': '中高', high: '高', variable: '有起伏', 'very-high': '很高',
  'brand-recap': '品牌回顾', 'case-study': '案例解析', casual: '轻松内容', climax: '高潮段落', comedy: '喜剧内容',
  conflict: '冲突场景', corporate: '企业内容', culture: '文化内容', digital: '数字科技', documentary: '纪录片',
  education: '教育内容', explainer: '讲解视频', food: '美食内容', highlights: '高光集锦', intro: '片头',
  investigation: '调查揭秘', kids: '儿童内容', lifestyle: '生活方式', 'light-transition': '轻转场', meditation: '冥想',
  memory: '回忆叙事', opener: '开场', outdoor: '户外内容', outro: '片尾', podcast: '播客', 'product-demo': '产品演示',
  reveal: '揭晓时刻', 'short-social': '社交短视频', 'slow-lifestyle': '慢生活', sports: '运动内容', storytelling: '故事叙述',
  tech: '科技内容', 'tense-story': '紧张叙事', trailer: '预告片', transition: '转场', travel: '旅行', 'true-crime': '真实罪案',
  tutorial: '教程', vlog: 'Vlog', voiceover: '旁白视频', wedding: '婚礼内容',
};

const zhAudioMeta = (value: string): string => AUDIO_META_ZH[value] ?? value;

function officialAudioRemixPrompt(item: OfficialBgm): string {
  if (studioLocale().toLowerCase().startsWith('zh')) {
    const moods = item.moods.length ? item.moods.map(zhAudioMeta).join('、') : item.categoryLabel;
    const uses = item.useCases.length ? item.useCases.slice(0, 4).map(zhAudioMeta).join('、') : '口播视频';
    return `参考《${item.label}》的情绪、节奏与叙事适配度，创作一首全新的原创纯音乐。风格分类：${item.categoryLabel}；情绪：${moods}；能量：${zhAudioMeta(item.energy)}；适合：${uses}。保持相近的氛围和口播兼容性，但不要复制原曲的旋律或编曲。`;
  }
  const moods = item.moods.length ? item.moods.join(', ') : item.categoryLabelEn;
  const uses = item.useCases.length ? item.useCases.slice(0, 4).join(', ') : 'talking-head video';
  return `Create a fresh original instrumental track inspired by the mood and pacing of "${item.label}". ${item.categoryLabelEn}; ${moods} mood; ${item.energy} energy; suitable for ${uses}. Keep a similar atmosphere and narration fit, but do not copy the original melody or arrangement.`;
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

const TYPE_META: Record<AssetType, { ph: string; empty: string }> = {
  image: { ph: 'chatGen.describeImageGenerate', empty: '' },
  video: { ph: 'chatGen.describeShotGenerate', empty: '' },
  element: { ph: 'chatGen.describeOverlayElement', empty: 'chatGen.generatedComponentsStayHere' },
  audio: { ph: 'panels.musicPromptPlaceholder', empty: '' },
};

export function GenChatPanel({ projectId, type, seedPrompt, comp, onInsertMedia, onDragAsset, onInsertElement, generateElement, generateAudio, onInsertAudio }: GenChatPanelProps) {
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
  // Every generation type shares the same templates/mine interaction. Audio is intentionally
  // sourced from the same official catalog as Assets → Official, so these are playable tracks
  // with real covers rather than duplicate prompt-only presets.
  const templates = TEMPLATES_BY_TYPE[type] ?? [];
  const [officialAudio, setOfficialAudio] = useState<OfficialAssetsResponse | null>(null);
  useEffect(() => {
    if (type !== 'audio') return;
    let cancelled = false;
    setOfficialAudio(null);
    void fetch('/api/studio/official-assets')
      .then((r) => (r.ok ? (r.json() as Promise<OfficialAssetsResponse>) : null))
      .then((catalog) => {
        if (!cancelled) setOfficialAudio(catalog ?? {});
      })
      .catch(() => {
        if (!cancelled) setOfficialAudio({});
      });
    return () => {
      cancelled = true;
    };
  }, [type]);
  const hasTemplateLibrary = type === 'audio' || templates.length > 0;
  const [tab, setTab] = useState<'mine' | 'templates'>('mine');
  // remember across sessions whether this panel ever had its own output → get the first frame right (had output → open "mine",
  // otherwise show templates), avoiding the flash of "show templates on empty entries, then switch back to mine once history arrives".
  const hadMineHint = useMemo(() => {
    try {
      return window.localStorage.getItem(`studio:gen-hasmine:${projectId}:${type}`) === '1';
    } catch {
      return false;
    }
  }, [projectId, type]);
  // entries are authoritative only after history loads; before that, trust the persisted hint. Decide templates vs "mine" from this.
  const knownHasMine = loaded ? entries.length > 0 : hadMineHint;
  const showTemplates = hasTemplateLibrary && (tab === 'templates' || !knownHasMine);
  const showTabs = hasTemplateLibrary && knownHasMine;
  const viewKey: 'mine' | 'templates' = showTemplates ? 'templates' : 'mine';
  const viewKeyRef = useRef(viewKey);
  viewKeyRef.current = viewKey;
  // both views share one scroll container: each remembers its own scroll position, restored on tab switch (default: templates to top, mine to bottom)
  const scrollMemRef = useRef<{ mine?: number; templates?: number }>({});

  /** Template card click: fill the prompt into the input (still editable), focus, and return to the edit state next to "mine". */
  const applyTemplate = useCallback((prompt: string) => {
    setInput(prompt);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }, []);
  useEffect(() => {
    if (seedPrompt) applyTemplate(seedPrompt.prompt);
  }, [applyTemplate, seedPrompt]);
  const remixOfficialAudio = useCallback(
    (item: OfficialBgm) => {
      if (item.durationSec) setAudioSec(Math.max(10, Math.min(300, Math.round(item.durationSec))));
      applyTemplate(officialAudioRemixPrompt(item));
    },
    [applyTemplate],
  );

  // On mount, load only this panel type's history for the current project.
  useEffect(() => {
    setEntries([]);
    setLoaded(false);
    if (type === 'element') {
      let cancelled = false;
      setEntries(loadElementEntries(projectId));
      void syncStoredElements(projectId)
        .then((merged) => {
          if (!cancelled && merged) setEntries(merged.map((e): Entry => ({ ...e, type: 'element', status: 'succeeded' })));
        })
        .finally(() => {
          if (!cancelled) setLoaded(true);
        });
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    void listStudioGens(projectId, type)
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
  }, [projectId, type]);

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
      const k = `studio:gen-hasmine:${projectId}:${type}`;
      if (entries.length > 0) window.localStorage.setItem(k, '1');
      else window.localStorage.removeItem(k);
    } catch {
      /* ignore quota/private-mode errors */
    }
  }, [loaded, entries.length, projectId, type]);

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
          pushElementToCloud(projectId, { id, prompt: text, createdAt, element: el }); // project library is cloud-authoritative, new items sync immediately
          setEntries((cur) => {
            const next = cur.map((e) => (e.id === id ? { ...e, status: 'succeeded' as const, element: el } : e));
            saveElementEntries(projectId, next);
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
          const result = await generateAudio!(text, audioSec);
          setEntries((cur) => cur.map((e) => (e.id === id ? { ...e, id: result.id, status: 'succeeded' as const, assets: [{ url: result.url, key: result.url, mime: 'audio/mpeg' }] } : e)));
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
      const res = await startGeneration(projectId, type === 'image' ? 'image-gen' : 'video-gen', params);
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
  }, [input, busy, projectId, type, ratio, count, vidDur, quality, vidRes, refs, baseEl, modelId, generateElement, generateAudio, audioSec]);

  const meta = TYPE_META[type];

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* shimmer placeholder animation (same as fc-shimmer; studio doesn't import free-create.css, defined locally) */}
      <style>{'@keyframes hfgen-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}@media (prefers-reduced-motion: reduce){[style*="hfgen-shimmer"]{animation:none !important}}'}</style>
      {showTabs && (
        <div className="border-line text-ink flex items-center gap-1.5 border-b px-3 py-2 text-[12px]">
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
        </div>
      )}

      {/* stream: template library / my output (newest at bottom) */}
      <div
        ref={listRef}
        onScroll={(e) => {
          scrollMemRef.current[viewKeyRef.current] = e.currentTarget.scrollTop;
        }}
        className="min-h-0 flex-1 overflow-auto p-3"
      >
        {showTemplates ? (
          type === 'audio' ? (
            <OfficialAudioTemplateGallery
              catalog={officialAudio}
              onRemix={remixOfficialAudio}
            />
          ) : (
            <TemplateGallery type={type} templates={templates} onUse={applyTemplate} />
          )
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

function TemplateGallery({
  type,
  templates,
  onUse,
}: {
  type: AssetType;
  templates: GenTemplate[];
  onUse: (prompt: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {templates.map((t) => (
        <TemplateCard key={t.id} type={type} t={t} onUse={onUse} />
      ))}
    </div>
  );
}

function TemplateCard({ type, t: tpl, onUse }: { type: AssetType; t: GenTemplate; onUse: (prompt: string) => void }) {
  if (type === 'element') return <ElementTemplateCard template={tpl} onUse={onUse} />;

  const FallbackIcon = type === 'audio' ? Music2 : Film;
  const fallbackTone = type === 'audio' ? 'from-violet-700 via-indigo-800 to-slate-950' : 'from-neutral-700 to-neutral-900';
  const prompt = localizedTemplatePrompt(tpl, studioLocale());
  return (
    <button
      type="button"
      title={prompt}
      aria-label={`${tpl.title ? t(tpl.title) : ''} · ${t('chatGen.remix')}`}
      onClick={() => onUse(prompt)}
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
        // Text-only template: type-specific title card + prompt summary.
        <div className={`flex aspect-[4/5] flex-col justify-between bg-gradient-to-br p-2.5 ${fallbackTone}`}>
          <div className="flex items-center justify-between">
            <FallbackIcon size={14} className="text-white/60" />
            {type === 'audio' && (
              <span className="flex h-3 items-end gap-px opacity-55" aria-hidden>
                {[5, 10, 7, 12, 8, 4].map((h, i) => <i key={i} className="w-px rounded-full bg-white" style={{ height: h }} />)}
              </span>
            )}
          </div>
          <div>
            <div className="text-[12px] font-medium leading-tight text-white">{tpl.title ? t(tpl.title) : ''}</div>
            <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-white/60">{prompt}</div>
          </div>
        </div>
      )}
      <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[9.5px] text-white">
        {t(zhCategory(tpl.category))}
      </span>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100 group-focus-within:bg-black/35 group-focus-within:opacity-100">
        <span className="text-ink rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium">
          {t('chatGen.remix')}
        </span>
      </span>
    </button>
  );
}

/** Audio templates are real official tracks: cover + inline preview + semantic Remix into the composer. */
function OfficialAudioTemplateGallery({
  catalog,
  onRemix,
}: {
  catalog: OfficialAssetsResponse | null;
  onRemix: (item: OfficialBgm) => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const { playingUrl, toggle } = useAudioPreview();
  const english = !studioLocale().toLowerCase().startsWith('zh');
  const rows = catalog?.bgm ?? [];
  const categories = catalog?.bgmCategories ?? [];
  const filterItemClass = 'pl-2 text-[10.5px] data-[state=checked]:bg-panel-2 data-[state=checked]:text-ink [&>span:first-child]:hidden';
  const needle = query.trim().toLocaleLowerCase();
  const visible = rows.filter((item) => {
    if (category !== 'all' && item.category !== category) return false;
    if (!needle) return true;
    return [
      item.label,
      item.artist,
      item.categoryLabel,
      item.categoryLabelEn,
      item.energy,
      item.narrationFit,
      ...item.moods,
      ...item.useCases,
    ].some((value) => value.toLocaleLowerCase().includes(needle));
  });

  if (catalog === null) {
    return (
      <div className="text-ink-4 flex items-center justify-center gap-2 py-12 text-[11px]">
        <Loader2 size={13} className="animate-spin" /> {t('panels.loading')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="bg-panel sticky -top-3 z-10 -mx-1 flex items-center gap-1.5 px-1 pb-1 pt-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={t('panels.filterOfficialAssets')}
              aria-label={t('panels.filterOfficialAssets')}
              className={`border-line hover:text-ink inline-flex size-7 shrink-0 items-center justify-center rounded-md border transition active:translate-y-px ${
                category === 'all' ? 'text-ink-4' : 'bg-panel-2 text-ink'
              }`}
            >
              <SlidersHorizontal size={12} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={5} className="max-h-[420px] min-w-[180px] overflow-auto">
            <DropdownMenuRadioGroup value={category} onValueChange={setCategory}>
              <DropdownMenuRadioItem value="all" className={filterItemClass}>
                <span className="truncate">{t('panels.all')}</span>
                {category === 'all' && <Check size={10} className="ml-auto shrink-0" />}
              </DropdownMenuRadioItem>
              {categories.length > 0 && <DropdownMenuSeparator />}
              {categories.map((item: OfficialCategory) => (
                <DropdownMenuRadioItem key={item.id} value={item.id} className={filterItemClass}>
                  <span className="truncate">{english ? item.labelEn : item.label}</span>
                  {category === item.id && <Check size={10} className="ml-auto shrink-0" />}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <label className="border-line bg-panel-2 flex min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2">
          <Search size={12} className="text-ink-4 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('panels.searchOfficialAudio')}
            aria-label={t('panels.searchOfficialAudio')}
            className="text-ink placeholder:text-ink-4 h-7 min-w-0 flex-1 bg-transparent text-[11px] outline-none"
          />
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="text-ink-4 border-line rounded-md border border-dashed px-3 py-8 text-center text-[10.5px]">
          {rows.length === 0 ? t('panels.officialPreparing') : t('panels.noMatchingAssetsTry')}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {visible.map((item: OfficialBgm) => {
            const playing = playingUrl === item.url;
            return (
              <div key={item.id} className="border-line bg-panel hover:bg-panel-2 group relative flex items-center gap-2 rounded-lg border p-1.5 transition-colors">
                <button
                  type="button"
                  onClick={() => toggle(item.url)}
                  aria-label={playing ? t('panels.pauseAudio') : t('panels.playAudio')}
                  title={item.label}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="bg-panel-2 relative size-11 shrink-0 overflow-hidden rounded-md">
                    <img src={imageThumb(item.coverKey, 'thumb')} alt="" loading="lazy" className="size-full object-cover" />
                    <span className={`absolute inset-0 flex items-center justify-center text-white ${playing ? 'bg-accent/75' : 'bg-black/25'}`}>
                      {playing ? <Pause size={14} /> : <Play size={14} />}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-ink block truncate text-[11px] font-medium">{item.label}</span>
                    <span className="text-ink-4 mt-0.5 flex min-w-0 items-center gap-1 text-[9.5px]">
                      <Music2 size={9} className="shrink-0" />
                      <span className="truncate">{item.artist}</span>
                      <span>·</span>
                      <span className="shrink-0">{item.durationSec ? fmtDur(item.durationSec) : (english ? item.categoryLabelEn : item.categoryLabel)}</span>
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemix(item)}
                  title={t('chatGen.remix')}
                  className="bg-accent text-bg pointer-events-none absolute right-1.5 top-1/2 inline-flex h-7 -translate-y-1/2 items-center gap-1 rounded-md px-2 text-[10px] font-medium opacity-0 shadow-sm transition-[opacity,transform] duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
                >
                  <RefreshCw size={10} /> {t('chatGen.remix')}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
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
            {onAddRef && <ActionChip icon={RefreshCw} label={t('chatGen.remix')} onClick={() => onAddRef(e.assets![0]!)} />}
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
            {onAddRef && <ActionChip icon={RefreshCw} label={t('chatGen.remix')} onClick={() => onAddRef(e.assets![0]!)} />}
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
        {onUseAsBase && <ActionChip icon={RefreshCw} label={t('chatGen.remix')} onClick={() => onUseAsBase(el, prompt)} />}
      </div>
    </div>
  );
}
