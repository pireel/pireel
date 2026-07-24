'use client';

/**
 * Agent-facing context builders: @-mentionable element roster, per-message situation snapshot,
 * machine-facing transcript, on-demand insert-source transcription, draft-context backfill for
 * re-layout (design state + inserted clips + per-scene placeholders), narration beats and the
 * graphics roster for anti-monotony. Extracted from hyperframes-workbench.tsx — bodies verbatim.
 */

import { type MutableRefObject, useCallback, useMemo } from 'react';
import { toast } from '@pireel/ui/toast';
import {
  type Block,
  type Composition,
  type VideoShot,
  blockKind,
  isSentenceCaption,
  resolveCaptionStyle,
  totalDuration,
} from '@pireel/studio-engine/composition';
import { spans as clipSpans } from '@pireel/studio-engine/trim';
import { type Box as GraphicBox, dropPlaceholdersInWindows, insertedClipPlaceholder, isPlaceholder, layoutInsertWindow, pickGraphicBox, placeholderSpec } from '@pireel/studio-engine/build-draft';
import { beatsForWindow as beatsForWindowPure, insertPlanContexts } from '@pireel/studio-engine/captions-relay';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import type { DraftPlan, PlanInsert } from '@pireel/studio-engine/plan';
import { studioProviders } from '@pireel/studio-engine/providers';
import { type VisualTimeline, insertedClipSafeZone } from './visual';
import type { StudioElementRef } from './studio-chat';
import { t } from './i18n';

export interface AgentContextDeps {
  comp: Composition;
  compRef: MutableRefObject<Composition>;
  selectedIdRef: MutableRefObject<string | null>;
  selectedShotIdRef: MutableRefObject<string | null>;
  tRef: MutableRefObject<number>;
  asrRef: MutableRefObject<AsrSegment[] | null>;
  planRef: MutableRefObject<DraftPlan | null>;
  visualRef: MutableRefObject<VisualTimeline | null>;
  videoSigRef: MutableRefObject<string | null>;
  videoFileRef: MutableRefObject<File | null>;
  clipAsrRef: MutableRefObject<Record<string, AsrSegment[]>>;
  clipFilesRef: MutableRefObject<Map<string, File>>;
  clipAsrBusyRef: MutableRefObject<Set<string>>;
  clipAsrFailRef: MutableRefObject<Set<string>>;
  insertedClipsForPlanRef: MutableRefObject<() => Promise<PlanInsert[]>>;
  setClipAsr: (fn: (m: Record<string, AsrSegment[]>) => Record<string, AsrSegment[]>) => void;
  matteFileForShot: (s: VideoShot) => Promise<{ key: string; file: File; upTo: number } | null>;
}

export function useAgentContext(deps: AgentContextDeps) {
  const {
    comp, compRef, selectedIdRef, selectedShotIdRef, tRef, asrRef, planRef, visualRef, videoSigRef,
    videoFileRef, clipAsrRef, clipFilesRef, clipAsrBusyRef, clipAsrFailRef, insertedClipsForPlanRef,
    setClipAsr, matteFileForShot,
  } = deps;
  /* ---------- chat agent: can @ components + request context + client-executed tools ---------- */
  // Memo by **content key** (not array identity): box drag etc. changes the blocks array identity every frame but id/label/kind
  // don't change — keeping elements identity stable so the memoized StudioChat doesn't re-render every frame.
  const chatElemsKey = [
    comp.blocks.map((b) => `${b.id}${b.templateId}${b.label ?? ''}`).join(''),
    (comp.shots ?? []).map((s) => s.id).join(''),
  ].join('');
  const chatElements = useMemo<StudioElementRef[]>(
    () => [
      ...compRef.current.blocks.map((b) => ({ id: b.id, label: b.label?.slice(0, 16) || blockKind(b), kind: blockKind(b), isShot: false })),
      ...(compRef.current.shots ?? []).map((s, i) => ({ id: s.id, label: t('workbench.shotN', { n: i + 1 }), kind: 'shot', isShot: true })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatElemsKey],
  );

  /** The situation at the moment a chat message is sent (composition snapshot / selection / playhead / pipeline; attached
   *  as message metadata). The narration script isn't here — it's anchored to source time and doesn't change with editing,
   *  so it enters the feed once via the extract_asr receipt / read_script, no need to resend each round (prompt-cache friendly). */
  const getChatBody = useCallback((): Record<string, unknown> => {
    const c = compRef.current;
    let sel: { id: string; type: 'block' | 'shot'; label?: string; kind?: string } | null = null;
    if (selectedIdRef.current) {
      const b = c.blocks.find((x) => x.id === selectedIdRef.current);
      if (b) sel = { id: b.id, type: 'block', label: b.label, kind: blockKind(b) };
    } else if (selectedShotIdRef.current) {
      const i = (c.shots ?? []).findIndex((s) => s.id === selectedShotIdRef.current);
      if (i >= 0) sel = { id: selectedShotIdRef.current, type: 'shot', label: `Shot #${i + 1}`, kind: 'shot' };
    }
    return {
      composition: {
        durationSec: totalDuration(c),
        theme: c.theme,
        // Caption layer state (on/off + current preset/position): lets the agent decide set vs remove, and avoid re-enabling
        ...(c.blocks.some(isSentenceCaption)
          ? (() => {
              const cs = resolveCaptionStyle(c);
              return { captions: { preset: cs.preset, yPct: Math.round(cs.yPct) } };
            })()
          : {}),
        blocks: c.blocks.map((b) => ({
          id: b.id,
          label: b.label,
          kind: blockKind(b),
          startSec: b.startSec,
          durationSec: b.durationSec,
          ...(isPlaceholder(b) ? { placeholder: true } : {}),
        })),
        // Each shot carries its final-cut span (the addressing clock for cut_range/split/trim/add_block) + an insert-source short tag
        // (same insert source = same letter, so two different external clips are distinguishable; the main source isn't tagged) — fixes "the agent cuts using source seconds as if they were final-cut seconds"
        shots: (() => {
          const tag = new Map<string, string>();
          for (const s of c.shots ?? []) if (s.src && !tag.has(s.src)) tag.set(s.src, String.fromCharCode(65 + tag.size));
          return clipSpans(c.shots ?? []).map((sp, i) => ({
            id: sp.clip.id,
            index: i + 1,
            editedStart: sp.editedStart,
            editedEnd: sp.editedEnd,
            srcStart: sp.clip.srcStart,
            srcEnd: sp.clip.srcEnd,
            treatment: sp.clip.treatment,
            ...(sp.clip.src ? { source: tag.get(sp.clip.src) } : {}),
          }));
        })(),
      },
      selected: sel,
      playheadSec: tRef.current,
      // Pipeline state: so the agent doesn't blindly rerun, nor claim a transcript that doesn't exist
      pipeline: { asr: !!asrRef.current?.length, plan: !!planRef.current, visual: !!visualRef.current },
      // Main-video byte-mount state: the project should have a video (has shots / has sig) but bytes aren't ready → tell the agent explicitly
      // (a handoff-just-opened tab is often in the OPFS miss → cloud fetch window; the data plane is complete)
      ...((videoSigRef.current || (c.shots ?? []).length) && !videoFileRef.current ? { videoBytesReady: false } : {}),
    };
  }, []);

  /** Narration script → text fed to the agent: all main-source sentences + one section per insert source (each in its own
   *  source-file seconds, annotated with the owning shot id). Machine-facing English; shared by the extract_asr receipt and read_script. */
  const transcriptForAgent = (): string => {
    const rd = (x: number) => Math.round(x * 10) / 10;
    const row = (s: AsrSegment, i: number) => `  ${i}. [${rd(s.start)}–${rd(s.end)}s] ${s.text}`;
    const parts: string[] = [];
    const main = asrRef.current ?? [];
    parts.push(`MAIN NARRATION (source-video seconds — never shift when the video is cut; shot src in→out uses the same clock):\n${main.map(row).join('\n')}`);
    const bySrc = new Map<string, string[]>();
    for (const s of compRef.current.shots ?? []) {
      if (!s.src) continue;
      bySrc.set(s.src, [...(bySrc.get(s.src) ?? []), s.id]);
    }
    for (const [src, ids] of bySrc) {
      const segs = clipAsrRef.current[src];
      const head = `INSERTED CLIP for shot(s) ${ids.map((x) => `@${x}`).join(', ')} (its OWN source seconds; does not map to the narration clock)`;
      if (!segs) parts.push(`${head}: (no transcript — transcription unavailable for this clip)`);
      else if (!segs.length) parts.push(`${head}: (no speech detected)`);
      else parts.push(`${head}:\n${segs.map(row).join('\n')}`);
    }
    const out = parts.join('\n');
    return out.length > 4000 ? `${out.slice(0, 4000)}\n…(truncated)` : out;
  };
  /** Fill in insert-source transcripts (triggered on demand by read_script — policy: when captions are off, only transcribe when the LLM needs it).
   *  Shares the busy/fail lists with the panel transcription effect: failures don't re-burn ASR, in-flight ones are awaited. */
  const ensureClipTranscripts = async (): Promise<void> => {
    // Blacklist + tell the user (reported once per src: after blacklisting, the top continue won't reach here again) —
    // with only a console.warn the user has no idea why an inserted clip has no captions
    const failClipAsr = (src: string) => {
      if (clipAsrFailRef.current.has(src)) return;
      clipAsrFailRef.current.add(src);
      toast.error(t('workbench.bRollTranscriptionFailed'));
    };
    const srcs = [...new Set((compRef.current.shots ?? []).filter((s) => s.src).map((s) => s.src!))];
    for (const src of srcs) {
      if (clipAsrRef.current[src] || clipAsrFailRef.current.has(src)) continue;
      if (clipAsrBusyRef.current.has(src)) {
        const t0 = Date.now();
        while (clipAsrBusyRef.current.has(src) && Date.now() - t0 < 45000) await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      clipAsrBusyRef.current.add(src);
      try {
        const shot = (compRef.current.shots ?? []).find((s) => s.src === src)!;
        const got = await matteFileForShot(shot);
        if (!got) {
          failClipAsr(src);
          continue;
        }
        const segs = await studioProviders().transcriber.transcribe(got.file);
        setClipAsr((m) => ({ ...m, [src]: segs }));
        clipAsrRef.current = { ...clipAsrRef.current, [src]: segs };
      } catch (e) {
        console.warn('[studio] clip transcribe failed', e);
        failClipAsr(src);
      } finally {
        clipAsrBusyRef.current.delete(src);
      }
    }
  };

  // Inserted clip → planning context: anchor = the srcEnd of the nearest preceding main-source segment (main-source time domain, the plan's clock);
  // text = the transcribed sentences within that insert window (the two split halves of the same source share the whole transcript, filtered by window)
  insertedClipsForPlanRef.current = async () => {
    const shots = compRef.current.shots ?? [];
    if (!shots.some((s) => s.src)) return [];
    await ensureClipTranscripts(); // transcribe on demand (busy/fail lists handled internally, no re-burning ASR)
    // Pure function in captions-relay (same as the offline executor): carrying sentences = the input surface for equal-standing shots
    return insertPlanContexts(shots, clipAsrRef.current);
  };

  /** Context backfill for the shot draft (shared by lay_out and add_graphics's "shots first" to prevent drift between the two):
   *  1) design state preserved across rebuilds: frame (the user's explicit design system) > frame-derived palette; global caption style;
   *  2) multi-source main track: inserted clips are the body of the video and must not be overwritten by re-layout — insert them
   *     back at the nearest boundary at their original final-cut position, blocks after shift along (same mirror logic as manual
   *     insert), each insert window lands its image placeholder per **its own narration** (equal-standing, per user; main-source
   *     placeholders that slide into the window are dropped to avoid mismatched briefs); placeholder positions use the inserted
   *     clip's own geometry analysis (local File + MediaPipe, avoiding faces), falling back to a fixed box on unavailable/failure. */
  const restoreDraftContext = async (draft: Composition, vis: VisualTimeline | null): Promise<Composition> => {
    const keep = compRef.current;
    if (keep.frameId) {
      draft.frameId = keep.frameId;
      if (keep.palette) draft.palette = keep.palette;
    } else if (vis?.palette) {
      draft.palette = vis.palette;
    }
    if (keep.captionStyle) draft.captionStyle = keep.captionStyle;
    const inserted = clipSpans(keep.shots ?? []).filter((sp) => sp.clip.src);
    if (inserted.length && draft.shots?.length) {
      // The transcript cache may be cold (a plan cache hit doesn't trigger insert-source transcription) — fill it before inserting back,
      // otherwise speech is empty and the inserted clip can't land its own image placeholder
      await ensureClipTranscripts();
      let shots2 = draft.shots;
      let blocks2 = draft.blocks;
      const planCtx = insertPlanContexts(keep.shots ?? [], clipAsrRef.current); // same enumeration as the planning input (clip index = subscript + 1)
      const extraBlocks: Block[] = []; // per-scene placeholders produced by equal-standing shots
      const insertWins: { start: number; end: number; speech: string; planned?: boolean; layout?: { box: GraphicBox; hasFace: boolean } }[] = [];
      for (const [k, sp] of inserted.entries()) {
        const bounds = [0, ...clipSpans(shots2).map((x) => x.editedEnd)];
        let idx = 0;
        let at = 0;
        let best = Infinity;
        bounds.forEach((b, i) => {
          const d = Math.abs(b - sp.editedStart);
          if (d < best) {
            best = d;
            at = b;
            idx = i;
          }
        });
        const len = sp.editedEnd - sp.editedStart;
        shots2 = [...shots2.slice(0, idx), sp.clip, ...shots2.slice(idx)];
        blocks2 = blocks2.map((b) => (b.startSec >= at - 1e-3 ? { ...b, startSec: b.startSec + len } : b));
        const speech = (clipAsrRef.current[sp.clip.src!] ?? [])
          .filter((x) => x.end > sp.clip.srcStart + 0.05 && x.start < sp.clip.srcEnd - 0.05)
          .map((x) => x.text)
          .join('');
        // Inserted-clip geometry position (P1④ multi-source equal-standing): only run if there's a local File (a few frames of
        // MediaPipe, free and fast; remote/dead links aren't fetched, just fall back). Failure / no MediaPipe → undefined = always the fallback box, never breaks the shot chain.
        let layout: { box: GraphicBox; hasFace: boolean } | undefined;
        try {
          const f = sp.clip.src ? clipFilesRef.current.get(sp.clip.src) : undefined;
          if (f) {
            const zone = await insertedClipSafeZone(f, sp.clip.srcStart, sp.clip.srcEnd);
            if (zone) layout = { box: pickGraphicBox(zone.rects, zone.face ? [zone.face] : []), hasFace: !!zone.face };
          }
        } catch {
          /* geometry analysis failed → fall back to the status quo (FULL_GRAPHIC_BOX) */
        }
        // Equal-standing shots: the plan gave this inserted clip its own scenes (clip index = enumeration subscript + 1) → slice
        // shots + framing + per-scene placeholders; if it doesn't line up (no plan / no sentences / can't slice) fall back to the whole-clip single-beat old path
        const planned = planRef.current?.inserts?.find((x) => x.clip === k + 1);
        const sentences = planCtx[k]?.sentences;
        let sliced: { shots: VideoShot[]; blocks: Block[] } | null = null;
        if (planned?.scenes.length && sentences?.length) {
          sliced = layoutInsertWindow({ win: { start: at, end: at + len }, clip: sp.clip, sentences, scenes: planned.scenes, layout });
        }
        if (sliced) {
          shots2 = [...shots2.slice(0, idx), ...sliced.shots, ...shots2.slice(idx + 1)]; // replace the whole clip just inserted
          extraBlocks.push(...sliced.blocks);
        }
        insertWins.push({ start: at, end: at + len, speech, ...(sliced ? { planned: true } : {}), ...(layout ? { layout } : {}) });
      }
      draft.shots = shots2;
      const insertPh = insertWins.filter((w) => !w.planned).map((w) => insertedClipPlaceholder(w, w.speech, w.layout)).filter((b): b is Block => !!b);
      draft.blocks = [...dropPlaceholdersInWindows(blocks2, insertWins), ...insertPh, ...extraBlocks];
    }
    return draft;
  };

  /** Narration beats within a placeholder/component window (pure function in captions-relay, used on both ends), thin wrapper feeding refs. */
  const beatsForWindow = (startSec: number, durationSec: number): { text: string; start: number; end: number }[] =>
    beatsForWindowPure(compRef.current.shots ?? [], asrRef.current, clipAsrRef.current, startSec, durationSec);
  /** Roster of graphic slots in the same video (placeholders + filled custom, in time order) — fed to compose for anti-monotony. */
  const graphicsRoster = (): { id: string; desc: string }[] => {
    const describeSlot = (b: Block) => {
      const comp = /component: ([a-z-]+)/.exec(placeholderSpec(b))?.[1];
      return `${comp ? `[${comp}] ` : ''}${b.label ?? ''}`.trim() || '(fragment)';
    };
    return compRef.current.blocks
      .filter((b) => isPlaceholder(b) || b.templateId === 'custom')
      .sort((a, b) => a.startSec - b.startSec)
      .map((b, i) => ({ id: b.id, desc: `${i + 1}. ${describeSlot(b)}` }));
  };
  /** roster → neighbor list from a block's perspective (self marked «THIS»); a single block has no neighbors. */
  const neighborsFrom = (roster: { id: string; desc: string }[], selfId: string): string[] | undefined =>
    roster.length > 1 ? roster.map((r) => (r.id === selfId ? `${r.desc}  «THIS»` : r.desc)) : undefined;
  return { chatElements, getChatBody, transcriptForAgent, ensureClipTranscripts, restoreDraftContext, beatsForWindow, graphicsRoster, neighborsFrom };
}
