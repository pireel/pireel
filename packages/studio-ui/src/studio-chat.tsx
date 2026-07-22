'use client';

/**
 * Studio chat panel — agent + tools version, same look as the "project doc" chat.
 *
 *  · Message stream / auto-scroll / empty state / scroll-to-bottom = ai-elements Conversation family
 *  · Bubbles + markdown = Message / MessageResponse (Streamdown)
 *  · Input = contenteditable composer (border/focus/π avatar/placeholder/@ pill); @ opens the element picker
 *  · LLM tool calls = useChat streaming; tools do NOT execute server-side — onToolCall mutates the
 *    Composition client-side (runTool injected by the workbench), addToolOutput feeds back to continue.
 *    Block generation goes through /api/studio/compose.
 *  · Tool calls render in the stream as a badge (instant ops) or a card (generative)
 *  · Multi-session: threads live in localStorage, switching remounts by key; startProgress still drives "one-tap film".
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

/* ============================ Public types ============================ */

/** An @-mentionable element (block / shot). */
export interface StudioElementRef {
  id: string;
  label: string;
  /** caption / title / stat / list / transition / custom / shot */
  kind: string;
  isShot: boolean;
}

/** Updater for a streaming "progress" message (used by the "one-tap film" background flow to report). */
export interface ProgressHandle {
  step(text: string): void;
  finish(text: string): void;
  fail(text: string): void;
}

/** Frame attached to the session (studio theme-template pack; theme button highlights + frameId rides the request, server injects the playbook). */
export interface AttachedFrame {
  id: string;
  title: string;
  icon: string;
  iconKey?: string | null;
}

export interface StudioChatHandle {
  startProgress(): ProgressHandle;
  /** Called by the workbench on selection change: pass an element → input shows a "currently selected" pill; pass null → remove it. */
  insertElementPill(el: StudioElementRef | null): void;
  /** Workbench pushes a user message directly. Silently dropped while streaming. */
  send(text: string): void;
  /** Only fill a piece of text into the input without sending (used by the generate panel's "@reference" for assets). */
  insertText(text: string): void;
  /** Only focus the input (component floating bar's "AI edit" switches over to keep typing). */
  focusInput(): void;
  /** Attach a frame to the current session (shared by frame panel "use" and the input's theme button): button highlights, injected with the request. */
  attachFrame(frame: AttachedFrame): void;
}

export interface StudioChatProps {
  /** Client-side tool executor: mutates Composition state / calls compose to generate blocks, returns a summary. */
  runTool: (toolId: string, input: Record<string, unknown>) => Promise<StudioToolResult>;
  /** Callback when a frame is attached (both panel "use" and the theme button): the workbench uses it to apply the theme palette to comp. */
  onFrameApplied?: (frame: AttachedFrame) => void;
  /** The situation read at send time (composition snapshot/selection/playhead/pipeline): buildSituation
   *  turns it into text on the user message's metadata.situation (not in request body, not in system). */
  getBody: () => Record<string, unknown>;
  /** Currently @-mentionable elements. */
  elements: StudioElementRef[];
  /** Session persistence key (per project: studio:chat:v1:<projectId>, sessions belong to a project). */
  storageKey: string;
  /** Fired after threads are written to localStorage (the workbench uses it to sync sessions to the cloud too). */
  onThreadsChange?: () => void;
  /** Close the chat area (header X; workbench collapses the right region to free up screen). Omit to not render the close button. */
  onClose?: () => void;
}

/* ============================ Helpers ============================ */

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

/** Imperatively build an element pill (contenteditable=false). */
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

/** Render @id back into a pill within the stream (same look as the input). */
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

/* ============================ Tool-duration memory (for ETA) ============================ */

// Historical duration EMA per tool type (self-calibrating in localStorage): tools without a progress fraction use it for "~Ns left".
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
  if (ms < 300) return; // don't record near-instant returns
  try {
    const m = JSON.parse(window.localStorage.getItem(DUR_KEY) ?? '{}') as Record<string, number>;
    const old = typeof m[toolId] === 'number' ? m[toolId] : null;
    m[toolId] = old ? Math.round(old * 0.6 + ms * 0.4) : Math.round(ms);
    window.localStorage.setItem(DUR_KEY, JSON.stringify(m));
  } catch {
    /* quota exceeded / private mode: ignore */
  }
}

/** Thinking dots: cover every dead gap where "nothing is moving" (awaiting first response, tool finished awaiting continuation). */
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

/* ============================ Tool-call rendering ============================ */

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

/** Normalize tool-call status. */
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
  // Same card language as ToolCard: header row (icon chip + name + status icon), result text on its own full-width body row (wraps)
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
 * Generative tool card: something is always moving —
 * running = spinner + elapsed/remaining + stage text (stream note > progress text > busyText) + progress bar
 * (with frac: determinate, ETA extrapolated by rate; without: indeterminate slider + historical EMA for ETA).
 */
function ToolCard({ def, part }: { def: StudioToolDef; part: ToolPartLike }) {
  const st = toolStatus(part);
  const running = st.kind === 'running';
  const prog = useToolProgress(def.id);
  const live = running ? prog : null;
  const instruction = typeof part.input?.instruction === 'string' ? (part.input.instruction as string) : '';

  // Elapsed (clock starts once running is observed, ticks every 0.5s); on completion, record into the historical EMA
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
  // ETA: with frac, extrapolate by measured rate; else use historical EMA; with neither, only report elapsed
  let timeText = '';
  if (running && elapsedS >= 1) {
    if (live?.frac != null && live.frac >= 0.99) {
      timeText = t('收尾中 · 已 {s}s', { s: Math.floor(elapsedS) }); // bar full but not returned yet: stop lying with "~1s left"
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
      {/* Done/failed: result text on its own full-width body row (same spec as the badge), wraps instead of hanging in the right column */}
      {!running && st.text && (
        <div className={`border-line/70 break-words border-t px-2.5 py-1.5 text-[12px] leading-relaxed ${st.kind === 'error' ? 'text-destructive' : 'text-ink-3'}`}>
          {st.text}
        </div>
      )}
      {/* Running: stage-text body row (stream note > progress text > default busy text), multi-line readable */}
      {running && (
        <div className="border-line/70 text-ink-3 line-clamp-3 border-t px-2.5 py-1.5 text-[12px] leading-relaxed">
          {live?.text || (def.busyText ? t(def.busyText) : t('执行中…'))}
        </div>
      )}
      {/* Progress bar: determinate with frac; indeterminate slider without (always something moving) */}
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

/* ============================ Input (composer) ============================ */

interface ComposerHandle {
  insertElementPill(el: StudioElementRef | null): void;
  /** Append text at the end and focus (used by the generate panel's "@reference"): fill only, don't send. */
  insertText(text: string): void;
  /** Replace the whole box with text and focus (used by quick prompts): tapping different prompts swaps, doesn't concatenate. */
  setText(text: string): void;
  /** Focus only (cursor to end), don't touch content (used by the component floating bar's "AI edit"). */
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
  /** Frame attached to the current session (theme button highlights; tapping the same item in the picker removes it). */
  frame: AttachedFrame | null;
  /** Frame catalog for the theme picker. */
  frames: FrameCatalogItem[];
  onPickFrame: (frame: AttachedFrame) => void;
  onRemoveFrame: () => void;
  onSubmit: (text: string) => void;
  onStop: () => void;
  methodsRef: React.MutableRefObject<ComposerHandle | null>;
}) {
  const locale = useLocale() as Locale; // theme cover preview is a locale-specific content pack
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

  /** Serialize contenteditable → plain text (pills become @id tokens). */
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

  /** Swallow the nearest trigger character before the cursor. */
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

  /** Theme picker selection → attach frame (button highlights, not in body text); tapping the currently attached item = remove. */
  function pickFrame(item: FrameCatalogItem) {
    if (frame?.id === item.id) {
      onRemoveFrame();
      return;
    }
    onPickFrame({ id: item.id, title: item.title, icon: item.icon, iconKey: item.iconKey ?? null });
  }

  /** @ picker selection → insert pill. */
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
        // Remove the previous "currently selected" pill (and the space after it)
        root.querySelectorAll('[data-auto]').forEach((n) => {
          const next = n.nextSibling;
          if (next && next.nodeType === Node.TEXT_NODE && next.textContent === ' ') next.remove();
          n.remove();
        });
        if (el) {
          // Already explicitly @-mentioned the same one → don't add again
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
        // Focus and put the cursor at the end so the user's next typing becomes an addendum
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
            {/* Theme button: attached state = button itself highlights (no longer stuffs a tag into the input); tap the same item in the picker to remove */}
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

      {/* Theme picker: button-only trigger (no trigger char, `/` reserved for future skills); tall row card = cover on left, description on right */}
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

/** Tall row card for the theme picker: left = real dialect-cover render (16:9, hover preview; falls back to icon if no cover),
 *  right = title + summary; the currently attached item is checked, tap again to remove. */
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
  // Cover uses a uniform 16:9 canvas + the frame's own palette; chat can't reach the project comp, so theme is default
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

/* ============================ Single-thread chat (useChat) ============================ */

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

  // Frame attached to the session: input theme button highlights, every request carries frameId along (server injects the playbook)
  const [frame, setFrame] = useState<AttachedFrame | null>(initialFrame);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const onFrameAppliedRef = useRef(onFrameApplied);
  onFrameAppliedRef.current = onFrameApplied;
  /** Attach a frame (shared by panel/theme button): besides session state, also notifies the workbench to apply the theme palette to comp. */
  const applyFrame = useCallback((f: AttachedFrame) => {
    setFrame(f);
    onFrameAppliedRef.current?.(f);
  }, []);

  // body carries only frameId; the situation snapshot is attached to metadata.situation at send time (persists with the session,
  // the route materializes it into a <composition_state> part) — stable history bytes are what let the prompt cache hit
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

  // Persist: on stream end (ready / error) write localStorage; throttle a snapshot every 2s while streaming —
  // so switching sessions / refreshing mid-generation doesn't evaporate the streamed-out parts and completed tool outputs.
  // On first mount status is already 'ready' (also when restoring/switching to an old session) — skip that one,
  // otherwise merely opening an old session refreshes its updatedAt and scrambles the history ordering.
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
  // Unmount mid-generation (switching session/new chat triggers key remount): stop the stream + snapshot the last moment —
  // otherwise fetch keeps running and onToolCall mutates the work in the background while the UI is already gone.
  // Non-generating unmount doesn't snapshot (glance at an old session then switch away shouldn't refresh its updatedAt).
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
        /* already ended */
      }
      onSnapshot(messagesRef.current, frameRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // Refresh/close mid-generation: native browser confirm dialog (a broken stream can't resume — client-execution architecture, no server-side run to recover)
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  // Attaching/detaching a frame also persists (only if there are messages; an empty session shouldn't enter history)
  useEffect(() => {
    if (messagesRef.current.length > 0) onSnapshot(messagesRef.current, frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  const run = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || status === 'streaming' || status === 'submitted') return;
      // Snapshot the current situation at send time: only the latest one represents reality (situations in old messages are history, identity accounts for it)
      void sendMessage({ text: t, metadata: { situation: buildSituation(getBodyRef.current() as ChatSituation) } });
    },
    [sendMessage, status],
  );

  // Quick prompts: fill into the composer instead of sending directly (user can reword / add @ references before sending)
  const fillComposer = useCallback((text: string) => {
    composerRef.current?.setText(text);
  }, []);

  // Expose "one-tap film" progress + selected pill to the workbench.
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
      {/* Slide animation for the indeterminate progress bar (used by tool cards) */}
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
              {/* Onboarding: the film pipeline is entirely agent-driven, one tap = one sentence sent */}
              {/* Not using Suggestions (horizontal scrollbar): quick prompts wrap across lines instead.
                  Click = fill into the input (editable/deletable, send authority stays with the user), doesn't send directly */}
              <div className="flex max-w-full flex-wrap items-center justify-center gap-2 px-3">
                <Suggestion suggestion={t('一键成片,分镜、配图、字幕一步到位')} onClick={fillComposer} />
                <Suggestion suggestion={t('先分镜看看结构,我再决定怎么改')} onClick={fillComposer} />
                <Suggestion suggestion={t('提取口播稿,用文字直接剪视频')} onClick={fillComposer} />
              </div>
            </div>
          ) : (
            messages.map((m, mi) => {
              const parts = (m.parts ?? []) as ToolPartLike[];
              // Dead-zone detection: stream still running, but the last visible part is neither a "running tool" (its card animates itself)
              // nor "growing text" (the tokens are their own feedback) → show thinking dots, don't let the view freeze
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
          {/* Sent but no first response yet (last message is the user's): standalone thinking row */}
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
          {/* Request/stream failed: show a visible error bar (otherwise it just silently stops); retry = regenerate reruns the last round */}
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

/* ============================ Multi-session shell ============================ */

interface StoredThread {
  id: string;
  title: string;
  messages: UIMessage[];
  updatedAt: number;
  /** Frame attached to the session (theme button highlight comes back when restoring the session). */
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
    /* quota full / private mode — ignore */
  }
}

/** Sanitize an interrupted session on restore: in a snapshot persisted mid-stream, a tool part may be stuck in "input arrived/still streaming"
 *  state — after restore there's no onToolCall to continue it, so without sanitizing the card spins forever. Mark it as an interrupted error;
 *  keep half-finished text parts as-is (whatever already streamed out is history). */
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

/** memo: chat stays mounted (switching panels only hides it), so the workbench's high-frequency re-renders
 *  (box drag setComp every frame) must not re-render the whole message tree along with it. Precondition = the three
 *  props have stable identity (guaranteed on the workbench side: runTool via useStableCallbacks, getBody useCallback([]),
 *  elements memoized by content key). */
export const StudioChat = memo(
  forwardRef<StudioChatHandle, StudioChatProps>(function StudioChat({ runTool, getBody, elements, onFrameApplied, storageKey, onThreadsChange, onClose }, ref) {
  const [threads, setThreads] = useState<StoredThread[]>([]);
  const onThreadsChangeRef = useRef(onThreadsChange);
  onThreadsChangeRef.current = onThreadsChange;
  const [activeId, setActiveId] = useState<string>(() => mid('thread'));
  const [histOpen, setHistOpen] = useState(false);
  const innerRef = useRef<StudioChatHandle | null>(null);
  const frames = useFrameCatalog(); // frame catalog for the `/` picker (in-process cache)

  // Restore from localStorage after mount (SSR-safe: first frame empty, hydrate on the client). Key is per project,
  // sessions belong to a project; the workbench remounts per project, so storageKey won't change mid-life
  useEffect(() => {
    const loaded = loadThreads(storageKey);
    if (loaded.length) {
      setThreads(loaded);
      setActiveId(loaded[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = threads.find((t) => t.id === activeId);
  // Sanitize interruption leftovers on restore (memo by message identity: reference changes only when a snapshot persists, not every frame)
  const activeMessages = active?.messages;
  const restoredMessages = useMemo(() => (activeMessages ? sanitizeRestored(activeMessages) : []), [activeMessages]);

  // Latest threads mirror: onSnapshot computes merged outside the updater (the updater must be pure — React replays
  // queued updaters during render, and side effects like saveThreads/notifying the workbench inside would become
  // "setState during render" warnings; been bitten). Snapshots come from the stream-end callback (event time), so the ref reads the current value.
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
      onThreadsChangeRef.current?.(); // persisted to localStorage → notify the workbench to sync to the cloud
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
      {/* Header: title + history + new chat */}
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
