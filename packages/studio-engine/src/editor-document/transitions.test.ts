import { describe, expect, it } from 'vitest';
import { applyEditorCommand, emptyEditorDocumentV2, parseEditorDocumentV2, type EditorDocumentV2, type NarrativeTimelineClip, type TimelineTransition } from '../editor-document';
import { transitionSlotAt, transitionsAfterInsertion, transitionsAfterRangeRemoval, transitionsAfterRetime } from './transitions';

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
