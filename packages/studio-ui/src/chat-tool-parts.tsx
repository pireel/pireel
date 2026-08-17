'use client';

/** Tool-call rendering for the studio chat stream: badge (instant ops) / card (generative) + ETA memory. */

import { useEffect, useRef, useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { STUDIO_TOOL_MAP, type StudioToolDef, type StudioToolResult } from '@pireel/studio-engine/prompts';
import type { Composition } from '@pireel/studio-engine/composition';
import { useToolProgress } from './tool-progress';
import { CutListCard, cutRowsOf } from './chat-cut-list';
import { GraphicsPreviewBody } from './chat-graphics-card';
import { AssetSearchResultsBody } from './chat-asset-search-results';
import { AskUserCard } from './chat-ask-card';
import { ApprovalCard } from './chat-approval-card';
import { ExportSettingsCard } from './chat-export-card';
import { t } from './i18n';

/* ============================ Tool-duration memory (for ETA) ============================ */

// Historical duration EMA per tool type (self-calibrating in localStorage): tools without a progress fraction use it for "~Ns left".
const DUR_KEY = 'studio:tooldur:v1';
function typicalToolDuration(toolId: string): number | null {
  try {
    const m = JSON.parse(window.localStorage.getItem(DUR_KEY) ?? '{}') as Record<string, unknown>;
    const v = m[toolId];
    return typeof v === 'number' && v > 500 ? v : null;
  } catch {
    return null;
  }
}
function recordToolDuration(toolId: string, ms: number) {
  if (ms < 300) return; // don't record near-instant returns
  try {
    const m = JSON.parse(window.localStorage.getItem(DUR_KEY) ?? '{}') as Record<string, number>;
    const old = typeof m[toolId] === 'number' ? m[toolId] : null;
    m[toolId] = old ? Math.round(old * 0.6 + ms * 0.4) : Math.round(ms);
    window.localStorage.setItem(DUR_KEY, JSON.stringify(m));
  } catch {
    /* quota exceeded / private mode: ignore */
  }
}

/* ============================ Tool-call rendering ============================ */

export interface ToolPartLike {
  type: string;
  state?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
  toolName?: string;
}

/** Tools whose receipt shows the component(s) they produced/changed as a live preview strip. */
const PREVIEW_TOOLS = new Set(['add_block', 'edit_block', 'duplicate_block']);

function toolIdOf(part: ToolPartLike): string {
  if (part.type === 'dynamic-tool') return part.toolName ?? '';
  return part.type.startsWith('tool-') ? part.type.slice(5) : part.type;
}

function SpeechAssetBody({ output }: { output: unknown }) {
  const data = output && typeof output === 'object' ? (output as { data?: unknown }).data : null;
  const asset = data && typeof data === 'object' ? (data as { asset?: unknown }).asset : null;
  if (!asset || typeof asset !== 'object') return null;
  const row = asset as { url?: unknown; label?: unknown };
  if (typeof row.url !== 'string' || !/^https?:\/\//i.test(row.url)) return null;
  return (
    <div className="border-line/70 border-t px-2.5 py-2">
      {typeof row.label === 'string' && row.label ? <div className="text-ink-3 mb-1.5 truncate text-[11px]">{row.label}</div> : null}
      <audio src={row.url} controls preload="metadata" className="h-8 w-full" />
    </div>
  );
}

/** Normalize tool-call status. */
export function toolStatus(part: ToolPartLike): { kind: 'running' | 'done' | 'error'; text: string } {
  const out = part.output as StudioToolResult | undefined;
  if (part.state === 'output-error') return { kind: 'error', text: part.errorText?.slice(0, 40) || t('chatGen.failed') };
  if (part.state === 'output-available') {
    if (out && out.ok === false) return { kind: 'error', text: out.error?.slice(0, 40) || t('chatGen.failed') };
    return { kind: 'done', text: out?.summary?.slice(0, 60) || t('chatGen.done') };
  }
  return { kind: 'running', text: t('chatGen.running') };
}

function ToolBadge({ def, part, children }: { def: StudioToolDef; part: ToolPartLike; children?: React.ReactNode }) {
  const st = toolStatus(part);
  const prog = useToolProgress(def.id);
  const live = st.kind === 'running' ? prog?.text ?? null : null;
  const icon =
    st.kind === 'running' ? (
      <Loader2 size={11} className="animate-spin" />
    ) : st.kind === 'error' ? (
      <X size={11} strokeWidth={2.2} />
    ) : (
      <Check size={11} strokeWidth={2.2} />
    );
  const text = live ?? st.text;
  // Same card language as ToolCard: header row (icon chip + name + status icon), result text on its own full-width body row (wraps)
  return (
    <div className="border-line bg-panel-2 w-full overflow-hidden rounded-md border">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className="text-accent grid h-5 w-5 shrink-0 place-items-center rounded bg-accent/10 text-[12px]">{def.icon}</span>
        <span className="text-ink-2 shrink-0 text-[12px] font-semibold">{t(def.label)}</span>
        <span className={`ml-auto shrink-0 ${st.kind === 'error' ? 'text-destructive' : 'text-ink-3'}`}>{icon}</span>
      </div>
      {text && (
        <div className={`border-line/70 break-words border-t px-2.5 py-1.5 text-[12px] leading-relaxed ${st.kind === 'error' ? 'text-destructive' : 'text-ink-3'}`}>
          {text}
        </div>
      )}
      {/* Tool-specific extra body (e.g. the duplicate-component preview strip) */}
      {children}
    </div>
  );
}

/**
 * Generative tool card: something is always moving —
 * running = spinner + elapsed/remaining + stage text (stream note > progress text > busyText) + progress bar
 * (with frac: determinate, ETA extrapolated by rate; without: indeterminate slider + historical EMA for ETA).
 */
function ToolCard({ def, part, children }: { def: StudioToolDef; part: ToolPartLike; children?: React.ReactNode }) {
  const st = toolStatus(part);
  const running = st.kind === 'running';
  const prog = useToolProgress(def.id);
  const live = running ? prog : null;
  const instruction = typeof part.input?.instruction === 'string' ? (part.input.instruction as string) : '';

  // Elapsed (clock starts once running is observed, ticks every 0.5s); on completion, record into the historical EMA
  const startRef = useRef<number | null>(null);
  if (running && startRef.current == null) startRef.current = Date.now();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(id);
  }, [running]);
  const recordedRef = useRef(false);
  useEffect(() => {
    if (st.kind === 'done' && startRef.current != null && !recordedRef.current) {
      recordedRef.current = true;
      recordToolDuration(def.id, Date.now() - startRef.current);
    }
  }, [st.kind, def.id]);

  const elapsedS = running && startRef.current != null ? (Date.now() - startRef.current) / 1000 : 0;
  // ETA: with frac, extrapolate by measured rate; else use historical EMA; with neither, only report elapsed
  let timeText = '';
  if (running && elapsedS >= 1) {
    if (live?.frac != null && live.frac >= 0.99) {
      timeText = t('chatGen.wrappingUp', { s: Math.floor(elapsedS) }); // bar full but not returned yet: stop lying with "~1s left"
    } else {
      let remain: number | null = null;
      if (live?.frac != null && live.frac > 0.05) remain = (elapsedS / live.frac) * (1 - live.frac);
      else {
        const typ = typicalToolDuration(def.id);
        if (typ != null) remain = typ / 1000 - elapsedS;
      }
      timeText = remain != null && remain >= 1 ? t('chatGen.elapsedRemaining', { a: Math.floor(elapsedS), b: Math.ceil(remain) }) : t('chatGen.elapsed', { s: Math.floor(elapsedS) });
    }
  }

  return (
    <div className="border-line bg-panel-2 w-full overflow-hidden rounded-md border">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className="text-accent grid h-5 w-5 shrink-0 place-items-center rounded bg-accent/10 text-[12px]">{def.icon}</span>
        <span className="text-ink-2 shrink-0 text-[12px] font-semibold">{t(def.label)}</span>
        {instruction && <span className="text-ink-4 truncate text-[12px]">{instruction}</span>}
        <span className={`ml-auto inline-flex min-w-0 shrink-0 items-center gap-1.5 text-[11px] ${st.kind === 'error' ? 'text-destructive' : 'text-ink-3'}`}>
          {running ? <Loader2 size={11} className="animate-spin" /> : st.kind === 'error' ? <X size={11} /> : <Check size={11} />}
          {running && <span className="tabular-nums">{timeText || t('chatGen.starting')}</span>}
        </span>
      </div>
      {/* Done/failed: result text on its own full-width body row (same spec as the badge), wraps instead of hanging in the right column */}
      {!running && st.text && (
        <div className={`border-line/70 break-words border-t px-2.5 py-1.5 text-[12px] leading-relaxed ${st.kind === 'error' ? 'text-destructive' : 'text-ink-3'}`}>
          {st.text}
        </div>
      )}
      {/* Running: stage-text body row (stream note > progress text > default busy text), multi-line readable */}
      {running && (
        <div className="border-line/70 text-ink-3 line-clamp-3 border-t px-2.5 py-1.5 text-[12px] leading-relaxed">
          {live?.text || (def.busyText ? t(def.busyText) : t('chatGen.running'))}
        </div>
      )}
      {/* Tool-specific extra body (e.g. a component preview strip) */}
      {children}
      {/* Progress bar: determinate with frac; indeterminate slider without (always something moving) */}
      {running &&
        (live?.frac != null ? (
          <div className="bg-line/40 h-1 w-full">
            <div className="bg-accent h-full transition-[width] duration-200" style={{ width: `${Math.round(Math.max(0, Math.min(1, live.frac)) * 100)}%` }} />
          </div>
        ) : (
          <div className="bg-line/40 h-1 w-full overflow-hidden">
            <div className="bg-accent/70 h-full w-1/3 motion-reduce:animate-none" style={{ animation: 'hf-indet 1.2s ease-in-out infinite' }} />
          </div>
        ))}
    </div>
  );
}

export function renderToolPart(part: ToolPartLike, key: string, opts?: { onLocate?: (sec: number) => void; getComp?: () => Composition }): React.ReactNode {
  const id = toolIdOf(part);
  const def = STUDIO_TOOL_MAP[id];
  if (!def) return null;
  // ask_user: a structured question with clickable option chips (its own card, not the generic one)
  if (id === 'ask_user') return <div key={key}><AskUserCard part={part} /></div>;
  // request_approval: model-authored proposal, host-owned generic Reject / Approve boundary
  if (id === 'request_approval') return <div key={key}><ApprovalCard part={part} /></div>;
  // export_video: parks on an integrated settings card (presets + resolution/fps/format), then shows the started confirmation
  if (id === 'export_video' && part.state !== 'output-error') return <div key={key}><ExportSettingsCard part={part} /></div>;
  // Narration cuts get their own receipt: a per-cut list with click-to-seek, not one collapsed line
  if (id === 'cut_narration' && part.state === 'output-available') {
    const rows = cutRowsOf(part.output);
    const out = part.output as StudioToolResult | undefined;
    if (rows && out?.ok !== false) return <div key={key}><CutListCard summary={out?.summary ?? ''} rows={rows} onLocate={opts?.onLocate} /></div>;
  }
  // Component-producing tools get a live preview strip: paged, lazy (current page only), skeleton while generating
  const preview =
    PREVIEW_TOOLS.has(id) && opts?.getComp ? <GraphicsPreviewBody toolId={id} part={part} getComp={opts.getComp} /> : null;
  const assetResults = id === 'search_assets' && part.state === 'output-available'
    ? <AssetSearchResultsBody output={part.output} />
    : null;
  const speechAsset = id === 'generate_speech' && part.state === 'output-available'
    ? <SpeechAssetBody output={part.output} />
    : null;
  return (
    <div key={key}>
      {def.kind === 'card' ? (
        <ToolCard def={def} part={part}>
          {preview ?? assetResults ?? speechAsset}
        </ToolCard>
      ) : (
        <ToolBadge def={def} part={part}>
          {preview ?? assetResults ?? speechAsset}
        </ToolBadge>
      )}
    </div>
  );
}

/** Presentation-only fallback for legacy/model-emitted scalar framing calls. New calls should use
 * set_shot_framing.updates[], but persisted conversations may already contain dozens of adjacent
 * receipts; summarize such a run as one card without rewriting the stored AI SDK message. */
export function renderToolPartGroup(
  parts: ToolPartLike[],
  key: string,
  opts?: { onLocate?: (sec: number) => void; getComp?: () => Composition },
): React.ReactNode {
  if (parts.length <= 1) return parts[0] ? renderToolPart(parts[0], key, opts) : null;
  const statuses = parts.map(toolStatus);
  const done = statuses.filter((status) => status.kind === 'done').length;
  const failed = statuses.filter((status) => status.kind === 'error').length;
  const running = statuses.length - done - failed;
  const summary = running
    ? t('workbench.framingGroupRunning', { n: parts.length, done })
    : failed
      ? t('workbench.framingGroupFailed', { n: parts.length, done, failed })
      : t('workbench.framingGroupDone', { n: parts.length });
  const first = parts[0]!;
  const aggregate: ToolPartLike = {
    type: first.type,
    ...(first.toolName ? { toolName: first.toolName } : {}),
    state: running ? 'input-available' : failed ? 'output-error' : 'output-available',
    ...(running ? {} : failed ? { errorText: summary } : { output: { ok: true, summary } }),
  };
  return renderToolPart(aggregate, key, opts);
}
