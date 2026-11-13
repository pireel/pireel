import { describe, expect, it, vi } from 'vitest';

// A recording's soundtrack, stood in for by the samples each test file carries: handed over in
// uneven pieces, as a decoder would.
const soundtracks = new WeakMap<Blob, { sampleRate: number; pcm: Float32Array }>();
vi.mock('./audio-decode', async (original) => ({
  ...(await original<typeof import('./audio-decode')>()),
  readVideoSound: async (file: Blob, open: (shape: { sampleRate: number; channels: number; frames: number }) => (channels: Float32Array[]) => void) => {
    const sound = soundtracks.get(file);
    if (!sound) return null;
    const shape = { sampleRate: sound.sampleRate, channels: 1, frames: sound.pcm.length };
    const push = open(shape);
    for (let offset = 0, size = 1024; offset < sound.pcm.length; offset += size, size = (size * 7) % 2048 + 1) push([sound.pcm.slice(offset, offset + size)]);
    return shape;
  },
}));

import { assessLocalSpeechAudio, detectSpeechSilenceCuts, planSpeechSilenceCuts, resolveSpeechSilenceOptions, SPEECH_ACTIVITY_RATE, speechActivityReader, summarizeLocalSpeechAudio, type SpeechActivityFrame } from './speech-silence';

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
      minimumPauseSec: 0.4,
      speechPaddingSec: 0.15,
    });
  });

  it('classifies silent and noisy audio locally without mistaking it for speech', () => {
    expect(summarizeLocalSpeechAudio([], 0)).toMatchObject({ classification: 'no-audio', speechLikely: false });
    expect(summarizeLocalSpeechAudio(
      frames({ from: 0, to: 2, voiceProbability: 0.01, rms: 0.0001 }),
      2,
    )).toMatchObject({ classification: 'effectively-silent', audible: false, speechLikely: false });
    expect(summarizeLocalSpeechAudio(
      frames({ from: 0, to: 2, voiceProbability: 0.04, rms: 0.12 }),
      2,
    )).toMatchObject({ classification: 'non-speech-or-noise', audible: true, speechLikely: false });
  });

  it('requires a meaningful local voiced span before allowing ASR', () => {
    expect(summarizeLocalSpeechAudio(frames(
      { from: 0, to: 1, voiceProbability: 0.04, rms: 0.08 },
      { from: 1, to: 1.4, voiceProbability: 0.9, rms: 0.1 },
      { from: 1.4, to: 3, voiceProbability: 0.03, rms: 0.07 },
    ), 3)).toMatchObject({ classification: 'speech-likely', speechLikely: true, speechSec: 0.4 });
  });
});

describe('speech activity reader', () => {
  // 1.234 s of a tone that fades out, at the reader's rate: an uneven last frame on purpose.
  const pcm = Float32Array.from({ length: Math.round(SPEECH_ACTIVITY_RATE * 1.234) }, (_, index) => Math.sin(index / 9) * 0.4 * (1 - index / (SPEECH_ACTIVITY_RATE * 1.3)));

  it('reads the same frames however the audio is split', async () => {
    const whole = await speechActivityReader(); whole.push(pcm);
    const pieces = await speechActivityReader();
    for (let offset = 0, size = 1; offset < pcm.length; offset += size, size = (size * 7) % 4999 + 1) pieces.push(pcm.subarray(offset, offset + size));
    const a = whole.finish(); const b = pieces.finish();
    expect(b.durationSec).toBeCloseTo(1.234, 3);
    expect(b.frames).toHaveLength(Math.ceil(pcm.length / 480));
    expect(b.frames).toEqual(a.frames);
    expect(b.frames.at(-1)!.toSec).toBeCloseTo(b.durationSec, 6);
  });
});

describe('speech activity of a recording', () => {
  const recording = (sampleRate: number, seconds: number) => {
    const file = new File(['x'], 'talk.mp4', { type: 'video/mp4' });
    soundtracks.set(file, { sampleRate, pcm: Float32Array.from({ length: Math.round(sampleRate * seconds) }, (_, index) => Math.sin(index / 9) * 0.4) });
    return file;
  };

  it('reads the sound when nobody listens for progress', async () => {
    const heard = await assessLocalSpeechAudio(recording(SPEECH_ACTIVITY_RATE, 3));
    expect(heard.hasAudio).toBe(true);
    expect(heard.audibleSec).toBeCloseTo(3, 1);
  });

  it('reports progress up to the whole length, a few times rather than once per piece', async () => {
    const calls: [number, number][] = [];
    await detectSpeechSilenceCuts(recording(SPEECH_ACTIVITY_RATE, 12), { onProgress: (done, total) => calls.push([done, total]) });
    expect(calls[0]).toEqual([0, 1200]);
    expect(calls.at(-1)).toEqual([1200, 1200]);
    expect(calls.length).toBeGreaterThan(3);
    expect(calls.length).toBeLessThan(12);
    expect(calls.every(([done], index) => index === 0 || done >= calls[index - 1]![0])).toBe(true);
  });

  it('reads a 44.1 kHz recording at its real length', async () => {
    const heard = await assessLocalSpeechAudio(recording(44_100, 2));
    expect(heard.hasAudio).toBe(true);
    expect(heard.audibleSec).toBeCloseTo(2, 1);
  });

  it('calls a file without a soundtrack silent', async () => {
    expect((await assessLocalSpeechAudio(new File(['x'], 'mute.mp4'))).classification).toBe('no-audio');
  });
});
