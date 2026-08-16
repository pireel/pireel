'use client';

/** Shared presentation helpers for the studio chat: ids, element pills, avatar, thinking dots. */

import { BrandMark } from '@pireel/ui/brand-mark';
import { t } from './i18n';
import type { StudioElementRef } from './studio-chat';

let _mid = 0;
export const mid = (p = 'm') => `${p}${++_mid}_${Math.random().toString(36).slice(2, 7)}`;

const ELEMENT_ICON: Record<string, string> = {
  caption: '✨',
  title: '🔠',
  stat: '🔢',
  list: '☰',
  transition: '⤬',
  custom: '✦',
  shot: '🎬',
};
export const elementIcon = (el: { kind: string; isShot: boolean }) =>
  el.isShot ? '🎬' : (ELEMENT_ICON[el.kind] ?? '✦');

export function PiAvatar({ thinking = false, size = 22 }: { thinking?: boolean; size?: number }) {
  const glyph = Math.round(size * 0.72);
  return (
    <span
      className="bg-ink/8 text-ink ring-ink/10 relative flex shrink-0 items-center justify-center rounded-full ring-1 ring-inset"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <BrandMark
        size={glyph}
        variant="adaptive"
        className={thinking ? 'animate-pulse' : undefined}
      />
    </span>
  );
}

export const CHAT_PILL_CLASS =
  'sc-pill group/chat-pill relative mx-0.5 inline-flex h-6 max-w-[160px] cursor-default select-none items-center gap-1 rounded border border-accent/30 bg-accent/10 px-1.5 align-middle text-[12px] font-medium leading-none text-accent';

export const CHAT_PILL_ICON_CLASS =
  'bg-accent/10 inline-flex h-4 w-5 shrink-0 items-center justify-center overflow-hidden rounded-sm text-[11px] leading-none';

export const CHAT_PILL_LABEL_CLASS = 'min-w-0 truncate text-[11px] leading-none';

/** Shared trailing action for editable chat tags. Sent-message tags intentionally stay read-only. */
export function appendChatPillRemoveIcon(
  pill: HTMLElement,
  label: string,
  onRemove: () => void,
) {
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.contentEditable = 'false';
  remove.className =
    'border-line bg-panel text-ink-3 absolute -right-1 -top-1 z-10 inline-flex size-4 scale-90 cursor-pointer items-center justify-center rounded-sm border opacity-0 shadow-sm transition-[background-color,color,opacity,transform] hover:bg-ink hover:text-bg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink group-hover/chat-pill:pointer-events-auto group-hover/chat-pill:scale-100 group-hover/chat-pill:opacity-100 group-focus-within/chat-pill:pointer-events-auto group-focus-within/chat-pill:scale-100 group-focus-within/chat-pill:opacity-100';
  remove.setAttribute('aria-label', label);

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('width', '12');
  icon.setAttribute('height', '12');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M4.5 4.5l7 7m0-7-7 7');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-linecap', 'round');
  icon.appendChild(path);
  remove.appendChild(icon);

  remove.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  remove.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onRemove();
  });
  pill.appendChild(remove);
}

/** Imperatively build an element pill (contenteditable=false). */
export function makeElementPill(
  el: StudioElementRef,
  opts: { auto?: boolean; onRemove?: () => void } = {},
): HTMLSpanElement {
  const span = document.createElement('span');
  span.contentEditable = 'false';
  span.dataset.refId = el.id;
  if (opts.auto) span.dataset.auto = '1';
  span.className = CHAT_PILL_CLASS;
  span.title = `@${el.label}`;
  const text = document.createElement('span');
  text.className = CHAT_PILL_LABEL_CLASS;
  text.textContent = `@${el.label}`;
  span.appendChild(text);
  if (opts.onRemove) appendChatPillRemoveIcon(span, t('chatGen.removeElementTag'), opts.onRemove);
  return span;
}

/** Render @id back into a pill within the stream (same look as the input). */
const REF_TOKEN_RE = /@([a-zA-Z0-9._-]+)/g;
export function renderTextWithElementPills(text: string, elements: StudioElementRef[]): React.ReactNode {
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
        <span key={`${m.index}-${m[1]}`} className={CHAT_PILL_CLASS} title={`@${el.label}`}>
          <span className={CHAT_PILL_LABEL_CLASS}>@{el.label}</span>
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

/** Thinking dots: cover every dead gap where "nothing is moving" (awaiting first response, tool finished awaiting continuation). */
export function ThinkingDots({ label = t('chatGen.thinking') }: { label?: string }) {
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
