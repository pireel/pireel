'use client';

/**
 * Studio 对话面板 —— agent + 工具版,与「项目文档」chat 同款观感。
 *
 *  · 消息流/自动滚动/空态/回底 = ai-elements Conversation 家族
 *  · 气泡 + markdown = Message / MessageResponse(Streamdown)
 *  · 输入框 = contenteditable composer(边框/聚焦/π 头像/占位/@ pill),@ 唤起组件选择器
 *  · LLM 工具调用 = useChat 流式;工具不在服务端 execute,onToolCall 在客户端直接改
 *    Composition(runTool 由工作台注入),addToolOutput 回喂续写。块生成走 /api/studio/compose。
 *  · 工具调用在信息流里渲染成 徽章(即时操作)/ 卡片(生成类)
 *  · 多会话:线程存 localStorage,切换 key remount;startProgress 仍给「一键成片」推进度。
 */

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AtSign, ArrowUp, Square, Palette, Check, X, Sparkles, MessageSquarePlus, History, Loader2 } from 'lucide-react';
import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type ChatStatus,
  type UIMessage,
} from 'ai';
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from '@pireel/ui/ai-elements/conversation';
import { Suggestion } from '@pireel/ui/ai-elements/suggestion';
import { Message, MessageContent, MessageResponse } from '@pireel/ui/ai-elements/message';
import { useLocale } from 'use-intl';
import { TriggerPopover, type TriggerPopoverHandle } from '@pireel/ui/trigger-popover';
import { SkillIcon } from '@pireel/ui/skill-icon';
import type { Composition } from '@pireel/studio-engine/composition';
import { framePack, type SupportedLocale as Locale } from '@pireel/studio-frames/locales';
import { InlineBlockPreview } from './block-preview-card';
import { coverBlock } from '@pireel/studio-frames/showcase-blocks';
import { type FrameCatalogItem, useFrameCatalog } from './use-frame-catalog';
import { PiGlyph } from '@pireel/ui/brand-mark';
import { STUDIO_TOOL_MAP, type ChatSituation, type StudioToolDef, type StudioToolResult, buildSituation } from '@pireel/studio-engine/prompts';
import { studioProviders } from '@pireel/studio-engine/providers';
import { useToolProgress } from './tool-progress';
import { studioLocale, t } from './i18n';

/* ============================ 对外类型 ============================ */

/** 可 @ 的组件(块 / 分镜)。 */
export interface StudioElementRef {
  id: string;
  label: string;
  /** caption / title / stat / list / transition / custom / shot */
  kind: string;
  isShot: boolean;
}

/** 一条流式「进度」消息的更新器(给「一键成片」后台流程汇报)。 */
export interface ProgressHandle {
  step(text: string): void;
  finish(text: string): void;
  fail(text: string): void;
}

/** 会话挂载的 frame(studio 主题模板包;主题按钮高亮 + 请求带 frameId,服务端注入 playbook)。 */
export interface AttachedFrame {
  id: string;
  title: string;
  icon: string;
  iconKey?: string | null;
}

export interface StudioChatHandle {
  startProgress(): ProgressHandle;
  /** 选中态变化时由工作台调用:传组件 → 输入框出一个「当前选中」pill;传 null → 撤掉。 */
  insertElementPill(el: StudioElementRef | null): void;
  /** 工作台直接投喂一条用户消息。流式中静默丢弃。 */
  send(text: string): void;
  /** 只往输入框填一段文本不发送(生成面板「@引用」素材用)。 */
  insertText(text: string): void;
  /** 只聚焦输入框(组件浮动条「AI 改」切过来接着打字)。 */
  focusInput(): void;
  /** 把 frame 挂到当前会话(frame 面板「使用」/ 输入框主题按钮共用):按钮高亮,随请求注入。 */
  attachFrame(frame: AttachedFrame): void;
}

export interface StudioChatProps {
  /** 客户端执行工具:改 Composition 状态 / 调 compose 生成块,返回小结。 */
  runTool: (toolId: string, input: Record<string, unknown>) => Promise<StudioToolResult>;
  /** frame 挂上时回调(面板「使用」和主题按钮都走):工作台借此把主题 palette 落到 comp。 */
  onFrameApplied?: (frame: AttachedFrame) => void;
  /** 发消息瞬间读的局势(composition 快照/选中/播放头/流水线):经 buildSituation
   *  拼成文本挂在 user 消息 metadata.situation 上(不进请求 body,也不进 system)。 */
  getBody: () => Record<string, unknown>;
  /** 当前可 @ 的组件。 */
  elements: StudioElementRef[];
  /** 会话持久化 key(按项目分:studio:chat:v1:<projectId>,会话属于项目)。 */
  storageKey: string;
  /** 会话线程落 localStorage 后通知(工作台借此把会话一并同步上云)。 */
  onThreadsChange?: () => void;
  /** 关闭对话区(头部 X;工作台收起右侧区腾画面)。缺省不渲染关闭钮。 */
  onClose?: () => void;
}

/* ============================ 小工具 ============================ */

let _mid = 0;
const mid = (p = 'm') => `${p}${++_mid}_${Math.random().toString(36).slice(2, 7)}`;

const ELEMENT_ICON: Record<string, string> = {
  caption: '✨',
  title: '🔠',
  stat: '🔢',
  list: '☰',
  transition: '⤬',
  custom: '✦',
  shot: '🎬',
};
const elementIcon = (el: { kind: string; isShot: boolean }) =>
  el.isShot ? '🎬' : (ELEMENT_ICON[el.kind] ?? '✦');

function PiAvatar({ thinking = false, size = 22 }: { thinking?: boolean; size?: number }) {
  const glyph = Math.round(size * 0.56);
  return (
    <span
      className="bg-lime-soft text-lime-ink relative flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 100 100" width={glyph} height={glyph} className={thinking ? 'animate-pulse' : undefined}>
        <PiGlyph stroke="currentColor" strokeWidth={16} />
      </svg>
    </span>
  );
}

const PILL_CLASS =
  'sc-pill inline-flex items-center gap-1 align-middle rounded px-1.5 py-px mx-0.5 text-[12px] font-medium border border-accent/30 bg-accent/10 text-accent select-none cursor-default';

/** 命令式造一个组件 pill(contenteditable=false)。 */
function makeElementPill(el: StudioElementRef, opts: { auto?: boolean } = {}): HTMLSpanElement {
  const span = document.createElement('span');
  span.contentEditable = 'false';
  span.dataset.refId = el.id;
  if (opts.auto) span.dataset.auto = '1';
  span.className = PILL_CLASS;
  const icon = document.createElement('span');
  icon.textContent = elementIcon(el);
  span.appendChild(icon);
  const text = document.createElement('span');
  text.textContent = `@${el.label}`;
  span.appendChild(text);
  return span;
}

/** 信息流里把 @id 还原成 pill(与输入框同观感)。 */
const REF_TOKEN_RE = /@([a-zA-Z0-9._-]+)/g;
function renderTextWithElementPills(text: string, elements: StudioElementRef[]): React.ReactNode {
  if (!text) return null;
  const map = new Map(elements.map((e) => [e.id, e]));
  const out: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  REF_TOKEN_RE.lastIndex = 0;
  while ((m = REF_TOKEN_RE.exec(text)) !== null) {
    if (m.index > lastIdx) out.push(text.slice(lastIdx, m.index));
    const el = map.get(m[1]!);
    if (el) {
      out.push(
        <span key={`${m.index}-${m[1]}`} className={PILL_CLASS}>
          <span>{elementIcon(el)}</span>@{el.label}
        </span>,
      );
    } else {
      out.push(m[0]);
    }
    lastIdx = REF_TOKEN_RE.lastIndex;
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx));
  return <>{out}</>;
}

/* ============================ 工具耗时记忆(ETA 用) ============================ */

// 每类工具的历史耗时 EMA(localStorage 自校准):没有进度分数的工具靠它给「约剩 Ns」。
const DUR_KEY = 'studio:tooldur:v1';
function typicalToolDuration(toolId: string): number | null {
  try {
    const m = JSON.parse(window.localStorage.getItem(DUR_KEY) ?? '{}') as Record<string, unknown>;
    const v = m[toolId];
    return typeof v === 'number' && v > 500 ? v : null;
  } catch {
    return null;
  }
}
function recordToolDuration(toolId: string, ms: number) {
  if (ms < 300) return; // 秒回的不记
  try {
    const m = JSON.parse(window.localStorage.getItem(DUR_KEY) ?? '{}') as Record<string, number>;
    const old = typeof m[toolId] === 'number' ? m[toolId] : null;
    m[toolId] = old ? Math.round(old * 0.6 + ms * 0.4) : Math.round(ms);
    window.localStorage.setItem(DUR_KEY, JSON.stringify(m));
  } catch {
    /* 配额/隐私模式:忽略 */
  }
}

/** 思考中跳点:覆盖所有「没东西在动」的空窗(等首响、工具跑完等续写)。 */
function ThinkingDots({ label = t('思考中') }: { label?: string }) {
  return (
    <span className="text-ink-3 inline-flex items-center gap-1.5 pt-0.5 text-[13px]">
      {label}
      <span className="inline-flex items-end gap-[3px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="bg-ink-3/80 h-[4px] w-[4px] animate-bounce rounded-full motion-reduce:animate-none" style={{ animationDelay: `${i * 0.16}s`, animationDuration: '0.9s' }} />
        ))}
      </span>
    </span>
  );
}

/* ============================ 工具调用渲染 ============================ */

interface ToolPartLike {
  type: string;
  state?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
  toolName?: string;
}

function toolIdOf(part: ToolPartLike): string {
  if (part.type === 'dynamic-tool') return part.toolName ?? '';
  return part.type.startsWith('tool-') ? part.type.slice(5) : part.type;
}

/** 工具调用状态归一。 */
function toolStatus(part: ToolPartLike): { kind: 'running' | 'done' | 'error'; text: string } {
  const out = part.output as StudioToolResult | undefined;
  if (part.state === 'output-error') return { kind: 'error', text: part.errorText?.slice(0, 40) || t('失败') };
  if (part.state === 'output-available') {
    if (out && out.ok === false) return { kind: 'error', text: out.error?.slice(0, 40) || t('失败') };
    return { kind: 'done', text: out?.summary?.slice(0, 60) || t('完成') };
  }
  return { kind: 'running', text: t('执行中…') };
}

function ToolBadge({ def, part }: { def: StudioToolDef; part: ToolPartLike }) {
  const st = toolStatus(part);
  const prog = useToolProgress(def.id);
  const live = st.kind === 'running' ? prog?.text ?? null : null;
  const icon =
    st.kind === 'running' ? (
      <Loader2 size={11} className="animate-spin" />
    ) : st.kind === 'error' ? (
      <X size={11} strokeWidth={2.2} />
    ) : (
      <Check size={11} strokeWidth={2.2} />
    );
  const text = live ?? st.text;
  // 与 ToolCard 同一套卡片语言:头行(图标章+名称+状态图标),结果文案独立全宽正文行(可换行)
  return (
    <div className="border-line bg-panel-2 w-full overflow-hidden rounded-md border">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className="text-accent grid h-5 w-5 shrink-0 place-items-center rounded bg-accent/10 text-[12px]">{def.icon}</span>
        <span className="text-ink-2 shrink-0 text-[12px] font-semibold">{t(def.label)}</span>
        <span className={`ml-auto shrink-0 ${st.kind === 'error' ? 'text-destructive' : 'text-ink-3'}`}>{icon}</span>
      </div>
      {text && (
        <div className={`border-line/70 break-words border-t px-2.5 py-1.5 text-[12px] leading-relaxed ${st.kind === 'error' ? 'text-destructive' : 'text-ink-3'}`}>
          {text}
        </div>
      )}
    </div>
  );
}

/**
 * 生成类工具卡:任何时刻都有东西在动 ——
 * 运行中 = spinner + 已用时/预计剩余 + 阶段文案(流式 note > 进度文案 > busyText)+ 进度条
 * (有 frac 走确定态并按速率外推 ETA;没有走 indeterminate 滑条 + 历史耗时 EMA 给 ETA)。
 */
function ToolCard({ def, part }: { def: StudioToolDef; part: ToolPartLike }) {
  const st = toolStatus(part);
  const running = st.kind === 'running';
  const prog = useToolProgress(def.id);
  const live = running ? prog : null;
  const instruction = typeof part.input?.instruction === 'string' ? (part.input.instruction as string) : '';

  // 已用时(观察到 running 才起表,每 0.5s 走);完成时记进历史 EMA
  const startRef = useRef<number | null>(null);
  if (running && startRef.current == null) startRef.current = Date.now();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(id);
  }, [running]);
  const recordedRef = useRef(false);
  useEffect(() => {
    if (st.kind === 'done' && startRef.current != null && !recordedRef.current) {
      recordedRef.current = true;
      recordToolDuration(def.id, Date.now() - startRef.current);
    }
  }, [st.kind, def.id]);

  const elapsedS = running && startRef.current != null ? (Date.now() - startRef.current) / 1000 : 0;
  // ETA:frac 按实测速率外推;否则用历史 EMA;都没有就只报已用时
  let timeText = '';
  if (running && elapsedS >= 1) {
    if (live?.frac != null && live.frac >= 0.99) {
      timeText = t('收尾中 · 已 {s}s', { s: Math.floor(elapsedS) }); // 进度打满但还没返回:别再报「约剩 1s」骗人
    } else {
      let remain: number | null = null;
      if (live?.frac != null && live.frac > 0.05) remain = (elapsedS / live.frac) * (1 - live.frac);
      else {
        const typ = typicalToolDuration(def.id);
        if (typ != null) remain = typ / 1000 - elapsedS;
      }
      timeText = remain != null && remain >= 1 ? t('已 {a}s · 约剩 {b}s', { a: Math.floor(elapsedS), b: Math.ceil(remain) }) : t('已 {s}s', { s: Math.floor(elapsedS) });
    }
  }

  return (
    <div className="border-line bg-panel-2 w-full overflow-hidden rounded-md border">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className="text-accent grid h-5 w-5 shrink-0 place-items-center rounded bg-accent/10 text-[12px]">{def.icon}</span>
        <span className="text-ink-2 shrink-0 text-[12px] font-semibold">{t(def.label)}</span>
        {instruction && <span className="text-ink-4 truncate text-[12px]">{instruction}</span>}
        <span className={`ml-auto inline-flex min-w-0 shrink-0 items-center gap-1.5 text-[11px] ${st.kind === 'error' ? 'text-destructive' : 'text-ink-3'}`}>
          {running ? <Loader2 size={11} className="animate-spin" /> : st.kind === 'error' ? <X size={11} /> : <Check size={11} />}
          {running && <span className="tabular-nums">{timeText || t('启动中…')}</span>}
        </span>
      </div>
      {/* 完成/失败:结果文案独立全宽正文行(与 badge 同规格),换行不再吊在右列 */}
      {!running && st.text && (
        <div className={`border-line/70 break-words border-t px-2.5 py-1.5 text-[12px] leading-relaxed ${st.kind === 'error' ? 'text-destructive' : 'text-ink-3'}`}>
          {st.text}
        </div>
      )}
      {/* 运行中:阶段文案正文行(流式 note > 进度文案 > 默认忙碌文案),多行可读 */}
      {running && (
        <div className="border-line/70 text-ink-3 line-clamp-3 border-t px-2.5 py-1.5 text-[12px] leading-relaxed">
          {live?.text || (def.busyText ? t(def.busyText) : t('执行中…'))}
        </div>
      )}
      {/* 进度条:有 frac 确定态;没有 indeterminate 滑条(永远有东西在动) */}
      {running &&
        (live?.frac != null ? (
          <div className="bg-line/40 h-1 w-full">
            <div className="bg-accent h-full transition-[width] duration-200" style={{ width: `${Math.round(Math.max(0, Math.min(1, live.frac)) * 100)}%` }} />
          </div>
        ) : (
          <div className="bg-line/40 h-1 w-full overflow-hidden">
            <div className="bg-accent/70 h-full w-1/3 motion-reduce:animate-none" style={{ animation: 'hf-indet 1.2s ease-in-out infinite' }} />
          </div>
        ))}
    </div>
  );
}

function renderToolPart(part: ToolPartLike, key: string): React.ReactNode {
  const id = toolIdOf(part);
  const def = STUDIO_TOOL_MAP[id];
  if (!def) return null;
  return <div key={key}>{def.kind === 'card' ? <ToolCard def={def} part={part} /> : <ToolBadge def={def} part={part} />}</div>;
}

/* ============================ 输入框(composer) ============================ */

interface ComposerHandle {
  insertElementPill(el: StudioElementRef | null): void;
  /** 末尾追加一段文本并聚焦(生成面板「@引用」用):只填不发。 */
  insertText(text: string): void;
  /** 整框替换成一段文本并聚焦(快捷话术用):连点不同话术互替不拼接。 */
  setText(text: string): void;
  /** 只聚焦(光标到末尾),不动内容(组件浮动条「AI 改」用)。 */
  focusInput(): void;
}

function Composer({
  placeholder,
  status,
  elements,
  frame,
  frames,
  onPickFrame,
  onRemoveFrame,
  onSubmit,
  onStop,
  methodsRef,
}: {
  placeholder: string;
  status: ChatStatus;
  elements: StudioElementRef[];
  /** 当前会话挂载的 frame(主题按钮高亮;选择器里再点同一项即移除)。 */
  frame: AttachedFrame | null;
  /** 主题选择器的 frame 目录。 */
  frames: FrameCatalogItem[];
  onPickFrame: (frame: AttachedFrame) => void;
  onRemoveFrame: () => void;
  onSubmit: (text: string) => void;
  onStop: () => void;
  methodsRef: React.MutableRefObject<ComposerHandle | null>;
}) {
  const locale = useLocale() as Locale; // 主题封面预览是 locale 化内容包
  const editorRef = useRef<HTMLDivElement>(null);
  const refPopoverRef = useRef<TriggerPopoverHandle>(null);
  const framePopoverRef = useRef<TriggerPopoverHandle>(null);
  const [empty, setEmpty] = useState(true);
  const isBusy = status === 'streaming' || status === 'submitted';

  function recomputeEmpty() {
    const el = editorRef.current;
    if (!el) return;
    const isEmpty = (el.textContent ?? '').length === 0;
    if (isEmpty && (el.innerHTML === '<br>' || el.innerHTML === '<div><br></div>')) el.innerHTML = '';
    setEmpty(isEmpty);
  }

  /** 序列化 contenteditable → 纯文本(pill 还原成 @id token)。 */
  function serialize(): string {
    const el = editorRef.current;
    if (!el) return '';
    let buf = '';
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        buf += node.textContent ?? '';
        return;
      }
      if (!(node instanceof HTMLElement)) return;
      if (node.dataset.refId) {
        buf += `@${node.dataset.refId}`;
        return;
      }
      if (node.tagName === 'BR') {
        buf += '\n';
        return;
      }
      if ((node.tagName === 'DIV' || node.tagName === 'P') && buf && !buf.endsWith('\n')) buf += '\n';
      node.childNodes.forEach(walk);
    };
    el.childNodes.forEach(walk);
    return buf;
  }

  function clear() {
    const el = editorRef.current;
    if (el) {
      el.innerHTML = '';
      el.focus();
    }
    setEmpty(true);
  }

  function fireSubmit() {
    if (isBusy) return;
    const text = serialize().trim();
    if (!text) return;
    onSubmit(text);
    clear();
  }

  /** 吞掉光标前最近一个 trigger 字符。 */
  function consumeTriggerChar(trigger: string) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    let node: Node | null = range.startContainer;
    let offset = range.startOffset;
    let scanned = 0;
    while (node && scanned < 32) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? '';
        const limit = node === range.startContainer ? offset : text.length;
        for (let i = limit - 1; i >= 0; i--) {
          if (text[i] === trigger) {
            node.textContent = text.slice(0, i) + text.slice(i + 1);
            const r2 = document.createRange();
            r2.setStart(node, i);
            r2.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r2);
            return;
          }
          scanned++;
          if (scanned >= 32) return;
        }
      }
      if (node.previousSibling) {
        node = node.previousSibling;
        offset = node.nodeType === Node.TEXT_NODE ? (node.textContent ?? '').length : 0;
      } else break;
    }
  }

  function insertPillAtCursor(span: HTMLElement) {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    const sp = document.createTextNode(' ');
    if (sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).startContainer)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(span);
      span.parentNode?.insertBefore(sp, span.nextSibling);
      const after = document.createRange();
      after.setStartAfter(sp);
      after.collapse(true);
      sel.removeAllRanges();
      sel.addRange(after);
    } else {
      el.appendChild(span);
      el.appendChild(sp);
    }
  }

  /** 主题选择器选中 → 挂 frame(按钮高亮,不进正文);再点当前已挂的那项 = 移除。 */
  function pickFrame(item: FrameCatalogItem) {
    if (frame?.id === item.id) {
      onRemoveFrame();
      return;
    }
    onPickFrame({ id: item.id, title: item.title, icon: item.icon, iconKey: item.iconKey ?? null });
  }

  /** @ 选择器选中 → 插 pill。 */
  function pickElement(el: StudioElementRef) {
    const root = editorRef.current;
    if (root && root.querySelector(`[data-ref-id="${CSS.escape(el.id)}"]:not([data-auto])`)) {
      consumeTriggerChar('@');
      recomputeEmpty();
      return;
    }
    consumeTriggerChar('@');
    insertPillAtCursor(makeElementPill(el));
    recomputeEmpty();
  }

  useImperativeHandle(
    methodsRef,
    () => ({
      insertElementPill: (el: StudioElementRef | null) => {
        const root = editorRef.current;
        if (!root) return;
        // 撤掉上一枚「当前选中」pill(连同它后面的那个空格)
        root.querySelectorAll('[data-auto]').forEach((n) => {
          const next = n.nextSibling;
          if (next && next.nodeType === Node.TEXT_NODE && next.textContent === ' ') next.remove();
          n.remove();
        });
        if (el) {
          // 已显式 @ 过同一个 → 不重复加
          if (!root.querySelector(`[data-ref-id="${CSS.escape(el.id)}"]`)) {
            root.appendChild(makeElementPill(el, { auto: true }));
            root.appendChild(document.createTextNode(' '));
          }
        }
        recomputeEmpty();
      },
      setText: (text: string) => {
        const root = editorRef.current;
        if (!root) return;
        root.innerHTML = '';
        root.appendChild(document.createTextNode(`${text} `));
        recomputeEmpty();
        root.focus();
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(root);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      },
      insertText: (text: string) => {
        const root = editorRef.current;
        if (!root) return;
        root.appendChild(document.createTextNode(`${text} `));
        recomputeEmpty();
        // 聚焦并把光标放到末尾,用户接着打字就是补充说明
        root.focus();
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(root);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      },
      focusInput: () => {
        const root = editorRef.current;
        if (!root) return;
        root.focus();
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(root);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      },
    }),
    [],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return;
    if (e.nativeEvent.isComposing) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      e.preventDefault();
      document.execCommand('insertLineBreak');
      return;
    }
    e.preventDefault();
    fireSubmit();
  }

  return (
    <>
      <div className="border-line bg-panel-2 focus-within:border-ink-4 relative rounded-md border transition-colors">
        <div className="relative">
          {empty && <div className="text-ink-4 pointer-events-none absolute left-3 top-2.5 text-[13px]">{placeholder}</div>}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onKeyDown={handleKeyDown}
            onInput={recomputeEmpty}
            onPaste={(e) => {
              e.preventDefault();
              const raw = e.clipboardData.getData('text/plain') || e.clipboardData.getData('text');
              const text = raw.replace(/^[\r\n]+|[\r\n]+$/g, '');
              if (text) document.execCommand('insertText', false, text);
            }}
            className="max-h-[200px] min-h-[64px] overflow-y-auto whitespace-pre-wrap px-3 pb-1.5 pt-2.5 text-[13px] outline-none"
          />
        </div>
        <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              className="text-ink-3 hover:bg-line hover:text-ink inline-flex h-7 w-7 items-center justify-center rounded-md"
              onClick={(e) => refPopoverRef.current?.open(e.currentTarget)}
              title={t('@ 引用组件 / 分镜')}
            >
              <AtSign className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
            {/* 主题按钮:挂载态 = 按钮本身高亮(不再往输入框塞 tag);选择器里再点同一项移除 */}
            <button
              type="button"
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${
                frame ? 'bg-accent/15 text-accent hover:bg-accent/25' : 'text-ink-3 hover:bg-line hover:text-ink'
              }`}
              onClick={(e) => framePopoverRef.current?.open(e.currentTarget)}
              title={frame ? t('主题:{title}', { title: frame.title }) : t('选主题')}
            >
              <Palette className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
          </div>
          {isBusy ? (
            <button
              type="button"
              className="bg-destructive inline-flex h-7 w-7 items-center justify-center rounded-md text-white hover:brightness-110"
              onClick={onStop}
              title={t('停止')}
            >
              <Square className="h-3 w-3" fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              className="bg-ink inline-flex h-7 w-7 items-center justify-center rounded-md text-white hover:bg-black disabled:opacity-30"
              disabled={empty}
              onClick={fireSubmit}
              title={t('发送(回车)')}
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      <TriggerPopover<StudioElementRef>
        ref={refPopoverRef}
        trigger="@"
        editorRef={editorRef}
        items={elements}
        itemSearchText={(el) => `${el.label} ${el.kind}`}
        itemKey={(el) => el.id}
        title={t('@ 引用组件 · {n} 个', { n: elements.length })}
        className="w-[260px]"
        emptyOriginal={<div className="text-ink-3 px-2 py-3 text-center text-[12px]">{t('还没有组件 / 分镜')}</div>}
        onPick={pickElement}
        renderItem={(el, { active, pick, setActive }) => (
          <button
            type="button"
            data-active={active || undefined}
            onMouseEnter={setActive}
            onMouseDown={(e) => e.preventDefault()}
            onClick={pick}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] ${active ? 'bg-panel-2' : ''}`}
          >
            <span className="shrink-0">{elementIcon(el)}</span>
            <span className="text-ink truncate">{el.label}</span>
            <span className="text-ink-4 ml-auto shrink-0 text-[11px]">{el.isShot ? (studioLocale() === 'en' ? 'Shot' : '分镜') : el.kind}</span>
          </button>
        )}
      />

      {/* 主题选择器:纯按钮唤起(无 trigger 字符,`/` 预留给以后的 skill);大行卡 = 左封面右介绍 */}
      <TriggerPopover<FrameCatalogItem>
        ref={framePopoverRef}
        editorRef={editorRef}
        items={frames}
        itemSearchText={(s) => `${s.title} ${s.summary} ${framePack(locale, s.id)?.title ?? ''}`}
        itemKey={(s) => s.id}
        title={t('选主题 · {n} 个', { n: frames.length })}
        className="w-[360px]"
        emptyOriginal={<div className="text-ink-3 px-2 py-3 text-center text-[12px]">{t('主题目录加载中…')}</div>}
        onPick={pickFrame}
        renderItem={(s, { active, pick, setActive }) => (
          <FrameOptionRow item={s} locale={locale} selected={frame?.id === s.id} active={active} pick={pick} setActive={setActive} />
        )}
      />
    </>
  );
}

/** 主题选择器的大行卡:左 = 方言封面真实渲染(16:9,悬停预演;无封面回落图标),
 *  右 = 标题 + 简介;当前挂载项打勾,再点一次移除。 */
function FrameOptionRow({
  item,
  locale,
  selected,
  active,
  pick,
  setActive,
}: {
  item: FrameCatalogItem;
  locale: Locale;
  selected: boolean;
  active: boolean;
  pick: () => void;
  setActive: () => void;
}) {
  const block = useMemo(() => coverBlock(item.id, locale), [item.id, locale]);
  // 封面统一 16:9 画布 + frame 自己的 palette;chat 里拿不到项目 comp,主题走默认
  const previewComp = useMemo<Composition>(
    () => ({ width: 1920, height: 1080, theme: 'general', video: null, blocks: [], ...(item.palette ? { palette: item.palette } : {}) }),
    [item.palette],
  );
  return (
    <button
      type="button"
      data-active={active || undefined}
      onMouseEnter={setActive}
      onMouseDown={(e) => e.preventDefault()}
      onClick={pick}
      title={selected ? t('再点一次移除主题') : (framePack(locale, item.id)?.title ?? item.title)}
      className={`flex w-full items-center gap-2.5 rounded-md p-1.5 text-left ${active ? 'bg-panel-2' : ''}`}
    >
      <span className={`border-line relative w-[112px] shrink-0 overflow-hidden rounded-md border ${selected ? 'ring-accent ring-2' : ''}`}>
        {block ? (
          <InlineBlockPreview comp={previewComp} block={block} width={112} animate="hover" ground="stage" />
        ) : (
          <span className="bg-panel-2 flex h-[63px] w-full items-center justify-center">
            <SkillIcon iconKey={item.iconKey} emoji={item.icon} size={30} rounded="rounded-md" />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="text-ink truncate text-[12.5px] font-medium">{framePack(locale, item.id)?.title ?? item.title}</span>
          {selected && <Check size={12} className="text-accent shrink-0" strokeWidth={2.5} />}
        </span>
        <span className="text-ink-4 mt-0.5 line-clamp-2 text-[11px] leading-snug">{framePack(locale, item.id)?.summary ?? item.summary}</span>
      </span>
    </button>
  );
}

/* ============================ 单线程 chat(useChat) ============================ */

function ChatThread({
  threadId,
  initialMessages,
  initialFrame,
  frames,
  onFrameApplied,
  runTool,
  getBody,
  elements,
  onSnapshot,
  handleRef,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  initialFrame: AttachedFrame | null;
  frames: FrameCatalogItem[];
  onFrameApplied?: (frame: AttachedFrame) => void;
  runTool: StudioChatProps['runTool'];
  getBody: StudioChatProps['getBody'];
  elements: StudioElementRef[];
  onSnapshot: (messages: UIMessage[], frame: AttachedFrame | null) => void;
  handleRef: React.MutableRefObject<StudioChatHandle | null>;
}) {
  const runToolRef = useRef(runTool);
  runToolRef.current = runTool;
  const getBodyRef = useRef(getBody);
  getBodyRef.current = getBody;
  const composerRef = useRef<ComposerHandle | null>(null);

  // 会话挂载的 frame:输入框主题按钮高亮,每次请求把 frameId 一起带走(服务端注入 playbook)
  const [frame, setFrame] = useState<AttachedFrame | null>(initialFrame);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const onFrameAppliedRef = useRef(onFrameApplied);
  onFrameAppliedRef.current = onFrameApplied;
  /** 挂 frame(面板/主题按钮共用):除了会话态,还通知工作台把主题 palette 应用到 comp。 */
  const applyFrame = useCallback((f: AttachedFrame) => {
    setFrame(f);
    onFrameAppliedRef.current?.(f);
  }, []);

  // body 只带 frameId;局势快照在发消息时挂 metadata.situation(随会话持久,
  // 路由物化成 <composition_state> part)——历史字节稳定,prompt cache 才命中
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: studioProviders().chatEndpoint ?? '/api/studio/chat',
        body: () => (frameRef.current ? { frameId: frameRef.current.id } : {}),
      }),
    [],
  );

  const { messages, sendMessage, status, stop, setMessages, addToolOutput, error, regenerate } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    async onToolCall({ toolCall }) {
      const id = toolCall.toolName;
      try {
        const out = await runToolRef.current(id, (toolCall.input ?? {}) as Record<string, unknown>);
        if (out.ok) addToolOutput({ tool: id, toolCallId: toolCall.toolCallId, output: out });
        else addToolOutput({ tool: id, toolCallId: toolCall.toolCallId, state: 'output-error', errorText: out.error ?? t('执行失败') });
      } catch (e) {
        addToolOutput({
          tool: id,
          toolCallId: toolCall.toolCallId,
          state: 'output-error',
          errorText: e instanceof Error ? e.message : String(e),
        });
      }
    },
  });

  // 落盘:流跑完(ready / error)写 localStorage;流式中每 2s 节流快照一份——
  // 生成中切走会话/刷新页面,已流出的部分和已完成的工具输出不再整条蒸发。
  // 首次挂载 status 就是 'ready'(恢复/切换旧会话时也是)——那次要跳过,
  // 否则光是打开旧会话就把它的 updatedAt 刷新,历史排序被翻乱。
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (status === 'ready' || status === 'error') onSnapshot(messagesRef.current, frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  const busy = status === 'streaming' || status === 'submitted';
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => onSnapshot(messagesRef.current, frameRef.current), 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);
  // 生成中卸载(切会话/新对话触发 key remount):停流 + 快照到最后一刻——
  // 不停的话 fetch 还在跑、onToolCall 在后台改作品但 UI 已经没了。
  // 非生成态卸载不快照(打开旧会话看一眼再切走,不该刷它的 updatedAt)。
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(
    () => () => {
      if (!busyRef.current) return;
      try {
        void stopRef.current();
      } catch {
        /* 已结束 */
      }
      onSnapshot(messagesRef.current, frameRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // 生成中刷新/关页:浏览器原生确认弹窗(流断了就续不上——客户端执行架构,没有服务端可恢复的 run)
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  // frame 挂/摘也落盘(有消息才存;否则空会话不该进历史)
  useEffect(() => {
    if (messagesRef.current.length > 0) onSnapshot(messagesRef.current, frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  const run = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || status === 'streaming' || status === 'submitted') return;
      // 发送瞬间快照当前局势:只有最新一份代表现实(旧消息里的是历史,identity 有交代)
      void sendMessage({ text: t, metadata: { situation: buildSituation(getBodyRef.current() as ChatSituation) } });
    },
    [sendMessage, status],
  );

  // 快捷话术:填充进 composer 而非直发(用户可改措辞/追加 @ 引用再发)
  const fillComposer = useCallback((text: string) => {
    composerRef.current?.setText(text);
  }, []);

  // 「一键成片」进度 + 选中 pill 暴露给工作台。
  useImperativeHandle(
    handleRef,
    () => ({
      startProgress(): ProgressHandle {
        const id = mid('prog');
        const paint = (text: string) =>
          setMessages((s) => {
            const exists = s.some((m) => m.id === id);
            const msg: UIMessage = { id, role: 'assistant', parts: [{ type: 'text', text }] };
            return exists ? s.map((m) => (m.id === id ? msg : m)) : [...s, msg];
          });
        const lines: string[] = [];
        paint(' ');
        return {
          step(text) {
            const done = lines.map((l) => `✓ ${l}`).join('\n');
            lines.push(text);
            paint((done ? `${done}\n` : '') + `${text} …`);
          },
          finish(text) {
            paint(`${lines.map((l) => `✓ ${l}`).join('\n')}\n\n${text}`);
          },
          fail(text) {
            const body = lines.map((l, i) => (i < lines.length - 1 ? `✓ ${l}` : `✗ ${l}`)).join('\n');
            paint(`${body}\n\n${text}`);
          },
        };
      },
      insertElementPill(el) {
        composerRef.current?.insertElementPill(el);
      },
      send(text) {
        run(text);
      },
      insertText(text) {
        composerRef.current?.insertText(text);
      },
      focusInput() {
        composerRef.current?.focusInput();
      },
      attachFrame(s) {
        applyFrame(s);
      },
    }),
    [setMessages, run],
  );

  const empty = messages.length === 0;

  return (
    <>
      {/* indeterminate 进度条的滑动动画(工具卡用) */}
      <style>{'@keyframes hf-indet{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}@media (prefers-reduced-motion: reduce){[style*="hf-indet"]{animation:none !important}}'}</style>
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-5 p-3">
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <ConversationEmptyState
                icon={<PiAvatar size={44} />}
                title={t('我来帮你做这条视频')}
                description={t('上传视频后点「一键成片」,自动分镜、配设计图形;也可以直接说要加什么、怎么改,@ 指定某个组件或分镜。')}
              />
              {/* 引导:成片流水线全由 agent 驱动,点一下 = 发一句话 */}
              {/* 不用 Suggestions(横向滚动条):快捷话术直接换行铺开。
                  点击=填进输入框(可改可删,发送权在用户),不直接发 */}
              <div className="flex max-w-full flex-wrap items-center justify-center gap-2 px-3">
                <Suggestion suggestion={t('一键成片,分镜、配图、字幕一步到位')} onClick={fillComposer} />
                <Suggestion suggestion={t('先分镜看看结构,我再决定怎么改')} onClick={fillComposer} />
                <Suggestion suggestion={t('提取口播稿,用文字直接剪视频')} onClick={fillComposer} />
              </div>
            </div>
          ) : (
            messages.map((m, mi) => {
              const parts = (m.parts ?? []) as ToolPartLike[];
              // 死区检测:流还在跑,但最后一个可见 part 既不是「正在跑的工具」(卡片自己会动)
              // 也不是「正在长的文本」(token 本身是反馈)→ 出思考跳点,别让画面静止
              const busy = status === 'submitted' || status === 'streaming';
              const isLast = mi === messages.length - 1;
              const vis = parts.filter((p) => p.type !== 'step-start');
              const lastPart = vis[vis.length - 1];
              const lastToolRunning =
                !!lastPart && (lastPart.type.startsWith('tool-') || lastPart.type === 'dynamic-tool') && toolStatus(lastPart).kind === 'running';
              const lastTextLive = !!lastPart && lastPart.type === 'text' && !!(lastPart as { text?: string }).text;
              const thinking = m.role === 'assistant' && isLast && busy && !lastToolRunning && !lastTextLive;
              return (
                <Message key={m.id} from={m.role}>
                  <div className="flex items-start gap-2">
                    {m.role === 'assistant' && <PiAvatar thinking={thinking} />}
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      {parts.map((part, idx) => {
                        const key = `${m.id}-${idx}`;
                        if (part.type === 'step-start') return null;
                        if (part.type === 'text') {
                          const text = (part as { text?: string }).text ?? '';
                          if (!text) return null;
                          return m.role === 'user' ? (
                            <MessageContent key={key}>
                              <div className="text-[13px] leading-relaxed">{renderTextWithElementPills(text, elements)}</div>
                            </MessageContent>
                          ) : (
                            <MessageContent key={key}>
                              <MessageResponse className="text-[13px] leading-relaxed">{text}</MessageResponse>
                            </MessageContent>
                          );
                        }
                        if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') return renderToolPart(part, key);
                        return null;
                      })}
                      {thinking && <ThinkingDots />}
                    </div>
                  </div>
                </Message>
              );
            })
          )}
          {/* 发出去还没等到首响(最后一条是用户消息):独立思考行 */}
          {(status === 'submitted' || status === 'streaming') && messages[messages.length - 1]?.role === 'user' && (
            <Message from="assistant">
              <div className="flex items-start gap-2">
                <PiAvatar thinking />
                <div className="pt-0.5">
                  <ThinkingDots />
                </div>
              </div>
            </Message>
          )}
          {/* 请求/流失败:给个看得见的错误条(否则只是悄悄停住),重试 = regenerate 重跑最后一轮 */}
          {error && (
            <div className="border-line bg-panel-2 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px]">
              <X size={12} className="shrink-0 text-destructive" />
              <span className="min-w-0 flex-1 truncate text-destructive">
                {error.message?.includes('insufficient_tokens') ? t('积分不足，充值后继续') : t('出错了:{msg}', { msg: error.message || t('请求失败') })}
              </span>
              <button
                type="button"
                onClick={() => void regenerate()}
                className="text-ink-2 hover:bg-line hover:text-ink shrink-0 rounded px-1.5 py-0.5 font-medium"
              >
                {t('重试')}
              </button>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="p-2.5 pt-1">
        <Composer
          placeholder={t('说说要加什么、怎么改(@ 指定组件)…')}
          status={status}
          elements={elements}
          frame={frame}
          frames={frames}
          onPickFrame={applyFrame}
          onRemoveFrame={() => setFrame(null)}
          onSubmit={run}
          onStop={stop}
          methodsRef={composerRef}
        />
      </div>
    </>
  );
}

/* ============================ 多会话外壳 ============================ */

interface StoredThread {
  id: string;
  title: string;
  messages: UIMessage[];
  updatedAt: number;
  /** 会话挂载的 frame(恢复会话时主题按钮高亮一起回来)。 */
  frame?: AttachedFrame | null;
}

function loadThreads(storageKey: string): StoredThread[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const arr = JSON.parse(raw) as StoredThread[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function saveThreads(storageKey: string, threads: StoredThread[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(threads.slice(0, 30)));
  } catch {
    /* 配额满 / 隐私模式 —— 忽略 */
  }
}

/** 恢复中断会话的清洗:流式中落盘的快照里,工具 part 可能停在「入参已到/还在流」态——
 *  恢复后没有 onToolCall 会继续执行它,不清洗就是永远转圈的卡。标成中断错误态,
 *  文本 part 的半截内容原样保留(已经流出来的就是历史)。 */
function sanitizeRestored(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => {
    if (m.role !== 'assistant') return m;
    const parts = (m.parts ?? []).map((p) => {
      const tp = p as { type: string; state?: string };
      if (tp.type.startsWith('tool-') && (tp.state === 'input-streaming' || tp.state === 'input-available')) {
        return { ...p, state: 'output-error', errorText: t('生成被打断(切换了会话或刷新了页面)') } as typeof p;
      }
      return p;
    });
    return { ...m, parts };
  });
}

function firstUserText(messages: UIMessage[]): string {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return '';
  return ((first.parts ?? []) as { type: string; text?: string }[])
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('')
    .replace(/@[\w.-]+/g, '')
    .trim();
}

/** memo:chat 常挂(切面板只 hidden),工作台高频重渲(box 拖拽逐帧 setComp)时
 *  不能连带整棵消息树重渲。前提 = 三个 props 身份稳定(工作台侧已保证:
 *  runTool 走 useStableCallbacks、getBody useCallback([])、elements 按内容 key memo)。 */
export const StudioChat = memo(
  forwardRef<StudioChatHandle, StudioChatProps>(function StudioChat({ runTool, getBody, elements, onFrameApplied, storageKey, onThreadsChange, onClose }, ref) {
  const [threads, setThreads] = useState<StoredThread[]>([]);
  const onThreadsChangeRef = useRef(onThreadsChange);
  onThreadsChangeRef.current = onThreadsChange;
  const [activeId, setActiveId] = useState<string>(() => mid('thread'));
  const [histOpen, setHistOpen] = useState(false);
  const innerRef = useRef<StudioChatHandle | null>(null);
  const frames = useFrameCatalog(); // `/` 选择器的 frame 目录(进程内缓存)

  // 挂载后从 localStorage 恢复(SSR 安全:首帧空,客户端再水合)。key 按项目分,
  // 会话属于项目;工作台按项目 remount,所以 storageKey 不会中途变
  useEffect(() => {
    const loaded = loadThreads(storageKey);
    if (loaded.length) {
      setThreads(loaded);
      setActiveId(loaded[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = threads.find((t) => t.id === activeId);
  // 恢复时清洗中断残留(memo 按消息身份:快照落盘才换引用,不逐帧跑)
  const activeMessages = active?.messages;
  const restoredMessages = useMemo(() => (activeMessages ? sanitizeRestored(activeMessages) : []), [activeMessages]);

  // 最新 threads 镜像:onSnapshot 在 updater 外算 merged 用(updater 必须纯——React 会在
  // 渲染期重放排队中的 updater,内含 saveThreads/通知工作台的副作用会变成"渲染中 setState"
  // 告警,踩过)。快照来自流式收尾回调(事件时机),ref 读到的就是当前值。
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const onSnapshot = useCallback(
    (messages: UIMessage[], frame: AttachedFrame | null) => {
      if (messages.length === 0) return;
      const title = firstUserText(messages).slice(0, 24) || t('新对话');
      const next: StoredThread = { id: activeId, title, messages, updatedAt: Date.now(), frame };
      const merged = [next, ...threadsRef.current.filter((t) => t.id !== activeId)];
      setThreads(merged);
      saveThreads(storageKey, merged);
      onThreadsChangeRef.current?.(); // 落 localStorage 了 → 通知工作台同步上云
    },
    [activeId, storageKey],
  );

  const newConversation = useCallback(() => {
    setActiveId(mid('thread'));
    setHistOpen(false);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      startProgress: () =>
        innerRef.current?.startProgress() ?? { step() {}, finish() {}, fail() {} },
      insertElementPill: (el) => innerRef.current?.insertElementPill(el),
      send: (text) => innerRef.current?.send(text),
      insertText: (text) => innerRef.current?.insertText(text),
      focusInput: () => innerRef.current?.focusInput(),
      attachFrame: (frame) => innerRef.current?.attachFrame(frame),
    }),
    [],
  );

  return (
    <div className="bg-panel flex h-full min-h-0 w-full min-w-0 flex-col">
      {/* 头:标题 + 历史 + 新对话 */}
      <div className="border-line text-ink-3 relative flex items-center gap-1.5 border-b px-3 py-2 text-[12px]">
        <Sparkles size={13} className="text-accent" />
        <span className="truncate">{active?.title ?? t('对话')}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            className="hover:bg-panel-2 hover:text-ink inline-flex h-6 w-6 items-center justify-center rounded"
            onClick={() => setHistOpen((v) => !v)}
            title={t('历史会话')}
          >
            <History size={13} />
          </button>
          <button
            type="button"
            disabled={!active || active.messages.length === 0}
            className="hover:bg-panel-2 hover:text-ink inline-flex h-6 w-6 items-center justify-center rounded disabled:pointer-events-none disabled:opacity-30"
            onClick={newConversation}
            title={!active || active.messages.length === 0 ? t('已是新对话') : t('新对话')}
          >
            <MessageSquarePlus size={14} />
          </button>
          {onClose && (
            <button
              type="button"
              className="hover:bg-panel-2 hover:text-ink inline-flex h-6 w-6 items-center justify-center rounded"
              onClick={onClose}
              title={t('关闭对话')}
              aria-label={t('关闭对话')}
            >
              <X size={14} />
            </button>
          )}
        </div>
        {histOpen && (
          <div className="border-line bg-panel absolute right-2 top-9 z-20 max-h-[50vh] w-[260px] overflow-y-auto rounded-md border shadow-md">
            {threads.length === 0 ? (
              <div className="text-ink-4 px-3 py-3 text-center text-[12px]">{t('还没有历史会话')}</div>
            ) : (
              threads.map((th) => (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => {
                    setActiveId(th.id);
                    setHistOpen(false);
                  }}
                  className={`hover:bg-panel-2 flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] ${th.id === activeId ? 'bg-panel-2' : ''}`}
                >
                  <span className="text-ink truncate">{th.title || t('新对话')}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <ChatThread
        key={activeId}
        threadId={activeId}
        initialMessages={restoredMessages}
        initialFrame={active?.frame ?? null}
        frames={frames}
        onFrameApplied={onFrameApplied}
        runTool={runTool}
        getBody={getBody}
        elements={elements}
        onSnapshot={onSnapshot}
        handleRef={innerRef}
      />
    </div>
  );
  }),
);
