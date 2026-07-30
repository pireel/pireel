'use client';

/** Studio chat input: contenteditable composer with @ element pills and the theme (frame) picker. */

import { useImperativeHandle, useMemo, useRef, useState } from 'react';
import { AtSign, ArrowUp, Square, Palette, Check } from 'lucide-react';
import type { ChatStatus } from 'ai';
import { useLocale } from 'use-intl';
import { TriggerPopover, type TriggerPopoverHandle } from '@pireel/ui/trigger-popover';
import { SkillIcon } from '@pireel/ui/skill-icon';
import type { Composition } from '@pireel/studio-engine/composition';
import { framePack, type SupportedLocale as Locale } from '@pireel/studio-frames/locales';
import { InlineBlockPreview } from './block-preview-card';
import { coverBlock } from '@pireel/studio-frames/showcase-blocks';
import type { FrameCatalogItem } from './use-frame-catalog';
import { elementIcon, makeElementPill } from './chat-format';
import { t } from './i18n';
import type { AttachedFrame, StudioElementRef } from './studio-chat';

export interface ComposerHandle {
  insertElementPill(el: StudioElementRef | null): void;
  /** Append text at the end and focus (used by the generate panel's "@reference"): fill only, don't send. */
  insertText(text: string): void;
  /** Replace the whole box with text and focus (used by quick prompts): tapping different prompts swaps, doesn't concatenate. */
  setText(text: string): void;
  /** Focus only (cursor to end), don't touch content (used by the component floating bar's "AI edit"). */
  focusInput(): void;
}

export function Composer({
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
              title={t('chatGen.mentionElementShot')}
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
              title={frame ? t('chatGen.themeTitle', { title: frame.title }) : t('chatGen.pickTheme')}
            >
              <Palette className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
          </div>
          {isBusy ? (
            <button
              type="button"
              className="bg-destructive inline-flex h-7 w-7 items-center justify-center rounded-md text-white hover:brightness-110"
              onClick={onStop}
              title={t('chatGen.stop')}
            >
              <Square className="h-3 w-3" fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              className="bg-ink inline-flex h-7 w-7 items-center justify-center rounded-md text-white hover:bg-black disabled:opacity-30"
              disabled={empty}
              onClick={fireSubmit}
              title={t('chatGen.sendEnter')}
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
        title={t('chatGen.mentionElementN', { n: elements.length })}
        className="w-[260px]"
        emptyOriginal={<div className="text-ink-3 px-2 py-3 text-center text-[12px]">{t('chatGen.noElementsShotsYet')}</div>}
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
            <span className="text-ink-4 ml-auto shrink-0 text-[11px]">{el.isShot ? t('common.shot') : el.kind}</span>
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
        title={t('chatGen.pickThemeN', { n: frames.length })}
        className="w-[360px]"
        emptyOriginal={<div className="text-ink-3 px-2 py-3 text-center text-[12px]">{t('chatGen.loadingThemes')}</div>}
        onPick={pickFrame}
        initialActiveKey={frame?.id ?? null}
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
      title={selected ? t('chatGen.clickAgainRemoveTheme') : (framePack(locale, item.id)?.title ?? item.title)}
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
