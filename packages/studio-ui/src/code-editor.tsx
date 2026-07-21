'use client';

/**
 * 轻量代码编辑器(组件源码编辑器用):透明 textarea 叠在 shiki 高亮层上 ——
 * 输入/光标/选区/撤销全是原生 textarea 行为,高亮层只是同字距的只读镜像。
 *  - 行号槽 + 滚动同步(textarea 是唯一滚动源,pre/行号跟随);
 *  - Tab/Shift+Tab 缩进(多行选区整体进退),Enter 继承当前行缩进;
 *  - 单行插入走 execCommand 保住原生撤销栈;多行缩进退化为 setRangeText。
 * 不引 CodeMirror:这里只有两小段代码(HTML 片段 + GSAP 时间轴体),够用且零新依赖。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { HighlighterGeneric } from 'shiki';

type Lang = 'html' | 'javascript';

// 单例 highlighter(两种语言一次装齐);模块级缓存,多个编辑器/反复开关共用
type Hl = HighlighterGeneric<never, never>;
let hlPromise: Promise<Hl> | null = null;
function getHighlighter(): Promise<Hl> {
  hlPromise ??= import('shiki').then(
    (m) => m.createHighlighter({ langs: ['html', 'javascript'], themes: ['github-light', 'github-dark'] }) as Promise<Hl>,
  );
  return hlPromise;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// pre 与 textarea 必须字距完全一致,高亮层才能和光标逐字对齐 —— 两边共用这串字体度量类
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
      .catch(() => {}); // 高亮挂了退纯文本镜像,编辑不受影响
    return () => {
      alive = false;
    };
  }, []);

  // 高亮 HTML:highlighter 就绪前用转义纯文本(同字距,只是没颜色)。
  // 双主题:亮色走默认 color,暗色由 globals.css 的 .dark .shiki 规则读 --shiki-dark。
  // 尾行补一个空格:值以换行结尾时 pre 的末行不塌掉,行号/滚动高度与 textarea 一致。
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

  // 滚动同步:textarea 是唯一滚动源;pre overflow:hidden 但 scrollTop 可编程设置
  const syncScroll = () => {
    const ta = taRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.style.transform = `translateY(${-ta.scrollTop}px)`;
  };
  // 内容变化(如 AI 回填整段)可能带动滚动位置,渲染后补一次对齐
  useEffect(syncScroll, [highlighted]);

  /** 单点插入:优先 execCommand(保原生撤销栈),不支持则 setRangeText 兜底。 */
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
      // 多行缩进/任意退缩进:按行改写选中范围(setRangeText,一次性替换)
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
      // 继承当前行缩进(不做语法感知,够用)
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
      {/* 行号槽(跟随纵向滚动) */}
      <div className="border-line bg-panel-2 absolute bottom-0 left-0 top-0 z-[1] w-9 overflow-hidden border-r">
        <div ref={gutterRef} className={`text-ink-4 select-none py-3 pr-1.5 text-right ${METRICS}`}>
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
      </div>
      {/* 高亮镜像:与 textarea 同字距同内边距,只读不接指针 */}
      <pre
        ref={preRef}
        aria-hidden
        className={`pointer-events-none absolute bottom-0 left-9 right-0 top-0 m-0 overflow-hidden p-3 whitespace-pre ${METRICS} [&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:!p-0 [&_code]:!font-mono`}
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
      {/* 真正的输入面:文字透明只留光标/选区,滚动源 */}
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
