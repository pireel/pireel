import type { EditorDocumentV2 } from './composition';
import { resolveBrollEdits, type BrollOptions, type BrollCandidate, type BrollPlacement } from './broll-task';
import { applyPipLayout } from './pip-layout';

export function composeBrollDocument(document: EditorDocumentV2, placements: BrollPlacement[], candidates: BrollCandidate[], options: BrollOptions, durationSec: number, prefix = '') {
    const clips = resolveBrollEdits(placements, candidates, options, durationSec);
    let next = structuredClone(document); const fps = next.canvas.fps;
    next.timeline.tracks = next.timeline.tracks.filter(track => ![prefix + 'broll', prefix + 'broll-pip-ground', prefix + 'broll-pip-presenter'].includes(track.id));
    for (const clip of clips) next.assets[prefix + 'broll-' + clip.asset.id] = { id: prefix + 'broll-' + clip.asset.id, kind: clip.asset.kind, label: clip.asset.name, locator: { localSig: clip.asset.sig }, metadata: { width: clip.asset.width, height: clip.asset.height, durationSec: clip.asset.durationSec } };
    next.timeline.tracks.push({ id: prefix + 'broll', type: 'visual', role: 'broll', name: 'B-roll', stackOrder: 1, hidden: false, muted: true, locked: false, syncLocked: false, clips: clips.map(clip => ({ id: prefix + clip.id, kind: 'media', assetId: prefix + 'broll-' + clip.asset.id, startFrame: Math.round(clip.start * fps), durationFrames: Math.max(1, Math.round(clip.duration * fps)), sourceInSec: clip.sourceIn, sourceOutSec: clip.sourceIn + clip.duration, enabled: true, fit: 'cover', ...(clip.asset.kind === 'video' ? { video: { treatment: 'full', audioMuted: true } } : {}) })) });
    // Captions always remain above supplemental footage.
    for (const track of next.timeline.tracks) if (track.type === 'caption') track.stackOrder = Math.max(2, track.stackOrder);
    if (options.pip) next = applyPipLayout(next, options.pip, prefix + 'broll', Object.fromEntries(clips.flatMap(clip => clip.layout ? [[prefix + clip.id, clip.layout]] : [])));
    return next;
}
