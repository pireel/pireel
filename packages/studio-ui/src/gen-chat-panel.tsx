'use client';

/**
 * 生成面板(生图 / 生视频 / 生组件共用组件,按 type 特化 —— 用户定的形态:
 * **入口分开、面板单类型、交互一致**):历史是「任务卡」流不是对话流——每条生成相互
 * **独立、无上下文**(用户定的:别做成 chat 信息流);要带上下文只有一条路:在图片卡上点
 * 「参考」把具体图片选进 composer 的参考位(reference_images),不选就是纯文生图。
 * 输入 = 圆角 composer,参数收在滑杆 popover(比例/时长/数量),回车即生成。
 * 素材动作:插入画面(到播放头)/ 参考(图→reference_images、视频→reference_videos,喂下一条生成)。
 *
 * 数据面:图/视频走 /api/create 生成栈(服务端持久历史,pending 挂载续轮询);组件走
 * composeBlockChecked(客户端生成,不自动进片子,历史存 localStorage,插入时重作用域 id)。
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

type AssetType = 'image' | 'video' | 'element';

interface Entry {
  id: string;
  type: AssetType;
  prompt: string;
  status: 'pending' | 'succeeded' | 'failed';
  createdAt: number;
  /** 发起时的比例(pending 占位条按它撑形状) */
  ratio?: string;
  assets?: GenAsset[];
  element?: GenElementResult;
  error?: string;
}

export interface GenChatPanelProps {
  /** 本面板生成/展示的类型(每个 rail 入口一种,不混)。 */
  type: AssetType;
  comp: Composition; // 组件卡活预览要主题/画布
  /** dims:已知自然宽高(生图按请求比例反推)→ 插入端免量尺寸,占位即时。 */
  onInsertMedia: (m: MediaRef, label?: string, dims?: { w: number; h: number }) => void;
  /** 产物拖出面板(拖到画面/时间轴插入):开始拖报素材,结束报 null(与上传面板同契约)。 */
  onDragAsset?: (asset: (MediaRef & { label?: string; dims?: { w: number; h: number } }) | null) => void;
  /** 设为主视频。目前视频卡只留「插入画面 / 参考」(与图片卡一致),此入口暂不外显,plumbing 保留备用。 */
  onSetMainVideo: (url: string) => Promise<void>;
  onInsertElement: (el: GenElementResult, prompt: string) => void;
  /** @引用:把素材塞进右侧 agent 的输入框。目前视频卡不外显此入口,plumbing 保留备用。 */
  onMention: (text: string) => void;
  /** 生成一个组件(composeBlockChecked,不进片子)。 */
  generateElement: (prompt: string, base?: GenElementResult) => Promise<GenElementResult>;
  /** 仅组件面板:插一个基础块(块类型注册表,原模板面板的入口收编到这)。 */
  onInsertTemplate?: (templateId: string) => void;
}

/* ---------------- 组件历史(localStorage,单一来源在 element-history.ts;图/视频历史在服务端) ---------------- */

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

/* ---------------- 小件(popover/胶囊/行,同项目线 composer-gen-controls 的观感) ---------------- */

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

/** 请求比例 'W:H' → 宽高(比例即可,插入端只用 h/w 定盒)。拿不到 = undefined,让插入端量。 */
function ratioDims(size: string | undefined): { w: number; h: number } | undefined {
  const m = (size ?? '').match(/^(\d+):(\d+)$/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : undefined;
}

/**
 * 提交给 image-gen 的 size。gpt-image 要具体 WxH(其它模型吃 aspect):
 *  - 计费 tier_param='image_tier'=`${quality}_${sizeTier}`,sizeTier 由 WxH 反推(见 pickGptImageSizeTier);
 *    发 aspect 会退回 base、质量白选;发 WxH 才让不同 quality 算出不同积分。
 *  - provider 也需要合法尺寸(gpt 不吃 '9:16')。16:9/9:16 默认 2K、1:1 只有 1K。
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

/* ---------------- 面板 ---------------- */

const TYPE_META: Record<AssetType, { title: string; ph: string; empty: string }> = {
  image: { title: '图片', ph: '描述要生成的画面…', empty: '' },
  video: { title: '视频', ph: '描述要生成的镜头…', empty: '' },
  element: { title: '组件', ph: '描述叠加组件…', empty: '生成的组件会留在这里\n点「插入」才进片子,同一个可插多次' },
};

export function GenChatPanel({ type, comp, onInsertMedia, onDragAsset, onInsertElement, generateElement, onInsertTemplate }: GenChatPanelProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const [loaded, setLoaded] = useState(false); // 历史拉回前不拿 entries 空判视图(免「模板→我的」闪切)
  const [input, setInput] = useState('');
  const [ratio, setRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [count, setCount] = useState(1); // 仅图
  const shell = useStudioShell();
  const [vidDur, setVidDur] = useState('5'); // 仅视频:时长档(随模型,见 videoDurationOptions)
  const [quality, setQuality] = useState(''); // 仅图:质量/分辨率档(随模型,见 qualityConfigFor)
  const [vidRes, setVidRes] = useState('720p'); // 仅视频:分辨率(随模型,见 videoResolutionOptions)
  const [busy, setBusy] = useState(false); // 提交瞬间锁(生成本身并发跑)
  const [credits, setCredits] = useState<{ need: number; balance: number } | null>(null);
  // 参考图(仅图面板):显式选中的图片才进下一条生成的 reference_images —— 这是唯一的上下文通道
  const [refs, setRefs] = useState<GenAsset[]>([]);
  // 组件底稿:选中某个已生成组件,下一条指令在它基础上改(单个,可替换/移除)
  const [baseEl, setBaseEl] = useState<{ el: GenElementResult; prompt: string } | null>(null);
  const [preview, setPreview] = useState<GenAsset | null>(null); // 灯箱:hover 预览镜点开的大图
  const listRef = useRef<HTMLDivElement | null>(null);
  // 模型清单(用户可选;list[0] = 默认,与 create 路由挑的兜底同源)。选中的 modelId 既进
  // 提交参数(model_id),也喂 useQuote 拿"按钮旁的预估积分"。组件走客户端 compose,无模型。
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [modelId, setModelId] = useState('');
  useEffect(() => {
    if (type === 'element') return;
    let cancelled = false;
    void fetch(`/api/models?kind=${type}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { models?: Array<{ id?: string; name?: string }> } | null) => {
        if (cancelled || !Array.isArray(j?.models)) return;
        const list = j.models.filter((m): m is { id: string; name?: string } => typeof m?.id === 'string').map((m) => ({ id: m.id, name: m.name ?? m.id }));
        setModels(list);
        if (list[0]) setModelId((cur) => cur || list[0]!.id); // 默认第一款,用户没选过才落
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [type]);
  // 切模型 → 质量档 reset 到新模型默认;视频分辨率钳到新模型支持的档(各家档位不同)
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
    return {};
  }, [type, ratio, count, vidDur, quality, vidRes, modelId]);
  // 组件:modelId 传空 → useQuote 直接给 null,不发请求
  const quoteCredits = useQuote({ toolId: type === 'video' ? 'video-gen' : 'image-gen', modelId: type === 'element' ? '' : modelId, params: quoteParams });
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // 模板 / 我的 分栏:图、视频面板才有模板库(组件走「基础块」不在此)
  const templates = type === 'element' ? [] : (TEMPLATES_BY_TYPE[type] ?? []);
  const [tab, setTab] = useState<'mine' | 'templates'>('mine');
  // 跨会话记住这个面板有没有过自己的产物 → 首帧就能定对(有产物直接开「我的」,没有才铺模板),
  // 免掉「历史异步回来前先按 entries 空铺模板、回来后又切回我的」的闪切。
  const hadMineHint = useMemo(() => {
    try {
      return window.localStorage.getItem(`studio:gen-hasmine:${type}`) === '1';
    } catch {
      return false;
    }
  }, [type]);
  // 历史拉回后 entries 才权威;之前信持久提示。据此决定该铺模板还是「我的」。
  const knownHasMine = loaded ? entries.length > 0 : hadMineHint;
  const showTemplates = templates.length > 0 && (tab === 'templates' || !knownHasMine);
  const showTabs = templates.length > 0 && knownHasMine;
  const viewKey: 'mine' | 'templates' = showTemplates ? 'templates' : 'mine';
  const viewKeyRef = useRef(viewKey);
  viewKeyRef.current = viewKey;
  // 两个视图共用一个滚动容器:各记各的滚动位置,切 tab 时还原(缺省:模板到顶、我的到底)
  const scrollMemRef = useRef<{ mine?: number; templates?: number }>({});

  /** 模板卡点击:提示词填进输入框(可再编辑),聚焦并切回「我的」旁的编辑态。 */
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

  // 挂载:只拉本面板类型的历史(组件在 localStorage,图/视频在服务端含 pending)
  useEffect(() => {
    if (type === 'element') {
      setEntries((cur) => {
        const seen = new Set(cur.map((e) => e.id));
        return [...cur, ...loadElementEntries().filter((e) => !seen.has(e.id))].sort((a, b) => a.createdAt - b.createdAt);
      });
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

  // pending(服务端)轮询
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

  // 落持久提示:历史权威后,有产物记 '1'、没有清掉 —— 下次开面板首帧直接定对视图(见 hadMineHint)
  useEffect(() => {
    if (!loaded) return;
    try {
      const k = `studio:gen-hasmine:${type}`;
      if (entries.length > 0) window.localStorage.setItem(k, '1');
      else window.localStorage.removeItem(k);
    } catch {
      /* 配额/隐私模式忽略 */
    }
  }, [loaded, entries.length, type]);

  // 切 tab(视图切换)→ 还原该视图上次的滚动位置;首次进:模板到顶、我的到最新(底)
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const saved = scrollMemRef.current[viewKey];
    el.scrollTop = saved != null ? saved : viewKey === 'templates' ? 0 : el.scrollHeight;
  }, [viewKey]);

  // 我的:冒出新条目 → 滚到最新(底);模板视图下别抢滚动
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
    setTab('mine'); // 发起后回到「我的」,好看到刚冒出的产物
    try {
      if (type === 'element') {
        const id = `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const createdAt = Date.now();
        setEntries((cur) => [...cur, { id, type: 'element', prompt: text, status: 'pending', createdAt }]);
        setInput('');
        setBusy(false); // 组件生成较久,先解锁输入(生成在后台继续)
        try {
          const el = await generateElement(text, baseEl?.el);
          pushElementToCloud({ id, prompt: text, createdAt, element: el }); // 组件库云端为准,新品即上云
          setEntries((cur) => {
            const next = cur.map((e) => (e.id === id ? { ...e, status: 'succeeded' as const, element: el } : e));
            saveElementEntries(next);
            return next;
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : t('生成失败');
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
  }, [input, busy, type, ratio, count, vidDur, quality, vidRes, refs, baseEl, modelId, generateElement]);

  const meta = TYPE_META[type];

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* shimmer 占位动画(同项目线 fc-shimmer;studio 不引 free-create.css,本地定义) */}
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
                {tb === 'mine' ? t('我的') : t('模板')}
              </button>
            ))}
          </div>
        ) : (
          <span className="truncate">{t(meta.title)}</span>
        )}
      </div>


      {/* 流:模板库 / 我的产物(新的在底) */}
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
                  onUseAsBase={type === 'element' ? (el2, p2) => setBaseEl({ el: el2, prompt: p2 }) : undefined}
                  onAddRef={
                    // 图/视频面板才有素材参考:图进 reference_images(≤4),视频进 reference_videos(≤3);
                    // 组件面板的「参考」=底稿(onUseAsBase),不收图
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

      {/* 灯箱:点图(hover 预览镜)看大图;点任意处/Esc 关 */}
      {preview && <Lightbox asset={preview} onClose={() => setPreview(null)} />}

      {/* composer:参数收在滑杆 popover,主体就是打字 + 发送 */}
      <div className="px-3 pb-3 pt-1">
        {credits && shell.CreditsCard && (
          <div className="mb-2">
            <shell.CreditsCard need={credits.need} balance={credits.balance} />
          </div>
        )}
        {/* composer 观感与对话面板严格同规格:bg-panel-2 / rounded-md / min-h 64 / text-13(用户定的:三个面板输入框统一) */}
        <div className="border-line bg-panel-2 focus-within:border-ink-4 rounded-md border transition-colors">
          {baseEl && (
            <div className="flex items-center gap-1.5 px-3 pt-2.5">
              <span className="border-accent/50 bg-accent/10 text-ink inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10.5px]">
                {t('基于:{name}', { name: baseEl.prompt.slice(0, 16) || baseEl.el.label })}
                <button type="button" aria-label={t('移除底稿')} onClick={() => setBaseEl(null)} className="text-ink-3 hover:text-ink">
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
                    // 视频参考:首帧当缩略(preload=metadata),裸 key 走 original 直读原片
                    <video src={imageThumb(r.key, 'original')} muted playsInline preload="metadata" className="h-8 w-8 bg-black object-cover" />
                  ) : (
                    <img src={imageThumb(r.key, 'inline')} alt="" className="h-8 w-8 object-cover" />
                  )}
                  {/* 删除:hover 出现在右上角(不再占「参考图」标签位) */}
                  <button
                    type="button"
                    aria-label={type === 'video' ? t('移除参考片') : t('移除参考图')}
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
            aria-label={t('生成素材描述')}
            className="text-ink placeholder:text-ink-4 max-h-[200px] min-h-[64px] w-full resize-none bg-transparent px-3 pb-1.5 pt-2.5 text-[13px] leading-relaxed outline-none"
          />
          <div className="flex items-center gap-1 px-2 pb-2 pt-1">
            {type !== 'element' && (
              <>
                {models.length > 1 && (
                  <select
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    aria-label={t('选择模型')}
                    title={t('模型')}
                    className="border-line bg-panel-2 text-ink-2 focus:border-ink-4 max-w-[140px] shrink truncate rounded-md border py-1 pl-2 pr-1 text-[11px] outline-none"
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}
                <PopButton icon={<Sliders size={15} strokeWidth={2.2} />} title={t('生成参数')}>
                  {/* 质量/分辨率:随模型变(有些模型多档,单档不显)——参考 /image 工作室 */}
                  {type === 'image' && qualityCfg && qualityCfg.options.length > 1 && (
                    <Row label={t('质量')}>
                      {qualityCfg.options.map((o) => (
                        <Pill key={o.value} selected={quality === o.value} onClick={() => setQuality(o.value)}>
                          {o.label}
                        </Pill>
                      ))}
                    </Row>
                  )}
                  {type === 'video' && vidResOpts.length > 1 && (
                    <Row label={t('分辨率')}>
                      {vidResOpts.map((r) => (
                        <Pill key={r} selected={vidRes === r} onClick={() => setVidRes(r)}>
                          {r}
                        </Pill>
                      ))}
                    </Row>
                  )}
                  <Row label={t('比例')}>
                    {(type === 'image' ? (['9:16', '16:9', '1:1'] as const) : (['9:16', '16:9'] as const)).map((r) => (
                      <Pill key={r} selected={ratio === r} onClick={() => setRatio(r)}>
                        {r}
                      </Pill>
                    ))}
                  </Row>
                  {type === 'image' ? (
                    <Row label={t('数量')}>
                      {[1, 2, 3, 4].map((n) => (
                        <Pill key={n} selected={count === n} onClick={() => setCount(n)}>
                          {n}
                        </Pill>
                      ))}
                    </Row>
                  ) : (
                    <Row label={t('时长')}>
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
                  {type === 'image' ? (count > 1 ? ` · ${t('{count}张', { count })}` : '') : ` · ${vidDur}s · ${vidRes}`}
                </span>
              </>
            )}
            <div className="ml-auto flex items-center gap-2">
              {type !== 'element' && quoteCredits != null && (
                <span className="text-ink-4 text-[10.5px] tabular-nums" title={t('本次生成消耗积分')}>
                  {t('{n} 积分', { n: quoteCredits })}
                </span>
              )}
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || !input.trim()}
                aria-label={t('生成')}
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

/* ---------------- 流内条目:用户气泡 + 产物 ---------------- */

/** 任务卡说明:最多两行,溢出时尾部给展开/收起箭头(用户定的)。 */
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
          aria-label={expanded ? t('收起') : t('展开')}
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

/** 大图灯箱:preview 预设(1024 宽)兜清晰度;点任意处/Esc 关。 */
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
      aria-label={t('关闭预览')}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/70 p-6"
    >
      <img src={imageThumb(asset.key, 'preview')} alt="" className="max-h-full max-w-full rounded-lg shadow-2xl" />
    </div>
  );
}

/* ---------------- 模板库:点卡片把提示词填进输入框 ---------------- */

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
        // 视频模板有成品:循环小视频卡(静音、hover 才播,省流量);裸 key 走 original 直读原片
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
        // 视频模板无成品预览:深色渐变卡 + 标题 + 提示词摘要
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
        <span className="text-ink rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium">{t('填入并编辑')}</span>
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
}: {
  entry: Entry;
  comp: Composition;
  /** 图/视频面板:把这张产物选为下一条生成的参考(图→reference_images,视频→reference_videos) */
  onAddRef?: (a: GenAsset) => void;
  /** 组件面板:把这个组件设为底稿——下一条指令在它基础上改。 */
  onUseAsBase?: (el: GenElementResult, prompt: string) => void;
  /** 点图/hover 预览镜 → 面板级灯箱看大图 */
  onPreview: (a: GenAsset) => void;
} & Pick<GenChatPanelProps, 'onInsertMedia' | 'onDragAsset' | 'onInsertElement'>) {
  return (
    <div className="flex flex-col gap-1.5">
      {/* 任务卡口径:提示词是这条生成的说明小字,不是对话发言(每条生成相互独立,无上下文) */}
      <PromptLine text={e.prompt} />

      {/* 产物(左侧) */}
      {e.status === 'pending' && (
        <div
          // self-start:不被 flex-col 拉满宽度,否则 aspectRatio 让位给拉伸宽 → 变全宽
          className="border-line self-start rounded-lg border"
          style={
            e.type === 'element'
              ? { height: 120, width: 180, ...SHIMMER }
              : { height: e.type === 'video' ? 120 : 112, aspectRatio: ratioToCss(e.ratio), ...SHIMMER }
          }
        />
      )}
      {e.status === 'failed' && <div className="text-destructive text-[11.5px]">{t('生成失败')}{e.error ? `:${e.error}` : ''}</div>}

      {e.status === 'succeeded' && e.type === 'element' && e.element && (
        <ElementResult el={e.element} prompt={e.prompt} comp={comp} onInsertElement={onInsertElement} onUseAsBase={onUseAsBase} />
      )}

      {e.status === 'succeeded' && e.type === 'image' && (e.assets?.length ?? 0) > 0 && (
        <div className="flex flex-col items-start gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            {e.assets!.map((a, i) => (
              // 缩略保持原始比例(strip 预设只限宽不裁);hover 出预览镜,点开灯箱
              <button
                key={i}
                type="button"
                title={t('预览大图（也可拖到画面 / 时间轴插入）')}
                aria-label={t('预览大图')}
                onClick={() => onPreview(a)}
                draggable
                onDragStart={(ev) => {
                  ev.dataTransfer.effectAllowed = 'copy';
                  onDragAsset?.({ type: 'image', url: a.url, label: e.prompt.slice(0, 12) || t('配图'), dims: ratioDims(e.ratio) });
                }}
                onDragEnd={() => onDragAsset?.(null)}
                className="border-line group relative block shrink-0 overflow-hidden rounded-lg border"
                // 请求时已知比例:成图占同一个比例盒(=占位图 height 112 + aspectRatio),字节加载前也不塌 → 零跳动
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
            <ActionChip icon={Plus} label={t('插入画面')} onClick={() => onInsertMedia({ type: 'image', url: e.assets![0]!.url }, e.prompt.slice(0, 12) || t('配图'), ratioDims(e.ratio))} />
            {onAddRef && <ActionChip icon={ImagePlus} label={t('参考')} onClick={() => onAddRef(e.assets![0]!)} />}
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
            title={t('也可拖到画面 / 时间轴插入')}
            draggable
            onDragStart={(ev) => {
              ev.dataTransfer.effectAllowed = 'copy';
              onDragAsset?.({ type: 'video', url: e.assets![0]!.url, label: e.prompt.slice(0, 12) || t('视频素材'), dims: ratioDims(e.ratio) });
            }}
            onDragEnd={() => onDragAsset?.(null)}
            className="border-line max-h-44 w-fit max-w-full rounded-lg border bg-black"
          />
          <div className="flex flex-wrap gap-1">
            <ActionChip icon={Plus} label={t('插入画面')} onClick={() => onInsertMedia({ type: 'video', url: e.assets![0]!.url }, e.prompt.slice(0, 12) || t('视频素材'), ratioDims(e.ratio))} />
            {onAddRef && <ActionChip icon={ImagePlus} label={t('参考')} onClick={() => onAddRef(e.assets![0]!)} />}
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
        <ActionChip icon={Plus} label={t('插入画面')} onClick={() => onInsertElement(el, prompt)} />
        {onUseAsBase && <ActionChip icon={ImagePlus} label={t('参考')} onClick={() => onUseAsBase(el, prompt)} />}
      </div>
    </div>
  );
}
