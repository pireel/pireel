/**
 * Receipt delta — honest side-effect reporting for footage edits.
 *
 * Cutting/trimming footage ripples the edited timeline: overlay blocks after the
 * cut shift left, blocks spanning it get trimmed or silently dropped
 * (removeEditedInterval), and cut_narration re-lays the caption layer. The
 * hand-written receipt summaries state the primary effect only, so the agent had
 * to re-read state (or guess) to learn what else moved. This module computes the
 * ACTUAL change from a before/after comp diff and attaches it to the receipt as
 * `data.delta` — agent-facing, English, compact:
 * - uniform block shifts collapse to one rule ({by, count, fromSec}) instead of
 *   an enumeration;
 * - the sentence-caption layer (whose blocks are regenerated wholesale by a
 *   relay) collapses to a single 'relaid' | 'shifted' | 'removed' flag;
 * - unchanged state is omitted; nothing changed → null (no delta key at all).
 */
import { type Composition, isSentenceCaption, totalDuration } from './composition-core';

export interface BlockShiftGroup {
  /** Seconds the group moved (negative = earlier). */
  by: number;
  count: number;
  /** Earliest original start among the shifted blocks. */
  fromSec: number;
  /** Listed only for small groups; larger groups are fully described by the rule. */
  ids?: string[];
}

export interface BlockResize {
  id: string;
  /** [startSec, endSec] before → after. */
  from: [number, number];
  to: [number, number];
}

export interface ReceiptDelta {
  /** Edited duration before → after. */
  durationSec?: [number, number];
  shotCount?: [number, number];
  blocksShifted?: BlockShiftGroup[];
  blocksResized?: BlockResize[];
  /** Blocks that fell entirely inside the removed range and were dropped. */
  blocksDropped?: string[];
  /** Sentence-caption layer aggregate: relaid = regenerated from the transcript, shifted = same lines moved, removed = layer gone. */
  captionLayer?: 'relaid' | 'shifted' | 'removed';
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Diff two compositions into a compact agent-facing delta; null when nothing observable changed. */
export function compReceiptDelta(before: Composition, after: Composition): ReceiptDelta | null {
  const delta: ReceiptDelta = {};

  const dur0 = r2(totalDuration(before));
  const dur1 = r2(totalDuration(after));
  if (Math.abs(dur0 - dur1) > 0.05) delta.durationSec = [dur0, dur1];

  const sc0 = before.shots?.length ?? 0;
  const sc1 = after.shots?.length ?? 0;
  if (sc0 !== sc1) delta.shotCount = [sc0, sc1];

  // Sentence-caption layer: compare as one unit (relays regenerate every line block, enumerating them is noise)
  const caps0 = before.blocks.filter(isSentenceCaption);
  const caps1 = after.blocks.filter(isSentenceCaption);
  if (caps0.length && !caps1.length) delta.captionLayer = 'removed';
  else if (caps0.length || caps1.length) {
    const sameIds = caps0.length === caps1.length && caps0.every((b, i) => caps1[i]!.id === b.id);
    const moved = (a: typeof caps0, b: typeof caps1) =>
      a.some((x, i) => Math.abs(b[i]!.startSec - x.startSec) > 0.01 || Math.abs(b[i]!.durationSec - x.durationSec) > 0.01);
    if (!sameIds) delta.captionLayer = 'relaid';
    else if (moved(caps0, caps1)) delta.captionLayer = 'shifted';
  }

  // Remaining blocks matched by id: uniform shifts collapse to rules, duration changes listed, disappearances reported
  const afterById = new Map(after.blocks.filter((b) => !isSentenceCaption(b)).map((b) => [b.id, b]));
  const shiftGroups = new Map<number, { count: number; fromSec: number; ids: string[] }>();
  const resized: BlockResize[] = [];
  const dropped: string[] = [];
  for (const b of before.blocks) {
    if (isSentenceCaption(b)) continue;
    const o = afterById.get(b.id);
    if (!o) {
      dropped.push(b.id);
      continue;
    }
    const dStart = r2(o.startSec - b.startSec);
    const dDur = r2(o.durationSec - b.durationSec);
    if (Math.abs(dDur) > 0.01) {
      resized.push({ id: b.id, from: [r2(b.startSec), r2(b.startSec + b.durationSec)], to: [r2(o.startSec), r2(o.startSec + o.durationSec)] });
    } else if (Math.abs(dStart) > 0.01) {
      const g = shiftGroups.get(dStart) ?? { count: 0, fromSec: Infinity, ids: [] };
      g.count++;
      g.fromSec = Math.min(g.fromSec, r2(b.startSec));
      g.ids.push(b.id);
      shiftGroups.set(dStart, g);
    }
  }
  if (dropped.length) delta.blocksDropped = dropped;
  if (resized.length) delta.blocksResized = resized;
  if (shiftGroups.size) {
    delta.blocksShifted = [...shiftGroups.entries()].map(([by, g]) => ({
      by,
      count: g.count,
      fromSec: g.fromSec,
      ...(g.count <= 3 ? { ids: g.ids } : {}),
    }));
  }

  return Object.keys(delta).length ? delta : null;
}
