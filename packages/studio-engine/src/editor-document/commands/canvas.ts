import type { EditorDocumentV2, TimelineClip } from '../types';
import { validateEditorDocumentV2 } from '../validation';
import {
  commandFailure,
  emptyCommandReceipt,
  type CanvasPatch,
  type EditorCommandResult,
} from './types';

function validCanvasDimension(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

const r4 = (value: number) => {
  const rounded = Math.round(value * 10_000) / 10_000;
  return rounded === 0 ? 0 : rounded;
};

type MediaBox = { x: number; y: number; w: number; h: number };
const FULL_MEDIA_BOX: MediaBox = { x: 0, y: 0, w: 1, h: 1 };

function resizeAroundRelativeCentre(box: MediaBox, width: number, height: number): MediaBox {
  const centerX = box.x + box.w / 2;
  const centerY = box.y + box.h / 2;
  return {
    x: r4(centerX - width / 2),
    y: r4(centerY - height / 2),
    w: r4(width),
    h: r4(height),
  };
}

const hasDefaultLayerScale = (box: MediaBox) => (
  Math.abs(box.w - 1) <= 0.0001 && Math.abs(box.h - 1) <= 0.0001
);

/** Match a professional NLE/Jianying-style ratio changes: width is the stable normalized scale axis, height
 * compensates for the new canvas aspect, and the clip remains around the same relative centre. */
function reflowCustomMediaBox(box: MediaBox, canvasAspectScale: number): MediaBox {
  return resizeAroundRelativeCentre(box, box.w, box.h * canvasAspectScale);
}

function reflowMediaClip(
  clip: TimelineClip,
  document: EditorDocumentV2,
  from: { width: number; height: number },
  to: { width: number; height: number },
): TimelineClip {
  if (clip.kind !== 'narrative' && clip.kind !== 'media') return clip;
  const asset = document.assets[clip.assetId];
  const sourceWidth = asset?.metadata.width;
  const sourceHeight = asset?.metadata.height;
  if (!sourceWidth || !sourceHeight || sourceWidth <= 0 || sourceHeight <= 0) return clip;

  const current = clip.box ?? FULL_MEDIA_BOX;
  const canvasAspectScale = (to.width / to.height) / (from.width / from.height);
  const boxKeyframes = clip.kind === 'media' ? clip.keyframes?.box : undefined;
  const hasScaleAnimation = !!boxKeyframes?.length;
  // The compositor already owns default contain/cover fitting inside the full media layer. Keeping
  // that wrapper intact is our equivalent of a professional NLE's new-canvas fitTransform; materializing the
  // visible fit here would apply the same fit twice and break source-aware framing treatments.
  if (!hasScaleAnimation && hasDefaultLayerScale(current)) return clip;
  const box = reflowCustomMediaBox(current, canvasAspectScale);
  if (clip.kind === 'narrative') return { ...clip, box };
  const nextBoxKeyframes = boxKeyframes?.map((keyframe) => ({
    ...keyframe,
    ...reflowCustomMediaBox(keyframe, canvasAspectScale),
  }));
  return {
    ...clip,
    box,
    ...(nextBoxKeyframes ? { keyframes: { ...clip.keyframes, box: nextBoxKeyframes } } : {}),
  };
}

/** Patch deliberate output dimensions. Aspect changes uniformly rebase native media transforms;
 * default-fit clips are re-fitted while custom clips keep their relative centre and width scale. */
export function patchEditorCanvas(document: EditorDocumentV2, patch: CanvasPatch): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  if (!validCanvasDimension(patch.width) || !validCanvasDimension(patch.height)) {
    return commandFailure(document, 'invalid-range', 'Canvas width and height must be positive integers.', { path: 'canvas' });
  }
  if (
    document.canvas.width === patch.width
    && document.canvas.height === patch.height
    && document.canvas.configured
  ) {
    return { ok: true, document, receipt: emptyCommandReceipt('canvas.patch') };
  }

  const from = { width: document.canvas.width, height: document.canvas.height };
  const to = { width: patch.width, height: patch.height };
  const aspectChanged = Math.abs(from.width / from.height - to.width / to.height) > 0.000001;
  const affectedTrackIds: string[] = [];
  const tracks = aspectChanged
    ? document.timeline.tracks.map((track) => {
        const clips = track.clips.map((clip) => reflowMediaClip(clip, document, from, to));
        const changed = clips.some((clip, index) => clip !== track.clips[index]);
        if (changed) affectedTrackIds.push(track.id);
        return changed ? { ...track, clips } : track;
      })
    : document.timeline.tracks;
  const next: EditorDocumentV2 = {
    ...document,
    canvas: {
      ...document.canvas,
      width: patch.width,
      height: patch.height,
      configured: true,
    },
    timeline: { ...document.timeline, tracks },
  };
  const outputIssue = validateEditorDocumentV2(next).find((candidate) => candidate.severity === 'error');
  if (outputIssue) return commandFailure(document, 'invalid-command', outputIssue.message, { path: outputIssue.path });
  const receipt = emptyCommandReceipt('canvas.patch');
  receipt.affectedTrackIds = affectedTrackIds;
  return { ok: true, document: next, receipt };
}
