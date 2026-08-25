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
  applyCaptionDocumentEdit,
  applyNarrationDocumentEdit,
  insertNarrativeAssetRange,
  shotId,
  timelineSpeechRangesForAsset,
  timelineTranscriptionTargets,
} from '@pireel/studio-engine/composition';
import { removeSrcRanges, restoreSrcRange, spans as clipSpans } from '@pireel/studio-engine/trim';
import { wordsFromText } from '@pireel/studio-engine/caption-fx';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import type { ScriptCut, TimelineScriptCut } from './script-panel';
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
  setDocument: (document: EditorDocumentV2) => void;
  setSelectedId: (id: string | null) => void;
  setSelectedShotId: (id: string | null) => void;
  applyT: (v: number) => void;
  pushUndoSnapshot: () => void;
  ensureShots: (c: Composition) => VideoShot[];
  stepAsr: () => Promise<AsrSegment[]>;
}

export function useScriptCut(deps: ScriptCutDeps) {
  const {
    projectId, comp, document: liveDocument, floatWin, asrSentences, compRef, tRef, asrRef, clipAsrRef, setClipAsr, setAsrSentences,
    documentRef, setDocument, setSelectedId, setSelectedShotId, applyT, pushUndoSnapshot, ensureShots, stepAsr,
  } = deps;

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
    for (const [trackId, sourceRanges] of byTrack) {
      const merged: Array<{ startFrame: number; endFrame: number }> = [];
      for (const range of [...sourceRanges].sort((left, right) => left.startFrame - right.startFrame)) {
        const previous = merged.at(-1);
        if (previous && range.startFrame <= previous.endFrame) previous.endFrame = Math.max(previous.endFrame, range.endFrame);
        else merged.push({ startFrame: range.startFrame, endFrame: range.endFrame });
      }
      for (const range of merged.sort((left, right) => right.startFrame - left.startFrame)) {
        const edit = applyEditorCommand(document, {
          type: 'range.remove',
          trackId,
          startFrame: range.startFrame,
          endFrame: range.endFrame,
          mode: 'ripple',
          includeLinked: true,
        });
        if (!edit.ok) {
          toast.error(editorErrorMessage(edit.error));
          return;
        }
        document = edit.document;
        removedFrames += edit.receipt.removedFrames ?? 0;
      }
    }
    if (!removedFrames) {
      toast.info(t('workbench.thoseRangesAlreadyOut'));
      return;
    }
    const captions = applyEditorCommand(document, { type: 'captions.relay' });
    if (!captions.ok) {
      toast.error(editorErrorMessage(captions.error));
      return;
    }
    pushUndoSnapshot();
    setDocument(captions.document);
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
    let document = documentRef.current;
    let cut = 0;
    for (const [src, ranges] of groups) {
      const r = removeSrcRanges(shots, ranges, (base, srcStart, srcEnd) => ({ ...base, id: shotId(), srcStart, srcEnd }), (c) => (c.src ?? null) === src);
      cut += r.removed.reduce((a, [x, y]) => a + (y - x), 0);
      if (r.removed.length) {
        const edit = applyNarrationDocumentEdit({
          projectId,
          document,
          ranges: r.removed.map(([fromSec, toSec]) => ({ fromSec, toSec })),
          mainTranscript: asrRef.current,
          clipTranscripts: clipAsrRef.current,
        });
        if (!edit.ok) {
          toast.error(editorErrorMessage(edit.error));
          return;
        }
        document = edit.document;
      }
      shots = r.clips;
    }
    if (cut < 0.01) {
      toast.info(t('workbench.thoseRangesAlreadyOut'));
      return;
    }
    pushUndoSnapshot();
    setDocument(document);
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
      const assetId = sourceClip?.kind === 'narrative' ? sourceClip.assetId : src == null ? document.semantics.primaryNarrativeAssetId : undefined;
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
        const edit = insertNarrativeAssetRange({
          document,
          assetId,
          clipId: inserted.id,
          atSec: at,
          sourceInSec: inserted.srcStart,
          sourceOutSec: inserted.srcEnd,
          properties: presentation?.properties ?? { treatment: 'full' },
          ...(presentation?.box ? { box: presentation.box } : {}),
          ...(presentation?.mediaFraming ? { mediaFraming: presentation.mediaFraming } : {}),
          coalesceAdjacent: true,
        });
        if (!edit.ok) {
          toast.error(editorErrorMessage(edit.error));
          return;
        }
        document = edit.document;
      }
      restored += len;
    }
    if (restored < 0.01) {
      toast.info(t('workbench.contentAlreadyInVideo'));
      return;
    }
    pushUndoSnapshot();
    setDocument(document);
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
    const edit = applyCaptionDocumentEdit({
      document: documentRef.current,
      mainTranscript: asrRef.current,
      clipTranscripts: clipAsrRef.current,
    });
    if (!edit.ok) {
      toast.error(editorErrorMessage(edit.error));
      return;
    }
    setDocument(edit.document);
    toast.success(t('workbench.replacedText', { text: txt }));
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
    const patched: EditorDocumentV2 = {
      ...current,
      semantics: {
        ...current.semantics,
        transcripts: { ...current.semantics.transcripts, [assetId]: nextSegments },
      },
    };
    const captions = applyEditorCommand(patched, { type: 'captions.relay' });
    if (!captions.ok) {
      toast.error(editorErrorMessage(captions.error));
      return;
    }
    if (assetId === current.semantics.primaryNarrativeAssetId) {
      asrRef.current = nextSegments;
      setAsrSentences(nextSegments);
    }
    setDocument(captions.document);
    toast.success(t('workbench.replacedText', { text: txt }));
  };
  /** The script panel's "extract narration script" (spinner prevents double-clicks; errors toast). */
  const [asrBusy, setAsrBusy] = useState(false);
  const asrBusyRef = useRef(false);
  const extractForScript = async () => {
    if (!timelineTranscriptionTargets(documentRef.current).length) {
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
  // Only triggers when asrSentences is still null (never extracted) — an empty array = extracted but empty, don't retry in a loop
  useEffect(() => {
    const targets = timelineTranscriptionTargets(liveDocument);
    const needsTranscript = targets.some((target) => !Object.prototype.hasOwnProperty.call(liveDocument.semantics.transcripts, target.assetId));
    if (floatWin !== 'script' || !targets.length || !needsTranscript) return;
    void extractForScript();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floatWin, comp.shots, asrSentences, liveDocument]);
  return {
    cutSrcRanges,
    cutTimelineRanges,
    restoreSrcRanges,
    replaceScriptWord,
    replaceTimelineScriptWord,
    extractForScript,
    asrBusy,
  };
}
