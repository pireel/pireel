'use client';

/**
 * Lightweight code editor (used by the component source editor): a transparent textarea layered over a
 * shiki highlight layer — input/cursor/selection/undo are all native textarea behavior, the highlight
 * layer is just a read-only mirror at the same character metrics.
 *  - Line-number gutter + scroll sync (textarea is the only scroll source; pre/gutter follow);
 *  - Tab/Shift+Tab indent (multi-line selection indents/dedents as a whole), Enter inherits the current line's indent;
 *  - Single-point insert uses execCommand to preserve the native undo stack; multi-line indent falls back to setRangeText.
 * No CodeMirror: there are only two small code segments here (HTML fragment + GSAP timeline body), enough and zero new deps.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { HighlighterGeneric } from 'shiki';

type Lang = 'html' | 'javascript';

// Singleton highlighter (both languages loaded at once); module-level cache, shared across editors / repeated open-close
type Hl = HighlighterGeneric<never, never>;
let hlPromise: Promise<Hl> | null = null;
function getHighlighter(): Promise<Hl> {
  hlPromise ??= import('shiki').then(
    (m) => m.createHighlighter({ langs: ['html', 'javascript'], themes: ['github-light', 'github-dark'] }) as Promise<Hl>,
  );
  return hlPromise;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// pre and textarea must have identical character metrics for the highlight layer to align char-by-char with the cursor — both share this font-metrics class string
const METRICS = 'font-mono text-[11px] leading-[1.6] [tab-size:2]';

export function CodeEditor({
  value,
  onChange,
  language,
  readOnly = false,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  language: Lang;
  readOnly?: boolean;
  className?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const [hl, setHl] = useState<Hl | null>(null);

  useEffect(() => {
    let alive = true;
    getHighlighter()
      .then((h) => {
        if (alive) setHl(h);
      })
      .catch(() => {}); // If highlighting fails, fall back to a plain-text mirror; editing is unaffected
    return () => {
      alive = false;
    };
  }, []);

  // Highlighted HTML: before the highlighter is ready, use escaped plain text (same metrics, just no color).
  // Dual theme: light uses the default color, dark is read from --shiki-dark by globals.css's .dark .shiki rule.
  // Pad a trailing space: when the value ends in a newline, pre's last line doesn't collapse, keeping line-number/scroll height in sync with the textarea.
  const highlighted = useMemo(() => {
    const padded = value.endsWith('\n') ? `${value} ` : value;
    if (!hl) return `<pre class="shiki"><code>${escapeHtml(padded)}</code></pre>`;
    try {
      return hl.codeToHtml(padded, { lang: language, themes: { light: 'github-light', dark: 'github-dark' } });
    } catch {
      return `<pre class="shiki"><code>${escapeHtml(padded)}</code></pre>`;
    }
  }, [hl, value, language]);

  const lineCount = useMemo(() => value.split('\n').length, [value]);

  // Scroll sync: textarea is the only scroll source; pre is overflow:hidden but scrollTop can be set programmatically
  const syncScroll = () => {
    const ta = taRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.style.transform = `translateY(${-ta.scrollTop}px)`;
  };
  // Content changes (e.g. AI filling back a whole segment) can shift the scroll position; re-align once after render
  useEffect(syncScroll, [highlighted]);

  /** Single-point insert: prefer execCommand (preserves native undo stack), fall back to setRangeText if unsupported. */
  const insertText = (text: string) => {
    const ta = taRef.current;
    if (!ta) return;
    ta.focus();
    let ok = false;
    try {
      ok = document.execCommand('insertText', false, text);
    } catch {
      ok = false;
    }
    if (!ok) {
      ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
      onChange(ta.value);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    const ta = e.currentTarget;
    const { selectionStart: s, selectionEnd: en } = ta;

    if (e.key === 'Tab') {
      e.preventDefault();
      const multiline = value.slice(s, en).includes('\n');
      if (!multiline && !e.shiftKey) {
        insertText('  ');
        return;
      }
      // Multi-line indent / any dedent: rewrite the selected range line by line (setRangeText, one-shot replace)
      const lineStart = value.lastIndexOf('\n', s - 1) + 1;
      const lineEnd = en > lineStart && value[en - 1] === '\n' ? en - 1 : en;
      const seg = value.slice(lineStart, lineEnd);
      const next = e.shiftKey
        ? seg.replace(/^ {1,2}/gm, '')
        : seg.replace(/^/gm, '  ');
      if (next === seg) return;
      ta.setRangeText(next, lineStart, lineEnd, 'select');
      onChange(ta.value);
      return;
    }

    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      // Inherit the current line's indent (no syntax awareness, good enough)
      const lineStart = value.lastIndexOf('\n', s - 1) + 1;
      const indent = /^[ \t]*/.exec(value.slice(lineStart, s))?.[0] ?? '';
      if (indent) {
        e.preventDefault();
        insertText(`\n${indent}`);
      }
    }
  };

  return (
    <div className={`bg-panel-2 relative min-h-0 overflow-hidden ${className}`}>
      {/* Line-number gutter (follows vertical scroll) */}
      <div className="border-line bg-panel-2 absolute bottom-0 left-0 top-0 z-[1] w-9 overflow-hidden border-r">
        <div ref={gutterRef} className={`text-ink-4 select-none py-3 pr-1.5 text-right ${METRICS}`}>
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
      </div>
      {/* Highlight mirror: same metrics and padding as the textarea, read-only, ignores pointer events */}
      <pre
        ref={preRef}
        aria-hidden
        className={`pointer-events-none absolute bottom-0 left-9 right-0 top-0 m-0 overflow-hidden p-3 whitespace-pre ${METRICS} [&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:!p-0 [&_code]:!font-mono`}
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
      {/* The real input surface: transparent text leaving only cursor/selection, the scroll source */}
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        onKeyDown={onKeyDown}
        readOnly={readOnly}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        wrap="off"
        className={`caret-ink absolute bottom-0 left-9 right-0 top-0 resize-none overflow-auto bg-transparent p-3 whitespace-pre text-transparent outline-none read-only:opacity-60 ${METRICS}`}
      />
    </div>
  );
}
