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
  type VideoShot,
  isCaptionsOn,
  isSentenceCaption,
  resolveCaptionStyle,
  resolveSubCaptionStyle,
} from '@pireel/studio-engine/composition';
import { type AsrSegment, applyCaptionTranslations } from '@pireel/studio-engine/build-blocks';
import { joinWords, wordsFromText } from '@pireel/studio-engine/caption-fx';
import { displayCues, mappedCaptionSegs as relayMappedCaptionSegs, relayCaptionLayer as relayCaptionLayerPure } from '@pireel/studio-engine/captions-relay';
import { studioProviders } from '@pireel/studio-engine/providers';
import { t } from './i18n';
import type { CaptionLineRow } from './captions-panel';

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
  setComp: (action: SetStateAction<Composition>) => void;
  ensureShots: (c: Composition) => VideoShot[];
  stepAsr: () => Promise<AsrSegment[]>;
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
    setPlaying, compRef, clipAsrRef, asrRef, videoFileRef, playingRef, tRef, setComp, ensureShots, stepAsr,
    ensureClipTranscripts, pushUndoSnapshot, postPreview, applyT, runTool,
  } = deps;
  const [capTransBusy, setCapTransBusy] = useState(false); // bilingual translation in progress (captions panel)
  const setCaptionStyle = useCallback((patch: Partial<CaptionStyle>) => {
    // SPARSE persistence: merge into the raw stored style, never the resolved one — defaults stay in
    // the resolver so future default changes reach projects that never explicitly set those fields.
    setComp((c) => ({ ...c, captionStyle: { ...(c.captionStyle ?? {}), ...patch } }));
  }, []);
  /** Caption re-lay/mapping: the pure functions live in captions-relay (reused by the offline MCP executor); this is a thin wrapper feeding refs. */
  const mappedCaptionSegs = (shots: VideoShot[], narr: AsrSegment[] | null): AsrSegment[] => relayMappedCaptionSegs(shots, narr, clipAsrRef.current);
  const relayCaptionLayer = (blocks: Block[], shots: VideoShot[], segs: AsrSegment[] | null): Block[] =>
    relayCaptionLayerPure(blocks, shots, segs, clipAsrRef.current, { subLang: resolveCaptionStyle(compRef.current).sub?.lang });
  /** Edit one caption line's TEXT (captions panel). Single source of truth = the transcript: the fix
   *  reaches caption re-lay, read_script/agents and the script panel at once. Timing untouched; word
   *  timing redistributed proportionally within the sentence (wordsFromText — karaoke presets keep working).
   *  Bilingual on → the stale translation is dropped and that line auto-retranslates. */
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
    const cueText = joinWords(base.slice(w0, w1 + 1).map((w) => w.text));
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
      toast.error(e instanceof Error ? e.message : t('workbench.translationFailedTryAgain'));
    } finally {
      setCaptionLineBusyKey((k) => (k === key ? null : k));
    }
  };
  /** Live-edited-but-not-committed lines (panel debounces keystrokes through phase 'live'):
   *  commit uses it to know a retranslate is owed even when the final call's text is already current. */
  const captionLiveDirtyRef = useRef<Set<string>>(new Set());
  /** Edit one display cue's TEXT: splice the cue's word range inside its source sentence (the
   *  transcript stays the single source of truth; the sentence text is rebuilt from its words).
   *  Blocks re-derive reactively — no manual re-lay. The edit invalidates this cue's translation and
   *  any later cue translations of the same sentence (their range keys shift with the word count). */
  const editCaptionLine = (row: CaptionLineRow, nextText: string, phase: 'live' | 'commit' | 'revert' = 'commit') => {
    const src = row.src;
    const segs = src ? clipAsrRef.current[src] : asrRef.current;
    const old = segs?.[row.index];
    if (!old || !nextText) return;
    const base = old.words?.length ? old.words : wordsFromText(old.text, old.start, old.end);
    const w0 = Math.max(0, Math.min(row.w0, base.length - 1));
    const w1 = Math.max(w0, Math.min(row.w1, base.length - 1));
    const oldCueText = joinWords(base.slice(w0, w1 + 1).map((w) => w.text));
    const changed = nextText !== oldCueText;
    let newW1 = w1;
    if (changed) {
      const replaced = wordsFromText(nextText, base[w0]!.start, base[w1]!.end);
      if (!replaced.length) return;
      newW1 = w0 + replaced.length - 1;
      const nextWords = [...base.slice(0, w0), ...replaced, ...base.slice(w1 + 1)];
      // Keep only translations of ranges fully BEFORE the edit; the edited range and everything after shift.
      const keptSubs = Object.fromEntries(
        Object.entries(old.cueSubs ?? {}).filter(([k]) => {
          const b = Number(k.split(':')[1]);
          return Number.isFinite(b) && b < w0;
        }),
      );
      const nextSeg: AsrSegment = { ...old, text: joinWords(nextWords.map((w) => w.text)), words: nextWords };
      if (Object.keys(keptSubs).length) nextSeg.cueSubs = keptSubs;
      else delete nextSeg.cueSubs;
      const next = segs.map((s, i) => (i === row.index ? nextSeg : s));
      if (src) {
        const m = { ...clipAsrRef.current, [src]: next };
        clipAsrRef.current = m;
        setClipAsr(m);
      } else {
        asrRef.current = next;
        setAsrSentences(next);
      }
    }
    if (phase === 'live') {
      if (changed) captionLiveDirtyRef.current.add(row.key);
      return;
    }
    const dirty = captionLiveDirtyRef.current.delete(row.key);
    if (phase === 'revert') return; // Esc: text restored above (if needed), old sub still matches — nothing else to do
    // Commit + bilingual on → refresh this cue's translation (also owed when live edits already landed the text)
    if ((changed || dirty) && resolveCaptionStyle(compRef.current).sub?.lang && studioProviders().translate) {
      void retranslateCaptionLine(src, row.index, { w0, w1: newW1 });
    }
  };
  /** Captions panel empty-state "extract captions": run ASR in place (no style applied — the user
   *  may just want to edit lines; picking a style later re-lays from this transcript). */
  const extractCaptionsNow = async () => {
    if (!videoFileRef.current) {
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
  const editCaptionSubLine = (row: CaptionLineRow, text: string | null, _phase: 'live' | 'commit' | 'revert' = 'commit') => {
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
    onRemove: removeCaptionLayer,
    // Per-line style controls (main / translation): resolved current styles + patch callbacks.
    // Patches with an explicit undefined clear that override; sub patches deep-merge into captionStyle.sub.
    styleCtl: {
      main: resolveCaptionStyle(comp),
      sub: resolveSubCaptionStyle(comp),
      bilingualOn: !!resolveCaptionStyle(comp).sub?.lang,
      onMainPatch: (patch: { scale?: number; color?: string | undefined; bg?: string | null | undefined }) => setCaptionStyle(patch),
      onSubPatch: (patch: { preset?: string | undefined; scale?: number; color?: string | undefined; bg?: string | null | undefined; lang?: string | undefined }) =>
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
  /** Clicking a style card in the captions panel: **always re-lay the whole layer from the narration script** (segmentation/
   *  mapping are deterministic post-processing and shouldn't reuse old blocks — old blocks may predate a segmentation-algorithm change;
   *  the transcript is the single source of truth, and word replacements are recorded there too). Auto-run ASR if there's no transcript;
   *  if there's no transcript but old captions exist (a loaded legacy draft), degrade to style-only. */
  const captionGenBusyRef = useRef(false);
  const [capGenBusy, setCapGenBusy] = useState(false); // used by the panel's "generating captions" overlay (the ref only prevents re-entry, doesn't trigger render)
  const applyCaptionPreset = async (preset: string) => {
    const has = isCaptionsOn(compRef.current);
    if (!compRef.current.video) {
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
      if (!segs?.length) {
        toast.info(t('workbench.extractingTranscript'));
        segs = await stepAsr();
      }
      const cues = displayCues(ensureShots(compRef.current), segs ?? [], clipAsrRef.current, { subLang: resolveCaptionStyle(compRef.current).sub?.lang });
      if (!cues.length) {
        toast.error(t('workbench.transcriptEmptyGenerateCaptions'));
        return;
      }
      pushUndoSnapshot();
      // Preset switch = a complete look: clear the per-line color/bg overrides (kept overrides would tint the new preset)
      setComp((c) => {
        const { color: _oc, bg: _ob, ...rest } = c.captionStyle ?? {};
        return { ...c, captionStyle: { ...rest, on: true, preset } };
      });
      // Let the user see the result immediately (same value as "select means visible"): if the playhead isn't in any
      // caption window, move it to the first caption — otherwise nothing on screen moves after laying and it feels like "clicked but no effect" (user reported)
      if (!playingRef.current && cues.length) {
        const t = tRef.current;
        const within = cues.some((c) => t >= c.start && t < c.end);
        if (!within) applyT(cues[0]!.start + Math.min(0.3, (cues[0]!.end - cues[0]!.start) / 2));
      }
      toast.success(has ? t('workbench.reLaidCaptionsFrom') : t('workbench.laidNCaptionsFrom', { n: cues.length }));
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
    pushUndoSnapshot();
    ids.forEach((id) => postPreview({ type: 'hf:remove', id }));
    setComp((c) => ({
      ...c,
      blocks: c.blocks.filter((b) => !isSentenceCaption(b)),
      captionStyle: { ...(c.captionStyle ?? {}), on: false },
    }));
    setSelectedIdRaw((s) => (s && ids.includes(s) ? null : s));
    setSelectedBlockIds((cur) => {
      const n = new Set([...cur].filter((x) => !ids.includes(x)));
      return n.size === cur.size ? cur : n;
    });
    toast.success(t('workbench.removedCaptions'));
  };
  const captionLineRows = useMemo<CaptionLineRow[]>(() => {
    // Rows = the SAME derivation the canvas renders (displayCues): one row = one on-screen line, by
    // construction. NOTE deliberately not gated on comp.video: transcript + shots are cloud-backed —
    // caption editing must keep working in the missing-media state (browser switch / cleared storage).
    return displayCues(ensureShots(comp), asrSentences, clipAsr, { subLang: resolveCaptionStyle(comp).sub?.lang })
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
  }, [comp.shots, comp.width, comp.height, asrSentences, clipAsr]);
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
      // Translate DISPLAY CUES (what's actually on screen), one translation per cue, all in one
      // context-bearing request; store per-cue on the source sentences (cueSubs via the executor).
      const cues = displayCues(ensureShots(compRef.current), asrRef.current, clipAsrRef.current, { subLang: target }).filter((c) => c.ref);
      if (!cues.length) {
        toast.error(t('workbench.noTranscriptShort'));
        return;
      }
      const out = await tr(cues.map((c, i) => ({ index: i, text: c.text })), target);
      const byPos = new Map(out.map((o) => [o.index, o.text.trim()]));
      const groups = new Map<string | null, { index: number; w0: number; w1: number; text: string }[]>();
      cues.forEach((c, i) => {
        const textOut = byPos.get(i);
        if (!textOut) return;
        const r = c.ref!;
        const arr = groups.get(r.src) ?? [];
        arr.push({ index: r.seg, w0: r.w0, w1: r.w1, text: textOut });
        groups.set(r.src, arr);
      });
      for (const [src, items] of groups) {
        if (!items.length) continue;
        if (src) {
          const shot = (compRef.current.shots ?? []).find((sh) => sh.src === src);
          if (shot) await runTool('set_caption_translations', { shotId: shot.id, items, lang: target });
        } else {
          await runTool('set_caption_translations', { items, lang: target });
        }
      }
      // Remember the target language: panel chip selected state + new inserted clips auto-translated to the same language
      setCaptionStyle({ sub: { ...(compRef.current.captionStyle?.sub ?? {}), lang: target } });
      toast.success(t('workbench.generatedLangTranslations', { lang: target }) + (isCaptionsOn(compRef.current) ? '' : t('workbench.enableCaptionsShowThem')));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('workbench.translationFailedTryAgain'));
    } finally {
      setCapTransBusy(false);
    }
  };
  return { setCaptionStyle, mappedCaptionSegs, relayCaptionLayer, captionLineRows, captionsPanelProps, applyCaptionPreset, removeCaptionLayer };
}
