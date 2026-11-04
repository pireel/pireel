import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2 } from '@pireel/studio-engine/editor-document';
import { runAgentTimelineTool } from '@pireel/studio-engine/agent-timeline';
import { compileMontage, fitMontage, narrationCutSlots, type MontageFitShot, type MontageFrameSignal } from './montage-plan';

const still = (overrides: Partial<MontageFrameSignal> = {}): MontageFrameSignal => ({
  shake: 0, pan: 0, people: 1, face: true, front: true, faceH: 0.15, mouth: 0.05, sharp: 0, bright: 0.47, cut: false, ...overrides,
});

/** Deterministic pseudo-random numbers, so a failing case can be replayed. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

describe('narrationCutSlots', () => {
  it('opens a slot only in the pause after punctuation', () => {
    const words = [
      { text: '最近', start: 0.2, end: 0.5 }, { text: '去看了，', start: 0.5, end: 1.4 },
      { text: '看着', start: 1.6, end: 2.0 }, { text: '看着。', start: 2.0, end: 2.24 },
      { text: '突然', start: 2.24, end: 2.5 },
    ];
    expect(narrationCutSlots(words)).toEqual([{ from: 1.4, to: 1.6 }, { from: 2.24, to: 2.24 }]);
  });
});

describe('fitMontage', () => {
  it('always tiles the narration exactly, cuts inside pauses and windows inside ranges', () => {
    const fps = 30;
    for (let seed = 1; seed <= 300; seed += 1) {
      const random = rng(seed);
      const count = 2 + Math.floor(random() * 10);
      // Beats of 1–4s separated by pauses of 0–0.4s.
      const cuts: { from: number; to: number }[] = [];
      let at = 0;
      const lengths: number[] = [];
      for (let index = 0; index < count; index += 1) {
        const length = 1 + random() * 3;
        lengths.push(length);
        at += length;
        if (index < count - 1) {
          const pause = random() < 0.3 ? 0 : random() * 0.4;
          cuts.push({ from: at, to: at + pause });
          at += pause;
        }
      }
      const endSec = at;
      const shots: MontageFitShot[] = lengths.map((length) => {
        const from = random() * 20;
        const span = length + 0.5 + random() * 4;
        const signals = Array.from({ length: Math.round(span * 10) }, () => still({ shake: random() * 0.025, people: random() < 0.2 ? 2 : 1, mouth: random() * 0.3 }));
        return { range: [from, from + span], want: 'any', signals };
      });
      const result = fitMontage({ endSec, cuts, shots, fps, signalFps: 10 });
      expect(result.ok, `seed ${seed}: ${JSON.stringify(result)}`).toBe(true);
      if (!result.ok) continue;
      expect(result.shots[0]!.startSec).toBe(0);
      expect(result.shots.at(-1)!.endSec).toBeCloseTo(Math.round(endSec * fps) / fps, 9);
      result.shots.forEach((shot, index) => {
        if (index) expect(shot.startSec).toBe(result.shots[index - 1]!.endSec);
        expect(shot.endSec - shot.startSec).toBeGreaterThanOrEqual(0.8 - 1e-9);
        expect(shot.sourceInSec).toBeGreaterThanOrEqual(shots[index]!.range[0] - 1e-9);
        expect(shot.sourceInSec + (shot.endSec - shot.startSec)).toBeLessThanOrEqual(shots[index]!.range[1] + 1e-6);
      });
      result.cuts.forEach((cut, index) => {
        const slot = cuts[index]!;
        // On a frame inside the pause; a pause shorter than a frame pins the cut to its nearest frame.
        expect(cut).toBeGreaterThanOrEqual(Math.min(slot.from, Math.round(((slot.from + slot.to) / 2) * fps) / fps) - 1e-9);
        expect(cut).toBeLessThanOrEqual(Math.max(slot.to, Math.round(((slot.from + slot.to) / 2) * fps) / fps) + 1e-9);
      });
    }
  });

  it('chooses the steady, silent stretch and honours a face-first opening', () => {
    const shaky = Array.from({ length: 30 }, () => still({ shake: 0.05 }));
    const calm = Array.from({ length: 30 }, () => still());
    const talking = Array.from({ length: 30 }, (_, index) => still({ mouth: index % 2 ? 0.3 : 0.02 }));
    const backFirst = [...Array.from({ length: 20 }, () => still({ face: false, front: false, faceH: 0 })), ...calm];
    const result = fitMontage({
      endSec: 6, fps: 30, signalFps: 10,
      cuts: [{ from: 2.9, to: 3.1 }],
      shots: [
        { range: [10, 16], signals: [...shaky, ...calm], want: 'front' },
        { range: [0, 7], signals: [...talking.slice(0, 20), ...calm, ...talking.slice(0, 20)], want: 'front' },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shots[0]!.sourceInSec).toBeGreaterThanOrEqual(13);
    expect(result.shots[1]!.sourceInSec).toBeGreaterThanOrEqual(1.9);
    expect(result.shots[1]!.sourceInSec).toBeLessThanOrEqual(2.2);
    const opening = fitMontage({ endSec: 2, fps: 30, signalFps: 10, cuts: [], shots: [{ range: [0, 5], signals: backFirst, firstFace: true }] });
    expect(opening.ok && opening.shots[0]!.sourceInSec).toBeGreaterThanOrEqual(2);
  });

  it('reports a beat its range cannot hold instead of stretching the footage', () => {
    const result = fitMontage({
      endSec: 7, fps: 30, signalFps: 10,
      cuts: [{ from: 3, to: 3.2 }],
      shots: [{ range: [0, 4] }, { range: [10, 11.5] }],
    });
    expect(result).toMatchObject({ ok: false, shots: [1] });
  });
});

describe('compileMontage', () => {
  it('replaces the spine with frame-exact, muted shots that end with the narration', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', { assets: [
      { id: 'a', kind: 'video', url: 'https://cdn.example/a.mp4', durationSec: 20 },
      { id: 'b', kind: 'video', url: 'https://cdn.example/b.mp4', durationSec: 20 },
      { id: 'voice', kind: 'audio', url: 'https://cdn.example/voice.mp3', durationSec: 6.31 },
    ] }).document!;
    document = runAgentTimelineTool(document, 'add_clips', { clips: [
      { role: 'primary', assetId: 'b', startFrame: 0, source: [0, 9] },
      { role: 'narration', assetId: 'voice', startFrame: 0 },
    ] }).document!;
    const fitted = fitMontage({ endSec: 6.31, fps: 30, signalFps: 10, cuts: [{ from: 2.24, to: 2.4 }, { from: 4.1, to: 4.3 }], shots: [{ range: [1, 5] }, { range: [3, 8] }, { range: [12, 16] }] });
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    const out = compileMontage(document, fitted.shots.map((shot, index) => ({ ...shot, assetId: index === 1 ? 'b' : 'a' })));
    expect(out.ok, JSON.stringify(out)).toBe(true);
    const spine = out.document!.timeline.tracks.find((track) => track.id === out.document!.semantics.primaryNarrativeTrackId)!.clips;
    expect(spine.map((clip) => [clip.startFrame, clip.durationFrames])).toEqual([[0, Math.round(fitted.cuts[0]! * 30)], [Math.round(fitted.cuts[0]! * 30), Math.round(fitted.cuts[1]! * 30) - Math.round(fitted.cuts[0]! * 30)], [Math.round(fitted.cuts[1]! * 30), 189 - Math.round(fitted.cuts[1]! * 30)]]);
    expect(spine.every((clip) => clip.kind === 'narrative' && clip.properties?.audioMuted === true)).toBe(true);
    expect(compileMontage(document, [{ assetId: 'a', sourceInSec: 18, startSec: 0, endSec: 4 }])).toMatchObject({ ok: false });
  });
});
