'use client';

/**
 * Component source editor — the third layer of editing (direct stage edit / AI edit / source edit),
 * closing the loop on the same surface as the other two:
 *  - The stage is the live preview: edits (after debounce) go straight to the main composition
 *    (double-buffered, no flicker), no separate isolated preview. Only "Apply" commits; closing
 *    (or switching away) without applying lets the parent restore the state from open time / last apply.
 *  - lint shares the LLM contract: hand-edited source also goes through lintBlock + JS syntax compile;
 *    hard errors don't hit the stage and block Apply (previously a human could paste unscoped CSS here
 *    that polluted the whole video, while the LLM couldn't).
 *  - AI present: one instruction input at the bottom runs compose on the **current draft** (equivalent
 *    to edit_block), result fills back into the draft (still via the same live-preview→apply flow),
 *    no need to switch back to chat to re-locate.
 * The two panes align to the data model (innerHtml / timelineBody), no more single-document round-trips
 * (the old combine/split lost edge cases).
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
  /** Generation lock: this component is being AI-generated/rewritten, editor is read-only */
  locked: boolean;
  /** Push draft to stage live (only called after debounce, with no hard lint errors) */
  onDraft: (draft: SourceDraft) => void;
  /** Commit: draft becomes the component's new state (closing no longer restores) */
  onApply: (draft: SourceDraft) => void;
  /** Loop-play this component's time window (for tuning animation) */
  loop: boolean;
  onLoop: (on: boolean) => void;
  /** Let AI edit using the current draft as the base; onNote streams back what the model is saying */
  runAi: (instruction: string, draft: SourceDraft, onNote: (note: string) => void) => Promise<SourceDraft | null>;
}

interface Issue {
  hard: boolean;
  message: string;
}

/** Static check on the draft: lintBlock (same contract as LLM output) + JS syntax compile (lint doesn't parse syntax). */
function checkDraft(blockId: string, draft: SourceDraft): Issue[] {
  const issues: Issue[] = lintBlock({ blockId, innerHtml: draft.innerHtml, timelineBody: draft.timelineBody }).map((i) => ({
    hard: HARD_LINT_CODES.has(i.code),
    message: i.message,
  }));
  try {
    // Same compile as assembleHtml's timelineScript, surfacing syntax errors early in the editor
    new Function('tl', draft.timelineBody);
  } catch (e) {
    issues.unshift({ hard: true, message: t('chatGen.animationScriptSyntaxError', { msg: e instanceof Error ? e.message : String(e) }) });
  }
  return issues;
}

export function ElementSourceEditor({ block, locked, onDraft, onApply, loop, onLoop, runAi }: ElementSourceEditorProps) {
  // Draft is read once on mount (parent's key=block.id resets it on block change) — afterward,
  // changes to the block prop are our own live-apply reflow and must not flow back into the draft
  const [draft, setDraft] = useState<SourceDraft>(() => {
    const s = block.slots as { innerHtml?: unknown; timelineBody?: unknown };
    if (block.templateId === 'custom' && typeof s.innerHtml === 'string') {
      return { innerHtml: s.innerHtml, timelineBody: typeof s.timelineBody === 'string' ? s.timelineBody : '' };
    }
    return renderBlock(block); // Template block: current render output as initial value (becomes custom after apply)
  });
  const [dirty, setDirty] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const hardCount = issues.filter((i) => i.hard).length;

  // Check + live push to stage: runs 500ms after typing stops; hard errors only report, don't push
  // (bad CSS/script never enters the composition).
  // onDraft via ref: parent passes it inline so the reference changes each render; putting it in deps would keep resetting the debounce
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const onDraftRef = useRef(onDraft);
  onDraftRef.current = onDraft;
  useEffect(() => {
    if (!dirtyRef.current) return; // Don't check/push the initial value (erroring/rebuilding on open is annoying)
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
      {/* Title (source · block name) / close live in the popover header; this row only holds function buttons */}
      <div className="border-line flex items-center gap-2 border-b px-3 py-1.5">
        {locked && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-600">
            <Loader2 size={10} className="animate-spin" /> {t('chatGen.generatingReadOnly')}
          </span>
        )}
        <button
          type="button"
          onClick={() => onLoop(!loop)}
          title={t('panels.loopElementSTime')}
          className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition ${
            loop ? 'border-accent bg-accent/10 text-accent' : 'border-line text-ink-4 hover:text-ink'
          }`}
        >
          <Repeat size={11} /> {t('chatGen.loopPreview')}
        </button>
      </div>
      {block.templateId !== 'custom' && (
        <div className="border-line border-b bg-amber-500/8 px-3 py-1 text-[10px] text-amber-600">
          {t('chatGen.templateBlockHint', { id: block.templateId })}
        </div>
      )}

      {/* HTML + CSS */}
      <div className="text-ink-4 border-line flex items-center border-b px-3 py-1 text-[10px]">
        {t('chatGen.htmlCssSelectorsScoped', { id: block.id })}
      </div>
      <CodeEditor
        value={draft.innerHtml}
        onChange={(v) => edit({ innerHtml: v })}
        language="html"
        readOnly={disabled}
        className="flex-[3]"
      />

      {/* Animation */}
      <div className="text-ink-4 border-line flex items-center border-y px-3 py-1 text-[10px]">
        {t('chatGen.animationGsapLocalTime')}
      </div>
      <CodeEditor
        value={draft.timelineBody}
        onChange={(v) => edit({ timelineBody: v })}
        language="javascript"
        readOnly={disabled}
        className="flex-[2]"
      />

      {/* Check results: hard errors block push/apply, soft issues only warn */}
      {issues.length > 0 && (
        <div className="border-line max-h-20 overflow-auto border-t px-3 py-1.5">
          {issues.map((i, idx) => (
            <div key={idx} className={`text-[11px] leading-[1.6] ${i.hard ? 'text-destructive' : 'text-amber-600'}`}>
              {i.hard ? '✕' : '⚠'} {i.message}
            </div>
          ))}
        </div>
      )}

      {/* AI edit: use current draft as base, result fills back into the draft */}
      <div className="border-line border-t px-3 py-2">
        {aiBusy && (
          <div className="text-ink-3 mb-1.5 flex items-center gap-1.5 text-[11px]">
            <Loader2 size={11} className="shrink-0 animate-spin" />
            <span className="truncate">{aiNote || t('chatGen.aiEditing')}</span>
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
            placeholder={t('chatGen.askAiEditSource')}
            className="border-line bg-panel text-ink placeholder:text-ink-4 min-w-0 flex-1 rounded-md border px-2 py-1 text-[12px] outline-none focus:border-ink-4 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void submitAi()}
            disabled={disabled || !aiInput.trim()}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent px-2 py-1 text-[12px] font-medium text-white hover:bg-accent/85 disabled:opacity-40"
          >
            {aiBusy ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} {t('chatGen.aiEdit')}
          </button>
        </div>
      </div>

      {/* Apply / status */}
      <div className="border-line flex items-center gap-2 border-t px-3 py-1.5">
        <span className="text-ink-4 text-[10px]">{t('chatGen.livePreviewHint')}</span>
        <button
          type="button"
          onClick={() => {
            onApply(draft);
            setDirty(false);
          }}
          disabled={!dirty || hardCount > 0 || disabled}
          className="ml-auto inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent/85 disabled:opacity-40"
        >
          <Check size={12} /> {t('chatGen.apply')}
        </button>
      </div>
    </div>
  );
}
