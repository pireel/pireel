'use client';

/**
 * Agent-facing context builders: @-mentionable element roster, per-message situation snapshot,
 * machine-facing transcript, on-demand insert-source transcription, narration beats, and the
 * graphics roster for anti-monotony.
 */

import { type MutableRefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from '@pireel/ui/toast';
import {
  type Block,
  type Composition,
  type EditorDocumentV2,
  type VideoShot,
  audioClipWindow,
  blockKind,
  isCaptionsOn,
  isSentenceCaption,
  resolveCaptionStyle,
  primaryNarrativeAsset,
  totalDuration,
} from '@pireel/studio-engine/composition';
import { narrationRowMarks, spans as clipSpans } from '@pireel/studio-engine/trim';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { studioProviders } from '@pireel/studio-engine/providers';
import { wrapAgentTranscript } from '@pireel/studio-engine/prompts';
import type { VisualTimeline } from './visual';
import type { StudioElementRef } from './studio-chat';
import { agentElementRosterKey, buildAgentElementRoster } from './agent-element-roster';
import { blockDisplayTitle } from './block-display-title';
import { t } from './i18n';

export interface AgentContextDeps {
  comp: Composition;
  compRef: MutableRefObject<Composition>;
  documentRef: MutableRefObject<EditorDocumentV2>;
  selectedIdRef: MutableRefObject<string | null>;
  selectedShotIdRef: MutableRefObject<string | null>;
  tRef: MutableRefObject<number>;
  asrRef: MutableRefObject<AsrSegment[] | null>;
  visualRef: MutableRefObject<VisualTimeline | null>;
  videoSigRef: MutableRefObject<string | null>;
  videoFileRef: MutableRefObject<File | null>;
  clipAsrRef: MutableRefObject<Record<string, AsrSegment[]>>;
  clipAsrBusyRef: MutableRefObject<Set<string>>;
  clipAsrFailRef: MutableRefObject<Set<string>>;
  setClipAsr: (fn: (m: Record<string, AsrSegment[]>) => Record<string, AsrSegment[]>) => void;
  matteFileForShot: (s: VideoShot) => Promise<{ key: string; file: File; upTo: number } | null>;
  getActiveOutput: () => { id: string; title: string; position: number; total: number };
}

export function useAgentContext(deps: AgentContextDeps) {
  const {
    comp, compRef, documentRef, selectedIdRef, selectedShotIdRef, tRef, asrRef, visualRef, videoSigRef,
    videoFileRef, clipAsrRef, clipAsrBusyRef, clipAsrFailRef,
    setClipAsr, matteFileForShot, getActiveOutput,
  } = deps;
  /* ---------- chat agent: can @ components + request context + client-executed tools ---------- */
  // Memo by **content key** (not array identity): box drag etc. changes the blocks array identity every frame but id/label/kind
  // don't change — keeping elements identity stable so the memoized StudioChat doesn't re-render every frame.
  const chatElemsKey = agentElementRosterKey(comp.blocks, comp.shots ?? []);
  const chatElements = useMemo<StudioElementRef[]>(
    () => buildAgentElementRoster(compRef.current.blocks, compRef.current.shots ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatElemsKey],
  );

  // Credits affordability (boolean only — the snapshot never carries balance numbers): fetched on mount,
  // refreshed every 5 min while the tab is visible. Fetch failure / no backend (OSS shell) → stays null → line omitted.
  const canGenerateRef = useRef<boolean | null>(null);
  useEffect(() => {
    let gone = false;
    const refresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fetch('/api/me/balance')
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { balance?: number } | null) => {
          if (!gone && j && typeof j.balance === 'number') canGenerateRef.current = j.balance > 0;
        })
        .catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, 300_000);
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, []);

  /** The situation at the moment a chat message is sent (composition snapshot / selection / playhead / pipeline; attached
   *  as message metadata). The narration script isn't here — it's anchored to source time and doesn't change with editing,
   *  so it enters the feed once via the extract_asr receipt / read_script, no need to resend each round (prompt-cache friendly). */
  const getChatBody = useCallback((): Record<string, unknown> => {
    const c = compRef.current;
    const document = documentRef.current;
    const directorPlan = document.semantics.directorPlan;
    let sel: { id: string; type: 'block' | 'shot'; label?: string; kind?: string } | null = null;
    if (selectedIdRef.current) {
      const b = c.blocks.find((x) => x.id === selectedIdRef.current);
      if (b) sel = { id: b.id, type: 'block', label: blockDisplayTitle(b), kind: blockKind(b) };
    } else if (selectedShotIdRef.current) {
      const i = (c.shots ?? []).findIndex((s) => s.id === selectedShotIdRef.current);
      if (i >= 0) sel = { id: selectedShotIdRef.current, type: 'shot', label: `Shot #${i + 1}`, kind: 'shot' };
    }
    return {
      output: getActiveOutput(),
      composition: {
        durationSec: totalDuration(c),
        width: c.width,
        height: c.height,
        theme: c.theme,
        // Caption layer state (on/off + current preset/position): lets the agent decide set vs remove, and avoid re-enabling
        ...(isCaptionsOn(c)
          ? (() => {
              const cs = resolveCaptionStyle(c);
              return { captions: { preset: cs.preset, yPct: Math.round(cs.yPct) } };
            })()
          : {}),
        ...(c.audioTracks?.length
        ? {
            audio: c.audioTracks.map((a) => {
              const w = audioClipWindow(a, totalDuration(c)); // agents need the span, not just where it starts — "does the bed outrun the video" is unanswerable from startSec alone
              return { id: a.id, label: a.label, startSec: w.start, endSec: w.end, volumeDb: a.volumeDb, speed: a.speed, muted: a.muted };
            }),
          }
        : {}),
        ...(c.audioDenoise ? { denoise: { strength: c.audioDenoise.strength } } : {}),
        // Sentence captions are a derived rendering of one logical caption layer. The layer state
        // above is the useful context; enumerating every cue bloats and destabilizes every turn.
        blocks: c.blocks.filter((b) => !isSentenceCaption(b)).map((b) => ({
          id: b.id,
          label: blockDisplayTitle(b),
          kind: blockKind(b),
          startSec: b.startSec,
          durationSec: b.durationSec,
          ...(b.box ? { box: b.box } : {}),
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
            ...(sp.clip.treatSize != null ? { size: sp.clip.treatSize } : {}),
            ...(sp.clip.treatCrop != null ? { crop: sp.clip.treatCrop } : {}),
            ...(sp.clip.preciseFraming ? { ...sp.clip.preciseFraming } : {}),
            ...(sp.clip.src ? { source: tag.get(sp.clip.src) } : {}),
            ...(sp.clip.audioMuted ? { audioMuted: true } : sp.clip.volumeDb != null ? { volumeDb: sp.clip.volumeDb } : {}),
          }));
        })(),
      },
      selected: sel,
      playheadSec: tRef.current,
      // Pipeline state: so the agent doesn't blindly rerun, nor claim a transcript that doesn't exist
      pipeline: {
        asr: !!asrRef.current?.length,
        plan: !!directorPlan || document.semantics.plan !== undefined,
        visual: !!visualRef.current,
      },
      ...(directorPlan
        ? {
            directorPlan: {
              goal: directorPlan.goal,
              creativeThesis: directorPlan.creativeThesis,
              ...(directorPlan.audience ? { audience: directorPlan.audience } : {}),
              scenes: directorPlan.scenes.map((scene) => {
                const semanticScene = document.semantics.scenes.find((candidate) => candidate.id === scene.id);
                return {
                  id: scene.id,
                  label: scene.label,
                  startSec: scene.startFrame / document.canvas.fps,
                  endSec: (scene.startFrame + scene.durationFrames) / document.canvas.fps,
                  viewerTask: scene.viewerTask,
                  narrativeRole: scene.narrativeRole,
                  sceneFamily: scene.sceneFamily,
                  ...(scene.customFamily ? { customFamily: scene.customFamily } : {}),
                  purpose: scene.purpose,
                  ...(scene.evidence?.length ? { evidence: scene.evidence } : {}),
                  ...(scene.visualTreatment ? { visualTreatment: scene.visualTreatment } : {}),
                  ...(scene.assetStrategy ? { assetStrategy: scene.assetStrategy } : {}),
                  ...(semanticScene?.clipIds.length ? { clipIds: semanticScene.clipIds } : {}),
                };
              }),
            },
          }
        : {}),
      // Main-video byte-mount state: the project should have a video (has shots / has sig) but bytes aren't ready → tell the agent explicitly
      // (a handoff-just-opened tab is often in the OPFS miss → cloud fetch window; the data plane is complete)
      ...((videoSigRef.current || (c.shots ?? []).length) && !videoFileRef.current ? { videoBytesReady: false } : {}),
      // Credits guardrail: boolean visibility only (never the balance number). null = unknown (no backend / fetch failed) → line omitted
      ...(canGenerateRef.current != null ? { canGenerate: canGenerateRef.current } : {}),
    };
  }, []);

  /** Narration script → text fed to the agent: all main-source sentences + one section per insert source (each in its own
   *  source-file seconds, annotated with the owning shot id). Machine-facing English; shared by the extract_asr receipt and read_script. */
  const transcriptForAgent = (): string => {
    const rd = (x: number) => Math.round(x * 10) / 10;
    const copy = (s: AsrSegment) => s.captionText && s.captionText !== s.text
      ? `${s.captionText} 〈ASR: ${s.text}〉`
      : s.text;
    const row = (s: AsrSegment, i: number) => `  ${i}. [${rd(s.start)}–${rd(s.end)}s] ${copy(s)}`;
    const parts: string[] = [];
    const main = asrRef.current ?? [];
    // Derived CURRENT truth, not the source table: rows carry their edit state (removed/partly cut,
    // dead-air notes with tightened status) so a post-cut re-read shows what the editor shows.
    const marks = narrationRowMarks(
      main,
      compRef.current.shots ?? [],
      (c: { src?: string }) => !c.src,
      primaryNarrativeAsset(documentRef.current)?.metadata.durationSec,
    );
    const mainRow = (s: AsrSegment, i: number) => `  ${i}. [${rd(s.start)}–${rd(s.end)}s] ${marks.rows[i]!.prefix}${copy(s)}${marks.rows[i]!.gapNote}`;
    const mainLines = [...(marks.head ? [`  ${marks.head}`] : []), ...main.map(mainRow), ...(marks.tail ? [`  ${marks.tail}`] : [])];
    parts.push(
      `MAIN NARRATION (source-video seconds — never shift when the video is cut; shot src in→out uses the same clock. Rows carry CURRENT edit state: [REMOVED]/[partly cut] content is already gone — don't re-cut it. Dead-air notes cover ALL kinds: "+Xs gap after" (between sentences), "Xs pause inside at a–bs" (mid-sentence stalls, with their exact source range) and "dead air at the head/tail" (the recording's pre/post-roll) — cut any of them with cut_narration exactly like gaps. Read dead air from these notes instead of computing it, and skip any note already marked CUT):\n${mainLines.join('\n')}`,
    );
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
    return wrapAgentTranscript(out);
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

  return { chatElements, getChatBody, transcriptForAgent, ensureClipTranscripts };
}
