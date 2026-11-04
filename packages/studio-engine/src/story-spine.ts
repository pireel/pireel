import { applyEditorCommand, type EditorCommandReceipt, type EditorDocumentV2 } from '@pireel/studio-engine/editor-document';

/**
 * The story spine (the primary narrative track) is one unbroken run of picture from frame 0: no gap
 * between clips, no clip over another. Every agent edit that changes the spine's layout leaves it that
 * way through this module, so no tool has its own rule for what happens to the spine.
 */

/** Whether the spine already runs unbroken from frame 0. An empty spine is intact. */
export function storySpineIntact(document: EditorDocumentV2): boolean {
  const spine = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId);
  if (!spine?.clips.length) return true;
  let cursor = 0;
  for (const clip of [...spine.clips].sort((left, right) => left.startFrame - right.startFrame)) {
    if (clip.startFrame !== cursor) return false;
    cursor += clip.durationFrames;
  }
  return true;
}

/**
 * Lay the spine end to end from frame 0 in the order its clips start. `firstOnTie` names a clip that
 * goes before any clip starting on the same frame (a clip just moved there). A clip that moves takes
 * its linked partners on other tracks with it; everything else keeps its timeline position.
 */
export function packStorySpine(document: EditorDocumentV2, firstOnTie?: string): EditorDocumentV2 {
  const trackId = document.semantics.primaryNarrativeTrackId;
  const spine = document.timeline.tracks.find((track) => track.id === trackId);
  if (!spine?.clips.length) return document;
  const tie = (id: string) => (id === firstOnTie ? 0 : 1);
  const ordered = [...spine.clips].sort((left, right) => left.startFrame - right.startFrame || tie(left.id) - tie(right.id) || left.id.localeCompare(right.id));
  const delta = new Map<string, number>();
  const partnerDelta = new Map<string, number>();
  let cursor = 0;
  for (const clip of ordered) {
    if (clip.startFrame !== cursor) {
      delta.set(clip.id, cursor - clip.startFrame);
      if (clip.linkGroupId) partnerDelta.set(clip.linkGroupId, cursor - clip.startFrame);
    }
    cursor += clip.durationFrames;
  }
  if (!delta.size) return document;
  const tracks = document.timeline.tracks.map((track) => {
    if (track.id === trackId) {
      return { ...track, clips: ordered.map((clip) => (delta.has(clip.id) ? { ...clip, startFrame: clip.startFrame + delta.get(clip.id)! } : clip)) };
    }
    if (!partnerDelta.size || !track.clips.some((clip) => clip.linkGroupId && partnerDelta.has(clip.linkGroupId))) return track;
    return {
      ...track,
      clips: track.clips.map((clip) => {
        const shift = clip.linkGroupId ? partnerDelta.get(clip.linkGroupId) : undefined;
        return shift ? { ...clip, startFrame: Math.max(0, clip.startFrame + shift) } : clip;
      }),
    };
  });
  return { ...document, timeline: { ...document.timeline, tracks } };
}

/** The spine's layout: which clips, where and how long. Styling a clip does not change it. */
function spineLayout(document: EditorDocumentV2): string {
  const spine = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId);
  return (spine?.clips ?? []).map((clip) => `${clip.id}@${clip.startFrame}+${clip.durationFrames}`).sort().join('|');
}

/**
 * Close the spine after an edit changed its layout and left it broken, and re-lay the captions that
 * follow it. An edit that leaves the spine's layout alone (a filter, a level, a graphic) never
 * touches it, so a gap someone left there on purpose survives unrelated edits.
 */
export function keepStorySpineWhole(before: EditorDocumentV2, document: EditorDocumentV2): { ok: true; document: EditorDocumentV2; receipts: EditorCommandReceipt[] } | { ok: false; error: string } {
  if (storySpineIntact(document) || spineLayout(before) === spineLayout(document)) return { ok: true, document, receipts: [] };
  const packed = packStorySpine(document);
  if (!packed.semantics.managedCaptionTrackId) return { ok: true, document: packed, receipts: [] };
  const relaid = applyEditorCommand(packed, { type: 'captions.relay' });
  if (!relaid.ok) return { ok: false, error: relaid.error.message };
  return { ok: true, document: relaid.document, receipts: [relaid.receipt] };
}
