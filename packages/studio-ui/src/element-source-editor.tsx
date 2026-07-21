'use client';

/**
 * 组件源码编辑器 —— 三层编辑(舞台直改 / AI 改 / 源码改)的第三层,与前两层同面闭环:
 *  - 舞台就是实时预览:改动 debounce 后直接投主 composition(双缓冲无闪),不另建隔离预览;
 *    「应用」才算提交,关闭(或切走)未应用则由父层还原到打开时/上次应用的状态。
 *  - lint 与 LLM 同契约:人改的源码同样过 lintBlock + JS 语法编译,硬错误不投舞台、不让应用
 *    (此前人从这里贴未作用域 CSS 能污染全片,LLM 反而进不来)。
 *  - AI 在场:底部一条指令输入,以**当前草稿**为底稿走 compose(等价 edit_block),
 *    结果回填草稿(仍走同一 live-preview→应用流),不用切回对话重新定位。
 * 两个 pane 对齐数据模型(innerHtml / timelineBody),不再合成单文档往返(旧 combine/split 有损边角)。
 */

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Repeat, Sparkles } from 'lucide-react';
import { type Block, renderBlock } from '@pireel/studio-engine/composition';
import { HARD_LINT_CODES, lintBlock } from '@pireel/studio-engine/block-lint';
import { CodeEditor } from './code-editor';
import { t } from './i18n';

export interface SourceDraft {
  innerHtml: string;
  timelineBody: string;
}

interface ElementSourceEditorProps {
  block: Block;
  /** 生成锁:该组件正被 AI 生成/重写,编辑器只读 */
  locked: boolean;
  /** 草稿实时投舞台(debounce 后、无硬 lint 错误才会调) */
  onDraft: (draft: SourceDraft) => void;
  /** 提交:草稿成为组件的新状态(关闭不再还原) */
  onApply: (draft: SourceDraft) => void;
  /** 循环播放本组件时间窗(调动画用) */
  loop: boolean;
  onLoop: (on: boolean) => void;
  /** 以当前草稿为底稿让 AI 改;onNote 流式回传模型正在说的话 */
  runAi: (instruction: string, draft: SourceDraft, onNote: (note: string) => void) => Promise<SourceDraft | null>;
}

interface Issue {
  hard: boolean;
  message: string;
}

/** 草稿静态检查:lintBlock(与 LLM 产物同契约)+ JS 语法编译(lint 不做语法解析)。 */
function checkDraft(blockId: string, draft: SourceDraft): Issue[] {
  const issues: Issue[] = lintBlock({ blockId, innerHtml: draft.innerHtml, timelineBody: draft.timelineBody }).map((i) => ({
    hard: HARD_LINT_CODES.has(i.code),
    message: i.message,
  }));
  try {
    // 与 assembleHtml 的 timelineScript 同款编译,提前在编辑器里暴露语法错误
    new Function('tl', draft.timelineBody);
  } catch (e) {
    issues.unshift({ hard: true, message: t('动画脚本语法错误:{msg}', { msg: e instanceof Error ? e.message : String(e) }) });
  }
  return issues;
}

export function ElementSourceEditor({ block, locked, onDraft, onApply, loop, onLoop, runAi }: ElementSourceEditorProps) {
  // 草稿只在挂载时取一次(父层 key=block.id 换块自动重置)——之后 block prop 的变化
  // 就是我们自己的 live-apply 回流,不能反灌草稿
  const [draft, setDraft] = useState<SourceDraft>(() => {
    const s = block.slots as { innerHtml?: unknown; timelineBody?: unknown };
    if (block.templateId === 'custom' && typeof s.innerHtml === 'string') {
      return { innerHtml: s.innerHtml, timelineBody: typeof s.timelineBody === 'string' ? s.timelineBody : '' };
    }
    return renderBlock(block); // 模板块:当前渲染产物作初值(应用后转 custom)
  });
  const [dirty, setDirty] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const hardCount = issues.filter((i) => i.hard).length;

  // 检查 + 实时投舞台:停手 500ms 后跑;有硬错误只报不投(坏 CSS/坏脚本不进 composition)。
  // onDraft 走 ref:父层内联传入每渲染换引用,进依赖会反复重置 debounce
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const onDraftRef = useRef(onDraft);
  onDraftRef.current = onDraft;
  useEffect(() => {
    if (!dirtyRef.current) return; // 初值不检查不投(打开即报错/重建很扰人)
    const h = setTimeout(() => {
      const found = checkDraft(block.id, draft);
      setIssues(found);
      if (!found.some((i) => i.hard) && !locked) onDraftRef.current(draft);
    }, 500);
    return () => clearTimeout(h);
  }, [draft, block.id, locked]);

  const edit = (patch: Partial<SourceDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const submitAi = async () => {
    const instruction = aiInput.trim();
    if (!instruction || aiBusy || locked) return;
    setAiBusy(true);
    setAiNote('');
    try {
      const next = await runAi(instruction, draft, setAiNote);
      if (next) {
        setDraft(next);
        setDirty(true);
        setAiInput('');
      }
    } finally {
      setAiBusy(false);
    }
  };

  const disabled = locked || aiBusy;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {/* 标题(源码 · 块名)/关闭归浮窗头部,这行只剩功能钮 */}
      <div className="border-line flex items-center gap-2 border-b px-3 py-1.5">
        {locked && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-600">
            <Loader2 size={10} className="animate-spin" /> {t('生成中,只读')}
          </span>
        )}
        <button
          type="button"
          onClick={() => onLoop(!loop)}
          title={t('循环播放这个组件的时间段,方便调动画')}
          className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition ${
            loop ? 'border-accent bg-accent/10 text-accent' : 'border-line text-ink-4 hover:text-ink'
          }`}
        >
          <Repeat size={11} /> {t('循环预览')}
        </button>
      </div>
      {block.templateId !== 'custom' && (
        <div className="border-line border-b bg-amber-500/8 px-3 py-1 text-[10px] text-amber-600">
          {t('模板块({id}):应用后转为自定义组件,不再跟随模板', { id: block.templateId })}
        </div>
      )}

      {/* HTML + CSS */}
      <div className="text-ink-4 border-line flex items-center border-b px-3 py-1 text-[10px]">
        {t('HTML + CSS(选择器以 #{id} 作用域)', { id: block.id })}
      </div>
      <CodeEditor
        value={draft.innerHtml}
        onChange={(v) => edit({ innerHtml: v })}
        language="html"
        readOnly={disabled}
        className="flex-[3]"
      />

      {/* 动画 */}
      <div className="text-ink-4 border-line flex items-center border-y px-3 py-1 text-[10px]">
        {t('动画 · GSAP(局部时间,0 = 组件起点;写 tl.xxx)')}
      </div>
      <CodeEditor
        value={draft.timelineBody}
        onChange={(v) => edit({ timelineBody: v })}
        language="javascript"
        readOnly={disabled}
        className="flex-[2]"
      />

      {/* 检查结果:硬错误挡投放/应用,软问题只提示 */}
      {issues.length > 0 && (
        <div className="border-line max-h-20 overflow-auto border-t px-3 py-1.5">
          {issues.map((i, idx) => (
            <div key={idx} className={`text-[11px] leading-[1.6] ${i.hard ? 'text-destructive' : 'text-amber-600'}`}>
              {i.hard ? '✕' : '⚠'} {i.message}
            </div>
          ))}
        </div>
      )}

      {/* AI 改:以当前草稿为底稿,结果回填草稿 */}
      <div className="border-line border-t px-3 py-2">
        {aiBusy && (
          <div className="text-ink-3 mb-1.5 flex items-center gap-1.5 text-[11px]">
            <Loader2 size={11} className="shrink-0 animate-spin" />
            <span className="truncate">{aiNote || t('AI 修改中…')}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submitAi();
              }
            }}
            disabled={disabled}
            placeholder={t('让 AI 改这段源码,例如「数字换金色,入场更快」')}
            className="border-line bg-panel text-ink placeholder:text-ink-4 min-w-0 flex-1 rounded-md border px-2 py-1 text-[12px] outline-none focus:border-ink-4 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void submitAi()}
            disabled={disabled || !aiInput.trim()}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent px-2 py-1 text-[12px] font-medium text-white hover:bg-accent/85 disabled:opacity-40"
          >
            {aiBusy ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} {t('AI 改')}
          </button>
        </div>
      </div>

      {/* 应用 / 状态 */}
      <div className="border-line flex items-center gap-2 border-t px-3 py-1.5">
        <span className="text-ink-4 text-[10px]">{t('改动实时投到舞台;应用才保留,关闭即还原')}</span>
        <button
          type="button"
          onClick={() => {
            onApply(draft);
            setDirty(false);
          }}
          disabled={!dirty || hardCount > 0 || disabled}
          className="ml-auto inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent/85 disabled:opacity-40"
        >
          <Check size={12} /> {t('应用')}
        </button>
      </div>
    </div>
  );
}
