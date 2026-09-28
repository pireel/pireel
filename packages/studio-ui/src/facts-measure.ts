/**
 * Browser-side measurements behind the get_facts tool. Local and free: decoded pixels and audio
 * only, no model calls. Everything is cached per File, so asking again is instant.
 */

import { regionGridFromRgba, regionsByShot, type RegionGrid, type ShotRegions } from '@pireel/studio-engine/facts';
import { decodeAudioFile, decodeVideoAudio } from './audio-decode';
import { measureBufferLoudnessDb } from './loudness';
import { assessLocalSpeechAudio, type LocalSpeechAudioAssessment } from './speech-silence';

/** At most this many sampled frames per source: one per second, stretched for long sources. */
const MAX_SAMPLES = 90;
/** Long edge of the decoded frame used for the region grid (enough for 3×5 cells). */
const GRID_LONG_EDGE = 96;

const pictureCache = new WeakMap<File, Promise<ShotRegions[]>>();
const soundCache = new WeakMap<File, Promise<SoundFacts>>();

/** Region grids per shot: brightness, busyness and colour by area of the frame. */
export function measureShotRegions(file: File, durationSec: number, cuts: readonly number[]): Promise<ShotRegions[]> {
  let pending = pictureCache.get(file);
  if (!pending) {
    pending = sampleRegionGrids(file, durationSec).then((samples) => regionsByShot(samples, cuts, durationSec));
    pictureCache.set(file, pending);
    void pending.catch(() => pictureCache.delete(file));
  }
  return pending;
}

async function sampleRegionGrids(file: File, durationSec: number): Promise<Array<{ t: number; grid: RegionGrid }>> {
  if (!(durationSec > 0)) return [];
  const step = Math.max(1, durationSec / MAX_SAMPLES);
  const times: number[] = [];
  for (let t = Math.min(0.5, durationSec / 2); t < durationSec; t += step) times.push(Math.round(t * 1000) / 1000);
  const { ALL_FORMATS, BlobSource, Input, VideoSampleSink } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return [];
    const vw = track.displayWidth || 720;
    const vh = track.displayHeight || 1280;
    const scale = Math.min(1, GRID_LONG_EDGE / Math.max(vw, vh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(6, Math.round(vw * scale));
    canvas.height = Math.max(10, Math.round(vh * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    const t0 = Math.max(0, await input.getFirstTimestamp());
    const sink = new VideoSampleSink(track);
    const out: Array<{ t: number; grid: RegionGrid }> = [];
    for await (const sample of sink.samplesAtTimestamps(times.map((t) => t + t0))) {
      if (!sample) continue;
      const t = sample.timestamp - t0;
      sample.draw(ctx as unknown as CanvasRenderingContext2D, 0, 0, canvas.width, canvas.height);
      sample.close();
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      out.push({ t: Math.round(t * 100) / 100, grid: regionGridFromRgba(data, canvas.width, canvas.height) });
    }
    return out;
  } finally {
    await input.dispose();
  }
}

export interface SoundFacts {
  hasAudio: boolean;
  /** Gated RMS level of the whole source in dBFS (not K-weighted LUFS); null when silent or undecodable. */
  levelDb: number | null;
  /** Local voice-activity estimate: whether there is likely speech worth transcribing. */
  speech: Pick<LocalSpeechAudioAssessment, 'classification' | 'speechLikely' | 'speechSec' | 'audibleSec'>;
}

/** Loudness and a local speech estimate, without transcription. */
export function measureSound(file: File): Promise<SoundFacts> {
  let pending = soundCache.get(file);
  if (!pending) {
    pending = (async () => {
      const [assessment, buffer] = await Promise.all([
        assessLocalSpeechAudio(file),
        (file.type.startsWith('audio/') ? decodeAudioFile(file) : decodeVideoAudio(file)).catch(() => null),
      ]);
      const levelDb = buffer ? measureBufferLoudnessDb(buffer) : null;
      return {
        hasAudio: assessment.hasAudio,
        levelDb: levelDb == null ? null : Math.round(levelDb * 10) / 10,
        speech: {
          classification: assessment.classification,
          speechLikely: assessment.speechLikely,
          speechSec: Math.round(assessment.speechSec * 10) / 10,
          audibleSec: Math.round(assessment.audibleSec * 10) / 10,
        },
      };
    })();
    soundCache.set(file, pending);
    void pending.catch(() => soundCache.delete(file));
  }
  return pending;
}
