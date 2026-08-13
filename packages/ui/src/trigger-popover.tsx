'use client';

/**
 * TriggerPopover — unified interaction for "trigger char like @ or / + popover + live filter + keyboard select".
 *
 * The @ mention and / skill menu in chat-column used to be written separately and behaved inconsistently:
 * deleting @ closed the popover but deleting / didn't; / had no query filter; etc. This extracts the whole
 * trigger → position → query → keyboard nav → click-outside → auto-close-when-trigger-char-gone flow, so the
 * caller only handles:
 *
 *   1. items data + how to extract searchable text from an item (itemSearchText)
 *   2. rendering an item (renderItem, which gets active / pick / setActive / prev item for grouping)
 *   3. what to do on select (onPick; editor edits like "swallow the trigger char" go here too)
 *
 * When it opens: typing the trigger char in the editor; the component doesn't preventDefault, letting the
 * char into the editor while recording the caret anchor. Every input/compositionend re-runs the query
 * extraction — if it can't extract one (trigger deleted, a space appeared, moved out of the text node) it auto-closes.
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
import { useUiI18n } from './i18n';

/** Imperative API — opens directly when a Composer bottom-bar button is clicked (not via a trigger char).
 *  When anchorEl is passed the popover anchors to that element (usually the trigger button itself);
 *  otherwise it falls back to the editor position. */
export interface TriggerPopoverHandle {
  open: (anchorEl?: HTMLElement | null) => void;
}

export interface TriggerPopoverPickContext {
  /** Trigger-character menus edit the composer token; manual button menus must leave it untouched. */
  source: 'trigger' | 'manual';
}

export interface TriggerPopoverProps<T> {
  /** Trigger char: "@" / "/" / or another single char; omit = imperative open() only (button-invoked), editor not listened to */
  trigger?: string;
  /** ref to the contenteditable editor */
  editorRef: React.RefObject<HTMLElement | null>;
  /** Turn off listening (for streaming / disabled). Default true. */
  enabled?: boolean;

  /** Source of all items */
  items: T[];
  /** Extract searchable text from an item, joining multiple fields into a string. Filter uses lowercase includes. */
  itemSearchText: (item: T) => string;
  /** React key for an item */
  itemKey: (item: T) => string;

  /** Header title (e.g. "/ Run Skill · 28") */
  title: string;

  /** Optional category tabs: if passed, a row of clickable tabs shows under the title, ←/→ switches between them,
   *  and the list only shows the current tab. Use with itemTab — assigns an item to a tab.key. */
  tabs?: { key: string; label: string }[];
  /** Which tab.key an item belongs to (tabs mode only) */
  itemTab?: (item: T) => string;

  /** Placeholder when items is empty to begin with */
  emptyOriginal?: React.ReactNode;
  /** Placeholder when items is non-empty but the query matched nothing */
  emptyMatched?: (query: string) => React.ReactNode;

  /** Render an item */
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

  /** Select callback; the caller applies the item to the editor (swallow trigger char + insert pill, etc.).
   *  The component closes the popover right after calling onPick — the caller doesn't need to close it. */
  onPick: (item: T, context: TriggerPopoverPickContext) => void;

  /** Key (itemKey) of the item that is currently "selected" in the caller's state (e.g. the attached theme).
   *  On open, the highlight starts on it and the list scrolls it into view (centered) instead of starting at the top. */
  initialActiveKey?: string | null;

  /** Called when the popover closes (fires on toggle / Esc / click-outside / after select). The caller uses
   *  it to restore focus + caret back to the editor. */
  onClose?: () => void;

  /** Extra className for the popover container (width / shadow / etc.) */
  className?: string;
}

interface Anchor {
  /** left edge of the trigger element (absolute px, viewport coords) */
  left: number;
  /** top edge of the trigger */
  top: number;
  /** bottom edge of the trigger — used by the "flip below when there's not enough room above" logic; on caret trigger, top == bottom */
  bottom: number;
}

function TriggerPopoverImpl<T>(
  props: TriggerPopoverProps<T>,
  ref: React.Ref<TriggerPopoverHandle>,
) {
  const messages = useUiI18n();
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
    initialActiveKey,
    onClose,
    className,
  } = props;

  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<string>(tabs?.[0]?.key ?? '');
  /** Manual open() mode: skips the "must have a trigger char before the caret" check; doesn't track query
   *  in input or auto-close. Query comes from the popover's own search box. */
  const [manualMode, setManualMode] = useState(false);
  // Only auto-scroll when active changes came from the keyboard; setting active via mouse hover doesn't scroll —
  // otherwise brushing the mouse over a row half-clipped at the list edge would trigger scrollIntoView and jump the whole list.
  const kbNavRef = useRef(false);
  const isComposingRef = useRef(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Trigger button for the imperative open() — click-outside must skip it (clicking the button itself is
  // handled by its onClick toggle; otherwise mousedown closes first and onClick reopens, making the button
  // "only ever reopen, never close").
  const anchorElRef = useRef<HTMLElement | null>(null);
  // The open() closure can't read the latest anchor (deps are fixed), so mirror the open/closed state in a ref for the toggle check.
  const openRef = useRef(false);
  useEffect(() => {
    openRef.current = anchor != null;
  }, [anchor]);

  // Filter by query first; in tabs mode the tab counts use this layer.
  const queryFiltered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter((it) => itemSearchText(it).toLowerCase().includes(q));
  }, [items, query, itemSearchText]);

  // Then filter by the current tab (non-tabs mode just uses queryFiltered). Both list and keyboard use filtered.
  const filtered = useMemo(() => {
    if (!tabs || !itemTab) return queryFiltered;
    return queryFiltered.filter((it) => itemTab(it) === activeTab);
  }, [queryFiltered, tabs, itemTab, activeTab]);

  // filtered length changes / tab switches → reset active idx
  useEffect(() => {
    setActiveIdx(0);
  }, [filtered.length, activeTab]);

  // Clean up on close. silent=true (click-outside close) skips onClose — clicking elsewhere shouldn't yank
  // focus back to the editor; toggle / Esc / select use the default (onClose restores the editor caret).
  const close = useCallback(
    (opts?: { silent?: boolean }) => {
      setAnchor(null);
      setQuery('');
      setManualMode(false);
      setActiveIdx(0); // reset highlight on close — next open doesn't retain the last selection
      setActiveTab(tabs?.[0]?.key ?? ''); // tab also returns to the first
      anchorElRef.current = null;
      if (!opts?.silent) onClose?.();
    },
    [tabs, onClose],
  );

  /** Open-time highlight: land on the caller's currently-selected item (initialActiveKey), so a long
   *  list (e.g. the theme catalog) opens at the selection instead of the top. Falls back to 0. The
   *  matching scroll happens pre-paint in the open-centering layout effect below. */
  const applyInitialActive = useCallback(() => {
    const idx = initialActiveKey ? items.findIndex((it) => itemKey(it) === initialActiveKey) : -1;
    setActiveIdx(idx >= 0 ? idx : 0);
  }, [initialActiveKey, items, itemKey]);

  // Pre-paint centering on open: scroll the highlighted row to the middle of the list BEFORE the first
  // paint, so the popover appears already positioned (scrolling after paint reads as a visible jump).
  // Touches only the list's own scrollTop — scrollIntoView would also scroll ancestors (the chat thread
  // behind a non-portaled popover) and judder the page.
  const openedRef = useRef(false);
  useLayoutEffect(() => {
    if (!anchor) {
      openedRef.current = false;
      return;
    }
    if (openedRef.current) return; // only on the open transition, not on later filter/hover renders
    openedRef.current = true;
    const list = popoverRef.current?.querySelector('[data-trigger-list]') as HTMLElement | null;
    const active = list?.querySelector('[data-active]') as HTMLElement | null;
    if (!list || !active) return;
    const lr = list.getBoundingClientRect();
    const ar = active.getBoundingClientRect();
    list.scrollTop += ar.top - lr.top - (lr.height - ar.height) / 2;
  }, [anchor]);

  /** Search backward from the caret for the nearest trigger char, returning the query between it and the caret.
   *  Returns null = "should close the popover" — trigger isn't in the current text node / contains a space / is broken up by other chars. */
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

  // editor-level listeners: trigger char / input / composition (no trigger = button-only invocation, no listeners attached)
  useEffect(() => {
    if (!enabled || !trigger) return;
    const el = editorRef.current;
    if (!el) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== trigger) return;
      // Don't preventDefault: the char enters the editor normally, so readQuery can track it in later input events
      setTimeout(() => {
        const a = readCaretAnchor();
        if (a) {
          setAnchor(a);
          setQuery('');
          applyInitialActive(); // start on the caller's selected item if any, else the top
          setActiveTab(tabs?.[0]?.key ?? '');
        }
      }, 0);
    };

    const handleInputCheck = () => {
      // Don't track when the popover isn't open — no need
      const opened = popoverRef.current !== null;
      if (!opened && !anchor) return;
      // Manual mode: query comes from the popover's own input, don't track the trigger char in the editor
      if (manualMode) return;
      const q = readQuery();
      if (q === null) {
        close();
      } else {
        setQuery(q);
      }
    };

    const onInput = () => {
      if (isComposingRef.current) return; // hold still during IME composition
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
  }, [enabled, editorRef, trigger, readCaretAnchor, readQuery, close, anchor, manualMode, tabs, applyInitialActive]);

  // Imperative open: button click opens directly. Prefer the passed anchorEl as anchor, falling back to the editor position.
  // At render time the remaining viewport space decides whether the popover expands up or down (top edge too close to the top → down).
  useImperativeHandle(
    ref,
    () => ({
      open: (anchorEl?: HTMLElement | null) => {
        // Already open → clicking the same button again toggles it closed (the click-outside handler skips the
        // button, so it's still in the open state here and correctly switches to closed).
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
        applyInitialActive(); // start on the caller's selected item if any, else the top
        // Focus the search box on the next frame so the user can type to filter right away
        setTimeout(() => searchInputRef.current?.focus(), 0);
      },
    }),
    [editorRef, close, applyInitialActive],
  );

  // global keydown：↑↓ Enter Esc
  useEffect(() => {
    if (!anchor) return;
    const handle = (e: KeyboardEvent) => {
      let consumed = true;
      if (e.key === 'Escape') {
        close();
      } else if (tabs && tabs.length >= 2 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        // Switch tabs left/right (like global search)
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
          onPick(item, { source: manualMode ? 'manual' : 'trigger' });
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
  }, [anchor, filtered, activeIdx, onPick, close, tabs, activeTab, manualMode]);

  // click-outside close
  useEffect(() => {
    if (!anchor) return;
    const handle = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      // Clicking the trigger button itself doesn't count as outside — leave it to its onClick toggle, otherwise
      // mousedown closes first and onClick reopens, and the button can never be closed.
      if (anchorElRef.current?.contains(e.target as Node)) return;
      // Clicking in the editor (moving the caret) also counts as outside — the user switched context, so close.
      // silent: clicking elsewhere doesn't yank focus back to the editor (but clicking back into the editor itself lands focus naturally, no restore needed).
      close({ silent: true });
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [anchor, close]);

  // Scroll the active item into view — keyboard nav only; hover-induced active changes don't move the scroll position
  useEffect(() => {
    if (!kbNavRef.current) return;
    kbNavRef.current = false;
    const list = popoverRef.current?.querySelector('[data-trigger-list]');
    if (!list) return;
    const active = list.querySelector('[data-active]') as HTMLElement | null;
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  // Measure then clamp into the viewport: expands above the trigger by default, flips below if it won't fit;
  // pulls back in when it overflows left/right. Uses a layout effect (runs before paint) to position by actual
  // width/height, avoiding off-screen results from "estimated sizes".
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
    let top = anchor.top - 8 - h; // expand above
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
        // Above the timeline chrome (sticky gutter / playhead / drag ghost are z-50 and later in the DOM),
        // below the fullscreen lightbox layer (z-[100]) — they never show together anyway.
        zIndex: 90,
        // The list itself is max-h-[60vh]; cap the whole thing to the viewport height as a backstop, working with the layout-effect clamping
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
            placeholder={messages.searchPlaceholder}
            className="w-full rounded-md border border-line bg-panel-2 px-2 py-1 text-[12px] outline-none focus:border-ink"
          />
        </div>
      )}
      <div data-trigger-list className="overflow-y-auto p-2 max-h-[60vh]">
        {isOriginalEmpty ? (
          emptyOriginal ?? (
            <div className="px-2 py-3 text-[12px] text-ink-3 text-center">{messages.emptyOptions}</div>
          )
        ) : isMatchedEmpty ? (
          emptyMatched?.(query) ?? (
            <div className="px-2 py-3 text-[12px] text-ink-3 text-center">
              {messages.noMatches(query)}
            </div>
          )
        ) : (
          filtered.map((item, i) => (
            <div key={itemKey(item)}>
              {renderItem(item, {
                active: i === activeIdx,
                pick: () => {
                  onPick(item, { source: manualMode ? 'manual' : 'trigger' });
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

// Wrap in forwardRef to expose open() to the caller. Generic props are preserved via a cast, no runtime effect.
export const TriggerPopover = forwardRef(TriggerPopoverImpl) as <T>(
  props: TriggerPopoverProps<T> & { ref?: React.Ref<TriggerPopoverHandle> },
) => React.ReactElement | null;
