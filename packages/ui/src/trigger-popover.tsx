'use client';

/**
 * TriggerPopover —— "@ / 这类触发字符 + 浮窗 + 即时筛选 + 键盘选择" 的统一交互。
 *
 * 之前 chat-column 里的 @ mention 和 / skill menu 各写一遍，行为不一致：@ 删除会
 * 关闭弹窗、/ 删除不关；/ 缺 query filter 等。这里把触发→定位→query→keyboard nav→
 * click outside→trigger 字符消失自动关 这一整套抽出来，业务方只管：
 *
 *   1. items 数据 + 怎么从 item 提取可搜索文本（itemSearchText）
 *   2. 渲染单项（renderItem，能拿到 active / pick / setActive / 上一项做分组用）
 *   3. 选中以后做什么（onPick；"吞掉触发字符" 这种 editor 修改也在这里做）
 *
 * 打开时机：editor 上键入 trigger 字符，组件不 preventDefault，让字符进 editor，
 * 同时记录光标 anchor。后续 input/compositionend 都跑一遍 query 抽取——抽不到
 * （trigger 被删了、出现空格、跳出 text 节点）就自动关。
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/** 命令式 API —— Composer 底部按钮点了之后直接打开（不靠 trigger 字符）。
 *  传入 anchorEl 时弹窗以该元素为锚（一般是触发按钮自己），不传则 fallback 到编辑器位置。 */
export interface TriggerPopoverHandle {
  open: (anchorEl?: HTMLElement | null) => void;
}

export interface TriggerPopoverProps<T> {
  /** 触发字符："@" / "/" / 或其他单字符;不传 = 只走命令式 open()(按钮唤起),编辑器不监听 */
  trigger?: string;
  /** contenteditable 编辑器的 ref */
  editorRef: React.RefObject<HTMLElement | null>;
  /** 关掉监听（streaming / disabled 时用）。默认 true。 */
  enabled?: boolean;

  /** 全部 items 源 */
  items: T[];
  /** 提取 item 的可搜索文本，多个字段 join 成字符串。filter 用 lowercase includes。 */
  itemSearchText: (item: T) => string;
  /** item 的 React key */
  itemKey: (item: T) => string;

  /** 卡头标题（"/ 调用 Skill · 28 个" 这类） */
  title: string;

  /** 可选分类 tab：传了就在标题下出一排可点 tab，←/→ 左右切换，列表只显示当前 tab。
   *  搭配 itemTab 用——把 item 归到某个 tab.key。 */
  tabs?: { key: string; label: string }[];
  /** item 属于哪个 tab.key（仅 tabs 模式用） */
  itemTab?: (item: T) => string;

  /** items 本来就空时的占位 */
  emptyOriginal?: React.ReactNode;
  /** items 不为空但 query 没匹配到时的占位 */
  emptyMatched?: (query: string) => React.ReactNode;

  /** 渲染单项 */
  renderItem: (
    item: T,
    ctx: {
      active: boolean;
      pick: () => void;
      setActive: () => void;
      index: number;
      prev: T | undefined;
    },
  ) => React.ReactNode;

  /** 选中回调；caller 负责把 item 应用到 editor（吞 trigger 字符 + 插 pill 等）。
   *  组件会在调用 onPick 后立即关闭 popover —— caller 不需要自己 close。 */
  onPick: (item: T) => void;

  /** 弹窗关闭时回调（toggle / Esc / 外点 / 选中后皆触发）。caller 用来把焦点 +
   *  光标还原回编辑器原位。 */
  onClose?: () => void;

  /** 弹窗容器的额外 className（width / shadow 等） */
  className?: string;
}

interface Anchor {
  /** trigger 元素左边线（绝对像素，viewport 坐标） */
  left: number;
  /** trigger 顶边 */
  top: number;
  /** trigger 底边——给"上方空间不够时翻到下方"的算法用；caret 触发时 top == bottom */
  bottom: number;
}

function TriggerPopoverImpl<T>(
  props: TriggerPopoverProps<T>,
  ref: React.Ref<TriggerPopoverHandle>,
) {
  const {
    trigger,
    editorRef,
    enabled = true,
    items,
    itemSearchText,
    itemKey,
    title,
    tabs,
    itemTab,
    emptyOriginal,
    emptyMatched,
    renderItem,
    onPick,
    onClose,
    className,
  } = props;

  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<string>(tabs?.[0]?.key ?? '');
  /** 手动 open() 触发：跳过"光标前必须有 trigger 字符"的检查；不在 input 里跟踪 query
   *  自动关闭。query 通过弹窗自带搜索框输入。 */
  const [manualMode, setManualMode] = useState(false);
  // active 变化来自键盘才自动滚动;鼠标 hover 设 active 不滚——否则鼠标刚扫过
  // 列表边缘被裁一半的行,就会触发 scrollIntoView 让整个列表跳一下。
  const kbNavRef = useRef(false);
  const isComposingRef = useRef(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // 命令式 open() 的触发按钮——外点关闭要放过它（点按钮本身交给 onClick toggle，
  // 否则 mousedown 先 close、紧接着 onClick 又 open，按钮变成「只会重开、关不掉」）。
  const anchorElRef = useRef<HTMLElement | null>(null);
  // open() 闭包里读不到最新 anchor（deps 固定），用 ref 镜像开合态做 toggle 判断。
  const openRef = useRef(false);
  useEffect(() => {
    openRef.current = anchor != null;
  }, [anchor]);

  // 先按 query 过滤；tab 模式下 tab 计数用这一层。
  const queryFiltered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter((it) => itemSearchText(it).toLowerCase().includes(q));
  }, [items, query, itemSearchText]);

  // 再按当前 tab 过滤（非 tab 模式直接用 queryFiltered）。列表 / 键盘都用 filtered。
  const filtered = useMemo(() => {
    if (!tabs || !itemTab) return queryFiltered;
    return queryFiltered.filter((it) => itemTab(it) === activeTab);
  }, [queryFiltered, tabs, itemTab, activeTab]);

  // filtered 长度变 / 切 tab → 重置 active idx
  useEffect(() => {
    setActiveIdx(0);
  }, [filtered.length, activeTab]);

  // 关闭时清干净。silent=true（外点关闭）跳过 onClose —— 用户点到别处时不该把焦点
  // 抢回编辑器；toggle / Esc / 选中走默认（onClose 还原编辑器光标）。
  const close = useCallback(
    (opts?: { silent?: boolean }) => {
      setAnchor(null);
      setQuery('');
      setManualMode(false);
      setActiveIdx(0); // 关闭即复位高亮——下次打开不残留上次选中位
      setActiveTab(tabs?.[0]?.key ?? ''); // tab 也回到第一个
      anchorElRef.current = null;
      if (!opts?.silent) onClose?.();
    },
    [tabs, onClose],
  );

  /** 从光标向前找最近的 trigger 字符，返回它和光标之间的 query。
   *  返回 null = "应该关闭弹窗"——trigger 不在当前文本节点 / 含空格 / 被其他字符隔断。 */
  const readQuery = useCallback((): string | null => {
    if (typeof window === 'undefined' || !trigger) return null;
    const el = editorRef.current;
    if (!el) return null;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return null;
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;
    const text = node.textContent ?? '';
    const upToCursor = text.slice(0, range.startOffset);
    const triggerIdx = upToCursor.lastIndexOf(trigger);
    if (triggerIdx < 0) return null;
    const q = upToCursor.slice(triggerIdx + 1);
    if (/\s/.test(q)) return null;
    return q;
  }, [editorRef, trigger]);

  const readCaretAnchor = useCallback((): Anchor | null => {
    if (typeof window === 'undefined') return null;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0).cloneRange();
      r.collapse(true);
      const rects = r.getClientRects();
      if (rects.length > 0) {
        const rect = rects[0];
        return { left: rect.left, top: rect.top, bottom: rect.bottom };
      }
    }
    const el = editorRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { left: rect.left, top: rect.top, bottom: rect.bottom };
  }, [editorRef]);

  // editor-level 监听：trigger 字符 / input / composition(无 trigger = 纯按钮唤起,不挂监听)
  useEffect(() => {
    if (!enabled || !trigger) return;
    const el = editorRef.current;
    if (!el) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== trigger) return;
      // 不 preventDefault：字符正常进入 editor，readQuery 才能在后续 input 里跟踪
      setTimeout(() => {
        const a = readCaretAnchor();
        if (a) {
          setAnchor(a);
          setQuery('');
          setActiveIdx(0); // 每次重新触发都从头开始，不残留上次选中位
          setActiveTab(tabs?.[0]?.key ?? '');
        }
      }, 0);
    };

    const handleInputCheck = () => {
      // 弹窗没开就不跟踪 —— 没必要
      const opened = popoverRef.current !== null;
      if (!opened && !anchor) return;
      // 手动模式：query 走弹窗自带输入框，不跟踪 editor 里的 trigger 字符
      if (manualMode) return;
      const q = readQuery();
      if (q === null) {
        close();
      } else {
        setQuery(q);
      }
    };

    const onInput = () => {
      if (isComposingRef.current) return; // IME 组合期间不动
      handleInputCheck();
    };

    const onCompositionStart = () => {
      isComposingRef.current = true;
    };

    const onCompositionEnd = () => {
      isComposingRef.current = false;
      handleInputCheck();
    };

    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('input', onInput);
    el.addEventListener('compositionstart', onCompositionStart);
    el.addEventListener('compositionend', onCompositionEnd);
    return () => {
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('input', onInput);
      el.removeEventListener('compositionstart', onCompositionStart);
      el.removeEventListener('compositionend', onCompositionEnd);
    };
  }, [enabled, editorRef, trigger, readCaretAnchor, readQuery, close, anchor, manualMode, tabs]);

  // 命令式 open：按钮点击直接打开。优先用传入的 anchorEl 做锚，没传就 fallback 到编辑器位置。
  // 渲染时根据视口剩余空间决定弹窗向上还是向下展开（top edge 太靠近顶部 → 向下）。
  useImperativeHandle(
    ref,
    () => ({
      open: (anchorEl?: HTMLElement | null) => {
        // 已开 → 再点同一个按钮当作 toggle 关闭（外点 handler 已放过按钮，所以这里
        // 一定还是开态，能正确切到关）。
        if (openRef.current) {
          close();
          return;
        }
        const target = anchorEl ?? editorRef.current;
        if (!target) return;
        anchorElRef.current = anchorEl ?? null;
        const rect = target.getBoundingClientRect();
        setAnchor({ left: rect.left, top: rect.top, bottom: rect.bottom });
        setQuery('');
        setManualMode(true);
        setActiveIdx(0);
        // 下一帧把搜索框 focus 起来，让用户可以直接打字过滤
        setTimeout(() => searchInputRef.current?.focus(), 0);
      },
    }),
    [editorRef, close],
  );

  // global keydown：↑↓ Enter Esc
  useEffect(() => {
    if (!anchor) return;
    const handle = (e: KeyboardEvent) => {
      let consumed = true;
      if (e.key === 'Escape') {
        close();
      } else if (tabs && tabs.length >= 2 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        // 左右切 tab（像全局搜索）
        const i = tabs.findIndex((tb) => tb.key === activeTab);
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const next = tabs[(i + dir + tabs.length) % tabs.length];
        if (next) setActiveTab(next.key);
      } else if (e.key === 'ArrowDown' && filtered.length > 0) {
        kbNavRef.current = true;
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp' && filtered.length > 0) {
        kbNavRef.current = true;
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered.length > 0) {
        const item = filtered[activeIdx];
        if (item) {
          onPick(item);
          close();
        }
      } else {
        consumed = false;
      }
      if (consumed) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', handle, true);
    return () => document.removeEventListener('keydown', handle, true);
  }, [anchor, filtered, activeIdx, onPick, close, tabs, activeTab]);

  // click outside 关
  useEffect(() => {
    if (!anchor) return;
    const handle = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      // 点触发按钮自身不算外部 —— 留给它的 onClick 做 toggle 关闭，否则 mousedown
      // 先 close、紧接着 onClick 又 open，按钮永远关不掉。
      if (anchorElRef.current?.contains(e.target as Node)) return;
      // 编辑器里点（移光标）也算外部 —— 用户切了上下文，弹窗该关。silent：点别处
      // 不抢焦点回编辑器（但点回编辑器自身时下面会自然落焦，无需还原）。
      close({ silent: true });
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [anchor, close]);

  // active 项滚到可视区 —— 仅键盘导航;hover 引起的 active 变化不动滚动位
  useEffect(() => {
    if (!kbNavRef.current) return;
    kbNavRef.current = false;
    const list = popoverRef.current?.querySelector('[data-trigger-list]');
    if (!list) return;
    const active = list.querySelector('[data-active]') as HTMLElement | null;
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  // 实测后夹进视口：默认在 trigger 上方展开，上方放不下翻到下方；左右越界回拉。
  // 用 layout effect（paint 前跑）按实际宽高定位，避免「估算尺寸」导致超出屏幕。
  useLayoutEffect(() => {
    if (!anchor) return;
    const el = popoverRef.current;
    if (!el || typeof window === 'undefined') return;
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    el.style.transform = 'none';
    const rect = el.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    let left = anchor.left;
    if (left + w > vw - margin) left = vw - margin - w;
    if (left < margin) left = margin;
    let top = anchor.top - 8 - h; // 上方展开
    if (top < margin) {
      const below = anchor.bottom + 8;
      top = below + h <= vh - margin ? below : Math.max(margin, vh - margin - h);
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  });

  if (!anchor) return null;

  const isOriginalEmpty = items.length === 0;
  const isMatchedEmpty = !isOriginalEmpty && filtered.length === 0;

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        left: anchor.left,
        top: anchor.top,
        zIndex: 50,
        // 列表本身 max-h-[60vh]；整体再兜一层不超过视口高度，配合 layout effect 夹位
        maxHeight: 'calc(100vh - 16px)',
        maxWidth: 'calc(100vw - 16px)',
      }}
      className={`rounded-md border border-line bg-panel shadow-md flex flex-col ${className ?? ''}`}
    >
      <div className="flex items-center justify-between px-2 py-1 text-[11px] text-ink-3 shrink-0">
        <span>{title}</span>
        <span className="text-ink-4">{tabs && tabs.length >= 2 ? '←→ ↑↓ ↵' : '↑↓ ↵ esc'}</span>
      </div>
      {tabs && tabs.length >= 2 && (
        <div className="border-line flex items-center gap-1 border-b px-2 py-1.5 shrink-0">
          {tabs.map((tb) => {
            const isActive = tb.key === activeTab;
            const count = itemTab
              ? queryFiltered.filter((it) => itemTab(it) === tb.key).length
              : 0;
            return (
              <button
                key={tb.key}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setActiveTab(tb.key)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition-colors ${
                  isActive
                    ? 'bg-panel-2 text-ink font-semibold'
                    : 'text-ink-3 font-medium hover:bg-panel-2 hover:text-ink'
                }`}
              >
                <span>{tb.label}</span>
                <span className={`font-mono text-[10.5px] ${isActive ? 'text-ink-3' : 'text-ink-4'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {manualMode && (
        <div className="px-2 pb-1 shrink-0">
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索…"
            className="w-full rounded-md border border-line bg-panel-2 px-2 py-1 text-[12px] outline-none focus:border-ink"
          />
        </div>
      )}
      <div data-trigger-list className="overflow-y-auto p-2 max-h-[60vh]">
        {isOriginalEmpty ? (
          emptyOriginal ?? (
            <div className="px-2 py-3 text-[12px] text-ink-3 text-center">无可选项</div>
          )
        ) : isMatchedEmpty ? (
          emptyMatched?.(query) ?? (
            <div className="px-2 py-3 text-[12px] text-ink-3 text-center">
              没有匹配「{query}」
            </div>
          )
        ) : (
          filtered.map((item, i) => (
            <div key={itemKey(item)}>
              {renderItem(item, {
                active: i === activeIdx,
                pick: () => {
                  onPick(item);
                  close();
                },
                setActive: () => setActiveIdx(i),
                index: i,
                prev: i > 0 ? filtered[i - 1] : undefined,
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// forwardRef 包一层暴露 open() 给 caller。泛型 props 通过 cast 保留，运行时无副作用。
export const TriggerPopover = forwardRef(TriggerPopoverImpl) as <T>(
  props: TriggerPopoverProps<T> & { ref?: React.Ref<TriggerPopoverHandle> },
) => React.ReactElement | null;
