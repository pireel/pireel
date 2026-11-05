import { describe, expect, it } from 'vitest';
import { applyEditorCommand, emptyEditorDocumentV2, parseEditorDocumentV2, type EditorDocumentV2, type NarrativeTimelineClip, type TimelineTransition } from '../editor-document';
import { spineCuts, transitionAtNearestCut, transitionCut, transitionSlotAt, transitionsAfterInsertion, transitionsAfterRangeRemoval, transitionsAfterRetime } from './transitions';

const t = (id: string, startFrame: number, durationFrames: number): TimelineTransition => ({ id, startFrame, durationFrames, effect: 'fade' });

function spine(transIn?: NarrativeTimelineClip['properties']['transIn']): EditorDocumentV2 {
  const document = emptyEditorDocumentV2({ fps: 30 });
  document.assets.video = { id: 'video', kind: 'video', locator: { localSig: 'sig' }, metadata: { durationSec: 20 } };
  const clip = (id: string, startFrame: number, extra: Partial<NarrativeTimelineClip['properties']> = {}): NarrativeTimelineClip => ({
    id, kind: 'narrative', assetId: 'video', startFrame, durationFrames: 90, enabled: true,
    sourceInSec: startFrame / 30, sourceOutSec: startFrame / 30 + 3, properties: { treatment: 'full', ...extra },
  });
  const primary = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId)!;
  primary.clips = [clip('a', 0), clip('b', 90, transIn ? { transIn } : {})];
  return document;
}

describe('transition lane', () => {
  it('lands a pick on the cut nearest the playhead, centred and clamped to its clips', () => {
    const document = spine();
    expect(spineCuts(document)).toEqual([{ frame: 90, from: 0, to: 180 }]);
    expect(transitionAtNearestCut(document, 10)).toEqual({ kind: 'insert', startFrame: 81, durationFrames: 18 });
    expect(transitionAtNearestCut(document, 170, 400)).toEqual({ kind: 'insert', startFrame: 0, durationFrames: 180 });
  });

  it('names the cut a transition hands over at, only when it lies strictly inside', () => {
    const cuts = spineCuts(spine());
    expect(transitionCut(cuts, t('on', 81, 18))).toEqual({ frame: 90, from: 0, to: 180 });
    expect(transitionCut(cuts, t('touching', 90, 12))).toBeNull();
  });

  it('replaces the transition already on that cut, re-centring one that only touches it', () => {
    const document = spine();
    document.timeline.transitions = [t('on', 80, 20)];
    expect(transitionAtNearestCut(document, 0)).toEqual({ kind: 'replace', id: 'on' });
    document.timeline.transitions = [t('edge', 90, 12)];
    expect(transitionAtNearestCut(document, 0)).toEqual({ kind: 'replace', id: 'edge', timing: { startFrame: 84, durationFrames: 12 } });
  });

  it('keeps clear of neighbouring transitions and reports a missing cut', () => {
    const document = spine();
    document.timeline.transitions = [t('left', 70, 15)];
    expect(transitionAtNearestCut(document, 90)).toEqual({ kind: 'insert', startFrame: 85, durationFrames: 14 });
    document.timeline.transitions = [t('left', 70, 20), t('right', 90, 10)];
    expect(transitionAtNearestCut(document, 90)).toEqual({ kind: 'none', reason: 'no-room' });
    const primary = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId)!;
    primary.clips[1] = { ...primary.clips[1]!, enabled: false };
    expect(transitionAtNearestCut(document, 90)).toEqual({ kind: 'none', reason: 'no-cut' });
  });

  it('queues a new transition after the ones already at the playhead', () => {
    expect(transitionSlotAt([], 30)).toBe(30);
    expect(transitionSlotAt([t('x', 20, 20), t('y', 40, 10)], 30)).toBe(50);
    expect(transitionSlotAt([t('x', 20, 20)], 60)).toBe(60);
  });

  it('follows ripple edits: later items move, covered ones go, straddlers shrink', () => {
    const list = [t('before', 0, 10), t('inside', 22, 5), t('straddle', 25, 20), t('after', 60, 10)];
    expect(transitionsAfterRangeRemoval(list, 20, 30)).toEqual([t('before', 0, 10), t('straddle', 20, 15), t('after', 50, 10)]);
    expect(transitionsAfterInsertion(list, 25, 30).map((item) => item.startFrame)).toEqual([0, 22, 55, 90]);
    expect(transitionsAfterRetime(list, 60, -10).find((item) => item.id === 'after')?.startFrame).toBe(50);
  });

  it('inserts, patches and removes through commands and refuses overlaps', () => {
    const inserted = applyEditorCommand(spine(), { type: 'transitions.insert', transition: t('one', 80, 20) });
    expect(inserted.ok).toBe(true);
    const clash = applyEditorCommand(inserted.document, { type: 'transitions.insert', transition: t('two', 95, 10) });
    expect(clash.ok).toBe(false);
    const patched = applyEditorCommand(inserted.document, { type: 'transitions.patch', id: 'one', patch: { effect: 'glitch', durationFrames: 12 } });
    expect(patched.ok && patched.document.timeline.transitions).toEqual([{ id: 'one', startFrame: 80, durationFrames: 12, effect: 'glitch' }]);
    const removed = applyEditorCommand(patched.document, { type: 'transitions.remove', ids: ['one'] });
    expect(removed.ok && removed.document.timeline.transitions).toEqual([]);
    expect(applyEditorCommand(spine(), { type: 'transitions.insert', transition: { ...t('bad', 0, 10), effect: 'sparkle' as never } }).ok).toBe(false);
  });

  it('moves with a ripple range removal on the spine', () => {
    const withLane = applyEditorCommand(spine(), { type: 'transitions.insert', transition: t('one', 150, 10) });
    const trackId = withLane.document.semantics.primaryNarrativeTrackId!;
    const rippled = applyEditorCommand(withLane.document, { type: 'range.remove', trackId, startFrame: 30, endFrame: 60, mode: 'ripple' });
    expect(rippled.ok && rippled.document.timeline.transitions?.[0]?.startFrame).toBe(120);
  });

  it('migrates a spine-attached transition onto the lane at the same place and length', () => {
    const parsed = parseEditorDocumentV2(spine({ prevId: 'a', effect: 'crosszoom', durationSec: 1, direction: 'left' }))!;
    expect(parsed.timeline.transitions).toEqual([{ id: 'transition_b', startFrame: 75, durationFrames: 30, effect: 'crosszoom', direction: 'left' }]);
    const b = parsed.timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === 'b') as NarrativeTimelineClip;
    expect(b.properties.transIn).toBeUndefined();
  });
});
