import { describe, expect, it } from 'vitest';
import { chooseHook, openingCheck, rankLeadShots, teaserShots } from './hook-plan';
import type { MontageFrameSignal } from './montage-plan';

const frame = (overrides: Partial<MontageFrameSignal> = {}): MontageFrameSignal => ({
  shake: 0, pan: 0, people: 1, face: true, front: true, faceH: 0.18, mouth: 0.04, sharp: 0, bright: 0.5, cut: false, ...overrides,
});

describe('chooseHook', () => {
  it('copies a later moment with its sound when the sound is the content', () => {
    expect(chooseHook({ mode: 'talking', narrationLocked: false, sourceSoundLeads: true })).toMatchObject({ kind: 'cold-open', opening: 'face', addsTime: true, repeats: true, textHook: false, confirmFirst: true });
    expect(chooseHook({ mode: 'timeline', narrationLocked: false, sourceSoundLeads: true }).kind).toBe('cold-open');
  });

  it('teases or shows the result first when nothing locks the length', () => {
    expect(chooseHook({ mode: 'beat', narrationLocked: false, sourceSoundLeads: false })).toMatchObject({ kind: 'teaser', addsTime: true });
    expect(chooseHook({ mode: 'process', narrationLocked: false, sourceSoundLeads: false })).toMatchObject({ kind: 'result-first', addsTime: true });
  });

  it('adds no time under a voice-over: a lead shot, or the result as the first beat', () => {
    expect(chooseHook({ mode: 'showcase', narrationLocked: true, sourceSoundLeads: false })).toMatchObject({ kind: 'lead-shot', opening: 'face', addsTime: false, repeats: false, textHook: true });
    expect(chooseHook({ mode: 'timeline', narrationLocked: true, sourceSoundLeads: false })).toMatchObject({ kind: 'lead-shot', addsTime: false });
    expect(chooseHook({ mode: 'product', narrationLocked: true, sourceSoundLeads: false })).toMatchObject({ kind: 'result-first', addsTime: false, repeats: true });
    expect(chooseHook({ mode: 'content', narrationLocked: true, sourceSoundLeads: false, pictureSaysScript: true }).textHook).toBe(false);
  });
});

describe('rankLeadShots', () => {
  it('opens on the clearest face that holds, and leaves out pools with none', () => {
    const turnedAway = Array.from({ length: 30 }, () => frame({ front: false, faceH: 0.1 }));
    const smallThenClose = [...Array.from({ length: 10 }, () => frame({ faceH: 0.08 })), ...Array.from({ length: 20 }, () => frame({ faceH: 0.22 }))];
    const shaky = Array.from({ length: 30 }, () => frame({ faceH: 0.25, shake: 0.03 }));
    const ranked = rankLeadShots([
      { assetId: 'away', range: [0, 3], signals: turnedAway },
      { assetId: 'close', range: [5, 8], signals: smallThenClose, openingFrameScore: 70 },
      { assetId: 'shaky', range: [0, 3], signals: shaky, openingFrameScore: 70 },
    ], 'face', 10);
    expect(ranked.map((row) => row.assetId)).toEqual(['close', 'shaky']);
    expect(ranked[0]!.sourceInSec).toBeCloseTo(6, 6);
  });

  it('checks a built film’s first frame against the floor', () => {
    expect(openingCheck(frame({ bright: 0.02 }), 'subject')).toEqual(['black']);
    expect(openingCheck(frame({ front: false }), 'face')).toEqual(['no-face']);
    expect(openingCheck(frame(), 'face')).toEqual([]);
  });
});

describe('teaserShots', () => {
  it('takes the best highlight of each source, three to five of them', () => {
    const shots = teaserShots([
      { assetId: 'a', sourceInSec: 1, score: 0.9 }, { assetId: 'a', sourceInSec: 9, score: 0.8 },
      { assetId: 'b', sourceInSec: 2, score: 0.7 }, { assetId: 'c', sourceInSec: 3, score: 0.6 },
      { assetId: 'd', sourceInSec: 4, score: 0.5 }, { assetId: 'e', sourceInSec: 5, score: 0.4 },
    ], 4);
    expect(shots.map((shot) => shot.assetId)).toEqual(['a', 'b', 'c', 'd']);
    expect(shots[0]).toMatchObject({ sourceInSec: 1, durationSec: 1.2 });
  });
});
