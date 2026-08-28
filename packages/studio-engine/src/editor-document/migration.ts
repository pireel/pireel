import { audioClipDefaults } from '../audio-tracks';
import type { Block, Composition, VideoShot } from '../composition-core';
import type { LocalAssetIndexEntry, ProjectCloudMediaIndex, TranscriptSegment } from '../project-dto';
import { createMigrationAssetRegistry } from './asset-registry';
import { DEFAULT_TIMELINE_FPS, isFinitePositive, positiveDurationFrames, secondsToTimelineFrames } from './time';
import {
  EDITOR_DOCUMENT_VERSION,
  type AssetId,
  type AudioTimelineClip,
  type CaptionSourceRef,
  type CaptionTimelineClip,
  type EditorDocumentIssue,
  type EditorDocumentMigrationResult,
  type EditorDocumentV2,
  type EditorMediaAsset,
  type EditorTrack,
  type GraphicBlockPayload,
  type GraphicTimelineClip,
  type NarrativeTimelineClip,
} from './types';
import { validateEditorDocumentV2 } from './validation';

export interface LegacyProjectForMigration {
  projectId: string;
  composition: Composition;
  context?: LegacyStudioProjectContext;
  /** Stored outside Composition because persisted V1 strips the runtime video object. */
  videoSig?: string | null;
  videoDurationSec?: number | null;
  fps?: number;
  canvasConfigured?: boolean;
}

/** Retired V1 row shadow. Only the one-shot online migration may consume this shape. */
export interface LegacyStudioProjectContext {
  asr?: TranscriptSegment[];
  clipAsr?: Record<string, TranscriptSegment[]>;
  plan?: unknown;
  media?: ProjectCloudMediaIndex;
  localAssets?: LocalAssetIndexEntry[];
}

function managedCaptionBlock(block: Block): boolean {
  // Today every managed sentence caption uses this template and no box. Avoid registry lookups in
  // migration so the pure data path does not depend on template side-effect registration.
  return block.templateId === 'caption' && !block.box;
}

function stripBlockPlacement(block: Block): GraphicBlockPayload {
  const { id: _id, startSec: _startSec, durationSec: _durationSec, trackIndex: _trackIndex, ...payload } = block;
  // Some pre-template projects (and a few early server-generated blocks) predate the required
  // templateId/slots fields. The persisted-data boundary must accept those rows even though the
  // current in-memory Composition type is stricter.
  return {
    ...payload,
    templateId: typeof block.templateId === 'string' && block.templateId ? block.templateId : 'custom',
    slots: block.slots && typeof block.slots === 'object' ? block.slots : {},
  };
}

function stripMediaUrl(payload: GraphicBlockPayload): GraphicBlockPayload {
  const media = payload.slots.media as { type?: 'image' | 'video'; url?: string } | undefined;
  if (!media?.url) return payload;
  const { url: _url, ...stableMedia } = media;
  return { ...payload, slots: { ...payload.slots, media: stableMedia } };
}

function captionSourceRef(block: Block, sourceToAssetId: Map<string, AssetId>, mainAssetId?: AssetId): CaptionSourceRef | undefined {
  const ref = block.slots?.ref as { src?: string | null; seg?: number; w0?: number; w1?: number } | undefined;
  if (!ref || !Number.isInteger(ref.seg) || !Number.isInteger(ref.w0) || !Number.isInteger(ref.w1)) return undefined;
  const assetId = ref.src ? sourceToAssetId.get(ref.src) : mainAssetId;
  if (!assetId) return undefined;
  return { assetId, segmentIndex: ref.seg!, wordStart: ref.w0!, wordEnd: ref.w1! };
}

function uniqueLegacyId(preferred: string, used: Set<string>, fallback: string): string {
  const base = preferred || fallback;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let suffix = 2;
  while (used.has(`${base}_${suffix}`)) suffix += 1;
  const id = `${base}_${suffix}`;
  used.add(id);
  return id;
}

/**
 * Deterministically convert the complete persisted V1 project state to V2.
 * The function is pure and safe to run repeatedly; V2 ids depend only on the project and legacy identities.
 */
export function migrateLegacyProjectToV2(input: LegacyProjectForMigration): EditorDocumentMigrationResult {
  const comp = input.composition;
  const context = input.context ?? {};
  const fps = isFinitePositive(input.fps) ? Math.min(240, Math.max(1, Math.round(input.fps))) : DEFAULT_TIMELINE_FPS;
  const projectId = input.projectId || 'legacy-project';
  const registry = createMigrationAssetRegistry(projectId);
  const { assets, sourceToAssetId, upsert: upsertAsset } = registry;
  const issues: EditorDocumentIssue[] = [];
  const usedClipIds = new Set<string>();

  const mainLocator = {
    ...(input.videoSig ? { localSig: input.videoSig } : {}),
    ...(context.media?.video?.key ? { cloudKey: context.media.video.key } : {}),
    ...(comp.video?.url ? { remoteUrl: comp.video.url } : {}),
  };
  const mainDuration = isFinitePositive(comp.video?.durationSec)
    ? comp.video.durationSec
    : isFinitePositive(input.videoDurationSec)
      ? input.videoDurationSec
      : undefined;
  const hasImplicitMain = comp.shots === undefined && isFinitePositive(mainDuration);
  const hasMainReference = !!comp.video || !!input.videoSig || !!context.media?.video || !!mainDuration || (comp.shots ?? []).some((shot) => !shot.src);
  const mainAssetId = hasMainReference
    ? upsertAsset('video', mainLocator, 'main-video', {
        label: 'Main narration',
        metadata: {
          ...(mainDuration ? { durationSec: mainDuration } : {}),
          ...(comp.video?.sourceWidth ? { width: comp.video.sourceWidth } : {}),
          ...(comp.video?.sourceHeight ? { height: comp.video.sourceHeight } : {}),
          hasAudio: true,
        },
      })
    : undefined;
  if (mainAssetId && comp.video?.url) sourceToAssetId.set(comp.video.url, mainAssetId);

  const legacyShots: VideoShot[] = Array.isArray(comp.shots)
    ? comp.shots
    : hasImplicitMain
      ? [{ id: 'main', srcStart: 0, srcEnd: mainDuration!, treatment: 'full' }]
      : [];

  const narrativeClips: NarrativeTimelineClip[] = [];
  let cursorSec = 0;
  for (const [index, shot] of legacyShots.entries()) {
    const sourceDuration = Math.max(0, shot.srcEnd - shot.srcStart);
    const locator = shot.src
      ? {
          ...(shot.srcSig ? { localSig: shot.srcSig } : {}),
          ...(shot.srcSig && context.media?.clips?.[shot.srcSig]?.key ? { cloudKey: context.media.clips[shot.srcSig]!.key } : {}),
          ...(!shot.src.startsWith('blob:pireel-offline/') ? { remoteUrl: shot.src } : {}),
        }
      : mainLocator;
    const assetId = shot.src
      ? upsertAsset('video', locator, `shot-source:${shot.src || shot.id}`, {
          label: shot.srcSig ?? `Video source ${index + 1}`,
          metadata: { durationSec: shot.srcEnd, hasAudio: true },
        })
      : mainAssetId;
    if (!assetId) {
      issues.push({ severity: 'error', code: 'missing-main-asset', path: `composition.shots[${index}]`, message: 'A narration shot has no resolvable source asset.' });
      continue;
    }
    if (shot.src) sourceToAssetId.set(shot.src, assetId);
    const startFrame = secondsToTimelineFrames(cursorSec, fps);
    cursorSec += sourceDuration;
    const endFrame = secondsToTimelineFrames(cursorSec, fps);
    const { id: oldId, src: _src, srcSig: _srcSig, srcStart, srcEnd, mediaFraming, ...properties } = shot;
    narrativeClips.push({
      id: uniqueLegacyId(oldId, usedClipIds, `narrative_${index + 1}`),
      kind: 'narrative',
      assetId,
      startFrame,
      durationFrames: Math.max(1, endFrame - startFrame),
      enabled: true,
      sourceInSec: srcStart,
      sourceOutSec: srcEnd,
      ...(mediaFraming ? { mediaFraming } : {}),
      properties,
    });
  }

  const primaryTrackId = 'track_primary_narrative';
  const tracks: EditorTrack[] = [{
    id: primaryTrackId,
    type: 'visual',
    role: 'primaryNarrative',
    name: 'Primary narrative',
    muted: false,
    hidden: false,
    locked: false,
    syncLocked: true,
    stackOrder: 0,
    clips: narrativeClips,
  }];

  const regularBlocks = new Map<number, Block[]>();
  const captionBlocks: Block[] = [];
  for (const block of comp.blocks ?? []) {
    if (managedCaptionBlock(block)) captionBlocks.push(block);
    else {
      const lane = Number.isFinite(block.trackIndex) ? Math.max(1, Math.round(block.trackIndex)) : 1;
      regularBlocks.set(lane, [...(regularBlocks.get(lane) ?? []), block]);
    }
  }

  for (const [lane, blocks] of [...regularBlocks.entries()].sort(([left], [right]) => left - right)) {
    const clips: GraphicTimelineClip[] = blocks.map((block, index) => {
      const rawMedia = block.slots?.media as { type?: 'image' | 'video'; url?: string } | undefined;
      // Local image blocks historically persisted only a data/object URL plus their display label;
      // the durable file signature lived in context.localAssets. Rejoin those halves before the
      // runtime URL is stripped, otherwise the first V2 save would make the placed image unrestorable.
      const localMedia = rawMedia && block.label
        ? (context.localAssets ?? []).find((entry) => (
            (entry.kind ?? 'video') === rawMedia.type && entry.label === block.label
          ))
        : undefined;
      const assetId = rawMedia?.url && (rawMedia.type === 'image' || rawMedia.type === 'video')
        ? upsertAsset(rawMedia.type, {
            ...(localMedia?.sig ? { localSig: localMedia.sig } : {}),
            ...(localMedia?.sig && context.media?.clips?.[localMedia.sig]?.key ? { cloudKey: context.media.clips[localMedia.sig]!.key } : {}),
            ...(!rawMedia.url.startsWith('blob:pireel-offline/') ? { remoteUrl: rawMedia.url } : {}),
          }, `block-media:${block.id}`, {
            label: block.label,
            metadata: {},
          })
        : undefined;
      return {
        id: uniqueLegacyId(block.id, usedClipIds, `graphic_${lane}_${index + 1}`),
        kind: 'graphic',
        startFrame: secondsToTimelineFrames(block.startSec, fps),
        durationFrames: positiveDurationFrames(block.durationSec, fps),
        enabled: true,
        block: assetId ? stripMediaUrl(stripBlockPlacement(block)) : stripBlockPlacement(block),
        ...(assetId ? { assetId } : {}),
        anchor: { type: 'timeline' },
      };
    });
    tracks.push({
      id: `track_graphics_${lane}`,
      type: 'graphics',
      role: 'graphics',
      name: `Graphics ${lane}`,
      muted: false,
      hidden: false,
      locked: false,
      syncLocked: true,
      stackOrder: lane,
      clips,
    });
  }

  let managedCaptionTrackId: string | undefined;
  if (captionBlocks.length) {
    managedCaptionTrackId = 'track_managed_captions';
    // Legacy assembly always forced managed captions above every graphic. The native compositor is
    // globally track-ordered, so migrate that visual guarantee into data instead of keeping a render
    // special case. New projects may explicitly reorder the caption track afterwards.
    const stackOrder = Math.max(
      1,
      ...captionBlocks.map((block) => block.trackIndex || 1),
      ...regularBlocks.keys(),
    ) + 1;
    const clips: CaptionTimelineClip[] = captionBlocks.map((block, index) => {
      const ref = captionSourceRef(block, sourceToAssetId, mainAssetId);
      return {
        id: uniqueLegacyId(block.id, usedClipIds, `caption_${index + 1}`),
        kind: 'caption',
        startFrame: secondsToTimelineFrames(block.startSec, fps),
        durationFrames: positiveDurationFrames(block.durationSec, fps),
        enabled: true,
        block: stripBlockPlacement(block),
        managed: true,
        ...(ref
          ? {
              sourceRef: ref,
              anchor: { type: 'word' as const, assetId: ref.assetId, segmentIndex: ref.segmentIndex, wordIndex: ref.wordStart, offsetFrames: 0 },
            }
          : { anchor: { type: 'timeline' as const } }),
      };
    });
    tracks.push({
      id: managedCaptionTrackId,
      type: 'caption',
      role: 'managedCaptions',
      name: 'Managed captions',
      muted: false,
      hidden: false,
      locked: false,
      syncLocked: true,
      stackOrder,
      clips,
    });
  }

  if ((comp.audioTracks?.length ?? 0) > 0) {
    const clips: AudioTimelineClip[] = comp.audioTracks!.map((audio, index) => {
      const locator = {
        ...(audio.sig ? { localSig: audio.sig } : {}),
        ...(audio.sig && context.media?.clips?.[audio.sig]?.key ? { cloudKey: context.media.clips[audio.sig]!.key } : {}),
        ...(audio.src && !audio.src.startsWith('blob:pireel-offline/') ? { remoteUrl: audio.src } : {}),
      };
      const assetId = upsertAsset('audio', locator, `audio:${audio.id}`, {
        label: audio.label,
        metadata: { ...(isFinitePositive(audio.durationSec) ? { durationSec: audio.durationSec } : {}) },
      });
      if (audio.src) sourceToAssetId.set(audio.src, assetId);
      const defaults = audioClipDefaults(audio);
      const knownOut = Number.isFinite(defaults.outSec) ? defaults.outSec : undefined;
      const timelineDuration = knownOut == null ? 1 / fps : Math.max(0, (knownOut - defaults.inSec) / defaults.speed);
      if (knownOut == null) {
        issues.push({
          severity: 'warning',
          code: 'unresolved-audio-duration',
          path: `composition.audioTracks[${index}]`,
          message: 'Audio duration is unresolved; a one-frame placeholder was migrated until metadata is restored.',
        });
      }
      const {
        id: oldId,
        src: _src,
        sig: _sig,
        durationSec: _durationSec,
        startSec: _startSec,
        inSec: _inSec,
        outSec: _outSec,
        role: _role,
        ...properties
      } = audio;
      return {
        id: uniqueLegacyId(oldId, usedClipIds, `audio_${index + 1}`),
        kind: 'audio',
        assetId,
        startFrame: secondsToTimelineFrames(defaults.startSec, fps),
        durationFrames: positiveDurationFrames(timelineDuration, fps),
        enabled: true,
        sourceInSec: defaults.inSec,
        ...(knownOut != null ? { sourceOutSec: knownOut } : {}),
        properties,
        anchor: { type: 'timeline' },
      };
    });
    tracks.push({
      id: 'track_audio_1',
      type: 'audio',
      role: 'music',
      name: 'Audio 1',
      muted: false,
      hidden: false,
      locked: false,
      // Legacy edits had no persisted sync-lock flag. Migrate to the NLE/a professional NLE default so
      // narration ripple cuts keep existing audio cues aligned; users may opt a music lane out later.
      syncLocked: true,
      stackOrder: 0,
      clips,
    });
  }

  addLibraryAssets(context, registry);

  const transcripts: Record<AssetId, TranscriptSegment[]> = {};
  if (mainAssetId && context.asr?.length) transcripts[mainAssetId] = context.asr;
  for (const [source, transcript] of Object.entries(context.clipAsr ?? {})) {
    let assetId = sourceToAssetId.get(source);
    if (!assetId) {
      assetId = upsertAsset('video', { remoteUrl: source }, `transcript-source:${source}`, { metadata: {} });
      sourceToAssetId.set(source, assetId);
    }
    transcripts[assetId] = transcript;
  }

  const hasLegacyContent = legacyShots.length > 0 || (comp.blocks?.length ?? 0) > 0 || (comp.audioTracks?.length ?? 0) > 0;
  const document: EditorDocumentV2 = {
    version: EDITOR_DOCUMENT_VERSION,
    canvas: {
      width: isFinitePositive(comp.width) ? Math.round(comp.width) : 1920,
      height: isFinitePositive(comp.height) ? Math.round(comp.height) : 1080,
      fps,
      configured: input.canvasConfigured ?? (hasLegacyContent || comp.width !== 1920 || comp.height !== 1080),
    },
    appearance: {
      theme: comp.theme ?? 'general',
      ...(comp.palette ? { palette: comp.palette } : {}),
      ...(comp.captionStyle ? { captionStyle: comp.captionStyle } : {}),
      ...(comp.frameId ? { frameId: comp.frameId } : {}),
      ...(comp.customVisualStyle ? { customVisualStyle: comp.customVisualStyle } : {}),
      ...(comp.personFx ? { personFx: comp.personFx } : {}),
    },
    assets,
    timeline: { tracks },
    semantics: {
      primaryNarrativeTrackId: primaryTrackId,
      ...(managedCaptionTrackId ? { managedCaptionTrackId } : {}),
      transcripts,
      scenes: [],
      ...(context.plan !== undefined ? { plan: context.plan } : {}),
    },
    ...(comp.audioDenoise ? { processing: { audioDenoise: comp.audioDenoise } } : {}),
  };

  return { document, issues: [...issues, ...validateEditorDocumentV2(document)] };
}

function addLibraryAssets(context: LegacyStudioProjectContext, registry: ReturnType<typeof createMigrationAssetRegistry>): void {
  for (const [index, entry] of (context.localAssets ?? []).entries()) {
    const kind = entry.kind ?? 'video';
    registry.upsert(kind, {
      localSig: entry.sig,
      ...(context.media?.clips?.[entry.sig]?.key ? { cloudKey: context.media.clips[entry.sig]!.key } : {}),
    }, `local-index:${index}`, {
      label: entry.label,
      metadata: {
        ...(isFinitePositive(entry.w) ? { width: entry.w } : {}),
        ...(isFinitePositive(entry.h) ? { height: entry.h } : {}),
      },
      library: {
        createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : 0,
        ...(entry.folder ? { folder: entry.folder } : {}),
      },
    });
  }

  // Preserve cloud-backed sources that are not placed and have no local-index row yet.
  for (const [sig, ref] of Object.entries(context.media?.clips ?? {})) {
    const known: EditorMediaAsset | undefined = registry.findByLocalSig(sig);
    if (known) known.locator = { ...known.locator, cloudKey: ref.key };
    else registry.upsert('video', { localSig: sig, cloudKey: ref.key }, `cloud-clip:${sig}`, { metadata: {} });
  }
}
