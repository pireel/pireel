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
  isSentenceCaption,
  resolveCaptionStyle,
  resolveSubCaptionStyle,
} from '@pireel/studio-engine/composition';
import { spans as clipSpans } from '@pireel/studio-engine/trim';
import { type AsrSegment, captionBlocksFromAsr } from '@pireel/studio-engine/build-blocks';
import { wordsFromText } from '@pireel/studio-engine/caption-fx';
import { mappedCaptionSegs as relayMappedCaptionSegs, relayCaptionLayer as relayCaptionLayerPure } from '@pireel/studio-engine/captions-relay';
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
    setComp((c) => ({ ...c, captionStyle: { ...resolveCaptionStyle(c), ...patch } }));
  }, []);
  /** Caption re-lay/mapping: the pure functions live in captions-relay (reused by the offline MCP executor); this is a thin wrapper feeding refs. */
  const mappedCaptionSegs = (shots: VideoShot[], narr: AsrSegment[] | null): AsrSegment[] => relayMappedCaptionSegs(shots, narr, clipAsrRef.current);
  const relayCaptionLayer = (blocks: Block[], shots: VideoShot[], segs: AsrSegment[] | null): Block[] =>
    relayCaptionLayerPure(blocks, shots, segs, clipAsrRef.current);
  /** Edit one caption line's TEXT (captions panel). Single source of truth = the transcript: the fix
   *  reaches caption re-lay, read_script/agents and the script panel at once. Timing untouched; word
   *  timing redistributed proportionally within the sentence (wordsFromText — karaoke presets keep working).
   *  Bilingual on → the stale translation is dropped and that line auto-retranslates. */
  const [captionLineBusyKey, setCaptionLineBusyKey] = useState<string | null>(null);
  const retranslateCaptionLine = async (src: string | null, index: number, langIn?: string) => {
    const tr = studioProviders().translate;
    const lang = langIn ?? resolveCaptionStyle(compRef.current).sub?.lang;
    if (!tr || !lang) return;
    const segs = src ? clipAsrRef.current[src] : asrRef.current;
    const seg = segs?.[index];
    if (!seg) return;
    const key = `${src ?? 'main'}:${index}`;
    setCaptionLineBusyKey(key);
    try {
      const out = await tr([{ index, text: seg.text }], lang);
      const textOut = out.find((o) => o.index === index)?.text?.trim();
      if (!textOut) throw new Error(t('workbench.translationFailedTryAgain'));
      if (src) {
        const shot = ensureShots(compRef.current).find((s) => s.src === src);
        if (shot) await runTool('set_caption_translations', { shotId: shot.id, items: [{ index, text: textOut }] });
      } else {
        await runTool('set_caption_translations', { items: [{ index, text: textOut }] });
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
  const editCaptionLine = (src: string | null, index: number, nextText: string, phase: 'live' | 'commit' | 'revert' = 'commit') => {
    const segs = src ? clipAsrRef.current[src] : asrRef.current;
    const old = segs?.[index];
    if (!old || !nextText) return;
    const key = `${src ?? 'main'}:${index}`;
    const changed = nextText !== old.text;
    if (changed) {
      // Keep the existing sub while typing (nicer than flashing 未翻译); the commit-time retranslate replaces it
      const nextSeg: AsrSegment = {
        ...old,
        text: nextText,
        // Only rebuild word timing if ASR provided it (karaoke presets read words); sentence-level stays sentence-level
        ...(old.words?.length ? { words: wordsFromText(nextText, old.start, old.end) } : {}),
      };
      const next = segs.map((s, i) => (i === index ? nextSeg : s));
      if (src) {
        const m = { ...clipAsrRef.current, [src]: next };
        clipAsrRef.current = m;
        setClipAsr(m);
      } else {
        asrRef.current = next;
        setAsrSentences(next);
      }
      // Captions on → re-lay so the canvas reflects the text live (double-buffered doc swap, no flash)
      if (compRef.current.blocks.some(isSentenceCaption)) {
        setComp((cur) => ({ ...cur, blocks: relayCaptionLayer(cur.blocks, ensureShots(cur), asrRef.current) }));
      }
    }
    if (phase === 'live') {
      if (changed) captionLiveDirtyRef.current.add(key);
      return;
    }
    const dirty = captionLiveDirtyRef.current.delete(key);
    if (phase === 'revert') return; // Esc: text restored above (if needed), old sub still matches — nothing else to do
    // Commit + bilingual on → refresh this line's translation (also owed when live edits already landed the text)
    if ((changed || dirty) && resolveCaptionStyle(compRef.current).sub?.lang && studioProviders().translate) {
      void retranslateCaptionLine(src, index);
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
  /** Manually edit one line's TRANSLATION (bilingual second row). Same single-source semantics as the
   *  text edit (seg.sub), same live re-lay; no auto-retranslate here — the user's wording wins
   *  (only editing the SOURCE re-triggers translation). null = clear this line's translation. */
  const editCaptionSubLine = (src: string | null, index: number, text: string | null, _phase: 'live' | 'commit' | 'revert' = 'commit') => {
    const segs = src ? clipAsrRef.current[src] : asrRef.current;
    const old = segs?.[index];
    if (!old) return;
    const nextSub = text?.trim() || undefined;
    if (nextSub === old.sub) return;
    const { sub: _drop, ...rest } = old;
    const nextSeg: AsrSegment = nextSub ? { ...rest, sub: nextSub } : rest;
    const next = segs.map((s, i) => (i === index ? nextSeg : s));
    if (src) {
      const m = { ...clipAsrRef.current, [src]: next };
      clipAsrRef.current = m;
      setClipAsr(m);
    } else {
      asrRef.current = next;
      setAsrSentences(next);
    }
    if (compRef.current.blocks.some(isSentenceCaption)) {
      setComp((cur) => ({ ...cur, blocks: relayCaptionLayer(cur.blocks, ensureShots(cur), asrRef.current) }));
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
      subFollows: !resolveCaptionStyle(comp).sub?.preset,
      bilingualOn: !!resolveCaptionStyle(comp).sub?.lang,
      onMainPatch: (patch: { scale?: number; color?: string | undefined; bg?: string | null | undefined }) => setCaptionStyle(patch),
      onSubPatch: (patch: { preset?: string | undefined; scale?: number; color?: string | undefined; bg?: string | null | undefined; lang?: string | undefined }) =>
        setCaptionStyle({ sub: { ...(resolveCaptionStyle(compRef.current).sub ?? {}), ...patch } }),
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
    onRetranslateLine: (src: string | null, index: number) => void retranslateCaptionLine(src, index),
    lineBusyKey: captionLineBusyKey,
    onExtract: () => void extractCaptionsNow(),
    translation: studioProviders().translate
      ? {
          done: (asrSentences ?? []).filter((x) => x.sub).length + Object.values(clipAsr).flat().filter((x) => x.sub).length,
          total: (asrSentences ?? []).length + Object.values(clipAsr).flat().length,
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
    const has = compRef.current.blocks.some(isSentenceCaption);
    if (!compRef.current.video) {
      toast.error(t('workbench.uploadVideoBeforeApplying'));
      return;
    }
    if (captionGenBusyRef.current) return;
    captionGenBusyRef.current = true;
    setCapGenBusy(true);
    try {
      // Run ASR if there's no transcript (fileSig cache hit = instant) — **never** skip re-laying because "captions already exist":
      // old blocks may predate a segmentation-algorithm change, and without re-laying, segmentation never takes effect (hit this:
      // after loading a draft the transcript state was empty, took the "style-only" degrade path, and no matter how the user clicked they saw no segmentation)
      let segs = asrRef.current;
      if (!segs?.length) {
        toast.info(t('workbench.extractingTranscript'));
        segs = await stepAsr();
      }
      const caps = captionBlocksFromAsr(mappedCaptionSegs(ensureShots(compRef.current), segs ?? []));
      if (!caps.length) {
        toast.error(t('workbench.transcriptEmptyGenerateCaptions'));
        return;
      }
      pushUndoSnapshot();
      // Preset switch = a complete look: clear the per-line color/bg overrides (kept overrides would tint the new preset)
      setComp((c) => {
        const { color: _oc, bg: _ob, ...rest } = resolveCaptionStyle(c);
        return { ...c, blocks: [...c.blocks.filter((b) => !isSentenceCaption(b)), ...caps], captionStyle: { ...rest, preset } };
      });
      // Let the user see the result immediately (same value as "select means visible"): if the playhead isn't in any
      // caption window, move it to the first caption — otherwise nothing on screen moves after laying and it feels like "clicked but no effect" (user reported)
      if (!playingRef.current && caps.length) {
        const t = tRef.current;
        const within = caps.some((b) => t >= b.startSec && t < b.startSec + b.durationSec);
        if (!within) applyT(caps[0]!.startSec + Math.min(0.3, caps[0]!.durationSec / 2));
      }
      toast.success(has ? t('workbench.reLaidCaptionsFrom') : t('workbench.laidNCaptionsFrom', { n: caps.length }));
    } catch (e) {
      console.warn('[studio] apply caption preset failed', e);
      setCaptionStyle({ preset }); // on transcription failure, at least swap the style
      toast.error(t('workbench.transcriptExtractionFailedStyle'));
    } finally {
      captionGenBusyRef.current = false;
      setCapGenBusy(false);
    }
  };
  /** Captions panel "remove"/switch-off: drop the sentence-level caption layer. captionStyle is KEPT —
   *  it is state (preset/positions/translation language) and the on/off toggle must round-trip it intact
   *  (wiping it here orphaned the transcript translations from their language state). */
  const removeCaptionLayer = () => {
    const ids = compRef.current.blocks.filter(isSentenceCaption).map((b) => b.id);
    if (!ids.length) return;
    pushUndoSnapshot();
    ids.forEach((id) => postPreview({ type: 'hf:remove', id }));
    setComp((c) => ({ ...c, blocks: c.blocks.filter((b) => !isSentenceCaption(b)) }));
    setSelectedIdRaw((s) => (s && ids.includes(s) ? null : s));
    setSelectedBlockIds((cur) => {
      const n = new Set([...cur].filter((x) => !ids.includes(x)));
      return n.size === cur.size ? cur : n;
    });
    toast.success(t('workbench.removedCaptions'));
  };
  const captionLineRows = useMemo<CaptionLineRow[]>(() => {
    // NOTE deliberately not gated on comp.video: transcript + shots are cloud-backed — caption editing
    // must keep working in the missing-media state (browser switch / cleared storage).
    const rows: CaptionLineRow[] = [];
    const seen = new Set<string>();
    for (const sp of clipSpans(ensureShots(comp))) {
      const shot = sp.clip as VideoShot;
      const src = shot.src ?? null;
      const segs = src ? (clipAsr[src] ?? []) : (asrSentences ?? []);
      segs.forEach((seg, i) => {
        if (seg.end <= shot.srcStart + 0.05 || seg.start >= shot.srcEnd - 0.05) return;
        const key = `${src ?? 'main'}:${i}`;
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({
          key, src, index: i, text: seg.text, sub: seg.sub,
          editedStart: sp.editedStart + Math.max(0, seg.start - shot.srcStart),
          dur: Math.max(0.1, Math.min(seg.end, shot.srcEnd) - Math.max(seg.start, shot.srcStart)),
        });
      });
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp.shots, asrSentences, clipAsr]);
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
      const main = asrRef.current ?? [];
      const out = await tr(main.map((x, i) => ({ index: i, text: x.text })), target);
      if (out.length) await runTool('set_caption_translations', { items: out });
      for (const [src, segs] of Object.entries(clipAsrRef.current)) {
        if (!segs.length) continue;
        const shot = (compRef.current.shots ?? []).find((sh) => sh.src === src);
        if (!shot) continue;
        const co = await tr(segs.map((x, i) => ({ index: i, text: x.text })), target);
        if (co.length) await runTool('set_caption_translations', { shotId: shot.id, items: co });
      }
      // Remember the target language: panel chip selected state + new inserted clips auto-translated to the same language
      setCaptionStyle({ sub: { ...(resolveCaptionStyle(compRef.current).sub ?? {}), lang: target } });
      toast.success(t('workbench.generatedLangTranslations', { lang: target }) + (compRef.current.blocks.some(isSentenceCaption) ? '' : t('workbench.enableCaptionsShowThem')));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('workbench.translationFailedTryAgain'));
    } finally {
      setCapTransBusy(false);
    }
  };
  return { setCaptionStyle, mappedCaptionSegs, relayCaptionLayer, captionLineRows, captionsPanelProps, applyCaptionPreset, removeCaptionLayer };
}
