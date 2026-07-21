'use client';

/**
 * 素材库 —— 图片/视频/组件/上传的聚合面(用户定的:按资产分类、来源变徽标)。
 * 位置在预览区右侧、时间轴上方(不在右 rail;右侧释放给对话)。
 *
 * 数据面:上传素材(/api/me/materials)+ 生成图/视频(/api/create studio 空间历史)
 * + 组件(生成的叠加 HTML 块,localStorage 见 element-history)合并成一张时间倒序
 * 网格,来源徽标区分;pending 生成在网格顶部占位,4s 轮询到位后原地变素材。
 *
 * 生成不是独立面板 —— 库头部一个「生成」入口(弹层归 workbench,onOpenGen 上抛),
 * 弹层关闭后 genRefreshTick 自增触发重拉。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
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

/** 库内条目的统一口径(上传/生成图视频/组件三路都归一到这)。 */
const STATIC_ELEMENT_PREVIEW_COMP: Composition = { width: 1920, height: 1080, theme: 'general', video: null, blocks: [], shots: [] };

interface LibraryItem {
  id: string;
  kind: 'image' | 'video' | 'element';
  origin: 'upload' | 'gen' | 'preset';
  /** 仅组件:预置分类(数据/结构/…);用户组件无此字段=「我的」。 */
  category?: string;
  /** 插入/预览用的完整原图直链(组件无)。 */
  insertUrl?: string;
  /** 缩略图源(裸 key 或 URL,过 imageThumb);null → 视频用 <video> 首帧或占位。 */
  thumbSrc?: string | null;
  label: string;
  createdAt: number;
  width?: number | null;
  height?: number | null;
  /** 上传素材/组件可删;生成图视频历史归生成空间,不在库里删。 */
  deletable: boolean;
  uploadId?: string;
  /** 仅组件:插入用的产物(seedId 重作用域在插入端做)。 */
  element?: GenElementResult;
  prompt?: string;
}

type KindFilter = 'all' | 'image' | 'video' | 'element';

/** 面板拖出的素材载荷:图/视频=MediaRef+尺寸;组件=本体(seedId 重作用域在插入端)。 */
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

/** 上传前量本地文件自然宽高(instant,无网络)→ 落库存起来,之后瀑布流/插入直接用。 */
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
    insertUrl: a.url, // gen-api 已是完整原图直链
    thumbSrc: kind === 'image' ? a.key : null, // 生成视频无抽帧,缩略走 <video> 首帧
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
  /** 组件卡活预览要主题/画布(BlockPreviewFrame)。 */
  comp: Composition;
  onInsert: (asset: MediaRef, label?: string, dims?: { w: number; h: number }) => void;
  /** 插入一个组件(seedId 重作用域、目标空件回填都在插入端)。 */
  onInsertElement: (el: GenElementResult, prompt: string) => void;
  /** 拖出素材(dragstart 传素材,dragend 传 null)——workbench 据此在舞台/时间轴盖拖放接驳层。 */
  onDragAsset?: (asset: PanelDragAsset | null) => void;
  /** 打开生成浮窗(浮窗归 workbench;anchor=触发按钮矩形,popover 式就近弹出)。 */
  onOpenGen: (type: GenType, anchor?: DOMRect) => void;
  /** 生成弹层关闭时自增 → 重拉生成历史/组件。 */
  genRefreshTick?: number;
}) {
  const [kind, setKind] = useState<KindFilter>('all');
  // 组件分类浏览(用户定的:「我的」第一类,每类一行两卡,分类头右箭头进详情)
  const [elCat, setElCat] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>(() =>
    typeof window !== 'undefined' && window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid',
  );
  const [q, setQ] = useState('');
  const [uploads, setUploads] = useState<LibraryItem[]>([]);
  const [gens, setGens] = useState<GenJob[]>([]); // image+video 混存,item 化时按 kind 标
  const [elements, setElements] = useState<ElementEntry[]>([]);
  const genKindRef = useRef<Map<string, 'image' | 'video'>>(new Map());
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<LibraryItem | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // 上传素材:图/视频并行拉齐后合并(接口 kind 单值必填)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const get = (k: 'image' | 'video') =>
      fetch(`/api/me/materials?tab=global&kind=${k}&limit=200`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { items?: MaterialItem[] } | null) => j?.items ?? [])
        .catch(() => [] as MaterialItem[]);
    void Promise.all([get('image'), get('video')]).then(([imgs, vids]) => {
      if (cancelled) return;
      setUploads([...imgs, ...vids].map(materialToItem).filter((x): x is LibraryItem => !!x));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  // 生成历史 + 组件:挂载/弹层关闭时重拉。组件=先同步读缓存秒开,再拉云端合并
  // (云端为准;本地独有的回填上云,见 element-history)
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
    scrollRef.current?.scrollTo(0, 0); // 两种视图行高不同,旧 scrollTop 会落在随机位置
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* 隐私模式写不进就算了 */
    }
  };

  const items = useMemo(() => {
    const genItems = gens.flatMap((j) => {
      const k = genKindRef.current.get(j.id);
      return k ? genToItems(j, k) : [];
    });
    return [...uploads, ...genItems, ...elements.map(elementToItem)].sort((a, b) => b.createdAt - a.createdAt);
  }, [uploads, gens, elements]);

  // 组件库=「我的」+ 按主题分组:内容物是**口播叠加件**(卡片尺度、居中自持,不是整页
  // PPT——用户定的;整页设计留在主题墙给 AI 场景参照)。同一套叠加件结构 × 各主题皮肤:
  // 主题 token 以块作用域**烘焙进 innerHtml**(data-hf-baked)——预览、插入、换主题三态
  // 同一份样子,插入后不吃项目主题/其他组件影响(独立性,用户定的)
  const frames = useFrameCatalog();
  const themeGroups = useMemo(() => {
    const loc = studioLocale();
    const base = presetElements();
    return frames.map((fr) => ({
      id: fr.id,
      title: framePack(loc, fr.id)?.title ?? fr.title,
      items: (() => {
        const vars = themeVarsCss(getTheme('general'), fr.palette ?? undefined);
        // 专属叠加件集(方言手作,特色长在件上)优先;没做的主题回落通用结构×皮肤
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
  // 叠加件预览:**静态**16:9 画布常量——token 已烘焙,预览与项目 comp 零依赖,
  // chat 挂/换主题(comp.palette 变)不再连带重渲整墙组件卡(用户报的"跟着刷")
  const presetPreviewComp = STATIC_ELEMENT_PREVIEW_COMP;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // 组件筛选下主题组件一并进搜索池(createdAt=0 天然排最后)
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

  /** 网格卡(瀑布流/分类概览/分类详情共用):点击预览、可拖、hover 插入/删除。 */
  const gridCard = (it: LibraryItem) => (
    <div key={it.id} className="border-line hover:border-accent group relative mb-1.5 inline-block w-full break-inside-avoid overflow-hidden rounded-md border align-top transition">
      <button
        type="button"
        title={t('预览：{label}（拖到画面上可插入）', { label: it.label })}
        onClick={() => setPreview(it)}
        {...dragProps(it)}
        className="block w-full cursor-zoom-in text-left"
      >
        {/* 预置卡缩略统一 16:9(竖画布下真实比例大片留白);灯箱/插入仍用真实画布 */}
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
        const dims = await fileDims(f, k); // 本地量,连同上传一起落库
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

  /** 删除:上传素材=软删接口(乐观移除失败回滚);组件=移出本地历史。 */
  const doDelete = async (it: LibraryItem) => {
    if (it.kind === 'element') {
      const ok = await confirm({
        title: t('删除这个组件?'),
        description: t('组件历史里会移除它,已经插进片子的不受影响。'),
        tone: 'danger',
        confirmLabel: t('删除'),
      });
      if (!ok) return;
      removeElementEntry(it.id.slice(3)); // 'el:' 前缀
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
      setUploads(prev); // 失败回滚,别让素材凭空消失
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
    // 组件与图片同权可拖(用户定的统一):载荷带组件本体,落点语义在 workbench
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
                  setElCat(null); // 换筛选回到分类概览
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

      {/* 卡片式内容留白;列表式全宽贴边,留白在行内 padding */}
      <div ref={scrollRef} className={`min-h-0 flex-1 overflow-auto ${view === 'grid' ? 'p-2' : ''}`}>
        {/* pending 生成:占位卡置顶,到位后原地变素材 */}
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
          // 组件分类浏览(用户定的):「我的」第一类;概览每类一行两卡,分类头右箭头进详情
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
          // 瀑布流:CSS 多列,卡片按真实宽高比排,两列高低错落
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

      {/* 预览灯箱:点素材看大图/视频;插入仍走卡片上的「插入」按钮(这里也给一个顺手插) */}
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

/** 素材大图/视频预览:点背板 / Esc 关;底部给一个「插入到画面」顺手插。
 *  原图/原片直链不小,就绪前给「加载中」占位(用户点名补的)。 */
function AssetLightbox({ item, comp, onClose, onInsert }: { item: LibraryItem; comp: Composition; onClose: () => void; onInsert: () => void }) {
  // 组件=本地 iframe 活预览,即挂即有(无网络加载),不走 ready 占位
  const [ready, setReady] = useState(item.kind === 'element');
  // 就绪前的占位框按素材真实宽高比撑好(组件=画布比;库里没尺寸的先 16:9)
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
        // 宽 = min(视口余量, 78vh×比例) → 高度恰好 ≤78vh,占位与成品同尺寸
        style={{ aspectRatio: ar, width: `min(calc(100vw - 6rem), calc(78vh * ${ar}))` }}
      >
        {!ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/85">
            <Loader2 size={26} className="animate-spin" />
            <span className="text-[12px]">{t('加载中…')}</span>
          </div>
        )}
        {item.kind === 'element' && item.element ? (
          // 组件活预览:自动循环播(与卡片 hover 播同一渲染,只是常播 + 大尺寸)
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

/** 组件卡活预览:与生成面板同一渲染(定格入场后的稳定帧,hover 才循环播)。
 *  列宽随瀑布流(约 145px),用容器实测宽喂 BlockPreviewFrame 免横向溢出。 */
function ElementTile({ item, comp }: { item: LibraryItem; comp: Composition }) {
  const el = item.element!;
  // 列表=静态 HTML 直出(用户定):不跑 GSAP(from 动画不生效=定格终态)、零 iframe、
  // 零光栅;选择器 #seedId 作用域直落主文档不串样式(与 InlineBlockPreview 同手法)。
  // 挂载后量一次内容真实 rect(含 rotate),把件缩放居中到卡里。
  const holderRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<{ scale: number; dx: number; dy: number } | null>(null);
  const TILE_W = 144;
  const TILE_H = Math.round((144 * 9) / 16);
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const base = holder.getBoundingClientRect();
    if (base.width < 2) return;
    // holder 已被 scale 预置为 0?否——量在 scale(1) 隐藏态做:见下 visibility 策略
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const n of Array.from(holder.querySelectorAll('*')) as HTMLElement[]) {
      if (n.tagName === 'STYLE') continue;
      const r = n.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      // 近满幅的容器(#seed inset:0 / 根 .w 铺满层)不算内容,否则并集恒等于整画布
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

/** 灯箱里的组件活预览:与 ElementTile 同一渲染,大尺寸 + 常播循环(本地 iframe 即挂即有)。 */
function LightboxElement({ item, comp }: { item: LibraryItem; comp: Composition }) {
  const el = item.element!;
  // 主题组件按设计尺寸(1920×1080)渲染:用项目竖屏画布会字大框小(px 相对画布宽)
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

/** 瀑布流缩略图:按真实宽高比铺(不裁);生成视频没抽帧 → <video> 元数据首帧顶上。 */
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

/** 视频瀑布卡:与图片同口径按真实比例铺(不裁)。落库没宽高的(生成视频/旧上传)
 *  → 元数据一到用 videoWidth/Height 钉比例(竖版视频不再被硬裁成 16:9),钉住前
 *  16:9 占位、到位小跳一次(preload=metadata 很快,可接受)。 */
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

/** 列表行缩略图(方块小图);组件用图标占位(iframe 缩到 36px 没意义)。 */
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
