'use client';

/**
 * Script-panel scissors: batch delete/restore (source, source-time-range) cuts, word replacement
 * (transcript is the single source of truth — the caption layer recomputes whole), and the panel's
 * ASR extraction (with auto-extract on panel open). Extracted from hyperframes-workbench.tsx —
 * bodies verbatim.
 */

import { type MutableRefObject, type SetStateAction, useEffect, useRef, useState } from 'react';
import { toast } from '@pireel/ui/toast';
import {
  type Block,
  type Composition,
  type TimelineSiblingLayers,
  type VideoShot,
  rippleInsertSiblingLayers,
  rippleRemoveSiblingLayers,
  shotId,
} from '@pireel/studio-engine/composition';
import { removeSrcRanges, restoreSrcRange, spans as clipSpans } from '@pireel/studio-engine/trim';
import { wordsFromText } from '@pireel/studio-engine/caption-fx';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import type { ScriptCut } from './script-panel';
import { t } from './i18n';

export interface ScriptCutDeps {
  comp: Composition;
  /** Which tool panel is open ('script' triggers auto-extract). */
  floatWin: string | null;
  asrSentences: AsrSegment[] | null;
  compRef: MutableRefObject<Composition>;
  tRef: MutableRefObject<number>;
  asrRef: MutableRefObject<AsrSegment[] | null>;
  clipAsrRef: MutableRefObject<Record<string, AsrSegment[]>>;
  setClipAsr: (v: Record<string, AsrSegment[]>) => void;
  setAsrSentences: (v: AsrSegment[] | null) => void;
  setComp: (action: SetStateAction<Composition>) => void;
  setSelectedId: (id: string | null) => void;
  setSelectedShotId: (id: string | null) => void;
  applyT: (v: number) => void;
  pushUndoSnapshot: () => void;
  ensureShots: (c: Composition) => VideoShot[];
  relayCaptionLayer: (blocks: Block[], shots: VideoShot[], segs: AsrSegment[] | null) => Block[];
  stepAsr: () => Promise<AsrSegment[]>;
}

export function useScriptCut(deps: ScriptCutDeps) {
  const {
    comp, floatWin, asrSentences, compRef, tRef, asrRef, clipAsrRef, setClipAsr, setAsrSentences,
    setComp, setSelectedId, setSelectedShotId, applyT, pushUndoSnapshot, ensureShots, relayCaptionLayer, stepAsr,
  } = deps;
  /** The script panel's scissors: delete a batch of (source, source-time range) (shared by delete-sentence / delete-silence
   *  / delete-filler; the mapping math is in trim.removeSrcRanges); grouped and computed per source (source timelines are
   *  independent), overlay blocks compressed in the order deletions occur; one setComp (rebuilds flicker only once). */
  const cutSrcRanges = (cuts: ScriptCut[], msg: string) => {
    const c0 = compRef.current;
    if (!c0.video || !cuts.length) return;
    pushUndoSnapshot();
    const groups = new Map<string | null, [number, number][]>();
    for (const it of cuts) groups.set(it.src, [...(groups.get(it.src) ?? []), it.range]);
    let shots = ensureShots(c0);
    let layers: TimelineSiblingLayers = { blocks: c0.blocks, ...(c0.audioTracks ? { audioTracks: c0.audioTracks } : {}) };
    let cut = 0;
    for (const [src, ranges] of groups) {
      const r = removeSrcRanges(shots, ranges, (base, srcStart, srcEnd) => ({ ...base, id: shotId(), srcStart, srcEnd }), (c) => (c.src ?? null) === src);
      cut += r.removed.reduce((a, [x, y]) => a + (y - x), 0);
      // Non-caption blocks compressed by the deleted spans; the caption layer is recomputed whole at the end (captions = a pure computed product of the transcript, word times must follow the new edit)
      layers = r.removed.reduce((current, [a, b]) => rippleRemoveSiblingLayers(current, a, b), layers);
      shots = r.clips;
    }
    if (cut < 0.01) {
      toast.info(t('workbench.thoseRangesAlreadyOut'));
      return;
    }
    layers = { ...layers, blocks: relayCaptionLayer(layers.blocks, shots, asrRef.current) };
    setComp((c) => ({ ...c, shots, ...layers }));
    setSelectedShotId(null);
    setSelectedId(null);
    const lastSp = clipSpans(shots);
    const newDur = lastSp.length ? lastSp[lastSp.length - 1]!.editedEnd : 0;
    applyT(Math.max(0, Math.min(tRef.current, Math.max(0, newDur - 0.05))));
    toast.success(t('workbench.msgUndoHint', { msg }));
  };
  /** Script panel "restore": reconnect a deleted (source, source range) back into the video (the gap merges into an adjacent
   *  same-source shot or inserts a new shot); overlay blocks after the restore point shift right by the restored duration to stay content-aligned. */
  const restoreSrcRanges = (cuts: ScriptCut[], msg: string) => {
    const c0 = compRef.current;
    if (!c0.video || !cuts.length) return;
    pushUndoSnapshot();
    let shots = ensureShots(c0);
    let layers: TimelineSiblingLayers = { blocks: c0.blocks, ...(c0.audioTracks ? { audioTracks: c0.audioTracks } : {}) };
    let restored = 0;
    for (const { src, range: [s, e] } of cuts) {
      const before = shots;
      const inSrc = (c: VideoShot) => (c.src ?? null) === src;
      // An insert source entirely absent from the video = no anchor and no srcSig, unrecoverable (the panel only emits words for present sources, so this shouldn't happen in theory)
      if (src && !before.some(inSrc)) continue;
      const srcSig = src ? before.find((c) => c.src === src)?.srcSig : undefined;
      const durBefore = clipSpans(before).at(-1)?.editedEnd ?? 0;
      shots = restoreSrcRange(
        before,
        s,
        e,
        (a, b) => ({ id: shotId(), ...(src ? { src, ...(srcSig ? { srcSig } : {}) } : {}), srcStart: a, srcEnd: b, treatment: 'full' as const }),
        (c) => !c.partnerBlockId,
        inSrc,
      );
      if (shots === before) continue;
      const durAfter = clipSpans(shots).at(-1)?.editedEnd ?? 0;
      const len = durAfter - durBefore;
      if (len <= 0.01) continue;
      restored += len;
      // The restored segment's final-cut start: where s lands on the new shots (only same-source clips count, different-source seconds would collide numerically); blocks after it shift right as a whole
      const sp = clipSpans(shots).find((x) => inSrc(x.clip) && s >= x.clip.srcStart - 1e-3 && s < x.clip.srcEnd);
      const at = sp ? sp.editedStart + Math.max(0, s - sp.clip.srcStart) : 0;
      layers = rippleInsertSiblingLayers(layers, at, len);
    }
    if (restored < 0.01) {
      toast.info(t('workbench.contentAlreadyInVideo'));
      return;
    }
    const relaid = relayCaptionLayer(layers.blocks, shots, asrRef.current);
    setComp((c) => ({ ...c, shots, ...layers, blocks: relaid }));
    setSelectedShotId(null);
    toast.success(t('workbench.msgUndoHint', { msg }));
  };
  /** Script panel "replace word": edit the transcript (word + sentence text), and the caption layer is **recomputed whole**
   *  (captions = a pure computed product of the transcript; changing a word may change segment width → segmentation boundaries
   *  shift, per-block patches can't keep up). Text only, audio untouched. src identifies which source's script. */
  const replaceScriptWord = (src: string | null, si: number, word: { start: number; end: number }, text: string) => {
    const txt = text.trim();
    if (!txt) return;
    const isSame = (x: { start: number; end: number }) => Math.abs(x.start - word.start) < 1e-3 && Math.abs(x.end - word.end) < 1e-3;
    const patchSent = (s: AsrSegment): AsrSegment => {
      const words = (s.words?.length ? s.words : wordsFromText(s.text, s.start, s.end)).map((w) => (isSame(w) ? { ...w, text: txt } : w));
      return { ...s, words, text: words.map((w) => w.text).join('') };
    };
    if (src == null) {
      const prev = asrRef.current;
      if (!prev?.[si]) return;
      const next = [...prev];
      next[si] = patchSent(prev[si]!);
      setAsrSentences(next);
      asrRef.current = next; // mirror immediately (the state mirror writes on next render): the recompute below needs the latest transcript
    } else {
      const list = clipAsrRef.current[src];
      if (!list?.[si]) return;
      const next = { ...clipAsrRef.current, [src]: list.map((x, i) => (i === si ? patchSent(x) : x)) };
      setClipAsr(next);
      clipAsrRef.current = next;
    }
    setComp((c) => ({ ...c, blocks: relayCaptionLayer(c.blocks, ensureShots(c), asrRef.current) }));
    toast.success(t('workbench.replacedText', { text: txt }));
  };
  /** The script panel's "extract narration script" (spinner prevents double-clicks; errors toast). */
  const [asrBusy, setAsrBusy] = useState(false);
  const asrBusyRef = useRef(false);
  const extractForScript = async () => {
    if (asrBusyRef.current) return;
    asrBusyRef.current = true;
    setAsrBusy(true);
    try {
      await stepAsr();
    } catch (e) {
      console.warn('[studio] extract asr failed', e);
      toast.error(t('workbench.transcriptExtractionFailed'));
    } finally {
      asrBusyRef.current = false;
      setAsrBusy(false);
    }
  };
  // Opening the script panel auto-extracts (no button needed): fileSig cache hit returns instantly; runs ASR once if uncached.
  // Only triggers when asrSentences is still null (never extracted) — an empty array = extracted but empty, don't retry in a loop
  useEffect(() => {
    if (floatWin !== 'script' || !comp.video || asrSentences != null) return;
    void extractForScript();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floatWin, comp.video, asrSentences]);
  return { cutSrcRanges, restoreSrcRanges, replaceScriptWord, extractForScript, asrBusy };
}
