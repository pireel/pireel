/**
 * Offline MCP executor — when the tab is closed, pure-data tools operate directly
 * on studio_projects' comp + context (asr/clipAsr/plan) server-side, so the
 * bridge's studio_not_open is no longer a dead end. Shares the SAME pure functions
 * with the browser's runStudioTool (trim/captions-relay/build-blocks/composition),
 * one semantics, no second implementation.
 *
 * Coverage = "editing an already-produced project": block add/delete/edit/move,
 * cutting, captions, BYO (compose_context/apply_block/plan_context/submit_plan),
 * read script, snapshot. Does NOT cover browser-only tools: extract_asr,
 * analyze_visual (video bytes not in the cloud), capture_frame, add_block/
 * edit_block/add_graphics (our own LLM generation, browser drives compose),
 * lay_out (needs restoreDraftContext's media restore), focus_element (pure UI state).
 * undo IS offline-capable, but lives in the ROUTE (it walks the cloud history ring —
 * DB territory, and this module stays pure).
 *
 * Pure-module discipline: zero react/browser/DB deps — loading/persistence is the
 * route's job; this just takes data and returns data, directly pinnable by vitest.
 */

import { interpretApplyRaw } from './briefs';
import {
  type Block,
  type Composition,
  type EditorDocumentV2,
  type CutTransitionEffect,
  type ShotFilter,
  type TransitionDirection,
  type TimelineSiblingLayers,
  type VideoShot,
  type NarrativeClipPatchUpdate,
  CAPTION_PRESETS,
  DIRECTIONAL_TRANSITIONS,
  MAX_TRANSITION_SEC,
  VOLUME_DB_MAX,
  VOLUME_DB_MIN,
  applyBlockPlacement,
  applyCanvasDocumentEdit,
  applyCompositionLayout,
  applyNarrationDocumentEdit,
  applyOverlayDocumentEdits,
  applyNarrationSplitCommands,
  applyShotFramingInput,
  placementFramingNotes,
  narrationSourceSplitsAtEditedPoints,
  normalizeProjectDocument,
  projectDocumentToLegacyComposition,
  removeNarrationClipsWithoutRipple,
  removeOverlayDocumentClips,
  audioClipId,
  audioClipWindow,
  audioTrimPatch,
  patchAudioClip,
  patchNarrativeClips,
  patchShotAudio,
  splitAudioClipAt,
  blockId,
  blockKind,
  compReceiptDelta,
  canvasSizeFromInput,
  freeTrack,
  freezeBlockVars,
  getCaptionPreset,
  isCaptionsOn,
  isSentenceCaption,
  renderBlock,
  resolveCaptionStyle,
  rippleRemoveSiblingLayers,
  stripDerivedCaptions,
  zoneOf,
  shotFilterCss,
  shotId,
  splitShotsAtEditedPoints,
  syncFrozenBlockVars,
  patchShotFraming,
  totalDuration,
  validateComposition,
  validateEditorDocumentV2,
} from './composition';
import { parseBlockResponse } from './compose';
import { HARD_LINT_CODES, lintBlock } from './block-lint';
import { type DraftPlan, parsePlan, unifiedPlanRows } from './plan';
import { buildSituation, wrapSpokenTranscript } from './prompts';
import type { StudioProjectContext, TranscriptSegment } from './project-dto';
import { type CutSeamEntry, deleteClipById, finalizeCutSeams, narrationRowMarks, removeEditedRange, spans as clipSpans, srcToEditedLoose, tightenCutRanges, trimLeftAtEdited, trimRightAtEdited } from './trim';
import { type AsrSegment, applyCaptionTranslations, clearCaptionTranslations, desegmentCues } from './build-blocks';
import { beatsForWindow, displayCues, inNarrationSource, insertPlanContexts, relayCaptionLayer } from './captions-relay';
import { isPlaceholder, placeholderSpec } from './build-draft';
import { ensureTemplatesRegistered } from './templates';
import { listAddressedWords, resolveWordIds, wordRanges, wordRangesToEdited } from './transcript-address';

// Ensure the template registry is ready at module load. The MCP worker path
// doesn't go through UI mounting; this un-tree-shakeable call pulls templates.ts
// into the bundle and evaluates it at top level (else blockKind/renderBlock get an
// undefined template and crash).
ensureTemplatesRegistered();

export interface ServerToolProject {
  id: string;
  title: string;
  comp: Composition;
  /** Canonical authority when the caller has crossed the V2 persistence boundary. */
  document?: EditorDocumentV2;
  context: StudioProjectContext;
  videoDurationSec: number | null;
  /** Credits guardrail for the snapshot: hosted generation affordable? Boolean by design (never the balance
   *  number); route fills it for get_state from the billing store. Absent = line omitted. */
  canGenerate?: boolean;
}

/** Execution result: result goes back to MCP; comp/context present = a change happened, route persists it (version+1). */
export interface ServerToolOutcome {
  result: { ok: boolean; summary?: string; error?: string; data?: unknown; state?: string };
  comp?: Composition;
  document?: EditorDocumentV2;
  context?: StudioProjectContext;
}

/** The set of offline-executable tools (route uses this to decide between fallback and returning studio_not_open as-is). */
export const SERVER_EXECUTABLE_TOOLS: ReadonlySet<string> = new Set([
  'get_state',
  'read_script',
  'list_words',
  'get_block',
  'move_block',
  'resize_block',
  'place_block',
  'delete_block',
  'delete_blocks',
  'duplicate_block',
  'set_shot_treatment',
  'set_canvas',
  'set_shot_framing',
  'apply_layout',
  'set_video_filter',
  'set_shot_audio',
  'set_bgm',
  'split_shot',
  'trim_shot',
  'delete_shot',
  'cut_range',
  'cut_narration',
  'delete_words',
  'add_transition',
  'set_captions',
  'remove_captions',
  'set_caption_translations',
  'apply_block',
  'submit_plan',
  'plan_context',
  'compose_context',
]);

const TREATMENTS = new Set(['full', 'punch-in', 'corner-br', 'corner-tl', 'split-l', 'split-r', 'split-t', 'split-b']);
const r1 = (x: number) => Math.round(x * 10) / 10;

// desegmentCues here = the browser's on-load reverse migration (workbench applies it to asrRef): transcripts stored by
// the short-lived cue-split extraction scheme merge back to sentences, so offline read_script / cut ranges / captions
// see the SAME rows as the browser. Idempotent — sentence transcripts pass through by reference.
const asAsr = (segs: TranscriptSegment[] | undefined): AsrSegment[] => desegmentCues((segs ?? []) as AsrSegment[]);
const clipAsrOf = (ctx: StudioProjectContext): Record<string, AsrSegment[]> =>
  Object.fromEntries(Object.entries(ctx.clipAsr ?? {}).map(([k, v]) => [k, desegmentCues((v ?? []) as AsrSegment[])]));

/** Legacy shots fallback: only a missing `shots` field means "uncut whole clip". An explicit [] is
 *  an intentionally empty main track and must stay empty even while the imported source remains in
 *  the project media library. */
function shotsOf(p: ServerToolProject): VideoShot[] {
  if (p.comp.shots !== undefined) return p.comp.shots;
  const dur = p.comp.video?.durationSec ?? p.videoDurationSec ?? 0;
  return dur > 0 ? [{ id: shotId(), srcStart: 0, srcEnd: dur, treatment: 'full' }] : [];
}

type NativeNarrativePatchResult =
  | { document: EditorDocumentV2; comp: Composition }
  | { error: string; data?: unknown }
  | null;

function applyNativeNarrativePatches(
  p: ServerToolProject,
  updates: NarrativeClipPatchUpdate[],
): NativeNarrativePatchResult {
  if (!p.document) return null;
  const command = patchNarrativeClips(p.document, updates);
  if (!command.ok) {
    return {
      error: command.error.message,
      data: { code: command.error.code, trackIds: command.error.trackIds },
    };
  }
  return {
    document: command.document,
    comp: projectDocumentToLegacyComposition({ projectId: p.id, value: command.document }),
  };
}

/** Offline situation snapshot: same shape as the browser's getChatBody (shared buildSituation), prefixed with the offline notice. */
function offlineState(p: ServerToolProject): string {
  const c = p.comp;
  const tag = new Map<string, string>();
  for (const s of c.shots ?? []) if (s.src && !tag.has(s.src)) tag.set(s.src, String.fromCharCode(65 + tag.size));
  const cs = isCaptionsOn(c) ? resolveCaptionStyle(c) : null;
  const situation = buildSituation({
    composition: {
      durationSec: totalDuration(c),
      width: c.width,
      height: c.height,
      theme: c.theme,
      ...(cs ? { captions: { preset: cs.preset, yPct: Math.round(cs.yPct) } } : {}),
      ...(c.audioTracks?.length
        ? {
            audio: c.audioTracks.map((a) => {
              const w = audioClipWindow(a, totalDuration(c)); // agents need the span, not just where it starts — "does the bed outrun the video" is unanswerable from startSec alone
              return { id: a.id, label: a.label, startSec: w.start, endSec: w.end, volumeDb: a.volumeDb, speed: a.speed, muted: a.muted };
            }),
          }
        : {}),
      ...(c.audioDenoise ? { denoise: { strength: c.audioDenoise.strength } } : {}),
      blocks: c.blocks.map((b) => ({
        id: b.id,
        label: b.label,
        kind: blockKind(b),
        startSec: b.startSec,
        durationSec: b.durationSec,
        ...(isPlaceholder(b) ? { placeholder: true } : {}),
        ...(b.box ? { box: b.box } : {}),
      })),
      shots: clipSpans(c.shots ?? []).map((sp, i) => ({
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
      })),
    },
    pipeline: { asr: !!p.context.asr?.length, plan: !!p.context.plan, visual: false },
    ...(typeof p.canGenerate === 'boolean' ? { canGenerate: p.canGenerate } : {}),
  });
  return `<composition_state>\nOFFLINE MODE — the studio tab is NOT open. Operating directly on cloud project "${p.title}" (${p.id}). Video-dependent tools (extract_asr, analyze_visual, capture_frame, lay_out, visual_brief, export_video, Pireel-LLM generation) need the tab: open one yourself via create_browser_handoff {project_id:"${p.id}"} in your built-in browser (never the OS default browser), or ask the user to open the project.\n${situation}\n</composition_state>`;
}

/** Offline transcript (same format as the browser's transcriptForAgent). */
function offlineTranscript(p: ServerToolProject): string {
  const rd = (x: number) => Math.round(x * 10) / 10;
  const row = (s: TranscriptSegment, i: number) => `  ${i}. [${rd(s.start)}–${rd(s.end)}s] ${s.text}`;
  const parts: string[] = [];
  // Same derived-current-truth marks as the browser transcript — the two surfaces must tell one story
  const main = asAsr(p.context.asr);
  const marks = narrationRowMarks(main, p.comp.shots ?? [], (c: { src?: string }) => !c.src, p.comp.video?.durationSec ?? p.videoDurationSec ?? undefined);
  const mainRow = (s: TranscriptSegment, i: number) => `  ${i}. [${rd(s.start)}–${rd(s.end)}s] ${marks.rows[i]!.prefix}${s.text}${marks.rows[i]!.gapNote}`;
  const mainLines = [...(marks.head ? [`  ${marks.head}`] : []), ...main.map(mainRow), ...(marks.tail ? [`  ${marks.tail}`] : [])];
  parts.push(
    `MAIN NARRATION (source-video seconds — never shift when the video is cut; shot src in→out uses the same clock. Rows carry CURRENT edit state: [REMOVED]/[partly cut] content is already gone — don't re-cut it. Dead-air notes cover ALL kinds: "+Xs gap after" (between sentences), "Xs pause inside at a–bs" (mid-sentence stalls, with their exact source range) and "dead air at the head/tail" (the recording's pre/post-roll) — cut any of them with cut_narration exactly like gaps. Read dead air from these notes instead of computing it, and skip any note already marked CUT):\n${mainLines.join('\n')}`,
  );
  const bySrc = new Map<string, string[]>();
  for (const s of p.comp.shots ?? []) {
    if (!s.src) continue;
    bySrc.set(s.src, [...(bySrc.get(s.src) ?? []), s.id]);
  }
  const clipSegs = clipAsrOf(p.context);
  for (const [src, ids] of bySrc) {
    const segs = clipSegs[src];
    const head = `INSERTED CLIP for shot(s) ${ids.map((x) => `@${x}`).join(', ')} (its OWN source seconds)`;
    parts.push(segs?.length ? `${head}:\n${segs.map(row).join('\n')}` : `${head}: (no transcript stored)`);
  }
  const out = parts.join('\n');
  return wrapSpokenTranscript(out.length > 4000 ? `${out.slice(0, 4000)}\n…(truncated)` : out);
}

/** Execute one offline tool. Filter through SERVER_EXECUTABLE_TOOLS before calling. */
export function runServerTool(tool: string, input: Record<string, unknown>, p: ServerToolProject): ServerToolOutcome {
  const out = runServerToolInner(tool, input, p);
  // Insertion-time look freeze — the offline twin of the workbench setComp funnel (see freezeBlockVars):
  // blocks added or first touched here get the current effective tokens stamped on before persisting.
  if (out.comp && out.result.ok) {
    const next = freezeBlockVars(out.comp);
    const issues = validateComposition(next);
    if (issues.length) {
      return {
        result: {
          ok: false,
          error: 'mutation rejected: composition invariants failed',
          data: { issues },
        },
      };
    }
    out.comp = next;
    if (p.document) {
      if (out.document) {
        const projected = projectDocumentToLegacyComposition({ projectId: p.id, value: out.document });
        const frozenProjection = freezeBlockVars(projected);
        if (JSON.stringify(next) !== JSON.stringify(frozenProjection)) {
          return {
            result: {
              ok: false,
              error: 'mutation rejected: native document and compatibility result diverged',
            },
          };
        }
        out.document = syncFrozenBlockVars(out.document, next.blocks);
      } else {
        out.document = normalizeProjectDocument({
          projectId: p.id,
          value: next,
          context: out.context ?? p.context,
          videoDurationSec: p.videoDurationSec,
          previousDocument: p.document,
          previousProjection: p.comp,
        }).document;
      }
      const documentIssues = validateEditorDocumentV2(out.document).filter((issue) => issue.severity === 'error');
      if (documentIssues.length) {
        return {
          result: {
            ok: false,
            error: 'mutation rejected: editor document invariants failed',
            data: { issues: documentIssues },
          },
        };
      }
    }
    // Every successful composition mutation reports its actual compact diff, not just cutting tools.
    const delta = compReceiptDelta(p.comp, next);
    if (delta) out.result.data = { ...((out.result.data as Record<string, unknown> | undefined) ?? {}), delta };
  }
  return out;
}

function runServerToolInner(tool: string, input: Record<string, unknown>, p: ServerToolProject): ServerToolOutcome {
  const c = p.comp;
  const findBlock = (id: unknown) => c.blocks.find((b) => b.id === id);
  const bname = (b: Block) => b.label?.slice(0, 10) || blockKind(b);

  switch (tool) {
    case 'get_state':
      return { result: { ok: true, state: offlineState(p) } };
    case 'read_script': {
      if (!p.context.asr?.length) return { result: { ok: false, error: 'no transcript in the cloud project — open the studio tab and run extract_asr first' } };
      return { result: { ok: true, summary: 'Read transcript (cloud)', data: { transcript: offlineTranscript(p) } } };
    }
    case 'list_words': {
      if (!p.context.asr?.length) return { result: { ok: false, error: 'no transcript in the cloud project — run extract_asr in the studio first' } };
      const query = {
        ...(typeof input.shotId === 'string' ? { shotId: input.shotId } : {}),
        ...(Array.isArray(input.sentenceIndexes) ? { sentenceIndexes: input.sentenceIndexes.map(Number).filter(Number.isInteger) } : {}),
        ...(typeof input.fromSec === 'number' && Number.isFinite(input.fromSec) ? { fromSec: input.fromSec } : {}),
        ...(typeof input.toSec === 'number' && Number.isFinite(input.toSec) ? { toSec: input.toSec } : {}),
        ...(typeof input.offset === 'number' && Number.isInteger(input.offset) ? { offset: input.offset } : {}),
        ...(typeof input.limit === 'number' && Number.isInteger(input.limit) ? { limit: input.limit } : {}),
      };
      const listed = listAddressedWords(shotsOf(p), asAsr(p.context.asr), clipAsrOf(p.context), query);
      if ('error' in listed) return { result: { ok: false, error: listed.error } };
      return {
        result: {
          ok: true,
          summary: `Listed ${listed.words.length} transcript words`,
          data: listed,
        },
      };
    }
    case 'get_block': {
      const b = findBlock(input.blockId);
      if (!b) return { result: { ok: false, error: 'block not found' } };
      const r = renderBlock(b);
      return {
        result: {
          ok: true,
          summary: `"${bname(b)}"`,
          data: {
            id: b.id,
            kind: blockKind(b),
            label: b.label,
            startSec: b.startSec,
            durationSec: b.durationSec,
            trackIndex: b.trackIndex,
            box: b.box ?? null,
            innerHtml: r.innerHtml.slice(0, 4000),
            timelineBody: r.timelineBody.slice(0, 2000),
          },
        },
      };
    }
    case 'move_block': {
      const b = findBlock(input.blockId);
      if (!b) return { result: { ok: false, error: 'block not found' } };
      const s = Number(input.startSec);
      if (!Number.isFinite(s)) return { result: { ok: false, error: 'invalid startSec' } };
      const start = Math.max(0, Math.round(s * 100) / 100);
      if (p.document) {
        const edit = applyOverlayDocumentEdits({ document: p.document, updates: [{ clipId: b.id, startSec: start }] });
        if (!edit.ok) return { result: { ok: false, error: edit.error.message, data: { code: edit.error.code, trackIds: edit.error.trackIds } } };
        return {
          result: { ok: true, summary: `Moved "${bname(b)}" to ${r1(start)}s` },
          comp: projectDocumentToLegacyComposition({ projectId: p.id, value: edit.document }),
          document: edit.document,
        };
      }
      return {
        result: { ok: true, summary: `Moved "${bname(b)}" to ${r1(start)}s` },
        comp: { ...c, blocks: c.blocks.map((x) => (x.id === b.id ? { ...x, startSec: start } : x)) },
      };
    }
    case 'resize_block': {
      const b = findBlock(input.blockId);
      if (!b) return { result: { ok: false, error: 'block not found' } };
      const s = Number(input.startSec);
      const d = Number(input.durationSec);
      if (!Number.isFinite(s) || !Number.isFinite(d)) return { result: { ok: false, error: 'invalid startSec/durationSec' } };
      const start = Math.max(0, Math.round(s * 100) / 100);
      const dur = Math.max(0.3, Math.round(d * 100) / 100);
      if (p.document) {
        const edit = applyOverlayDocumentEdits({
          document: p.document,
          updates: [{ clipId: b.id, startSec: start, durationSec: dur }],
        });
        if (!edit.ok) return { result: { ok: false, error: edit.error.message, data: { code: edit.error.code, trackIds: edit.error.trackIds } } };
        return {
          result: { ok: true, summary: `Resized "${bname(b)}" to ${r1(start)}–${r1(start + dur)}s` },
          comp: projectDocumentToLegacyComposition({ projectId: p.id, value: edit.document }),
          document: edit.document,
        };
      }
      return {
        result: { ok: true, summary: `Resized "${bname(b)}" to ${r1(start)}–${r1(start + dur)}s` },
        comp: { ...c, blocks: c.blocks.map((x) => (x.id === b.id ? { ...x, startSec: start, durationSec: dur } : x)) },
      };
    }
    case 'place_block': {
      const b = findBlock(input.blockId);
      if (!b) return { result: { ok: false, error: 'block not found' } };
      if (isSentenceCaption(b)) return { result: { ok: false, error: 'sentence-caption layer — position it via set_captions yPct/scale' } };
      if (!b.box) return { result: { ok: false, error: 'this block has no screen box (full-canvas element) — cannot reposition' } };
      const next = applyBlockPlacement(b, input as Parameters<typeof applyBlockPlacement>[1]);
      if (!next) return { result: { ok: false, error: 'no position (anchor / xPct+yPct / dxPct+dyPct) or scale given' } };
      // Receipt hint, not a remap: when the block's window overlaps a corner/split span, say where
      // the video band is so the agent notices before parking a graphic on the speaker.
      const framing = placementFramingNotes(shotsOf(p), next.startSec, next.durationSec);
      if (p.document) {
        const edit = applyOverlayDocumentEdits({
          document: p.document,
          updates: [{ clipId: b.id, block: { box: next.box, contentBox: next.contentBox } }],
        });
        if (!edit.ok) return { result: { ok: false, error: edit.error.message, data: { code: edit.error.code, trackIds: edit.error.trackIds } } };
        return {
          result: { ok: true, summary: `Placed "${bname(b)}" at ${zoneOf(next.box!)}`, data: { box: next.box, ...(framing.length ? { hint: framing.join('; ') } : {}) } },
          comp: projectDocumentToLegacyComposition({ projectId: p.id, value: edit.document }),
          document: edit.document,
        };
      }
      return {
        result: { ok: true, summary: `Placed "${bname(b)}" at ${zoneOf(next.box!)}`, data: { box: next.box, ...(framing.length ? { hint: framing.join('; ') } : {}) } },
        comp: { ...c, blocks: c.blocks.map((x) => (x.id === b.id ? next : x)) },
      };
    }
    case 'delete_block': {
      const b = findBlock(input.blockId);
      if (!b) return { result: { ok: false, error: 'block not found' } };
      if (p.document) {
        const edit = removeOverlayDocumentClips({ document: p.document, clipIds: [b.id] });
        if (!edit.ok) return { result: { ok: false, error: edit.error.message, data: { code: edit.error.code, trackIds: edit.error.trackIds } } };
        return {
          result: { ok: true, summary: `Deleted "${bname(b)}"` },
          comp: projectDocumentToLegacyComposition({ projectId: p.id, value: edit.document }),
          document: edit.document,
        };
      }
      return { result: { ok: true, summary: `Deleted "${bname(b)}"` }, comp: { ...c, blocks: c.blocks.filter((x) => x.id !== b.id) } };
    }
    case 'delete_blocks': {
      const ids = Array.isArray(input.blockIds) ? new Set((input.blockIds as unknown[]).map(String)) : null;
      if (!ids?.size) return { result: { ok: false, error: 'missing blockIds' } };
      const hit = c.blocks.filter((b) => ids.has(b.id));
      if (!hit.length) return { result: { ok: false, error: 'blocks not found' } };
      if (p.document) {
        const edit = removeOverlayDocumentClips({ document: p.document, clipIds: hit.map((block) => block.id) });
        if (!edit.ok) return { result: { ok: false, error: edit.error.message, data: { code: edit.error.code, trackIds: edit.error.trackIds } } };
        return {
          result: { ok: true, summary: `Deleted ${hit.length} blocks` },
          comp: projectDocumentToLegacyComposition({ projectId: p.id, value: edit.document }),
          document: edit.document,
        };
      }
      return { result: { ok: true, summary: `Deleted ${hit.length} blocks` }, comp: { ...c, blocks: c.blocks.filter((b) => !ids.has(b.id)) } };
    }
    case 'duplicate_block': {
      const b = findBlock(input.blockId);
      if (!b) return { result: { ok: false, error: 'block not found' } };
      const at = typeof input.atSec === 'number' ? Math.max(0, input.atSec) : b.startSec + b.durationSec;
      const nb: Block = { ...b, id: blockId('ai'), startSec: at, trackIndex: freeTrack(c.blocks, at, b.durationSec) };
      return { result: { ok: true, summary: `Duplicated "${bname(b)}"`, data: { newBlockId: nb.id } }, comp: { ...c, blocks: [...c.blocks, nb] } };
    }
    case 'set_canvas': {
      const size = canvasSizeFromInput(input);
      if (!size) return { result: { ok: false, error: 'invalid canvas: use portrait / landscape / square or width+height (240..7680)' } };
      const currentCanvas = p.document?.canvas;
      if (
        size.width === (currentCanvas?.width ?? c.width)
        && size.height === (currentCanvas?.height ?? c.height)
        && (!currentCanvas || currentCanvas.configured)
      ) {
        return { result: { ok: false, error: 'canvas already has that size' } };
      }
      if (p.document) {
        const edit = applyCanvasDocumentEdit({
          projectId: p.id,
          document: p.document,
          ...size,
          mainTranscript: asAsr(p.context.asr),
          clipTranscripts: clipAsrOf(p.context),
        });
        if (!edit.ok) {
          return {
            result: {
              ok: false,
              error: edit.error.message,
              data: { code: edit.error.code, trackIds: edit.error.trackIds },
            },
          };
        }
        return {
          result: { ok: true, summary: `Set canvas to ${size.width}×${size.height}`, data: { canvas: size } },
          comp: edit.composition,
          document: edit.document,
        };
      }
      const shots = shotsOf(p);
      return {
        result: { ok: true, summary: `Set canvas to ${size.width}×${size.height}`, data: { canvas: size } },
        comp: {
          ...c,
          ...size,
          blocks: relayCaptionLayer(c.blocks, shots, asAsr(p.context.asr), clipAsrOf(p.context), { canvasW: size.width }),
        },
      };
    }
    case 'set_shot_framing': {
      const shots = shotsOf(p);
      const applied = applyShotFramingInput({ ...c, shots }, input, shots);
      if ('error' in applied) return { result: { ok: false, error: applied.error } };
      const native = applyNativeNarrativePatches(p, applied.patches.map(({ shotId, patch }) => ({
        clipId: shotId,
        patch: { framing: patch },
      })));
      if (native && 'error' in native) return { result: { ok: false, error: native.error, data: native.data } };
      const count = applied.updates.length;
      return {
        result: {
          ok: true,
          summary: count === 1 ? `Updated framing for shot ${applied.updates[0]!.shotId}` : `Updated framing for ${count} shots`,
          data: count === 1 ? applied.updates[0] : { updates: applied.updates },
        },
        comp: native?.comp ?? applied.comp,
        ...(native ? { document: native.document } : {}),
      };
    }
    case 'apply_layout': {
      const layout = String(input.layout);
      const blockIds = Array.isArray(input.blockIds) ? input.blockIds.map(String) : [];
      const applied = applyCompositionLayout({ ...c, shots: shotsOf(p) }, {
        layout: layout as Parameters<typeof applyCompositionLayout>[1]['layout'],
        blockIds,
        ...(typeof input.shotId === 'string' ? { shotId: input.shotId } : {}),
        ...(typeof input.videoPosition === 'string' ? { videoPosition: input.videoPosition as 'left' | 'right' | 'top' | 'bottom' } : {}),
      });
      if ('error' in applied) return { result: { ok: false, error: applied.error } };
      return {
        result: { ok: true, summary: `Applied ${layout} layout`, data: { blockIds: applied.blockIds, ...(applied.shotId ? { shotId: applied.shotId } : {}), ...(applied.treatment ? { treatment: applied.treatment } : {}) } },
        comp: applied.comp,
      };
    }
    case 'set_shot_treatment': {
      const shots = shotsOf(p);
      const s = shots.find((x) => x.id === input.shotId);
      if (!s) return { result: { ok: false, error: 'shot not found' } };
      const t = String(input.treatment);
      if (!TREATMENTS.has(t)) return { result: { ok: false, error: `invalid treatment: ${t}` } };
      const native = applyNativeNarrativePatches(p, [{ clipId: s.id, patch: { framing: { treatment: t as VideoShot['treatment'] } } }]);
      if (native && 'error' in native) return { result: { ok: false, error: native.error, data: native.data } };
      return {
        result: { ok: true, summary: `Set shot framing to ${t}` },
        comp: native?.comp ?? { ...c, shots: shots.map((x) => (x.id === s.id ? patchShotFraming(x, { treatment: t as VideoShot['treatment'] }) : x)) },
        ...(native ? { document: native.document } : {}),
      };
    }
    case 'set_video_filter': {
      const shots = shotsOf(p);
      const s = shots.find((x) => x.id === input.shotId);
      if (!s) return { result: { ok: false, error: 'shot not found' } };
      const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
      const f: ShotFilter = {
        ...(num(input.brightness) != null ? { brightness: num(input.brightness) } : {}),
        ...(num(input.contrast) != null ? { contrast: num(input.contrast) } : {}),
        ...(num(input.saturate) != null ? { saturate: num(input.saturate) } : {}),
      };
      const css = shotFilterCss(f);
      const native = applyNativeNarrativePatches(p, [{ clipId: s.id, patch: { filter: css === 'none' ? null : f } }]);
      if (native && 'error' in native) return { result: { ok: false, error: native.error, data: native.data } };
      const next = shots.map((x) => {
        if (x.id !== s.id) return x;
        const { filter: _drop, ...rest } = x;
        return css === 'none' ? rest : { ...rest, filter: f };
      });
      return {
        result: { ok: true, summary: css === 'none' ? 'Reset color grading for this shot' : `Applied color grading: ${css}` },
        comp: native?.comp ?? { ...c, shots: next },
        ...(native ? { document: native.document } : {}),
      };
    }
    case 'set_shot_audio': {
      const shots = shotsOf(p);
      if (!shots.length) return { result: { ok: false, error: 'no video track yet' } };
      const ids = input.all ? new Set(shots.map((s) => s.id)) : new Set((Array.isArray(input.shotIds) ? input.shotIds : []).map(String));
      if (!ids.size) return { result: { ok: false, error: 'pass shotIds or all:true' } };
      const hit = shots.filter((s) => ids.has(s.id));
      if (!hit.length) return { result: { ok: false, error: 'shots not found' } };
      const patch = {
        ...(typeof input.volumeDb === 'number' && Number.isFinite(input.volumeDb) ? { volumeDb: input.volumeDb } : {}),
        ...(typeof input.mute === 'boolean' ? { mute: input.mute } : {}),
        ...(typeof input.fadeInSec === 'number' && Number.isFinite(input.fadeInSec) ? { fadeInSec: input.fadeInSec } : {}),
        ...(typeof input.fadeOutSec === 'number' && Number.isFinite(input.fadeOutSec) ? { fadeOutSec: input.fadeOutSec } : {}),
      };
      if (!Object.keys(patch).length) return { result: { ok: false, error: 'pass volumeDb / mute / fadeInSec / fadeOutSec' } };
      const native = applyNativeNarrativePatches(p, hit.map((shot) => ({ clipId: shot.id, patch: { audio: patch } })));
      if (native && 'error' in native) return { result: { ok: false, error: native.error, data: native.data } };
      const next = shots.map((s) => (ids.has(s.id) ? patchShotAudio(s, patch) : s));
      const bits = [
        ...('volumeDb' in patch ? [`volume ${r1(Math.max(VOLUME_DB_MIN, Math.min(VOLUME_DB_MAX, patch.volumeDb!)))}dB`] : []),
        ...('mute' in patch ? [patch.mute ? 'muted' : 'unmuted'] : []),
      ];
      return {
        result: { ok: true, summary: `Audio on ${hit.length} shot${hit.length > 1 ? 's' : ''}: ${bits.join(', ')}` },
        comp: native?.comp ?? { ...c, shots: next },
        ...(native ? { document: native.document } : {}),
      };
    }
    case 'set_bgm': {
      const tracks = c.audioTracks ?? [];
      const trackIdIn = typeof input.trackId === 'string' ? input.trackId : '';
      const knobs = {
        ...(typeof input.volumeDb === 'number' && Number.isFinite(input.volumeDb) ? { volumeDb: input.volumeDb } : {}),
        ...(typeof input.fadeInSec === 'number' && Number.isFinite(input.fadeInSec) ? { fadeInSec: input.fadeInSec } : {}),
        ...(typeof input.fadeOutSec === 'number' && Number.isFinite(input.fadeOutSec) ? { fadeOutSec: input.fadeOutSec } : {}),
        ...(typeof input.speed === 'number' && Number.isFinite(input.speed) ? { speed: input.speed } : {}),
        ...(typeof input.startSec === 'number' && Number.isFinite(input.startSec) ? { startSec: Math.max(0, input.startSec) } : {}),
        ...(typeof input.mute === 'boolean' ? { muted: input.mute } : {}),
      };
      if (input.off === true) {
        if (!tracks.length) return { result: { ok: false, error: 'no audio tracks yet' } };
        if (trackIdIn && !tracks.some((x) => x.id === trackIdIn)) return { result: { ok: false, error: 'audio track not found' } };
        const next = trackIdIn ? tracks.filter((x) => x.id !== trackIdIn) : [];
        const { audioTracks: _drop, ...rest } = c;
        return { result: { ok: true, summary: trackIdIn ? 'Removed the audio track' : 'Removed all audio tracks' }, comp: next.length ? { ...c, audioTracks: next } : rest };
      }
      const urlIn = typeof input.url === 'string' ? input.url.trim() : '';
      if (urlIn) {
        // Offline add: no loudness measurement without the tab — the clip lands at the default level
        // (or the explicit volumeDb); honest defaults are fine.
        const clip = patchAudioClip({ id: audioClipId(), src: urlIn }, knobs);
        return {
          result: { ok: true, summary: `Added an audio track (${r1(clip.volumeDb ?? -18)}dB)`, data: { trackId: clip.id } },
          comp: { ...c, audioTracks: [...tracks, clip] },
        };
      }
      const target = trackIdIn ? tracks.find((x) => x.id === trackIdIn) : tracks.length === 1 ? tracks[0] : null;
      if (!tracks.length) return { result: { ok: false, error: 'no audio tracks yet — pass a url to add one' } };
      if (!target) return { result: { ok: false, error: 'pass trackId (several tracks exist)' } };
      // Split first: it's the one op that changes the track COUNT, so it can't be combined with knobs
      const splitAt = Number(input.splitAtSec);
      if (Number.isFinite(splitAt)) {
        const halves = splitAudioClipAt(target, splitAt, audioClipId);
        if (!halves) return { result: { ok: false, error: 'that second is outside the track (or too close to an edge to leave two usable halves)' } };
        return {
          result: { ok: true, summary: `Split the audio track at ${r1(splitAt)}s`, data: { trackId: halves[0].id, newTrackId: halves[1].id } },
          comp: { ...c, audioTracks: tracks.flatMap((x) => (x.id === target.id ? halves : [x])) },
        };
      }
      // Edge trims run through the same math as the lane handles (source in/out + start all move together)
      const head = Number(input.headSec);
      const tail = Number(input.tailSec);
      let trimmed = target;
      if (Number.isFinite(head)) trimmed = patchAudioClip(trimmed, audioTrimPatch(trimmed, 'left', Math.max(0, head)));
      if (Number.isFinite(tail)) trimmed = patchAudioClip(trimmed, audioTrimPatch(trimmed, 'right', Math.max(0, tail)));
      const trimming = trimmed !== target;
      if (!Object.keys(knobs).length && !trimming) {
        return { result: { ok: false, error: 'pass volumeDb / fadeInSec / fadeOutSec / speed / startSec / mute / headSec / tailSec / splitAtSec, or off:true' } };
      }
      const next = Object.keys(knobs).length ? patchAudioClip(trimmed, knobs) : trimmed;
      return { result: { ok: true, summary: trimming ? 'Trimmed the audio track' : 'Adjusted the audio track' }, comp: { ...c, audioTracks: tracks.map((x) => (x.id === target.id ? next : x)) } };
    }
    case 'split_shot': {
      const shots = shotsOf(p);
      if (!shots.length) return { result: { ok: false, error: 'no video track yet' } };
      if ('atSecs' in input && 'atSec' in input) return { result: { ok: false, error: 'use either atSec or atSecs, not both' } };
      const purpose = input.purpose == null ? 'editing' : String(input.purpose);
      if (purpose !== 'editing' && purpose !== 'framing') return { result: { ok: false, error: `invalid split purpose: ${purpose}` } };
      // subjectTracks are deliberately local (video analysis is browser-side and is not persisted in
      // cloud project context). Fail closed instead of letting an offline MCP agent create framing cuts
      // without the same stable-subject guard used by the live Agent surface.
      if (purpose === 'framing') {
        return {
          result: {
            ok: false,
            error: 'framing split requires an open Studio tab with local visual analysis; open the project, run visual_brief/analyze_visual, then retry',
          },
        };
      }
      const points = Array.isArray(input.atSecs)
        ? input.atSecs
        : typeof input.atSec === 'number' && Number.isFinite(input.atSec)
          ? [input.atSec]
          : [];
      if (!points.length) return { result: { ok: false, error: 'offline mode needs atSec or atSecs (no playhead)' } };
      const split = splitShotsAtEditedPoints(shots, points);
      if ('error' in split) return { result: { ok: false, error: split.error } };
      if (p.document) {
        const requests = narrationSourceSplitsAtEditedPoints(shots, split.atSecs);
        if (!requests) return { result: { ok: false, error: 'Validated split points no longer resolve to narration clips' } };
        const command = applyNarrationSplitCommands(p.document, requests);
        if (!command.ok) {
          return { result: { ok: false, error: command.error.message, data: { code: command.error.code, trackIds: command.error.trackIds } } };
        }
        const comp = projectDocumentToLegacyComposition({ projectId: p.id, value: command.document });
        return {
          result: {
            ok: true,
            summary: split.atSecs.length === 1 ? `Split at ${r1(split.atSecs[0]!)}s` : `Split at ${split.atSecs.length} timeline points`,
            data: { atSecs: split.atSecs, shotIds: comp.shots?.map((shot) => shot.id) ?? [] },
          },
          document: command.document,
          comp,
        };
      }
      return {
        result: {
          ok: true,
          summary: split.atSecs.length === 1 ? `Split at ${r1(split.atSecs[0]!)}s` : `Split at ${split.atSecs.length} timeline points`,
          data: { atSecs: split.atSecs, shotIds: split.shots.map((shot) => shot.id) },
        },
        comp: { ...c, shots: split.shots },
      };
    }
    case 'trim_shot': {
      const shots = shotsOf(p);
      if (!shots.length) return { result: { ok: false, error: 'no video track yet' } };
      const at = Number(input.atSec);
      if (!Number.isFinite(at)) return { result: { ok: false, error: 'offline mode needs atSec (no playhead)' } };
      const side = input.side === 'left' ? 'left' : 'right';
      const r = side === 'left' ? trimLeftAtEdited(shots, at) : trimRightAtEdited(shots, at);
      if (!r.removed) return { result: { ok: false, error: 'cannot trim here (not inside a shot)' } };
      if (p.document) {
        const command = applyNarrationDocumentEdit({
          projectId: p.id,
          document: p.document,
          ranges: [{ fromSec: r.removed[0], toSec: r.removed[1] }],
          context: p.context,
          mainTranscript: asAsr(p.context.asr),
          clipTranscripts: clipAsrOf(p.context),
          canvasWidth: c.width,
        });
        if (!command.ok) {
          return { result: { ok: false, error: command.error.message, data: { code: command.error.code, trackIds: command.error.trackIds } } };
        }
        return {
          result: { ok: true, summary: `Trimmed the ${side === 'left' ? 'left' : 'right'} side at ${r1(at)}s` },
          document: command.document,
          comp: command.composition,
        };
      }
      const layers = rippleRemoveSiblingLayers(c, r.removed[0], r.removed[1]);
      return {
        result: { ok: true, summary: `Trimmed the ${side === 'left' ? 'left' : 'right'} side at ${r1(at)}s` },
        comp: { ...c, shots: r.clips, ...layers, blocks: relayCaptionLayer(layers.blocks, r.clips, asAsr(p.context.asr), clipAsrOf(p.context), { canvasW: c.width }) },
      };
    }
    case 'delete_shot': {
      const shots = shotsOf(p);
      const r = deleteClipById(shots, String(input.shotId));
      if (!r.removed) return { result: { ok: false, error: 'shot not found' } };
      // Once the primary track becomes empty, other tracks own their own timeline and keep their
      // positions. For an ordinary in-track ripple delete, preserve the existing compression.
      const layers: TimelineSiblingLayers = r.clips.length
        ? rippleRemoveSiblingLayers(c, r.removed[0], r.removed[1])
        : { blocks: c.blocks, ...(c.audioTracks ? { audioTracks: c.audioTracks } : {}) };
      if (p.document) {
        const common = {
          projectId: p.id,
          document: p.document,
          context: p.context,
          mainTranscript: asAsr(p.context.asr),
          clipTranscripts: clipAsrOf(p.context),
          canvasWidth: c.width,
        };
        const command = r.clips.length
          ? applyNarrationDocumentEdit({ ...common, ranges: [{ fromSec: r.removed[0], toSec: r.removed[1] }] })
          : removeNarrationClipsWithoutRipple({ ...common, clipIds: [String(input.shotId)] });
        if (!command.ok) {
          return { result: { ok: false, error: command.error.message, data: { code: command.error.code, trackIds: command.error.trackIds } } };
        }
        return { result: { ok: true, summary: 'Deleted this scene' }, document: command.document, comp: command.composition };
      }
      return {
        result: { ok: true, summary: 'Deleted this scene' },
        comp: { ...c, shots: r.clips, ...layers, blocks: relayCaptionLayer(layers.blocks, r.clips, asAsr(p.context.asr), clipAsrOf(p.context), { canvasW: c.width }) },
      };
    }
    case 'delete_words': {
      const ids = Array.isArray(input.wordIds) ? [...new Set(input.wordIds.map(String))] : [];
      if (!ids.length) return { result: { ok: false, error: 'wordIds must contain at least one id from list_words' } };
      const shots = shotsOf(p);
      const resolved = resolveWordIds(shots, asAsr(p.context.asr), clipAsrOf(p.context), ids);
      if (resolved.missing.length) {
        return { result: { ok: false, error: `unknown or stale word ids: ${resolved.missing.join(', ')}`, data: { missing: resolved.missing } } };
      }
      const mapped = wordRangesToEdited(shots, wordRanges(resolved.words));
      if (!mapped.length) return { result: { ok: false, error: 'the selected words are already absent from the edited timeline' } };
      let curShots = shots;
      let layers: TimelineSiblingLayers = { blocks: c.blocks, ...(c.audioTracks ? { audioTracks: c.audioTracks } : {}) };
      const seams: CutSeamEntry[] = [];
      for (const range of mapped) {
        const removed = removeEditedRange(curShots, range.editedFrom, range.editedTo, (base, srcStart, srcEnd) => ({ ...base, id: shotId(), srcStart, srcEnd }));
        if (!removed.removed) continue;
        curShots = removed.clips;
        layers = rippleRemoveSiblingLayers(layers, removed.removed[0], removed.removed[1]);
        seams.push({ at: removed.removed[0], len: removed.removed[1] - removed.removed[0], ...(range.text ? { text: range.text } : {}) });
      }
      if (!seams.length) return { result: { ok: false, error: 'cannot remove the selected words from the current edit' } };
      const cuts = finalizeCutSeams(seams);
      let document: EditorDocumentV2 | undefined;
      let nextComp: Composition;
      if (p.document) {
        const command = applyNarrationDocumentEdit({
          projectId: p.id,
          document: p.document,
          ranges: seams.map((seam) => ({ fromSec: seam.at, toSec: seam.at + seam.len })),
          context: p.context,
          mainTranscript: asAsr(p.context.asr),
          clipTranscripts: clipAsrOf(p.context),
          canvasWidth: c.width,
        });
        if (!command.ok) {
          return { result: { ok: false, error: command.error.message, data: { code: command.error.code, trackIds: command.error.trackIds } } };
        }
        document = command.document;
        nextComp = command.composition;
      } else {
        const relaid = relayCaptionLayer(layers.blocks, curShots, asAsr(p.context.asr), clipAsrOf(p.context), { canvasW: c.width });
        nextComp = { ...c, shots: curShots, ...layers, blocks: relaid };
      }
      return {
        result: {
          ok: true,
          summary: `Deleted ${ids.length} transcript word${ids.length === 1 ? '' : 's'}`,
          data: { wordIds: ids, cuts },
        },
        comp: nextComp,
        ...(document ? { document } : {}),
      };
    }
    case 'cut_range':
    case 'cut_narration': {
      const shots = shotsOf(p);
      if (!shots.length) return { result: { ok: false, error: 'no video track yet' } };
      // cut_narration takes source seconds (ranges), convert to edited seconds first; cut_range is already edited seconds
      let ranges: { from: number; to: number; text?: string }[];
      let kg = NaN;
      if (tool === 'cut_narration') {
        const raw = Array.isArray(input.ranges) ? input.ranges : [];
        // Pause tightening: keepGapSec margins shrink on the SOURCE clock, same math as the browser runner
        kg = Number(input.keepGapSec);
        const srcRanges = raw
          .map((r) => {
            const o = (r ?? {}) as Record<string, unknown>;
            return { from: Number(o.fromSec), to: Number(o.toSec) };
          })
          .filter((r) => Number.isFinite(r.from) && Number.isFinite(r.to) && r.to - r.from > 0.05);
        // Transcript snippet per cut: the receipt list names what each cut removed (no words = dead air)
        const words = asAsr(p.context.asr).flatMap((s) => s.words ?? []);
        const snippetOf = (from: number, to: number): string | undefined => {
          const inside = words.filter((w) => w.start >= from - 0.02 && w.end <= to + 0.02).map((w) => w.text.trim());
          if (!inside.length) return undefined;
          const joined = inside.join('');
          return joined.length > 16 ? `${joined.slice(0, 16)}…` : joined;
        };
        ranges = (Number.isFinite(kg) && kg > 0 ? tightenCutRanges(srcRanges, kg) : srcRanges)
          .map((r) => ({ from: srcToEditedLoose(shots, r.from, inNarrationSource), to: srcToEditedLoose(shots, r.to, inNarrationSource), text: snippetOf(r.from, r.to) }))
          .filter((r) => r.to - r.from > 0.05)
          .sort((a, b) => b.from - a.from);
      } else {
        const from = Number(input.fromSec);
        const to = Number(input.toSec);
        if (!Number.isFinite(from) || !Number.isFinite(to) || to - from < 0.1) return { result: { ok: false, error: 'invalid fromSec/toSec' } };
        ranges = [{ from, to }];
      }
      if (!ranges.length) return { result: { ok: false, error: 'ranges empty/invalid, or these ranges no longer exist in the edited video' } };
      let curShots = shots;
      let layers: TimelineSiblingLayers = { blocks: c.blocks, ...(c.audioTracks ? { audioTracks: c.audioTracks } : {}) };
      const seams: CutSeamEntry[] = [];
      const removedRanges: { fromSec: number; toSec: number }[] = [];
      for (const e of ranges) {
        const rr = removeEditedRange(curShots, e.from, e.to, (base, srcStart, srcEnd) => ({ ...base, id: shotId(), srcStart, srcEnd }));
        if (!rr.removed) continue;
        curShots = rr.clips;
        layers = rippleRemoveSiblingLayers(layers, rr.removed[0], rr.removed[1]);
        seams.push({ at: rr.removed[0], len: rr.removed[1] - rr.removed[0], ...(e.text ? { text: e.text } : {}) });
        removedRanges.push({ fromSec: rr.removed[0], toSec: rr.removed[1] });
      }
      if (!seams.length) return { result: { ok: false, error: 'cannot remove these ranges from the current edit' } };
      let document: EditorDocumentV2 | undefined;
      let nextComp: Composition;
      if (p.document) {
        const command = applyNarrationDocumentEdit({
          projectId: p.id,
          document: p.document,
          ranges: removedRanges,
          context: p.context,
          mainTranscript: asAsr(p.context.asr),
          clipTranscripts: clipAsrOf(p.context),
          canvasWidth: c.width,
        });
        if (!command.ok) {
          return { result: { ok: false, error: command.error.message, data: { code: command.error.code, trackIds: command.error.trackIds } } };
        }
        document = command.document;
        nextComp = command.composition;
      } else {
        const relaid = relayCaptionLayer(layers.blocks, curShots, asAsr(p.context.asr), clipAsrOf(p.context), { canvasW: c.width });
        nextComp = { ...c, shots: curShots, ...layers, blocks: relaid };
      }
      // The receipt speaks ACTUAL seconds removed (post-margin) — the agent quotes these, not its own gap arithmetic
      const cuts = finalizeCutSeams(seams);
      const removedTotalSec = Math.round(cuts.reduce((a, x) => a + x.removedSec, 0) * 10) / 10;
      return {
        result: {
          ok: true,
          summary:
            tool === 'cut_narration'
              ? `Cut ${cuts.length} spots by transcript, ${removedTotalSec.toFixed(1)}s actually removed${Number.isFinite(kg) && kg > 0 ? ` (kept ${kg}s of air per seam)` : ''}`
              : 'Removed the specified range',
          ...(tool === 'cut_narration' ? { data: { cuts, removedTotalSec, ...(Number.isFinite(kg) && kg > 0 ? { keepGapSec: kg } : {}) } } : {}),
        },
        comp: nextComp,
        ...(document ? { document } : {}),
      };
    }
    case 'add_transition': {
      const at = Number(input.atSec);
      if (!Number.isFinite(at) || at < 0) return { result: { ok: false, error: 'invalid atSec' } };
      const sp = clipSpans(shotsOf(p));
      const bi = sp.findIndex((s, idx) => idx >= 1 && Math.abs(s.editedStart - at) < 0.3);
      if (bi < 1) return { result: { ok: false, error: `atSec must be a shot cut point (boundaries: ${sp.slice(1).map((s) => r1(s.editedStart)).join(', ')}s) — a transition joins two shots` } };
      const cut = sp[bi]!.editedStart;
      const selfId = sp[bi]!.clip.id;
      const prevId = sp[bi - 1]!.clip.id;
      const remove = input.effect === 'none' || input.remove === true;
      const effect: CutTransitionEffect = typeof input.effect === 'string' && ['fade', 'fadeblack', 'directional', 'directionalwipe', 'circleopen', 'windowslice', 'crosszoom', 'rotatescale', 'glitch', 'dreamy'].includes(input.effect) ? (input.effect as CutTransitionEffect) : 'fade';
      const dir = typeof input.direction === 'string' && ['up', 'down', 'left', 'right'].includes(input.direction) ? (input.direction as TransitionDirection) : undefined;
      const durIn = Number(input.durationSec);
      const shots = shotsOf(p).map((s) => {
        if (s.id !== selfId) return s;
        const { transIn: _drop, ...rest } = s;
        if (remove) return rest;
        const durationSec = Math.min(MAX_TRANSITION_SEC, Math.max(0.2, Number.isFinite(durIn) && durIn > 0 ? durIn : (s.transIn?.durationSec ?? 1)));
        const direction = dir ?? s.transIn?.direction;
        return { ...rest, transIn: { prevId, effect, durationSec, ...(DIRECTIONAL_TRANSITIONS.has(effect) && direction ? { direction } : {}) } };
      });
      return {
        result: { ok: true, summary: remove ? `Removed the transition at ${r1(cut)}s` : `Set a transition at the ${r1(cut)}s cut (${effect})` },
        comp: { ...c, shots },
      };
    }
    case 'set_captions': {
      const preset = typeof input.preset === 'string' ? input.preset : undefined;
      if (preset && !CAPTION_PRESETS.some((x) => x.id === preset)) return { result: { ok: false, error: `no such caption preset: ${preset}` } };
      const yPct = Number(input.yPct);
      const scale = Number(input.scale);
      const patch: Record<string, number> = {};
      if (Number.isFinite(yPct)) patch.yPct = yPct;
      if (Number.isFinite(scale)) patch.scale = scale;
      if (!preset && !Object.keys(patch).length) return { result: { ok: false, error: 'nothing to set: provide at least one of preset / yPct / scale' } };
      // Captions are DERIVED state: persist only captionStyle {on, preset, ...} — blocks re-derive from
      // the transcript on every surface (client materializes; offline state derives for display).
      let base = c;
      if (preset) {
        if (!p.context.asr?.length) return { result: { ok: false, error: 'no transcript in the cloud project, cannot lay captions — open the studio tab and run extract_asr first' } };
        const cues = displayCues(shotsOf(p), asAsr(p.context.asr), clipAsrOf(p.context), { subLang: resolveCaptionStyle(c).sub?.lang, canvasW: c.width });
        if (!cues.length) return { result: { ok: false, error: 'transcript is empty, cannot generate captions' } };
        base = stripDerivedCaptions(c, true); // legacy persisted caption blocks retire now that derivation is proven possible
      }
      // SPARSE persistence: merge into the raw stored style (defaults live in the resolver)
      const style = { ...(base.captionStyle ?? {}), ...(preset ? { on: true, preset } : {}), ...patch };
      return {
        result: { ok: true, summary: `${preset ? 'Set' : 'Adjusted'} captions: ${getCaptionPreset(style.preset).name}` },
        comp: { ...base, captionStyle: style },
      };
    }
    case 'remove_captions': {
      if (!isCaptionsOn(c)) return { result: { ok: false, error: 'no captions right now' } };
      // Switch off, KEEP the style (preset/positions/translation language round-trip through the toggle); drop any legacy persisted caption blocks.
      return {
        result: { ok: true, summary: 'Removed captions' },
        comp: { ...c, blocks: c.blocks.filter((b) => !isSentenceCaption(b)), captionStyle: { ...(c.captionStyle ?? {}), on: false } },
      };
    }
    case 'set_caption_translations': {
      // Translations are written onto the transcript sentences (sub / per-cue cueSubs of context.asr/clipAsr) via the
      // SHARED writer (applyCaptionTranslations — same semantics as the browser mirror and the panel flows)
      const clear = input.clear === true;
      const lang = typeof input.lang === 'string' && input.lang.trim() ? input.lang.trim() : undefined;
      const items = (Array.isArray(input.items) ? input.items : [])
        .map((it) => {
          const o = (it ?? {}) as Record<string, unknown>;
          const w0 = Number(o.w0);
          const w1 = Number(o.w1);
          return {
            index: Number(o.index),
            text: typeof o.text === 'string' ? o.text.trim() : null,
            // optional display-cue word range (UI per-cue translations); without it the translation is whole-sentence
            ...(Number.isInteger(w0) && Number.isInteger(w1) && w0 >= 0 && w1 >= w0 ? { w0, w1 } : {}),
          };
        })
        .filter((it): it is { index: number; text: string; w0?: number; w1?: number } => Number.isInteger(it.index) && it.index >= 0 && it.text !== null);
      if (!clear && !items.length) return { result: { ok: false, error: 'items empty/invalid (expected {index, text}[], where index is the read_script line number)' } };
      let ctx: StudioProjectContext;
      let summary: string;
      if (clear) {
        ctx = {
          ...p.context,
          ...(p.context.asr ? { asr: clearCaptionTranslations(asAsr(p.context.asr)) } : {}),
          ...(p.context.clipAsr ? { clipAsr: Object.fromEntries(Object.entries(p.context.clipAsr).map(([k, v]) => [k, clearCaptionTranslations(asAsr(v))])) } : {}),
        };
        summary = 'Cleared all caption translations';
      } else {
        const shotIdIn = typeof input.shotId === 'string' ? input.shotId : undefined;
        const src = shotIdIn ? shotsOf(p).find((s) => s.id === shotIdIn)?.src : undefined;
        if (shotIdIn && !src) return { result: { ok: false, error: 'this shotId is not an inserted clip (do not pass shotId for the main narration)' } };
        // Through the desegment funnel: translation item indices refer to read_script's (desegmented) line numbers
        const segs = src ? clipAsrOf(p.context)[src] : asAsr(p.context.asr);
        if (!segs?.length) return { result: { ok: false, error: src ? 'this inserted clip has no transcript' : 'no transcript in the cloud project — open the studio tab and run extract_asr first' } };
        const bad = items.filter((it) => it.index >= segs.length);
        if (bad.length) return { result: { ok: false, error: `index out of range: ${bad.map((b) => b.index).join(', ')} (this transcript has ${segs.length} lines; see read_script for line numbers)` } };
        const next = applyCaptionTranslations(segs, items, lang);
        ctx = src ? { ...p.context, clipAsr: { ...p.context.clipAsr, [src]: next } } : { ...p.context, asr: next };
        summary = `Set ${items.filter((it) => it.text).length} translations`;
      }
      // Captions derive from the transcript at render time — the translation shows up without any re-lay.
      const captionsOn = isCaptionsOn(c);
      return {
        result: { ok: true, summary: captionsOn ? summary : `${summary} (captions are off; will show after set_captions)` },
        context: ctx,
      };
    }
    case 'apply_block': {
      const raw = typeof input.raw === 'string' ? input.raw : '';
      if (!raw.trim()) return { result: { ok: false, error: 'raw required (the raw text produced by compose_block_brief)' } };
      const bid = typeof input.blockId === 'string' ? input.blockId : undefined;
      const target = bid ? findBlock(bid) : undefined;
      // Stabilize applyId (fixes a lint infinite loop found on-device): for a new
      // block with no bid, mint an id now and hand it back in the receipt on lint
      // failure; the retry carries blockId to reuse it → the new block's scoped-CSS
      // #id no longer changes each round and can converge. A bid pointing to a
      // non-existent block = last round's handed-back new-block id, treated as the
      // new-block id as-is (no more "component not found" that dead-ends the retry).
      const applyId = target?.id ?? bid ?? blockId('ai');
      // The raw text follows whichever contract the brief carried — component JSON on a themeless
      // project, fenced markup on a themed one. Shape-detect and give each answer its own meaning
      // (shared interpreter with the browser bridge, so the semantics cannot drift).
      const shape = interpretApplyRaw(raw);
      if (shape.kind === 'kit') {
        const slots = { props: shape.props };
        if (target) {
          return {
            result: { ok: true, summary: isPlaceholder(target) ? `Filled "${target.label ?? 'graphic'}"` : `Updated "${bname(target)}"`, data: { blockId: target.id } },
            comp: { ...c, blocks: c.blocks.map((x) => (x.id === target.id ? { ...x, templateId: `kit:${shape.component}`, slots } : x)) },
          };
        }
        const kAt = typeof input.atSec === 'number' ? Math.min(Math.max(0, input.atSec), totalDuration(c)) : 0;
        const kDur = typeof input.durationSec === 'number' && input.durationSec >= 0.3 ? input.durationSec : 3;
        const kb: Block = {
          id: applyId,
          templateId: `kit:${shape.component}`,
          slots,
          startSec: kAt,
          durationSec: kDur,
          trackIndex: freeTrack(c.blocks, kAt, kDur),
          label: (typeof input.label === 'string' && input.label ? input.label : 'New block').slice(0, 12),
        };
        return { result: { ok: true, summary: 'Added block', data: { newBlockId: kb.id } }, comp: { ...c, blocks: [...c.blocks, kb] } };
      }
      if (shape.kind === 'kit-unknown') {
        return { result: { ok: false, error: `unknown component "${shape.component}" — use an id from the brief's COMPONENTS list, answer {"custom": true} for a bespoke build, or null for no graphic` } };
      }
      if (shape.kind === 'custom') {
        // The model judged no component carries this. Markup needs the markup contract — hand the
        // agent back to the brief rather than accepting free-form output against the kit brief.
        return { result: { ok: false, error: 'the model chose a bespoke build — call compose_block_brief again with format:"html" for the markup contract, generate against it, then apply_block with that raw text' } };
      }
      if (shape.kind === 'declined') {
        if (target && isPlaceholder(target)) {
          // The moment deserves no graphic: remove the empty slot instead of leaving a shell.
          return { result: { ok: true, summary: `Removed "${target.label ?? 'graphic'}" — the model judged this moment needs no graphic`, data: { removedBlockId: target.id } }, comp: { ...c, blocks: c.blocks.filter((x) => x.id !== target.id) } };
        }
        return { result: { ok: false, error: 'the model answered null (no graphic) — nothing was changed; delete_block the target yourself if you agree' } };
      }
      const fb = target && !isPlaceholder(target) ? renderBlock(target) : { innerHtml: '<div></div>', timelineBody: '' };
      const parsed = parseBlockResponse(raw, fb);
      const issues = lintBlock({ blockId: applyId, innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody });
      const hard = issues.filter((i) => HARD_LINT_CODES.has(i.code));
      if (hard.length) {
        return {
          result: {
            ok: false,
            error: `failed static checks — fix each item in data.issues (common: scope every CSS selector to #${applyId}), keep everything else as-is, then apply_block once more with blockId:"${applyId}"`,
            data: { blockId: applyId, issues: issues.map((i) => i.message) },
          },
        };
      }
      const warnings = issues.length ? { warnings: issues.map((i) => i.message) } : {};
      if (target) {
        return {
          result: { ok: true, summary: isPlaceholder(target) ? `Filled "${target.label ?? 'graphic'}"` : `Updated "${bname(target)}"`, data: { blockId: target.id, ...warnings } },
          comp: {
            ...c,
            blocks: c.blocks.map((x) => (x.id === target.id ? { ...x, templateId: 'custom', slots: { innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody } } : x)),
          },
        };
      }
      const at = typeof input.atSec === 'number' ? Math.min(Math.max(0, input.atSec), totalDuration(c)) : 0;
      const dur = typeof input.durationSec === 'number' && input.durationSec >= 0.3 ? input.durationSec : 3;
      const nb: Block = {
        id: applyId,
        templateId: 'custom',
        slots: { innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody },
        startSec: at,
        durationSec: dur,
        trackIndex: freeTrack(c.blocks, at, dur),
        label: (typeof input.label === 'string' && input.label ? input.label : 'New block').slice(0, 12),
      };
      return { result: { ok: true, summary: 'Added block', data: { newBlockId: nb.id, ...warnings } }, comp: { ...c, blocks: [...c.blocks, nb] } };
    }
    case 'submit_plan': {
      if (!p.context.asr?.length) return { result: { ok: false, error: 'no transcript in the cloud project (the plan is anchored to sentence indexes)' } };
      const text = typeof input.plan === 'string' ? input.plan : JSON.stringify(input.plan ?? {});
      // Unified narrative stream (same interleaving pure function as the browser's plan_context): global-row-number scenes are decomposed back into main/inserted segments at the assembly layer
      const insCtx = insertPlanContexts(p.comp.shots ?? [], clipAsrOf(p.context));
      const planRows = unifiedPlanRows(
        (p.context.asr ?? []).map((x, i) => ({ index: i, text: x.text, start: x.start, end: x.end })),
        insCtx,
      );
      let plan: DraftPlan;
      try {
        plan = parsePlan(text, planRows);
      } catch (e) {
        return { result: { ok: false, error: `failed to parse plan: ${e instanceof Error ? e.message : String(e)}` } };
      }
      if (!plan.scenes.length) return { result: { ok: false, error: 'no valid scenes — regenerate and resubmit' } };
      return {
        result: { ok: true, summary: `Plan received · ${plan.scenes.length} scenes (lay_out needs the studio tab open to run)`, data: { scenes: plan.scenes.length } },
        context: { ...p.context, plan },
      };
    }
    case 'plan_context': {
      if (!p.context.asr?.length) return { result: { ok: false, error: 'no transcript in the cloud project — open the studio tab and run extract_asr first' } };
      return {
        result: {
          ok: true,
          summary: 'Fetched plan context (cloud; no visual hints)',
          data: {
            sentences: p.context.asr.map((s, i) => ({ index: i, text: s.text, start: s.start, end: s.end })),
            videoDurationSec: p.comp.video?.durationSec ?? p.videoDurationSec ?? 0,
            theme: c.theme,
          },
        },
      };
    }
    case 'compose_context': {
      const script = (p.context.asr ?? []).map((s) => s.text).join('');
      const base = { theme: c.theme, ...(c.palette ? { palette: c.palette } : {}), ...(c.frameId ? { frameId: c.frameId } : {}) };
      const bid = typeof input.blockId === 'string' ? input.blockId : undefined;
      if (bid) {
        const b = findBlock(bid);
        if (!b) return { result: { ok: false, error: 'block not found' } };
        if (isPlaceholder(b)) {
          const boxPx = b.box ? { w: Math.round(b.box.w * c.width), h: Math.round(b.box.h * c.height) } : undefined;
          const beats = beatsForWindow(shotsOf(p), asAsr(p.context.asr), clipAsrOf(p.context), b.startSec, b.durationSec);
          return {
            result: {
              ok: true,
              summary: 'Fetched placeholder context (cloud)',
              data: {
                ...base,
                block: { id: b.id, kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: b.label ?? 'graphic', durationSec: b.durationSec, ...(boxPx ? { boxPx } : {}) },
                context: { ...(script ? { script } : {}), ...(beats.length ? { beats } : {}) },
                suggested_instruction: placeholderSpec(b),
              },
            },
          };
        }
        return {
          result: {
            ok: true,
            summary: 'Fetched block context (cloud)',
            data: {
              ...base,
              block: { id: b.id, kind: blockKind(b), ...renderBlock(b), label: b.label },
              // A kit block edits as props — same as the bridge context (unmentioned fields survive).
              ...(b.templateId.startsWith('kit:') ? { kitCurrent: { component: b.templateId.slice(4), props: (b.slots as { props?: Record<string, unknown> }).props ?? {} } } : {}),
              ...(script ? { context: { script } } : {}),
            },
          },
        };
      }
      const at = typeof input.atSec === 'number' ? Math.min(Math.max(0, input.atSec), totalDuration(c)) : 0;
      return {
        result: {
          ok: true,
          summary: 'Fetched new block context (cloud)',
          data: { ...base, atSec: at, block: { id: blockId('ai'), kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: 'New block' }, ...(script ? { context: { script } } : {}) },
        },
      };
    }
    default:
      return { result: { ok: false, error: `offline executor does not support ${tool}` } };
  }
}
