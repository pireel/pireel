/**
 * Canonical V2 live editor state with a read-only Composition render projection.
 *
 * EditorDocumentV2 owns persistence/history. Composition is a runtime projection retained for
 * existing panels, preview and export. Runtime media URLs live in a side map so undoing a V2
 * snapshot does not discard already-resolved local bytes and those URLs never enter persistence.
 */

import {
  applyEditorCommand,
  type Composition,
  type EditorCommand,
  type EditorCommandResult,
  type EditorDocumentV2,
  type EditorMediaAsset,
  freezeEditorDocumentBlockVars,
  mergeProjectContextIntoDocument,
  normalizeProjectDocument,
  projectDocumentToLegacyComposition,
} from '@pireel/studio-engine/composition';
import type { StudioProjectContext } from '@pireel/studio-engine/project-dto';

export interface LiveProjectMigrationContext {
  context?: StudioProjectContext;
  videoSig?: string | null;
  videoDurationSec?: number | null;
}

export interface LiveProjectDocumentState {
  document: EditorDocumentV2;
  composition: Composition;
}

export interface LiveProjectDocumentSession {
  projectId: string;
  state: LiveProjectDocumentState;
  runtimeAssetUrls: Map<string, string>;
}

const isCompatibilityPlaceholder = (url: string) => url.startsWith('blob:pireel-offline/');

export function resolveLiveAssetUrl(session: LiveProjectDocumentSession, asset: EditorMediaAsset): string | undefined {
  return session.runtimeAssetUrls.get(asset.id) ?? asset.locator.remoteUrl;
}

/** Attach session-only bytes to a durable asset identity without mutating the document. */
export function rememberLiveAssetUrl(session: LiveProjectDocumentSession, assetId: string, url: string): void {
  if (!assetId) throw new Error('Asset id is required.');
  if (!url || isCompatibilityPlaceholder(url)) return;
  session.runtimeAssetUrls.set(assetId, url);
}

function assetClipIdMap(document: EditorDocumentV2): Map<string, string> {
  const result = new Map<string, string>();
  for (const track of document.timeline.tracks) {
    for (const clip of track.clips) {
      if ('assetId' in clip && clip.assetId) result.set(clip.id, clip.assetId);
    }
  }
  return result;
}

/** Capture only runtime resolution, keyed by durable asset identity. */
export function rememberCompositionRuntimeUrls(
  document: EditorDocumentV2,
  composition: Composition,
  into: Map<string, string>,
): void {
  const remember = (assetId: string | undefined, url: string | undefined) => {
    if (assetId && url && !isCompatibilityPlaceholder(url)) into.set(assetId, url);
  };
  remember(document.semantics.primaryNarrativeAssetId, composition.video?.url);
  const clipAssets = assetClipIdMap(document);
  for (const shot of composition.shots ?? []) remember(clipAssets.get(shot.id), shot.src);
  for (const block of composition.blocks ?? []) {
    const media = block.slots?.media as { url?: string } | undefined;
    remember(clipAssets.get(block.id), media?.url);
  }
  for (const audio of composition.audioTracks ?? []) remember(clipAssets.get(audio.id), audio.src);
}

function projectRuntimeComposition(session: LiveProjectDocumentSession, document: EditorDocumentV2): Composition {
  return projectDocumentToLegacyComposition(
    { projectId: session.projectId, value: document },
    { resolveAssetUrl: (asset) => session.runtimeAssetUrls.get(asset.id) },
  );
}

export function createLiveProjectDocumentSession(
  projectId: string,
  composition: Composition,
  migration: LiveProjectMigrationContext = {},
): LiveProjectDocumentSession {
  const document = normalizeProjectDocument({
    projectId,
    value: composition,
    context: migration.context,
    videoSig: migration.videoSig,
    videoDurationSec: migration.videoDurationSec,
  }).document;
  const session: LiveProjectDocumentSession = {
    projectId,
    state: { document, composition },
    runtimeAssetUrls: new Map(),
  };
  rememberCompositionRuntimeUrls(document, composition, session.runtimeAssetUrls);
  return session;
}

/** Build a persistence-safe V2 snapshot from canonical authority and project metadata. */
export function persistableLiveProjectDocument(
  session: LiveProjectDocumentSession,
  migration: LiveProjectMigrationContext = {},
  options: { stripManagedCaptions?: boolean } = {},
): EditorDocumentV2 {
  const document = mergeProjectContextIntoDocument({
    projectId: session.projectId,
    document: session.state.document,
    context: migration.context,
    videoSig: migration.videoSig,
    videoDurationSec: migration.videoDurationSec,
  });
  if (!options.stripManagedCaptions || !document.semantics.managedCaptionTrackId) return document;
  return {
    ...document,
    timeline: {
      ...document.timeline,
      tracks: document.timeline.tracks.map((track) => (
        track.id === document.semantics.managedCaptionTrackId ? { ...track, clips: [] } : track
      )),
    },
  };
}

/** Restore/replace the V2 authority (undo, redo, cloud restore or a native V2 command). */
export function applyDocumentToLiveProject(
  session: LiveProjectDocumentSession,
  document: EditorDocumentV2,
  runtimeComposition?: Composition,
): LiveProjectDocumentState {
  const canonical = freezeEditorDocumentBlockVars(
    normalizeProjectDocument({ projectId: session.projectId, value: document }).document,
  );
  if (runtimeComposition) rememberCompositionRuntimeUrls(canonical, runtimeComposition, session.runtimeAssetUrls);
  const composition = runtimeComposition ?? projectRuntimeComposition(session, canonical);
  session.state = { document: canonical, composition };
  return session.state;
}

/** Native V2 mutation gateway. Failed commands leave both authority and runtime projection intact. */
export function applyCommandToLiveProject(
  session: LiveProjectDocumentSession,
  command: EditorCommand,
): EditorCommandResult {
  const result = applyEditorCommand(session.state.document, command);
  if (!result.ok) return result;
  const next = applyDocumentToLiveProject(session, result.document);
  return { ...result, document: next.document };
}

export function projectLiveDocument(session: LiveProjectDocumentSession): Composition {
  return projectRuntimeComposition(session, session.state.document);
}
