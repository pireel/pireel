import { captionBlocksFromAsr, type AsrSegment, type CueRef } from '../../build-blocks';
import { displayCuesFromMappedSegs, mapTranscriptSegsToEdited } from '../../captions-relay';
import { positiveDurationFrames, secondsToTimelineFrames, timelineFramesToSeconds } from '../time';
import type {
  AudioTimelineClip,
  CaptionSourceRef,
  CaptionTimelineClip,
  EditorDocumentV2,
  GraphicBlockPayload,
  MediaTimelineClip,
  NarrativeTimelineClip,
  TimelineClip,
} from '../types';
import { validateEditorDocumentV2 } from '../validation';
import { commandFailure, emptyCommandReceipt, type EditorCommandResult } from './types';

function stripBlockPlacement(block: ReturnType<typeof captionBlocksFromAsr>[number]): GraphicBlockPayload {
  const { id: _id, startSec: _startSec, durationSec: _durationSec, trackIndex: _trackIndex, ...payload } = block;
  return payload;
}

/** Peer editors treat caption word timing as clip-local data and rescale it with a text-clip trim.
 * Our renderer stores edited-timeline seconds, so materialize the equivalent mapping here while
 * leaving the source transcript and sourceRef untouched. */
function retimeCaptionBlock(
  block: ReturnType<typeof captionBlocksFromAsr>[number],
  startFrame: number,
  endFrame: number,
  fps: number,
  shouldRetime: boolean,
): GraphicBlockPayload {
  if (!shouldRetime) return stripBlockPlacement(block);
  const words = Array.isArray(block.slots.words)
    ? block.slots.words as Array<{ text: string; start: number; end: number }>
    : [];
  if (!words.length) return stripBlockPlacement(block);
  const baseDuration = Math.max(1 / fps, block.durationSec);
  const nextStartSec = timelineFramesToSeconds(startFrame, fps);
  const nextDurationSec = timelineFramesToSeconds(endFrame - startFrame, fps);
  const scale = nextDurationSec / baseDuration;
  return stripBlockPlacement({
    ...block,
    startSec: nextStartSec,
    durationSec: nextDurationSec,
    slots: {
      ...block.slots,
      words: words.map((word) => ({
        ...word,
        start: nextStartSec + Math.max(0, word.start - block.startSec) * scale,
        end: nextStartSec + Math.max(0, word.end - block.startSec) * scale,
      })),
    },
  });
}

export type SpeechTimelineClip = NarrativeTimelineClip | MediaTimelineClip | AudioTimelineClip;

type CaptionSourceSelection = NonNullable<EditorDocumentV2['semantics']['managedCaptionSource']>;

export interface TimelineTranscriptionTarget {
  trackId: string;
  clipId: string;
  assetId: string;
}

export interface TimelineSpeechTrack {
  trackId: string;
  clips: SpeechTimelineClip[];
}

export interface TimelineSpeechRange {
  trackId: string;
  clipId: string;
  assetId: string;
  startFrame: number;
  endFrame: number;
  sourceFromSec: number;
  sourceToSec: number;
}

export interface SpokenTimelineBeat {
  text: string;
  /** Local seconds from the requested window start. */
  start: number;
  /** Local seconds from the requested window start. */
  end: number;
}

function isSpeechClip(clip: TimelineClip): clip is SpeechTimelineClip {
  return clip.kind === 'narrative' || clip.kind === 'media' || clip.kind === 'audio';
}

function isCaptionableClip(document: EditorDocumentV2, clip: TimelineClip): clip is SpeechTimelineClip {
  if (!isSpeechClip(clip) || !clip.enabled) return false;
  const asset = document.assets[clip.assetId];
  return !!asset && (asset.kind === 'audio' || (asset.kind === 'video' && asset.metadata.hasAudio !== false));
}

/** Clip-level audible state. A muted clip is outside the mix, so automatic narration-source
 * selection must never transcribe it (muted montage B-roll is not the narration script); an
 * explicit track/clip selection still honors the caller's stated intent. */
function clipAudioMuted(clip: SpeechTimelineClip): boolean {
  if (clip.kind === 'audio') return clip.properties.muted === true;
  if (clip.kind === 'narrative') return clip.properties.audioMuted === true;
  return clip.video?.audioMuted === true;
}

/** Transcription scope over native timeline identity. The primary lane is one
 * candidate, never a prerequisite. Linked A/V uses the audio-side clip so one recording is not
 * billed and transcribed twice. Assets are returned once even when split into several clips. */
export function timelineTranscriptionTargets(
  document: EditorDocumentV2,
  selection: CaptionSourceSelection = { mode: 'auto' },
): TimelineTranscriptionTarget[] {
  const all = document.timeline.tracks.flatMap((track) => track.clips
    .filter((clip) => isCaptionableClip(document, clip))
    .map((clip) => ({ trackId: track.id, trackMuted: track.muted, clip })));
  const eligible = selection.mode === 'auto'
    ? all.filter((entry) => !entry.trackMuted && !clipAudioMuted(entry.clip))
    : all;
  const selected = selection.mode === 'auto'
    ? eligible
    : selection.mode === 'track'
      ? eligible.filter((entry) => entry.trackId === selection.trackId)
      : eligible.filter((entry) => entry.clip.id === selection.clipId);
  const selectedGroups = new Set(selected.map((entry) => entry.clip.linkGroupId).filter((id): id is string => !!id));
  const expanded = selection.mode === 'auto'
    ? selected
    : [...selected, ...all.filter((entry) => entry.clip.linkGroupId && selectedGroups.has(entry.clip.linkGroupId))];
  const audioGroups = new Set(eligible
    .filter((entry) => entry.clip.kind === 'audio' && entry.clip.linkGroupId)
    .map((entry) => entry.clip.linkGroupId!));
  const seenAssets = new Set<string>();
  return expanded
    .filter((entry) => entry.clip.kind === 'audio' || !entry.clip.linkGroupId || !audioGroups.has(entry.clip.linkGroupId))
    .sort((left, right) => left.clip.startFrame - right.clip.startFrame || left.clip.id.localeCompare(right.clip.id))
    .flatMap((entry) => {
      if (seenAssets.has(entry.clip.assetId)) return [];
      seenAssets.add(entry.clip.assetId);
      return [{ trackId: entry.trackId, clipId: entry.clip.id, assetId: entry.clip.assetId }];
    });
}

export interface ManagedCaptionLineRow {
  clipId: string;
  /** Transcript owner (sourceRef) — the edit write-back target when runtime refs miss. */
  assetId?: string;
  /** Runtime source key carried by the cue ref; absent = legacy main narration domain. */
  src?: string;
  seg: number;
  w0: number;
  w1: number;
  text: string;
  sub?: string;
  editedStartSec: number;
  durationSec: number;
}

/** Panel line rows straight from the document's managed caption lane — the same clips the canvas
 * renders. This is the only caption row source that understands an audio-lane narration: the
 * legacy comp-side displayCues derivation maps main-domain segments through primary-lane shots
 * and structurally cannot represent narration placed as an audio clip. Returns null when the lane
 * holds no managed cues so legacy projects keep their comp-side derivation. */
export function managedCaptionLineRows(document: EditorDocumentV2): ManagedCaptionLineRow[] | null {
  const track = document.semantics.managedCaptionTrackId
    ? document.timeline.tracks.find((candidate) => candidate.id === document.semantics.managedCaptionTrackId)
    : undefined;
  const clips = (track?.clips ?? []).filter(
    (clip): clip is CaptionTimelineClip => clip.kind === 'caption' && clip.managed && clip.enabled,
  );
  if (!clips.length) return null;
  const fps = document.canvas.fps;
  const rows = clips
    .flatMap((clip): ManagedCaptionLineRow[] => {
      const slots = clip.block.slots as {
        ref?: { src?: unknown; seg?: unknown; w0?: unknown; w1?: unknown };
        words?: Array<{ text?: unknown }>;
        sub?: unknown;
      };
      const ref = slots.ref;
      if (!ref || !Number.isInteger(Number(ref.seg))) return [];
      const label = (clip.block as { label?: unknown }).label;
      const text = typeof label === 'string' && label.trim()
        ? label.trim()
        : (Array.isArray(slots.words) ? slots.words : []).map((word) => String(word?.text ?? '')).join('');
      if (!text) return [];
      return [{
        clipId: clip.id,
        ...(clip.sourceRef ? { assetId: clip.sourceRef.assetId } : {}),
        ...(typeof ref.src === 'string' && ref.src ? { src: ref.src } : {}),
        seg: Number(ref.seg),
        w0: Number(ref.w0) || 0,
        w1: Number(ref.w1) || 0,
        text,
        ...(typeof slots.sub === 'string' && slots.sub.trim() ? { sub: slots.sub.trim() } : {}),
        editedStartSec: timelineFramesToSeconds(clip.startFrame, fps),
        durationSec: Math.max(0.1, timelineFramesToSeconds(clip.durationFrames, fps)),
      }];
    })
    .sort((left, right) => left.editedStartSec - right.editedStartSec || left.clipId.localeCompare(right.clipId));
  return rows.length ? rows : null;
}

function transcriptBearingClips(document: EditorDocumentV2, clips: readonly TimelineClip[]): SpeechTimelineClip[] {
  return clips
    .filter((clip): clip is SpeechTimelineClip => isSpeechClip(clip) && clip.enabled)
    .filter((clip) => (document.semantics.transcripts[clip.assetId]?.length ?? 0) > 0)
    .sort((left, right) => left.startFrame - right.startFrame);
}

/** The spoken lane a transcript-first UI should expose by default. A semantic
 * primary lane is only one candidate; the lane with the most surviving words wins. */
export function dominantTimelineSpeechTrack(document: EditorDocumentV2): TimelineSpeechTrack | null {
  return document.timeline.tracks
    .filter((track) => !track.muted)
    // Clip-muted footage is outside the mix: its (possibly polluted) transcript must not win the
    // dominant-lane vote, or auto caption source re-pins to a silent montage lane.
    .map((track) => ({
      trackId: track.id,
      clips: transcriptBearingClips(document, track.clips).filter((clip) => !clipAudioMuted(clip)),
    }))
    .filter((entry) => entry.clips.length)
    .sort((left, right) => (
      right.clips.reduce((sum, clip) => sum + spokenWordCount(document, clip), 0)
      - left.clips.reduce((sum, clip) => sum + spokenWordCount(document, clip), 0)
    ) || left.trackId.localeCompare(right.trackId))[0] ?? null;
}

/** Map an asset-clock range to every surviving occurrence on one real speech lane. */
export function timelineSpeechRangesForAsset(
  document: EditorDocumentV2,
  trackId: string,
  assetId: string,
  sourceFromSec: number,
  sourceToSec: number,
  clipId?: string,
): TimelineSpeechRange[] {
  if (!assetId || !Number.isFinite(sourceFromSec) || !Number.isFinite(sourceToSec) || sourceToSec <= sourceFromSec) return [];
  const track = document.timeline.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return [];
  return transcriptBearingClips(document, track.clips).flatMap((clip) => {
    if (clip.assetId !== assetId || (clipId && clip.id !== clipId)) return [];
    const range = sourceRange(clip, document.canvas.fps);
    const sourceFrom = Math.max(sourceFromSec, range.start);
    const sourceTo = Math.min(sourceToSec, range.end);
    if (sourceTo - sourceFrom <= 0.001) return [];
    const sourceSpan = range.end - range.start;
    if (sourceSpan <= 0) return [];
    const startFrame = clip.startFrame + Math.round(((sourceFrom - range.start) / sourceSpan) * clip.durationFrames);
    const endFrame = clip.startFrame + Math.round(((sourceTo - range.start) / sourceSpan) * clip.durationFrames);
    if (endFrame <= startFrame) return [];
    return [{
      trackId,
      clipId: clip.id,
      assetId,
      startFrame,
      endFrame,
      sourceFromSec: sourceFrom,
      sourceToSec: sourceTo,
    }];
  }).sort((left, right) => right.startFrame - left.startFrame || left.clipId.localeCompare(right.clipId));
}

function spokenWordCount(document: EditorDocumentV2, clip: SpeechTimelineClip): number {
  const range = sourceRange(clip, document.canvas.fps);
  return (document.semantics.transcripts[clip.assetId] ?? []).reduce((count, segment) => {
    if (segment.words?.length) {
      return count + segment.words.filter((word) => word.end > range.start && word.start < range.end).length;
    }
    if (segment.end <= range.start || segment.start >= range.end) return count;
    return count + Math.max(1, segment.text.trim().split(/\s+|(?=\p{Script=Han})/u).filter(Boolean).length);
  }, 0);
}

function selectedSpeechClips(document: EditorDocumentV2, selection: CaptionSourceSelection): SpeechTimelineClip[] {
  if (selection.mode === 'auto') return dominantTimelineSpeechTrack(document)?.clips ?? [];
  if (selection.mode === 'track') {
    const track = document.timeline.tracks.find((candidate) => candidate.id === selection.trackId);
    return transcriptBearingClips(document, track?.clips ?? []);
  }
  const clip = document.timeline.tracks.flatMap((track) => track.clips).find((candidate) => candidate.id === selection.clipId);
  return clip ? transcriptBearingClips(document, [clip]) : [];
}

/** Source seconds mapped through native clip placement, including explicit gaps and retiming. */
function sourceRange(clip: SpeechTimelineClip, fps: number): { start: number; end: number } {
  const speed = clip.kind === 'audio' && Number.isFinite(clip.properties.speed) && clip.properties.speed! > 0
    ? clip.properties.speed!
    : 1;
  return {
    start: clip.sourceInSec,
    end: clip.sourceOutSec ?? clip.sourceInSec + timelineFramesToSeconds(clip.durationFrames, fps) * speed,
  };
}

function sourceSecToTimelineSec(
  clip: SpeechTimelineClip,
  sourceSec: number,
  fps: number,
): number {
  const startSec = timelineFramesToSeconds(clip.startFrame, fps);
  const endSec = timelineFramesToSeconds(clip.startFrame + clip.durationFrames, fps);
  const range = sourceRange(clip, fps);
  const ratio = Math.max(0, Math.min(1, (sourceSec - range.start) / Math.max(0.001, range.end - range.start)));
  return startSec + ratio * (endSec - startSec);
}

/**
 * Resolve spoken beats from the canonical multi-track timeline. Motion Graphic composition used
 * to inspect only legacy video shots, so narration placed on an audio lane arrived with no timing
 * context and every visual item appeared at once. This follows the same explicit/automatic speech
 * source selection as managed captions and maps source-clock transcript segments through trim,
 * retiming, gaps and native clip placement into local Component time.
 */
export function spokenTimelineBeats(
  document: EditorDocumentV2,
  startSec: number,
  durationSec: number,
): SpokenTimelineBeat[] {
  if (!Number.isFinite(startSec) || !Number.isFinite(durationSec) || durationSec <= 0) return [];
  const windowStart = Math.max(0, startSec);
  const windowEnd = windowStart + durationSec;
  const selection = document.semantics.managedCaptionSource ?? { mode: 'auto' as const };
  const beats = selectedSpeechClips(document, selection).flatMap((clip) => {
    const range = sourceRange(clip, document.canvas.fps);
    return (document.semantics.transcripts[clip.assetId] ?? []).flatMap((segment) => {
      const text = segment.text?.trim();
      if (!text) return [];
      const sourceStart = Math.max(range.start, segment.start);
      const sourceEnd = Math.min(range.end, segment.end);
      if (sourceEnd - sourceStart <= 0.03) return [];
      const timelineStart = sourceSecToTimelineSec(clip, sourceStart, document.canvas.fps);
      const timelineEnd = sourceSecToTimelineSec(clip, sourceEnd, document.canvas.fps);
      const overlapStart = Math.max(windowStart, timelineStart);
      const overlapEnd = Math.min(windowEnd, timelineEnd);
      if (overlapEnd - overlapStart <= 0.03) return [];
      return [{
        text,
        start: Math.max(0, overlapStart - windowStart),
        end: Math.min(durationSec, overlapEnd - windowStart),
      }];
    });
  }).sort((left, right) => left.start - right.start || left.end - right.end);

  const seen = new Set<string>();
  return beats.filter((beat) => {
    const key = `${beat.text}\u0000${beat.start.toFixed(3)}\u0000${beat.end.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function priorSourceKeys(document: EditorDocumentV2, clips: readonly TimelineClip[]): Map<string, string> {
  const keys = new Map<string, string>();
  for (const clip of clips) {
    if (clip.kind !== 'caption' || !clip.sourceRef) continue;
    const ref = clip.block.slots.ref as { src?: unknown } | undefined;
    if (typeof ref?.src === 'string' && ref.src && !keys.has(clip.sourceRef.assetId)) keys.set(clip.sourceRef.assetId, ref.src);
  }
  return keys;
}

function uniqueClipId(preferred: string, used: Set<string>): string {
  if (!used.has(preferred)) {
    used.add(preferred);
    return preferred;
  }
  let suffix = 2;
  while (used.has(`${preferred}_${suffix}`)) suffix += 1;
  const id = `${preferred}_${suffix}`;
  used.add(id);
  return id;
}

function sameSourceRef(left: CaptionSourceRef | undefined, right: CaptionSourceRef | undefined): boolean {
  return !!left && !!right
    && left.assetId === right.assetId
    && left.segmentIndex === right.segmentIndex
    && left.wordStart === right.wordStart
    && left.wordEnd === right.wordEnd;
}

/** Rebuild the semantic managed-caption lane directly from V2 transcript and narrative truth. */
export function relayManagedCaptionTrack(
  document: EditorDocumentV2,
  requestedSource?: CaptionSourceSelection,
): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  const trackId = document.semantics.managedCaptionTrackId;
  if (!trackId) return { ok: true, document, receipt: emptyCommandReceipt('captions.relay') };
  const trackIndex = document.timeline.tracks.findIndex((candidate) => candidate.id === trackId);
  if (trackIndex < 0) return commandFailure(document, 'track-not-found', `Track does not exist: ${trackId}`, { trackIds: [trackId] });
  const track = document.timeline.tracks[trackIndex]!;
  if (track.locked) return commandFailure(document, 'track-locked', `Track is locked: ${trackId}`, { trackIds: [trackId] });

  // Captions-off is authoritative. Bare relays arrive from transcript edits and sync passes; if
  // they materialize cues into a lane the user just switched off, captions resurrect on the next
  // word edit — a real incident surfaced them from the wrong source entirely.
  const on = document.appearance.captionStyle?.on ?? Boolean(track.clips.length);
  if (!on) {
    if (!track.clips.length) return { ok: true, document, receipt: emptyCommandReceipt('captions.relay') };
    const tracks = [...document.timeline.tracks];
    tracks[trackIndex] = { ...track, clips: [] };
    const receipt = emptyCommandReceipt('captions.relay');
    receipt.affectedTrackIds = [track.id];
    return { ok: true, document: { ...document, timeline: { ...document.timeline, tracks } }, receipt };
  }

  const selection = requestedSource ?? document.semantics.managedCaptionSource ?? { mode: 'auto' };
  const automaticTrack = selection.mode === 'auto' ? dominantTimelineSpeechTrack(document) : null;
  const speechClips = automaticTrack?.clips ?? selectedSpeechClips(document, selection);
  // `auto` is a discovery instruction, not a durable relationship. Once the first viable speech
  // lane is chosen, pin that lane so a later mute/unmute action changes playback only and cannot
  // silently rebind or remove the user's generated captions.
  const persistedSelection: CaptionSourceSelection = automaticTrack
    ? { mode: 'track', trackId: automaticTrack.trackId }
    : selection;
  const captionTruthKnown = Object.values(document.semantics.transcripts).some((segments) => segments.length > 0);
  if (!speechClips.length && !captionTruthKnown && !requestedSource) {
    return { ok: true, document, receipt: emptyCommandReceipt('captions.relay') };
  }
  if (!speechClips.length && requestedSource) {
    return commandFailure(document, 'invalid-command', 'The selected caption source has no placed transcript-bearing media.', {
      path: requestedSource.mode === 'track' ? 'source.trackId' : requestedSource.mode === 'clip' ? 'source.clipId' : 'source',
    });
  }

  const firstSpeechAssetId = speechClips[0]?.assetId;
  const sourceKeys = priorSourceKeys(document, track.clips);
  const assetBySourceKey = new Map<string, string>();
  const mapped = speechClips.flatMap((clip) => {
    const assetId = clip.assetId;
    const segments = document.semantics.transcripts[assetId] ?? [];
    const sourceKey = sourceKeys.get(assetId) ?? document.assets[assetId]?.locator.remoteUrl ?? `blob:pireel-offline/${assetId}`;
    assetBySourceKey.set(sourceKey, assetId);
    const range = sourceRange(clip, document.canvas.fps);
    return (segments as AsrSegment[]).flatMap((segment, segmentIndex) => {
      const sourceWords = (segment.words ?? []).map((word, wordIndex) => ({ ...word, si: wordIndex }));
      const words = sourceWords.filter((word) => word.end > range.start && word.start < range.end);
      if (sourceWords.length && !words.length) return [];
      if (!sourceWords.length && (segment.end <= range.start || segment.start >= range.end)) return [];
      return mapTranscriptSegsToEdited(
        [{ ...segment, ...(sourceWords.length ? { words } : {}) } as AsrSegment],
        (sourceSec) => sourceSecToTimelineSec(clip, sourceSec, document.canvas.fps),
        sourceKey,
      ).map((mappedSegment) => ({ ...mappedSegment, ref: { ...mappedSegment.ref, seg: segmentIndex } }));
    });
  }).sort((left, right) => left.start - right.start);
  const sourceSegment = (ref: CueRef): AsrSegment | undefined => {
    // Missing ref.src can only come from an older caption block. Resolve it by current lane order
    // once; newly relayed blocks always carry their source key.
    const assetId = ref.src ? assetBySourceKey.get(ref.src) : firstSpeechAssetId;
    return assetId ? document.semantics.transcripts[assetId]?.[ref.seg] as AsrSegment | undefined : undefined;
  };
  const cues = displayCuesFromMappedSegs(mapped, sourceSegment, {
    canvasW: document.canvas.width,
    style: document.appearance.captionStyle,
    ...(document.appearance.captionStyle?.sub?.lang ? { subLang: document.appearance.captionStyle.sub.lang } : {}),
  });
  const blocks = captionBlocksFromAsr(cues);
  const existingById = new Map(track.clips.map((clip) => [clip.id, clip] as const));
  const usedIds = new Set(document.timeline.tracks
    .filter((candidate) => candidate.id !== trackId)
    .flatMap((candidate) => candidate.clips.map((clip) => clip.id)));
  const reusedPreviousIds = new Set<string>();
  const clips: CaptionTimelineClip[] = blocks.map((block, index) => {
    const ref = block.slots.ref as CueRef | undefined;
    const assetId = ref?.src ? assetBySourceKey.get(ref.src) : firstSpeechAssetId;
    const sourceRef: CaptionSourceRef | undefined = ref && assetId
      ? { assetId, segmentIndex: ref.seg, wordStart: ref.w0, wordEnd: ref.w1 }
      : undefined;
    const previousByGeneratedId = existingById.get(block.id);
    const previous = previousByGeneratedId?.kind === 'caption'
      && (!previousByGeneratedId.sourceRef || sameSourceRef(previousByGeneratedId.sourceRef, sourceRef))
      ? previousByGeneratedId
      : track.clips.find((clip) => (
          clip.kind === 'caption'
          && !reusedPreviousIds.has(clip.id)
          && sameSourceRef(clip.sourceRef, sourceRef)
        ));
    if (previous) reusedPreviousIds.add(previous.id);
    const id = uniqueClipId(previous?.id || block.id || `caption_${index + 1}`, usedIds);
    const timingOverride = previous?.kind === 'caption'
      && sameSourceRef(previous.sourceRef, sourceRef)
      ? previous.timingOverride
      : undefined;
    const derivedStartFrame = secondsToTimelineFrames(block.startSec, document.canvas.fps);
    const derivedEndFrame = derivedStartFrame + positiveDurationFrames(block.durationSec, document.canvas.fps);
    const startFrame = Math.max(0, derivedStartFrame + (timingOverride?.startOffsetFrames ?? 0));
    // ASR word timings can run past the end of the audio they describe; a cue that outlives the
    // picture and narration would extend the output by a few silent frames (observed: 1588 → 1597)
    // and send the agent chasing a phantom tail. Cues end where the material ends.
    const materialEndFrame = document.timeline.tracks
      .filter((candidate) => candidate.type !== 'caption')
      .reduce((end, candidate) => candidate.clips.reduce((inner, clip) => Math.max(inner, clip.startFrame + clip.durationFrames), end), 0);
    const unboundedEndFrame = Math.max(startFrame + 1, derivedEndFrame + (timingOverride?.endOffsetFrames ?? 0));
    const endFrame = materialEndFrame > startFrame ? Math.min(unboundedEndFrame, materialEndFrame) : unboundedEndFrame;
    return {
      id,
      kind: 'caption',
      startFrame,
      durationFrames: endFrame - startFrame,
      enabled: previous?.enabled ?? true,
      ...(previous?.linkGroupId ? { linkGroupId: previous.linkGroupId } : {}),
      block: retimeCaptionBlock(block, startFrame, endFrame, document.canvas.fps, !!timingOverride),
      managed: true,
      ...(timingOverride ? { timingOverride } : {}),
      ...(sourceRef
        ? {
            sourceRef,
            anchor: {
              type: 'word' as const,
              assetId: sourceRef.assetId,
              segmentIndex: sourceRef.segmentIndex,
              wordIndex: sourceRef.wordStart,
              offsetFrames: 0,
            },
          }
        : { anchor: { type: 'timeline' as const } }),
    };
  });
  if (
    JSON.stringify(track.clips) === JSON.stringify(clips)
    && JSON.stringify(document.semantics.managedCaptionSource) === JSON.stringify(persistedSelection)
  ) {
    return { ok: true, document, receipt: emptyCommandReceipt('captions.relay') };
  }

  const tracks = [...document.timeline.tracks];
  tracks[trackIndex] = { ...track, clips };
  const nextIds = new Set(clips.map((clip) => clip.id));
  const removedIds = new Set(track.clips.map((clip) => clip.id).filter((id) => !nextIds.has(id)));
  const next: EditorDocumentV2 = {
    ...document,
    timeline: { ...document.timeline, tracks },
    semantics: {
      ...document.semantics,
      managedCaptionSource: persistedSelection,
      scenes: removedIds.size
        ? document.semantics.scenes.map((scene) => ({ ...scene, clipIds: scene.clipIds.filter((id) => !removedIds.has(id)) }))
        : document.semantics.scenes,
    },
  };
  const outputIssue = validateEditorDocumentV2(next).find((candidate) => candidate.severity === 'error');
  if (outputIssue) return commandFailure(document, 'invalid-command', outputIssue.message, { path: outputIssue.path });
  const priorIds = new Set(track.clips.map((clip) => clip.id));
  const receipt = emptyCommandReceipt('captions.relay');
  receipt.affectedTrackIds = [trackId];
  receipt.removedClipIds = [...removedIds];
  receipt.createdClipIds = clips.map((clip) => clip.id).filter((id) => !priorIds.has(id));
  return { ok: true, document: next, receipt };
}
