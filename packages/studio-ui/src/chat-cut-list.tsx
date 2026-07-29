'use client';

/**
 * Narration-cut receipt list for the chat stream — cut_narration's dedicated message component.
 * The generic tool badge collapses a multi-cut into one summary line; here every cut is a ROW
 * (final-timeline seam position + what was removed: a transcript snippet, or "silence" when the
 * range held no words), and clicking a row seeks the preview to that seam so the user can audit
 * each cut in place. Rows come from the receipt's data.cuts — the seconds ACTUALLY removed after
 * margins, the same numbers the agent is told to quote.
 */

import { Check, Scissors } from 'lucide-react';
import { t } from './i18n';

export interface CutRow {
  atSec: number;
  removedSec: number;
  text?: string;
}

/** Parse a tool output's data.cuts (unknown-shaped by transport). Null = not a cut receipt. */
export function cutRowsOf(output: unknown): CutRow[] | null {
  const data = (output as { data?: { cuts?: unknown } } | undefined)?.data;
  if (!Array.isArray(data?.cuts) || !data.cuts.length) return null;
  const rows = data.cuts
    .map((r) => r as Record<string, unknown>)
    .filter((r) => Number.isFinite(Number(r.atSec)) && Number.isFinite(Number(r.removedSec)))
    .map((r) => ({ atSec: Number(r.atSec), removedSec: Number(r.removedSec), ...(typeof r.text === 'string' && r.text ? { text: r.text } : {}) }));
  return rows.length ? rows : null;
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;

export function CutListCard({ summary, rows, onLocate }: { summary: string; rows: CutRow[]; onLocate?: (sec: number) => void }) {
  return (
    <div className="border-line bg-panel-2 w-full overflow-hidden rounded-md border">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className="text-accent grid h-5 w-5 shrink-0 place-items-center rounded bg-accent/10">
          <Scissors size={11} />
        </span>
        <span className="text-ink-2 shrink-0 text-[12px] font-semibold">{t('tools.cut_narration.label')}</span>
        <span className="text-ink-4 truncate text-[11px]">{summary}</span>
        <span className="text-ink-3 ml-auto shrink-0">
          <Check size={11} strokeWidth={2.2} />
        </span>
      </div>
      <div className="border-line/70 border-t">
        {rows.map((r, i) => (
          <button
            key={i}
            type="button"
            title={t('chatGen.cutRowLocate')}
            onClick={() => onLocate?.(r.atSec)}
            className="hover:bg-panel group flex w-full items-center gap-2 px-2.5 py-1 text-left transition-colors"
          >
            <span className="text-ink-4 group-hover:text-accent shrink-0 font-mono text-[11px] tabular-nums">{mmss(r.atSec)}</span>
            <span className={`min-w-0 flex-1 truncate text-[12px] ${r.text ? 'text-ink-3 line-through opacity-80' : 'text-ink-4'}`}>
              {r.text ?? t('chatGen.cutRowSilence')}
            </span>
            <span className="text-ink-4 shrink-0 font-mono text-[11px] tabular-nums">−{r.removedSec.toFixed(1)}s</span>
          </button>
        ))}
      </div>
    </div>
  );
}
