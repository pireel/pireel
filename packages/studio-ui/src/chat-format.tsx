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
      className="bg-panel-2 relative flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <BrandMark
        size={glyph}
        variant="chromatic"
        className={thinking ? 'animate-pulse' : undefined}
      />
    </span>
  );
}

const PILL_CLASS =
  'sc-pill inline-flex items-center gap-1 align-middle rounded px-1.5 py-px mx-0.5 text-[12px] font-medium border border-accent/30 bg-accent/10 text-accent select-none cursor-default';

/** Imperatively build an element pill (contenteditable=false). */
export function makeElementPill(el: StudioElementRef, opts: { auto?: boolean } = {}): HTMLSpanElement {
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
