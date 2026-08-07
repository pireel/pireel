import { describe, expect, it } from 'vitest';
import { planSpeechSilenceCuts, resolveSpeechSilenceOptions, type SpeechActivityFrame } from './speech-silence';

function frames(...runs: { from: number; to: number; voiceProbability: number; rms: number }[]): SpeechActivityFrame[] {
  return runs.flatMap((run) => {
    const out: SpeechActivityFrame[] = [];
    for (let at = run.from; at < run.to - 1e-9; at += 0.1) {
      out.push({
        fromSec: Number(at.toFixed(3)),
        toSec: Number(Math.min(run.to, at + 0.1).toFixed(3)),
        voiceProbability: run.voiceProbability,
        rms: run.rms,
      });
    }
    return out;
  });
}

describe('speech silence planner', () => {
  it('cuts only quiet non-speech and keeps speech padding, with exposed head/tail unpadded', () => {
    const activity = frames(
      { from: 0, to: 0.6, voiceProbability: 0.01, rms: 0.001 },
      { from: 0.6, to: 1, voiceProbability: 0.95, rms: 0.2 },
      { from: 1, to: 1.8, voiceProbability: 0.02, rms: 0.002 },
      // Music / loud ambience is non-speech but must not be classified as removable dead air.
      { from: 1.8, to: 2.2, voiceProbability: 0.02, rms: 0.15 },
      { from: 2.2, to: 2.4, voiceProbability: 0.9, rms: 0.18 },
      { from: 2.4, to: 3, voiceProbability: 0.01, rms: 0.001 },
    );

    expect(planSpeechSilenceCuts(activity, 3, { minimumPauseSec: 0.5, speechPaddingSec: 0.15 })).toEqual([
      { fromSec: 0, toSec: 0.45 },
      { fromSec: 1.15, toSec: 1.65 },
      { fromSec: 2.55, toSec: 3 },
    ]);
  });

  it('ignores short pauses and bridges one-frame VAD flicker inside a real pause', () => {
    const activity = frames(
      { from: 0, to: 0.4, voiceProbability: 0.9, rms: 0.2 },
      { from: 0.4, to: 0.6, voiceProbability: 0.01, rms: 0.001 },
      { from: 0.6, to: 0.8, voiceProbability: 0.9, rms: 0.2 },
      { from: 0.8, to: 1.1, voiceProbability: 0.01, rms: 0.001 },
      { from: 1.1, to: 1.2, voiceProbability: 0.8, rms: 0.002 },
      { from: 1.2, to: 1.6, voiceProbability: 0.01, rms: 0.001 },
      { from: 1.6, to: 2, voiceProbability: 0.9, rms: 0.2 },
    );

    expect(planSpeechSilenceCuts(activity, 2, {
      minimumPauseSec: 0.5,
      speechPaddingSec: 0.1,
      bridgeGapSec: 0.11,
    })).toEqual([{ fromSec: 0.9, toSec: 1.5 }]);
  });

  it('keeps detecting room-tone pauses in a quiet recording', () => {
    const activity = frames(
      { from: 0, to: 0.4, voiceProbability: 0.9, rms: 0.01 },
      // About -44 dB: quiet room tone, but not 12 dB below this unusually quiet voice.
      { from: 0.4, to: 1.2, voiceProbability: 0.01, rms: 0.006 },
      { from: 1.2, to: 1.6, voiceProbability: 0.9, rms: 0.01 },
    );

    expect(planSpeechSilenceCuts(activity, 1.6, {
      minimumPauseSec: 0.5,
      speechPaddingSec: 0.1,
    })).toEqual([{ fromSec: 0.5, toSec: 1.1 }]);
  });

  it('fails closed when no speech reference exists and normalizes omitted numeric tool input', () => {
    expect(planSpeechSilenceCuts(
      frames({ from: 0, to: 1, voiceProbability: 0.01, rms: 0.001 }),
      1,
    )).toEqual([]);
    expect(resolveSpeechSilenceOptions({ minimumPauseSec: Number.NaN, speechPaddingSec: Number.NaN })).toMatchObject({
      minimumPauseSec: 0.5,
      speechPaddingSec: 0.15,
    });
  });
});
