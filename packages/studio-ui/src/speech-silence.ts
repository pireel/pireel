/**
 * Native narration dead-air analysis.
 *
 * Transcript timestamps answer "what was said"; they are not safe acoustic cut points. This module
 * reads the actual PCM once per File, combines RNNoise voice probability with waveform energy, and
 * plans cuts only where audio is BOTH non-speech and quiet. The planner is pure so its boundary
 * policy stays testable without a browser or wasm runtime.
 */

import { decodeVideoAudio, toMono } from './audio-decode';

const ANALYSIS_RATE = 48_000;
const FRAME_SAMPLES = 480; // RNNoise contract: 10 ms at 48 kHz.
const YIELD_EVERY_FRAMES = 200;
const DEFAULT_MINIMUM_PAUSE_SEC = 0.5;
const DEFAULT_SPEECH_PADDING_SEC = 0.15;
const DEFAULT_BRIDGE_GAP_SEC = 0.05;
const VOICE_PROBABILITY_THRESHOLD = 0.35;
const SPEECH_REFERENCE_THRESHOLD = 0.5;
const QUIET_TO_SPEECH_RATIO = 0.25; // about 12 dB below the recording's median speech energy.
// Mainstream editors clamp their normalized waveform gate to roughly -40..-22 dB. The lower bound matters for
// quiet recordings: an unbounded relative gate can fall below ordinary room tone and reject every
// real pause even when VAD clearly reports non-speech.
const MINIMUM_QUIET_CEILING_RMS = 10 ** (-40 / 20);
const MAXIMUM_QUIET_CEILING_RMS = 10 ** (-22 / 20);

export interface SpeechActivityFrame {
  fromSec: number;
  toSec: number;
  voiceProbability: number;
  rms: number;
}

export interface SpeechSilenceOptions {
  minimumPauseSec?: number;
  /** Audio kept next to speech on EACH side of an internal quiet span. */
  speechPaddingSec?: number;
  /** Joins tiny VAD flickers inside an otherwise continuous quiet span. */
  bridgeGapSec?: number;
}

export interface ResolvedSpeechSilenceOptions {
  minimumPauseSec: number;
  speechPaddingSec: number;
  bridgeGapSec: number;
}

export interface SpeechSilenceCut {
  fromSec: number;
  toSec: number;
}

interface SpeechActivityAnalysis {
  durationSec: number;
  frames: SpeechActivityFrame[];
}

export type LocalSpeechAudioClass = 'no-audio' | 'effectively-silent' | 'non-speech-or-noise' | 'speech-likely';

export interface LocalSpeechAudioAssessment {
  classification: LocalSpeechAudioClass;
  hasAudio: boolean;
  audible: boolean;
  speechLikely: boolean;
  audibleSec: number;
  speechSec: number;
  speechFraction: number;
}

const activityCache = new WeakMap<File, Promise<SpeechActivityAnalysis>>();
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const roundMs = (value: number) => Math.round(value * 1000) / 1000;
const finiteOr = (value: number | undefined, fallback: number) => (Number.isFinite(value) ? value! : fallback);
const AUDIBLE_RMS = 10 ** (-55 / 20);

/** Summarize local PCM + RNNoise observations without uploading any bytes. This intentionally
 * answers only whether useful speech is plausible; music, ambience and noise share one safe
 * non-speech class because distinguishing those genres is not required before deciding on ASR. */
export function summarizeLocalSpeechAudio(
  frames: readonly SpeechActivityFrame[],
  durationSec: number,
): LocalSpeechAudioAssessment {
  if (!frames.length || !Number.isFinite(durationSec) || durationSec <= 0) {
    return {
      classification: 'no-audio', hasAudio: false, audible: false, speechLikely: false,
      audibleSec: 0, speechSec: 0, speechFraction: 0,
    };
  }
  const audible = frames.filter((frame) => frame.rms > AUDIBLE_RMS);
  const audibleSec = audible.reduce((total, frame) => total + Math.max(0, frame.toSec - frame.fromSec), 0);
  if (audibleSec < Math.max(0.1, durationSec * 0.01)) {
    return {
      classification: 'effectively-silent', hasAudio: true, audible: false, speechLikely: false,
      audibleSec: roundMs(audibleSec), speechSec: 0, speechFraction: 0,
    };
  }
  const voiced = audible.filter((frame) => frame.voiceProbability >= SPEECH_REFERENCE_THRESHOLD);
  const speechSec = voiced.reduce((total, frame) => total + Math.max(0, frame.toSec - frame.fromSec), 0);
  const speechFraction = audibleSec > 0 ? speechSec / audibleSec : 0;
  const minimumSpeechSec = Math.min(0.35, Math.max(0.15, durationSec * 0.02));
  const speechLikely = speechSec >= minimumSpeechSec && speechFraction >= 0.03;
  return {
    classification: speechLikely ? 'speech-likely' : 'non-speech-or-noise',
    hasAudio: true,
    audible: true,
    speechLikely,
    audibleSec: roundMs(audibleSec),
    speechSec: roundMs(speechSec),
    speechFraction: Math.round(speechFraction * 1000) / 1000,
  };
}

export function resolveSpeechSilenceOptions(options: SpeechSilenceOptions = {}): ResolvedSpeechSilenceOptions {
  return {
    minimumPauseSec: clamp(finiteOr(options.minimumPauseSec, DEFAULT_MINIMUM_PAUSE_SEC), 0.25, 3),
    speechPaddingSec: clamp(finiteOr(options.speechPaddingSec, DEFAULT_SPEECH_PADDING_SEC), 0, 0.5),
    bridgeGapSec: clamp(finiteOr(options.bridgeGapSec, DEFAULT_BRIDGE_GAP_SEC), 0, 0.25),
  };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Convert voice/energy cells into source-clock ranges to remove.
 *
 * Head and tail quiet spans remain open to the media edge: only their speech-facing side gets
 * padding. Internal spans keep padding on both sides. `minimumPauseSec` applies to the detected
 * pause before padding, matching an editor's "remove pauses at least N seconds" control.
 */
export function planSpeechSilenceCuts(
  frames: readonly SpeechActivityFrame[],
  durationSec: number,
  options: SpeechSilenceOptions = {},
): SpeechSilenceCut[] {
  if (!frames.length || !Number.isFinite(durationSec) || durationSec <= 0) return [];
  const { minimumPauseSec, speechPaddingSec, bridgeGapSec } = resolveSpeechSilenceOptions(options);
  const speechRms = frames
    .filter((frame) => frame.voiceProbability >= SPEECH_REFERENCE_THRESHOLD && frame.rms > 0)
    .map((frame) => frame.rms);
  // A silent/music-only source is not a narration cleanup target. Failing closed avoids deleting
  // an entire visual clip when VAD found no speech reference at all.
  if (!speechRms.length) return [];
  const allRms = frames.filter((frame) => frame.rms > 0).map((frame) => frame.rms);
  const reference = median(speechRms) ?? median(allRms) ?? 0;
  const quietCeiling = clamp(
    reference * QUIET_TO_SPEECH_RATIO,
    MINIMUM_QUIET_CEILING_RMS,
    MAXIMUM_QUIET_CEILING_RMS,
  );
  const dead = frames.map((frame) => (
    frame.voiceProbability < VOICE_PROBABILITY_THRESHOLD && frame.rms <= quietCeiling
  ));

  // A one-cell VAD spike in a real pause otherwise produces two cuts and visible seam chatter.
  for (let index = 0; index < dead.length;) {
    if (dead[index]) {
      index += 1;
      continue;
    }
    const start = index;
    while (index < dead.length && !dead[index]) index += 1;
    const end = index;
    if (start === 0 || end === dead.length || !dead[start - 1] || !dead[end]) continue;
    const gapSec = frames[end - 1]!.toSec - frames[start]!.fromSec;
    if (gapSec <= bridgeGapSec + 1e-6) dead.fill(true, start, end);
  }

  const cuts: SpeechSilenceCut[] = [];
  for (let index = 0; index < dead.length;) {
    if (!dead[index]) {
      index += 1;
      continue;
    }
    const startIndex = index;
    while (index < dead.length && dead[index]) index += 1;
    const endIndex = index - 1;
    const pauseFrom = Math.max(0, frames[startIndex]!.fromSec);
    const pauseTo = Math.min(durationSec, frames[endIndex]!.toSec);
    if (pauseTo - pauseFrom + 1e-6 < minimumPauseSec) continue;
    const touchesHead = pauseFrom <= frames[0]!.toSec - frames[0]!.fromSec + 1e-6;
    const touchesTail = durationSec - pauseTo <= frames[endIndex]!.toSec - frames[endIndex]!.fromSec + 1e-6;
    const fromSec = touchesHead ? 0 : pauseFrom + speechPaddingSec;
    const toSec = touchesTail ? durationSec : pauseTo - speechPaddingSec;
    if (toSec - fromSec < 0.05) continue;
    cuts.push({ fromSec: roundMs(fromSec), toSec: roundMs(toSec) });
  }
  return cuts;
}

async function analyzeSpeechActivity(file: File): Promise<SpeechActivityAnalysis> {
  const decoded = await decodeVideoAudio(file);
  if (!decoded) return { durationSec: 0, frames: [] };
  const pcm = await toMono(decoded, ANALYSIS_RATE);
  const durationSec = pcm.length / ANALYSIS_RATE;
  const { default: factory } = await import('@jitsi/rnnoise-wasm/dist/rnnoise-sync');
  const mod = await factory();
  const state = mod._rnnoise_create();
  const inputPointer = mod._malloc(FRAME_SAMPLES * 4);
  const outputPointer = mod._malloc(FRAME_SAMPLES * 4);
  const inputFrame = new Float32Array(FRAME_SAMPLES);
  const frames: SpeechActivityFrame[] = [];
  try {
    const frameCount = Math.ceil(pcm.length / FRAME_SAMPLES);
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      const offset = frameIndex * FRAME_SAMPLES;
      const sampleCount = Math.min(FRAME_SAMPLES, pcm.length - offset);
      let squareSum = 0;
      for (let sampleIndex = 0; sampleIndex < FRAME_SAMPLES; sampleIndex++) {
        const sample = sampleIndex < sampleCount ? pcm[offset + sampleIndex]! : 0;
        if (sampleIndex < sampleCount) squareSum += sample * sample;
        inputFrame[sampleIndex] = sample * 32767; // RNNoise uses float values in the int16 range.
      }
      mod.HEAPF32.set(inputFrame, inputPointer >> 2);
      const voiceProbability = mod._rnnoise_process_frame(state, outputPointer, inputPointer);
      frames.push({
        fromSec: offset / ANALYSIS_RATE,
        toSec: Math.min(durationSec, (offset + sampleCount) / ANALYSIS_RATE),
        voiceProbability,
        rms: sampleCount ? Math.sqrt(squareSum / sampleCount) : 0,
      });
      if (frameIndex % YIELD_EVERY_FRAMES === YIELD_EVERY_FRAMES - 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    return { durationSec, frames };
  } finally {
    mod._free(inputPointer);
    mod._free(outputPointer);
    mod._rnnoise_destroy(state);
  }
}

/** Analyze once per live File, then re-plan cheaply for different pause/padding settings. */
export async function detectSpeechSilenceCuts(file: File, options: SpeechSilenceOptions = {}): Promise<SpeechSilenceCut[]> {
  let pending = activityCache.get(file);
  if (!pending) {
    pending = analyzeSpeechActivity(file);
    activityCache.set(file, pending);
    void pending.catch(() => activityCache.delete(file));
  }
  const analysis = await pending;
  return planSpeechSilenceCuts(analysis.frames, analysis.durationSec, options);
}

/** Local pre-ASR gate. Decodes on-device and runs RNNoise VAD; no media leaves the browser. */
export async function assessLocalSpeechAudio(file: File): Promise<LocalSpeechAudioAssessment> {
  let pending = activityCache.get(file);
  if (!pending) {
    pending = analyzeSpeechActivity(file);
    activityCache.set(file, pending);
    void pending.catch(() => activityCache.delete(file));
  }
  const analysis = await pending;
  return summarizeLocalSpeechAudio(analysis.frames, analysis.durationSec);
}
