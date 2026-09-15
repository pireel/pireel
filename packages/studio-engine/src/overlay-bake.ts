/**
 * Replace a graphic clip with rendered footage of itself, in place. The clip keeps its identity,
 * lane, frames and links, so scene anchors and stacking survive; only its kind changes. Used after a
 * component has been baked to a video outside the closed component runtime.
 */

import { runAgentTimelineTool } from './agent-timeline';
import {
  validateEditorDocumentV2,
  type EditorCommandError,
  type EditorDocumentV2,
  type MediaTimelineClip,
} from './editor-document';

export interface BakeOverlayClipToMediaInput {
  document: EditorDocumentV2;
  clipId: string;
  /** The rendered footage, registered as a video asset before the swap. */
  asset: { id: string; label?: string; url: string; durationSec: number; width: number; height: number };
}

export type BakeOverlayClipToMediaResult =
  | { ok: true; document: EditorDocumentV2; assetId: string; startFrame: number; durationFrames: number }
  | { ok: false; document: EditorDocumentV2; error: EditorCommandError };

const fail = (document: EditorDocumentV2, code: EditorCommandError['code'], message: string): BakeOverlayClipToMediaResult =>
  ({ ok: false, document, error: { code, message } });

export function bakeOverlayClipToMedia(input: BakeOverlayClipToMediaInput): BakeOverlayClipToMediaResult {
  const { document, clipId, asset } = input;
  const track = document.timeline.tracks.find((candidate) => candidate.clips.some((clip) => clip.id === clipId));
  const original = track?.clips.find((clip) => clip.id === clipId);
  if (!track || !original) return fail(document, 'clip-not-found', `Clip does not exist: ${clipId}`);
  if (original.kind !== 'graphic') return fail(document, 'invalid-command', `Only a graphic clip can be baked: ${clipId}`);
  if (track.locked) return fail(document, 'track-locked', `Track is locked: ${track.id}`);

  const registered = runAgentTimelineTool(document, 'register_media', {
    assets: [{ id: asset.id, kind: 'video', ...(asset.label ? { label: asset.label } : {}), url: asset.url, durationSec: asset.durationSec, width: asset.width, height: asset.height }],
  });
  if (!registered.ok || !registered.document) return fail(document, 'invalid-command', registered.error ?? 'Rendered footage could not be registered.');

  const { startFrame, durationFrames } = original;
  const media: MediaTimelineClip = {
    id: original.id,
    kind: 'media',
    assetId: asset.id,
    startFrame,
    durationFrames,
    enabled: original.enabled,
    ...(original.linkGroupId ? { linkGroupId: original.linkGroupId } : {}),
    sourceInSec: 0,
    sourceOutSec: durationFrames / document.canvas.fps,
    fit: 'contain',
    box: { x: 0, y: 0, w: 1, h: 1 },
    video: { treatment: 'full', audioMuted: true },
  };
  const baked: EditorDocumentV2 = {
    ...registered.document,
    timeline: {
      ...registered.document.timeline,
      tracks: registered.document.timeline.tracks.map((candidate) => candidate.id !== track.id ? candidate : {
        ...candidate,
        clips: candidate.clips.map((clip) => clip.id !== clipId ? clip : media),
      }),
    },
  };
  const issue = validateEditorDocumentV2(baked).find((candidate) => candidate.severity === 'error');
  if (issue) return fail(document, 'invalid-document', issue.message);
  return { ok: true, document: baked, assetId: asset.id, startFrame, durationFrames };
}
