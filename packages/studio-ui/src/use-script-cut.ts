'use client';

/**
 * Script-panel scissors: batch delete/restore (source, source-time-range) cuts, word replacement
 * (transcript is the single source of truth — the caption layer recomputes whole), and the panel's
 * ASR extraction (with auto-extract on panel open). Extracted from hyperframes-workbench.tsx —
 * bodies verbatim.
 */

import { type MutableRefObject, useEffect, useRef, useState } from 'react';
import { toast } from '@pireel/ui/toast';
import {
  type Composition,
  type EditorDocumentV2,
  type NarrativeTimelineClip,
  type VideoShot,
  applyEditorCommand,
  insertNarrativeAssetRange,
  shotId,
  timelineSpeechRangesForAsset,
  timelineTranscriptionTargets,
  firstNarrativeAssetId,
} from '@pireel/studio-engine/composition';
import { removeSrcRanges, restoreSrcRange, spans as clipSpans } from '@pireel/studio-engine/trim';
import { wordsFromText } from '@pireel/studio-engine/caption-fx';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { type WordMaskPatch, applyWordMasks } from '@pireel/studio-engine/word-masks';
import { type DocumentOp, transcriptInputsFor } from '@pireel/studio-engine/document-transaction';
import type { DocumentCommitter } from './document-commit';
import type { ScriptCut, ScriptMaskTarget, TimelineMaskTarget, TimelineScriptCut } from './script-panel';
import { t } from './i18n';
import { editorErrorMessage } from './editor-error';

export interface ScriptCutDeps {
  projectId: string;
  comp: Composition;
  document: EditorDocumentV2;
  /** Which tool panel is open ('script' triggers auto-extract). */
  floatWin: string | null;
  asrSentences: AsrSegment[] | null;
  compRef: MutableRefObject<Composition>;
  tRef: MutableRefObject<number>;
  asrRef: MutableRefObject<AsrSegment[] | null>;
  clipAsrRef: MutableRefObject<Record<string, AsrSegment[]>>;
  setClipAsr: (v: Record<string, AsrSegment[]>) => void;
  setAsrSentences: (v: AsrSegment[] | null) => void;
  documentRef: MutableRefObject<EditorDocumentV2>;
  commit: DocumentCommitter['commit'];
  setSelectedId: (id: string | null) => void;
  setSelectedShotId: (id: string | null) => void;
  applyT: (v: number) => void;
  ensureShots: (c: Composition) => VideoShot[];
  stepAsr: () => Promise<AsrSegment[]>;
}

export function useScriptCut(deps: ScriptCutDeps) {
  const {
    projectId, comp, document: liveDocument, floatWin, asrSentences, compRef, tRef, asrRef, clipAsrRef, setClipAsr, setAsrSentences,
    documentRef, commit, setSelectedId, setSelectedShotId, applyT, ensureShots, stepAsr,
  } = deps;
  /** Runtime transcript mirrors, carried into an operation only when the document lacks them. */
  const currentTranscripts = () => transcriptInputsFor(documentRef.current, asrRef.current, clipAsrRef.current);

  const cutTimelineRanges = (cuts: TimelineScriptCut[], msg: string) => {
    if (!cuts.length) return;
    const trackIds = new Set(cuts.map((cut) => cut.trackId));
    if (trackIds.size !== 1) {
      toast.error('Selected words span multiple unlinked tracks. Edit one track at a time.');
      return;
    }
    let document = documentRef.current;
    const byTrack = new Map<string, Array<{ startFrame: number; endFrame: number }>>();
    for (const cut of cuts) {
      const mapped = timelineSpeechRangesForAsset(
        document,
        cut.trackId,
        cut.assetId,
        cut.range[0],
        cut.range[1],
        cut.clipId,
      );
      byTrack.set(cut.trackId, [...(byTrack.get(cut.trackId) ?? []), ...mapped]);
    }
    let removedFrames = 0;
    const ops: DocumentOp[] = [];
    for (const [trackId, sourceRanges] of byTrack) {
      const merged: Array<{ startFrame: number; endFrame: number }> = [];
      for (const range of [...sourceRanges].sort((left, right) => left.startFrame - right.startFrame)) {
        const previous = merged.at(-1);
        if (previous && range.startFrame <= previous.endFrame) previous.endFrame = Math.max(previous.endFrame, range.endFrame);
        else merged.push({ startFrame: range.startFrame, endFrame: range.endFrame });
      }
      for (const range of merged.sort((left, right) => right.startFrame - left.startFrame)) {
        const command = {
          type: 'range.remove' as const,
          trackId,
          startFrame: range.startFrame,
          endFrame: range.endFrame,
          mode: 'ripple' as const,
          includeLinked: true,
        };
        // Preview to learn what the cut removes; the same commands then land as one transaction.
        const edit = applyEditorCommand(document, command);
        if (!edit.ok) {
          toast.error(editorErrorMessage(edit.error));
          return;
        }
        document = edit.document;
        removedFrames += edit.receipt.removedFrames ?? 0;
        ops.push({ op: 'command', input: { command } });
      }
    }
    if (!removedFrames) {
      toast.info(t('workbench.thoseRangesAlreadyOut'));
      return;
    }
    const captions = commit([...ops, { op: 'command', input: { command: { type: 'captions.relay' } } }]);
    if (!captions.ok) {
      toast.error(editorErrorMessage(captions.error));
      return;
    }
    setSelectedShotId(null);
    setSelectedId(null);
    const endFrame = captions.document.timeline.tracks.reduce(
      (end, track) => Math.max(end, ...track.clips.map((clip) => clip.startFrame + clip.durationFrames), 0),
      0,
    );
    applyT(Math.max(0, Math.min(tRef.current, Math.max(0, endFrame / captions.document.canvas.fps - 0.05))));
    toast.success(t('workbench.msgUndoHint', { msg }));
  };
  /** The script panel's scissors: delete a batch of (source, source-time range) (shared by delete-sentence / delete-silence
   *  / delete-filler; the mapping math is in trim.removeSrcRanges); grouped and computed per source (source timelines are
   *  independent), overlay blocks compressed in deletion order; one document publish avoids rebuild flicker. */
  const cutSrcRanges = (cuts: ScriptCut[], msg: string) => {
    const c0 = compRef.current;
    if (!cuts.length) return;
    const groups = new Map<string | null, [number, number][]>();
    for (const it of cuts) groups.set(it.src, [...(groups.get(it.src) ?? []), it.range]);
    let shots = ensureShots(c0);
    let cut = 0;
    const ops: DocumentOp[] = [];
    for (const [src, ranges] of groups) {
      const r = removeSrcRanges(shots, ranges, (base, srcStart, srcEnd) => ({ ...base, id: shotId(), srcStart, srcEnd }), (c) => (c.src ?? null) === src);
      cut += r.removed.reduce((a, [x, y]) => a + (y - x), 0);
      if (r.removed.length) {
        ops.push({ op: 'narration.removeRanges', input: {
          ranges: r.removed.map(([fromSec, toSec]) => ({ fromSec, toSec })),
          ...currentTranscripts(),
        } });
      }
      shots = r.clips;
    }
    if (cut < 0.01) {
      toast.info(t('workbench.thoseRangesAlreadyOut'));
      return;
    }
    const edit = commit(ops);
    if (!edit.ok) {
      toast.error(editorErrorMessage(edit.error));
      return;
    }
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
    if (!cuts.length) return;
    let shots = ensureShots(c0);
    let document = documentRef.current;
    let restored = 0;
    const ops: DocumentOp[] = [];
    for (const { src, range: [s, e] } of cuts) {
      const before = shots;
      const inSrc = (c: VideoShot) => (c.src ?? null) === src;
      // An insert source entirely absent from the video = no anchor and no srcSig, unrecoverable (the panel only emits words for present sources, so this shouldn't happen in theory)
      if (src && !before.some(inSrc)) continue;
      const sourceShot = src ? before.find((candidate) => candidate.src === src) : before.find((candidate) => !candidate.src);
      const sourceClip = sourceShot
        ? document.timeline.tracks.flatMap((track) => track.clips).find((clip): clip is NarrativeTimelineClip => (
          clip.id === sourceShot.id && clip.kind === 'narrative'
        ))
        : undefined;
      const assetId = sourceClip?.kind === 'narrative' ? sourceClip.assetId : src == null ? firstNarrativeAssetId(document) : undefined;
      if (!assetId) continue;
      const generated: VideoShot[] = [];
      shots = restoreSrcRange(
        before,
        s,
        e,
        (a, b) => {
          const shot = { id: shotId(), ...(src ? { src } : {}), srcStart: a, srcEnd: b, treatment: 'full' as const };
          generated.push(shot);
          return shot;
        },
        () => false,
        inSrc,
      );
      if (shots === before) continue;
      const len = generated.reduce((total, shot) => total + shot.srcEnd - shot.srcStart, 0);
      if (len <= 0.01) continue;
      const spans = clipSpans(shots);
      for (const inserted of generated.sort((left, right) => (
        (spans.find((span) => span.clip.id === left.id)?.editedStart ?? 0)
        - (spans.find((span) => span.clip.id === right.id)?.editedStart ?? 0)
      ))) {
        const at = spans.find((span) => span.clip.id === inserted.id)?.editedStart;
        if (at == null) continue;
        const primaryTrack = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId);
        const adjacent = primaryTrack?.clips
          .filter((clip): clip is NarrativeTimelineClip => clip.kind === 'narrative' && clip.assetId === assetId)
          .find((clip) => Math.abs(clip.sourceOutSec - inserted.srcStart) < 0.03)
          ?? primaryTrack?.clips
            .filter((clip): clip is NarrativeTimelineClip => clip.kind === 'narrative' && clip.assetId === assetId)
            .find((clip) => Math.abs(clip.sourceInSec - inserted.srcEnd) < 0.03);
        const presentation = adjacent ?? sourceClip;
        const input = {
          assetId,
          clipId: inserted.id,
          atSec: at,
          sourceInSec: inserted.srcStart,
          sourceOutSec: inserted.srcEnd,
          properties: presentation?.properties ?? { treatment: 'full' as const },
          ...(presentation?.box ? { box: presentation.box } : {}),
          ...(presentation?.mediaFraming ? { mediaFraming: presentation.mediaFraming } : {}),
          coalesceAdjacent: true,
        };
        // Preview so the next range sees the restored neighbour; the same inputs land as one transaction.
        const edit = insertNarrativeAssetRange({ document, ...input });
        if (!edit.ok) {
          toast.error(editorErrorMessage(edit.error));
          return;
        }
        document = edit.document;
        ops.push({ op: 'narrative.insertRange', input });
      }
      restored += len;
    }
    if (restored < 0.01) {
      toast.info(t('workbench.contentAlreadyInVideo'));
      return;
    }
    const landed = commit(ops);
    if (!landed.ok) {
      toast.error(editorErrorMessage(landed.error));
      return;
    }
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
    const edit = commit({ op: 'captions.edit', input: { mainTranscript: asrRef.current, clipTranscripts: clipAsrRef.current } }, { undo: 'none' });
    if (!edit.ok) {
      toast.error(editorErrorMessage(edit.error));
      return;
    }
    toast.success(t('workbench.replacedText', { text: txt }));
  };
  /** Mask words (beep/mute their sound, swap their caption text) on the runtime transcripts, then
   *  publish through the caption transaction so the document, captions and export all follow. */
  const maskScriptWords = (targets: ScriptMaskTarget[], patch: WordMaskPatch, msg: string) => {
    if (!targets.length) return;
    const bySrc = new Map<string | null, { sentenceIndex: number; wordIndex: number }[]>();
    for (const target of targets) bySrc.set(target.src, [...(bySrc.get(target.src) ?? []), { sentenceIndex: target.si, wordIndex: target.wi }]);
    let changed = false;
    for (const [src, list] of bySrc) {
      if (src == null) {
        const prev = asrRef.current;
        if (!prev) continue;
        const next = applyWordMasks(prev, list, patch);
        if (next === prev) continue;
        setAsrSentences(next);
        asrRef.current = next;
        changed = true;
      } else {
        const prev = clipAsrRef.current[src];
        if (!prev) continue;
        const next = applyWordMasks(prev, list, patch);
        if (next === prev) continue;
        const nextClips = { ...clipAsrRef.current, [src]: next };
        setClipAsr(nextClips);
        clipAsrRef.current = nextClips;
        changed = true;
      }
    }
    if (!changed) return;
    const edit = commit({ op: 'captions.edit', input: { mainTranscript: asrRef.current, clipTranscripts: clipAsrRef.current } }, { undo: 'none' });
    if (!edit.ok) {
      toast.error(editorErrorMessage(edit.error));
      return;
    }
    toast.success(msg);
  };
  const replaceTimelineScriptWord = (
    assetId: string,
    si: number,
    word: { start: number; end: number },
    text: string,
  ) => {
    const txt = text.trim();
    if (!txt) return;
    const current = documentRef.current;
    const segments = current.semantics.transcripts[assetId] as AsrSegment[] | undefined;
    if (!segments?.[si]) return;
    const isSame = (candidate: { start: number; end: number }) => (
      Math.abs(candidate.start - word.start) < 1e-3 && Math.abs(candidate.end - word.end) < 1e-3
    );
    const segment = segments[si]!;
    const words = (segment.words?.length ? segment.words : wordsFromText(segment.text, segment.start, segment.end))
      .map((candidate) => (isSame(candidate) ? { ...candidate, text: txt } : candidate));
    const nextSegments = [...segments];
    nextSegments[si] = { ...segment, words, text: words.map((candidate) => candidate.text).join('') };
    const captions = commit([
      { op: 'transcripts.set', input: { transcripts: { [assetId]: nextSegments } } },
      { op: 'command', input: { command: { type: 'captions.relay' } } },
    ], { undo: 'none' });
    if (!captions.ok) {
      toast.error(editorErrorMessage(captions.error));
      return;
    }
    if (assetId === firstNarrativeAssetId(current)) {
      asrRef.current = nextSegments;
      setAsrSentences(nextSegments);
    }
    toast.success(t('workbench.replacedText', { text: txt }));
  };
  /** Native-panel mask writer: masks live on the document transcripts; the main copy mirrors the first
   *  narrative asset so the semantic panel and captions relay see the same state. */
  const maskTimelineScriptWords = (targets: TimelineMaskTarget[], patch: WordMaskPatch, msg: string) => {
    if (!targets.length) return;
    const current = documentRef.current;
    const byAsset = new Map<string, { sentenceIndex: number; wordIndex: number }[]>();
    for (const target of targets) byAsset.set(target.assetId, [...(byAsset.get(target.assetId) ?? []), { sentenceIndex: target.si, wordIndex: target.wi }]);
    const transcripts = { ...current.semantics.transcripts };
    let changed = false;
    for (const [assetId, list] of byAsset) {
      const segments = transcripts[assetId] as AsrSegment[] | undefined;
      if (!segments) continue;
      const next = applyWordMasks(segments, list, patch);
      if (next === segments) continue;
      transcripts[assetId] = next;
      changed = true;
    }
    if (!changed) return;
    const changedTranscripts = Object.fromEntries(Object.entries(transcripts).filter(([assetId, next]) => next !== current.semantics.transcripts[assetId]));
    const captions = commit([
      { op: 'transcripts.set', input: { transcripts: changedTranscripts } },
      { op: 'command', input: { command: { type: 'captions.relay' } } },
    ], { undo: 'none' });
    if (!captions.ok) {
      toast.error(editorErrorMessage(captions.error));
      return;
    }
    const mainAssetId = firstNarrativeAssetId(current);
    if (mainAssetId && transcripts[mainAssetId] && transcripts[mainAssetId] !== current.semantics.transcripts[mainAssetId]) {
      const main = transcripts[mainAssetId] as AsrSegment[];
      asrRef.current = main;
      setAsrSentences(main);
    }
    toast.success(msg);
  };
  /** The script panel's "extract narration script" (spinner prevents double-clicks; errors toast). */
  const [asrBusy, setAsrBusy] = useState(false);
  const asrBusyRef = useRef(false);
  const extractForScript = async () => {
    if (!timelineTranscriptionTargets(documentRef.current, documentRef.current.semantics.managedCaptionSource ?? { mode: 'auto' }).length) {
      toast.error(t('common.uploadVideoFirst'));
      return;
    }
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
  // Only triggers when asrSentences is still null (never extracted) — an empty array = extracted but empty, don't retry in a loop.
  // Auto-extraction attempts each asset ONCE per session: an unresolvable target (bytes not
  // restored, provider failure) must not re-launch the whole extraction flow on every tab
  // switch/refresh. The panel's explicit extract button remains a fresh attempt.
  const autoAsrAttemptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const targets = timelineTranscriptionTargets(liveDocument, liveDocument.semantics.managedCaptionSource ?? { mode: 'auto' });
    const missing = targets.filter((target) => !Object.prototype.hasOwnProperty.call(liveDocument.semantics.transcripts, target.assetId));
    const fresh = missing.filter((target) => !autoAsrAttemptedRef.current.has(target.assetId));
    if (floatWin !== 'script' || !targets.length || !fresh.length) return;
    for (const target of fresh) autoAsrAttemptedRef.current.add(target.assetId);
    void extractForScript();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floatWin, comp.shots, asrSentences, liveDocument]);
  return {
    cutSrcRanges,
    cutTimelineRanges,
    restoreSrcRanges,
    replaceScriptWord,
    maskScriptWords,
    maskTimelineScriptWords,
    replaceTimelineScriptWord,
    extractForScript,
    asrBusy,
  };
}
