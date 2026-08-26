'use client';

/**
 * Generic approval boundary for a model-authored proposal.
 *
 * The card intentionally knows nothing about editing-plan fields. The model decides what is
 * material to the current proposal and supplies one user-facing content string; the host owns only
 * the stable Reject / Approve actions and the persisted decision state.
 */

import { Check, X } from 'lucide-react';
import type { StudioToolResult } from '@pireel/studio-engine/prompts';
import { resolveInteraction, usePendingInteraction } from './interaction-store';
import type { ToolPartLike } from './chat-tool-parts';
import { t } from './i18n';

type ApprovalDecision = 'approved' | 'rejected';

export function ApprovalCard({ part }: { part: ToolPartLike }) {
  const input = part.input as { title?: unknown; content?: unknown } | undefined;
  const errored = part.state === 'output-error';
  const active = part.state === 'input-available' || part.state === 'input-streaming';
  const pendingInteraction = usePendingInteraction<{ title?: unknown; content?: unknown }>('approval');
  const source = active && pendingInteraction ? pendingInteraction : input;
  const title = typeof source?.title === 'string' ? source.title.trim() : '';
  const content = typeof source?.content === 'string' && source.content.trim()
    ? source.content.trim()
    : active ? t('workbench.preparingApproval') : '';
  const live = active && pendingInteraction !== null;
  const out = part.output as StudioToolResult | undefined;
  const rawDecision = (out?.data as { decision?: unknown } | undefined)?.decision;
  const decision: ApprovalDecision | null = rawDecision === 'approved' || rawDecision === 'rejected' ? rawDecision : null;

  if (!content) return null;

  const decide = (next: ApprovalDecision) => {
    if (live) resolveInteraction(next);
  };

  return (
    <div className="border-line bg-panel-2 w-full overflow-hidden rounded-md border">
      {title ? (
        <div className="text-ink-2 border-line/70 border-b px-3 py-2 text-[12px] font-semibold leading-relaxed">
          {title}
        </div>
      ) : null}
      <div className="text-ink whitespace-pre-wrap break-words px-3 py-3 text-[12px] leading-relaxed">
        {content}
      </div>
      <div className="border-line/70 flex items-center justify-end gap-2 border-t px-2.5 py-2">
        <button
          type="button"
          disabled={!live}
          onClick={() => decide('rejected')}
          className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium transition-colors ${
            decision === 'rejected'
              ? 'border-destructive/60 bg-destructive/10 text-destructive'
              : 'border-line text-ink-2 hover:bg-panel disabled:opacity-45'
          }`}
        >
          <X size={13} strokeWidth={2.2} />
          {t('workbench.reject')}
        </button>
        <button
          type="button"
          disabled={!live}
          onClick={() => decide('approved')}
          className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold transition-colors ${
            decision === 'approved'
              ? 'bg-ink text-bg'
              : 'bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-45'
          }`}
        >
          <Check size={13} strokeWidth={2.4} />
          {t('workbench.approve')}
        </button>
      </div>
      {errored ? (
        <div className="text-ink-4 border-line/70 border-t px-2.5 py-1 text-[11px]">
          {part.errorText || t('chatGen.stopped')}
        </div>
      ) : null}
    </div>
  );
}
