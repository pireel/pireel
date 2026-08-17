'use client';

/**
 * Caption operations for the workbench: global caption style, transcript-driven line editing
 * (text / translation), preset apply/remove (full re-lay from the transcript), bilingual
 * translation, and the shared CaptionsPanel props. Extracted from hyperframes-workbench.tsx —
 * bodies are moved verbatim; the transcript stays the single source of truth.
 */

import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback, useMemo, useRef, useState } from 'react';
import { toast } from '@pireel/ui/toast';
import {
  type Block,
  type CaptionStyle,
  type Composition,
  type EditorDocumentV2,
  type VideoShot,
  applyCaptionDocumentEdit,
  isCaptionsOn,
  isSentenceCaption,
  resolveCaptionStyle,
  resolveSubCaptionStyle,
} from '@pireel/studio-engine/composition';
import { type AsrSegment, applyCaptionTranslations } from '@pireel/studio-engine/build-blocks';
import { applyCaptionTextEdits } from '@pireel/studio-engine/caption-text-edit';
import { joinWords, wordsFromText } from '@pireel/studio-engine/caption-fx';
import { displayCues, mappedCaptionSegs as relayMappedCaptionSegs, relayCaptionLayer as relayCaptionLayerPure } from '@pireel/studio-engine/captions-relay';
import { studioProviders } from '@pireel/studio-engine/providers';
import { t } from './i18n';
import { editorErrorMessage } from './editor-error';
import type { CaptionLineRow } from './captions-panel';
import { inspectCaptionDocument } from './caption-document-state';
import { captionTranscriptsByAsset, captionTranscriptsFromDocument } from './caption-transcript-bridge';
import { replaceCaptionTranslationsTransaction } from './caption-translation-transaction';

/** Everything the caption ops borrow from the workbench (values are per-render, refs/handlers are stable-by-ref). */
export interface CaptionsOpsDeps {
  comp: Composition;
  tSec: number;
  asrSentences: AsrSegment[] | null;
  clipAsr: Record<string, AsrSegment[]>;
  setClipAsr: (v: Record<string, AsrSegment[]>) => void;
  setAsrSentences: (v: AsrSegment[] | null) => void;
  setSelectedIdRaw: Dispatch<SetStateAction<string | null>>;
  setSelectedBlockIds: Dispatch<SetStateAction<Set<string>>>;
  setPlaying: (v: boolean) => void;
  compRef: MutableRefObject<Composition>;
  clipAsrRef: MutableRefObject<Record<string, AsrSegment[]>>;
  asrRef: MutableRefObject<AsrSegment[] | null>;
  videoFileRef: MutableRefObject<File | null>;
  playingRef: MutableRefObject<boolean>;
  tRef: MutableRefObject<number>;
  documentRef: MutableRefObject<EditorDocumentV2>;
  setDocument: (document: EditorDocumentV2, runtimeComposition?: Composition) => void;
  ensureShots: (c: Composition) => VideoShot[];
  stepAsr: () => Promise<AsrSegment[]>;
  refreshAsr: () => Promise<AsrSegment[]>;
  ensureClipTranscripts: () => Promise<void>;
  pushUndoSnapshot: () => void;
  postPreview: (msg: Record<string, unknown>) => void;
  applyT: (v: number) => void;
  /** The agent tool dispatcher (set_caption_translations goes through the shared executor for undo/re-lay). */
  runTool: (toolId: string, input: Record<string, unknown>) => Promise<unknown>;
}

export function useCaptionsOps(deps: CaptionsOpsDeps) {
  const {
    comp, tSec, asrSentences, clipAsr, setClipAsr, setAsrSentences, setSelectedIdRaw, setSelectedBlockIds,
    setPlaying, compRef, clipAsrRef, asrRef, videoFileRef, playingRef, tRef, documentRef, setDocument, ensureShots, stepAsr, refreshAsr,
    ensureClipTranscripts, pushUndoSnapshot, postPreview, applyT, runTool,
  } = deps;
  const [capTransBusy, setCapTransBusy] = useState(false); // bilingual translation in progress (captions panel)
  const captionEdit = (patch: Partial<CaptionStyle>) => applyCaptionDocumentEdit({
    document: documentRef.current,
    patch,
    mainTranscript: asrRef.current,
    clipTranscripts: captionTranscriptsByAsset(documentRef.current, compRef.current, clipAsrRef.current),
  });
  const setCaptionStyle = useCallback((patch: Partial<CaptionStyle>) => {
    // SPARSE persistence: merge into the raw stored style, never the resolved one — defaults stay in
    // the resolver so future default changes reach projects that never explicitly set those fields.
    const edit = captionEdit(patch);
    if (!edit.ok) {
      toast.error(editorErrorMessage(edit.error));
      return;
    }
    setDocument(edit.document);
  }, []);
  /** Caption re-lay/mapping: the pure functions live in captions-relay (reused by the offline MCP executor); this is a thin wrapper feeding refs. */
  const mappedCaptionSegs = (shots: VideoShot[], narr: AsrSegment[] | null): AsrSegment[] => relayMappedCaptionSegs(shots, narr, clipAsrRef.current);
  const relayCaptionLayer = (blocks: Block[], shots: VideoShot[], segs: AsrSegment[] | null, canvasW = compRef.current.width): Block[] =>
    relayCaptionLayerPure(blocks, shots, segs, clipAsrRef.current, {
      subLang: resolveCaptionStyle(compRef.current).sub?.lang,
      canvasW,
      style: compRef.current.captionStyle,
    });
  /** Edit one caption line's audience-facing copy. ASR text/words stay immutable; cueTexts stores a
   *  source-word-range override which also locks this cue's start/end boundary. Input stays entirely
   *  local and this writer runs once on commit, never against provisional IME text. */
  const [captionLineBusyKey, setCaptionLineBusyKey] = useState<string | null>(null);
  /** Source-sentence word list a cue range indexes into (materialized deterministically when ASR words are absent). */
  const baseWordsOf = (seg: AsrSegment) => (seg.words?.length ? seg.words : wordsFromText(seg.text, seg.start, seg.end));
  /** Re-translate ONE display cue (range within its source sentence) and store it per-cue (cueSubs). */
  const retranslateCaptionLine = async (src: string | null, index: number, range: { w0: number; w1: number }, langIn?: string) => {
    const tr = studioProviders().translate;
    const lang = langIn ?? resolveCaptionStyle(compRef.current).sub?.lang;
    if (!tr || !lang) return;
    const segs = src ? clipAsrRef.current[src] : asrRef.current;
    const seg = segs?.[index];
    if (!seg) return;
    const base = baseWordsOf(seg);
    const w0 = Math.max(0, Math.min(range.w0, base.length - 1));
    const w1 = Math.max(w0, Math.min(range.w1, base.length - 1));
    const cueText = seg.cueTexts?.[`${w0}:${w1}`] ?? joinWords(base.slice(w0, w1 + 1).map((w) => w.text));
    if (!cueText) return;
    const key = `${src ?? 'main'}:${index}:${w0}`;
    setCaptionLineBusyKey(key);
    try {
      const out = await tr([{ index, text: cueText }], lang);
      const textOut = out.find((o) => o.index === index)?.text?.trim();
      if (!textOut) throw new Error(t('workbench.translationFailedTryAgain'));
      const item = { index, w0, w1, text: textOut };
      if (src) {
        const shot = ensureShots(compRef.current).find((s) => s.src === src);
        if (shot) await runTool('set_caption_translations', { shotId: shot.id, items: [item], lang });
      } else {
        await runTool('set_caption_translations', { items: [item], lang });
      }
    } catch (e) {
      console.warn('[captions] line translation failed', e);
      toast.error(t('workbench.translationFailedTryAgain'));
    } finally {
      setCaptionLineBusyKey((k) => (k === key ? null : k));
    }
  };
  /** Edit one display cue's copy and publish the cue lock + managed caption relay atomically. */
  const editCaptionLine = (row: CaptionLineRow, nextText: string, phase: 'live' | 'commit' | 'revert' = 'commit') => {
    if (phase !== 'commit') return;
    const src = row.src;
    const segs = src ? clipAsrRef.current[src] : asrRef.current;
    if (!segs?.[row.index] || !nextText.trim()) return;
    // Snapshot every currently materialized cue in this sentence. Locking only the edited range
    // would let the untouched tail rebalance around it on relay, which is still a hidden re-segment.
    const items = captionLineRows
      .filter((candidate) => candidate.src === row.src && candidate.index === row.index)
      .map((candidate) => ({
        index: candidate.index,
        w0: candidate.w0,
        w1: candidate.w1,
        text: candidate.key === row.key ? nextText : candidate.text,
        lock: true,
      }));
    const next = applyCaptionTextEdits(segs, items);
    if (next === segs) return;
    const nextClipAsr = src ? { ...clipAsrRef.current, [src]: next } : clipAsrRef.current;
    const edit = applyCaptionDocumentEdit({
      document: documentRef.current,
      mainTranscript: src ? asrRef.current : next,
      clipTranscripts: captionTranscriptsByAsset(documentRef.current, compRef.current, nextClipAsr),
    });
    if (!edit.ok) {
      toast.error(editorErrorMessage(edit.error));
      return;
    }
    pushUndoSnapshot();
    if (src) {
      clipAsrRef.current = nextClipAsr;
      setClipAsr(nextClipAsr);
    } else {
      asrRef.current = next;
      setAsrSentences(next);
    }
    setDocument(edit.document);
  };
  /** Captions panel empty-state "extract captions": run ASR in place (no style applied — the user
   *  may just want to edit lines; picking a style later re-lays from this transcript). */
  const extractCaptionsNow = async () => {
    const source = inspectCaptionDocument(documentRef.current);
    if (!source.hasSpeechTrack) {
      toast.error(t('common.uploadVideoFirst'));
      return;
    }
    if (captionGenBusyRef.current) return;
    captionGenBusyRef.current = true;
    setCapGenBusy(true);
    try {
      await stepAsr();
      await ensureClipTranscripts();
    } catch {
      toast.error(t('workbench.transcriptExtractionFailedTry'));
    } finally {
      captionGenBusyRef.current = false;
      setCapGenBusy(false);
    }
  };
  /** Manually edit one display cue's TRANSLATION (bilingual second row): stored per-cue on the source
   *  sentence (cueSubs["w0:w1"]); no auto-retranslate — the user's wording wins (only editing the
   *  SOURCE re-triggers translation). null = clear this cue's translation. Blocks re-derive reactively. */
  const editCaptionSubLine = (row: CaptionLineRow, text: string | null, phase: 'live' | 'commit' | 'revert' = 'commit') => {
    if (phase !== 'commit') return;
    const src = row.src;
    const segs = src ? clipAsrRef.current[src] : asrRef.current;
    const old = segs?.[row.index];
    if (!old) return;
    const nextSub = text?.trim() || undefined;
    const key = `${row.w0}:${row.w1}`;
    if (nextSub === (old.cueSubs?.[key] ?? old.sub)) return;
    const lang = resolveCaptionStyle(compRef.current).sub?.lang;
    const base = old.words?.length ? old.words : wordsFromText(old.text, old.start, old.end);
    const fullRange = row.w0 === 0 && row.w1 === base.length - 1;
    // Shared writer (same semantics as the executor): per-cue entry, plus the whole-sentence field
    // when the cue covers the full sentence (display fallback + the agent-facing value).
    const items = [
      { index: row.index, w0: row.w0, w1: row.w1, text: nextSub ?? '' },
      ...(fullRange ? [{ index: row.index, text: nextSub ?? '' }] : []),
    ];
    const next = applyCaptionTranslations(segs, items, lang);
    if (src) {
      const m = { ...clipAsrRef.current, [src]: next };
      clipAsrRef.current = m;
      setClipAsr(m);
    } else {
      asrRef.current = next;
      setAsrSentences(next);
    }
  };
  /** Shared props for the two CaptionsPanel mounts (docked rail + float window). */
  const captionsPanelProps = () => ({
    comp,
    generating: capGenBusy,
    onPickPreset: applyCaptionPreset,
    onRelayout: relayoutCaptions,
    onRemove: removeCaptionLayer,
    // Per-line style controls (main / translation): resolved current styles + patch callbacks.
    // Patches with an explicit undefined clear that override; sub patches deep-merge into captionStyle.sub.
    styleCtl: {
      main: resolveCaptionStyle(comp),
      sub: resolveSubCaptionStyle(comp),
      bilingualOn: !!resolveCaptionStyle(comp).sub?.lang,
      onMainPatch: (patch: { scale?: number; color?: string | undefined; bg?: string | null | undefined; bold?: boolean | undefined }) => setCaptionStyle(patch),
      onSubPatch: (patch: { preset?: string | undefined; scale?: number; color?: string | undefined; bg?: string | null | undefined; bold?: boolean | undefined; lang?: string | undefined }) =>
        setCaptionStyle({ sub: { ...(compRef.current.captionStyle?.sub ?? {}), ...patch } }),
    },
    rows: captionLineRows,
    activeKey: (() => {
      let hit: string | null = null;
      for (const r of captionLineRows) if (r.editedStart <= tSec + 0.001) hit = r.key;
      return hit;
    })(),
    onEditLine: editCaptionLine,
    onEditSubLine: editCaptionSubLine,
    onSeekTo: (sec: number) => {
      if (playingRef.current) setPlaying(false);
      applyT(sec);
    },
    onRetranslateLine: (row: CaptionLineRow) => void retranslateCaptionLine(row.src, row.index, { w0: row.w0, w1: row.w1 }),
    lineBusyKey: captionLineBusyKey,
    onExtract: () => void extractCaptionsNow(),
    translation: studioProviders().translate
      ? {
          done: captionLineRows.filter((r) => r.sub).length,
          total: captionLineRows.length,
          busy: capTransBusy,
          lang: resolveCaptionStyle(comp).sub?.lang,
          onTranslate: (lang: string) => void translateCaptionsTo(lang),
          onClear: () => void runTool('set_caption_translations', { clear: true }),
        }
      : undefined,
  });
  /** Clicking a style card changes the global look and relays the managed lane while preserving its
   *  materialized cueLayout. Auto-run ASR only when no transcript exists; boundary regeneration is
   *  deliberately reserved for the explicit re-layout action. */
  const captionGenBusyRef = useRef(false);
  const [capGenBusy, setCapGenBusy] = useState(false); // used by the panel's "generating captions" overlay (the ref only prevents re-entry, doesn't trigger render)
  const applyCaptionPreset = async (preset: string, stylePatch: Partial<CaptionStyle> = {}) => {
    const has = isCaptionsOn(compRef.current);
    const source = inspectCaptionDocument(documentRef.current);
    if (!source.hasSpeechTrack) {
      toast.error(t('workbench.uploadVideoBeforeApplying'));
      return;
    }
    if (captionGenBusyRef.current) return;
    captionGenBusyRef.current = true;
    setCapGenBusy(true);
    try {
      // Run ASR if there's no transcript (fileSig cache hit = instant). Captions are derived state:
      // switching the preset only writes captionStyle {on, preset} — the reactive derivation
      // materializes blocks from the transcript.
      let segs = asrRef.current;
      let transcribedForAttempt = false;
      if (!source.hasSpeechTranscript) {
        toast.info(t('workbench.extractingTranscript'));
        segs = await stepAsr();
        transcribedForAttempt = true;
      }
      // V2 primary lanes can be built entirely from ordinary narrative assets. Their bytes and
      // transcripts live in the per-source maps, not in the legacy special main-video File.
      await ensureClipTranscripts();
      // Preset switch = a complete look: clear per-line color/bg overrides, then relay from the
      // transcript in the same V2 transaction so locked lanes cannot publish half a style change.
      let edit = captionEdit({ on: true, preset, color: undefined, bg: undefined, ...stylePatch });
      if (!edit.ok) {
        toast.error(editorErrorMessage(edit.error));
        return;
      }
      let output = inspectCaptionDocument(edit.document);
      // A transcript can survive a source replacement through an old project context. Asset-level
      // presence alone is not proof that it overlaps the current source. Native relay is the final
      // authority: zero cues + mounted bytes means re-transcribe this source once and retry atomically.
      if (!output.captionCount && videoFileRef.current && !transcribedForAttempt) {
        toast.info(t('workbench.extractingTranscript'));
        segs = await refreshAsr();
        edit = captionEdit({ on: true, preset, color: undefined, bg: undefined, ...stylePatch });
        if (!edit.ok) {
          toast.error(editorErrorMessage(edit.error));
          return;
        }
        output = inspectCaptionDocument(edit.document);
      }
      if (!output.captionCount) {
        toast.error(t('workbench.transcriptEmptyGenerateCaptions'));
        return;
      }
      pushUndoSnapshot();
      setDocument(edit.document);
      // Let the user see the result immediately (same value as "select means visible"): if the playhead isn't in any
      // caption window, move it to the first caption — otherwise nothing on screen moves after laying and it feels like "clicked but no effect" (user reported)
      if (!playingRef.current && output.firstCaptionStartSec != null) {
        const t = tRef.current;
        const within = edit.document.timeline.tracks
          .find((track) => track.id === edit.document.semantics.managedCaptionTrackId)
          ?.clips.some((clip) => clip.kind === 'caption' && clip.enabled
            && t >= clip.startFrame / edit.document.canvas.fps
            && t < (clip.startFrame + clip.durationFrames) / edit.document.canvas.fps);
        if (!within) applyT(output.firstCaptionStartSec + 0.01);
      }
      if (!has) toast.success(t('workbench.laidNCaptionsFrom', { n: output.captionCount }));
    } catch (e) {
      console.warn('[studio] apply caption preset failed', e);
      setCaptionStyle({ preset }); // on transcription failure, at least swap the style
      toast.error(t('workbench.transcriptExtractionFailedStyle'));
    } finally {
      captionGenBusyRef.current = false;
      setCapGenBusy(false);
    }
  };
  /** Captions panel "remove"/switch-off: captionStyle.on = false. The rest of captionStyle is KEPT —
   *  it is state (preset/positions/translation language) and the on/off toggle must round-trip it intact.
   *  The derivation effect clears the materialized blocks. */
  const removeCaptionLayer = () => {
    if (!isCaptionsOn(compRef.current)) return;
    const ids = compRef.current.blocks.filter(isSentenceCaption).map((b) => b.id);
    const edit = captionEdit({ on: false });
    if (!edit.ok) {
      toast.error(editorErrorMessage(edit.error));
      return;
    }
    pushUndoSnapshot();
    ids.forEach((id) => postPreview({ type: 'hf:remove', id }));
    setDocument(edit.document);
    setSelectedIdRaw((s) => (s && ids.includes(s) ? null : s));
    setSelectedBlockIds((cur) => {
      const n = new Set([...cur].filter((x) => !ids.includes(x)));
      return n.size === cur.size ? cur : n;
    });
    toast.success(t('workbench.removedCaptions'));
  };
  /** Explicit re-layout: regenerate boundaries from current canvas/font metrics, remap corrected
   * copy onto those ranges, then immediately freeze the new layout. Deliberately no success toast. */
  const relayoutCaptions = () => {
    if (!isCaptionsOn(compRef.current)) return { ok: false, error: t('workbench.thereNoCaptionsRight') };
    const edit = applyCaptionDocumentEdit({
      document: documentRef.current,
      relayout: true,
      mainTranscript: null,
      clipTranscripts: {},
    });
    if (!edit.ok) {
      toast.error(editorErrorMessage(edit.error));
      return { ok: false, error: editorErrorMessage(edit.error) };
    }
    const transcripts = captionTranscriptsFromDocument(edit.document, compRef.current, clipAsrRef.current);
    pushUndoSnapshot();
    asrRef.current = transcripts.main;
    clipAsrRef.current = transcripts.clips;
    setAsrSentences(transcripts.main);
    setClipAsr(transcripts.clips);
    setDocument(edit.document);
    return { ok: true };
  };
  const captionLineRows = useMemo<CaptionLineRow[]>(() => {
    // Rows = the SAME derivation the canvas renders (displayCues): one row = one on-screen line, by
    // construction. Read document-owned cueLayout first: browser transcript refs can legitimately
    // lag a style transaction, but the list must never show different boundaries from the canvas.
    // NOTE deliberately not gated on comp.video: transcript + shots are cloud-backed.
    const documentTranscripts = captionTranscriptsFromDocument(documentRef.current, comp, clipAsr);
    const narr = documentTranscripts.main?.length ? documentTranscripts.main : asrSentences;
    return displayCues(ensureShots(comp), narr, documentTranscripts.clips, {
      subLang: resolveCaptionStyle(comp).sub?.lang,
      canvasW: comp.width,
      style: comp.captionStyle,
    })
      .filter((c) => c.ref)
      .map((c) => ({
        key: `${c.ref!.src ?? 'main'}:${c.ref!.seg}:${c.ref!.w0}`,
        src: c.ref!.src,
        index: c.ref!.seg,
        w0: c.ref!.w0,
        w1: c.ref!.w1,
        text: c.text,
        sub: c.sub,
        editedStart: c.start,
        dur: Math.max(0.1, c.end - c.start),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp.shots, comp.width, comp.height, comp.captionStyle, asrSentences, clipAsr]);
  /* ---------- Bilingual translation (the captions panel "bilingual" section): translations come from the in-house LLM
     (providers.translate; the OSS shell's default hides this section), data lands via the same set_caption_translations executor (undo/re-lay shared). ---------- */
  const translateCaptionsTo = async (target: string) => {
    const tr = studioProviders().translate;
    if (!tr) return;
    if (!asrRef.current?.length) {
      toast.error(t('workbench.noTranscriptShort'));
      return;
    }
    setCapTransBusy(true);
    try {
      await ensureClipTranscripts(); // translate insert sources too, don't produce half-done bilingual
      // Translate SENTENCE FRAGMENTS as they survive the edit (mappedCaptionSegs): the post-cut
      // sentence text, in edited order — the unit the audience actually hears. NOT display cues:
      // cue-fragment translation is linguistically unsound across word-order-divergent language
      // pairs, and hundreds of cue rows blew up the request (truncated output → translate_empty).
      const groups = relayMappedCaptionSegs(ensureShots(compRef.current), asrRef.current, clipAsrRef.current);
      if (!groups.length) {
        toast.error(t('workbench.noTranscriptShort'));
        return;
      }
      const out = await tr(groups.map((g, i) => ({ index: i, text: g.text })), target);
      // Stage clear + all-source replacement + caption relay first, then publish refs/state exactly
      // once. A missing row, stale source, or locked caption lane leaves the old bilingual layer
      // untouched instead of clearing it and writing only the batches that happened to succeed.
      const transaction = replaceCaptionTranslationsTransaction({
        document: documentRef.current,
        composition: compRef.current,
        groups,
        rows: out,
        target,
        mainTranscript: asrRef.current,
        clipTranscripts: clipAsrRef.current,
      });
      if (!transaction.ok) throw new Error(transaction.error || t('workbench.translationFailedTryAgain'));
      pushUndoSnapshot();
      asrRef.current = transaction.mainTranscript;
      clipAsrRef.current = transaction.clipTranscripts;
      setAsrSentences(transaction.mainTranscript);
      setClipAsr(transaction.clipTranscripts);
      setDocument(transaction.document);
      toast.success(t('workbench.generatedLangTranslations', { lang: target }) + (isCaptionsOn(compRef.current) ? '' : t('workbench.enableCaptionsShowThem')));
    } catch (e) {
      console.warn('[captions] translation failed', e);
      toast.error(t('workbench.translationFailedTryAgain'));
    } finally {
      setCapTransBusy(false);
    }
  };
  return { setCaptionStyle, mappedCaptionSegs, relayCaptionLayer, captionLineRows, captionsPanelProps, applyCaptionPreset, relayoutCaptions, removeCaptionLayer };
}
