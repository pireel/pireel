import type { MontageFrameSignal } from '@pireel/studio-engine/montage-plan';
import type { EditorialFaceObservation } from '@pireel/studio-engine/mouth-state';
import type { FrameQualityObservation } from '@pireel/studio-engine/visual-quality';

/**
 * Per-sample montage signals from the local analysis passes (no model calls): the quality scan
 * (camera move, brightness, detail, residual change), the face scan (primary face size and turn,
 * mouth, competing faces) and, optionally, person presence from segmentation for frames where the
 * person shows no face (a back view). Samples are matched by time to `times`.
 */
export interface MontageSignalSources {
  times: readonly number[];
  quality: readonly FrameQualityObservation[];
  faces: readonly EditorialFaceObservation[];
  /** Person presence in [0, 1] at sparse times; the nearest sample is used. */
  presence?: readonly { timeSec: number; value: number }[];
}

/** A turn below this reads as facing the camera. */
const FRONTAL_YAW = 0.3;
/** A face this small (share of frame height) is too small to read a mouth or count as a portrait. */
const READABLE_FACE = 0.06;

function nearest<T extends { timeSec: number }>(rows: readonly T[], time: number, within: number): T | undefined {
  let best: T | undefined;
  let gap = within;
  for (const row of rows) {
    const distance = Math.abs(row.timeSec - time);
    if (distance <= gap) { best = row; gap = distance; }
  }
  return best;
}

export function montageFrameSignals(sources: MontageSignalSources): MontageFrameSignal[] {
  const { times, quality, faces } = sources;
  const step = times.length > 1 ? Math.abs(times[1]! - times[0]!) : 0.1;
  const within = Math.max(0.05, step * 0.6);
  const rows = times.map((time) => ({ time, q: nearest(quality, time, within), f: nearest(faces, time, within) }));
  const sharpness = rows.map((row) => row.q?.sharpness ?? 0);
  const meanSharp = sharpness.reduce((sum, value) => sum + value, 0) / Math.max(1, sharpness.length);
  const spread = Math.sqrt(sharpness.reduce((sum, value) => sum + (value - meanSharp) ** 2, 0) / Math.max(1, sharpness.length)) || 1;
  const changes = rows.map((row) => row.q?.change).filter((value): value is number => value != null).sort((a, b) => a - b);
  const medianChange = changes.length ? changes[Math.floor(changes.length / 2)]! : 0;
  const cutAt = Math.max(0.12, medianChange * 6);
  let previous: { dx: number; dy: number } | null = null;
  return rows.map((row) => {
    const motion = row.q?.motion ?? null;
    const shake = motion && previous ? Math.hypot(motion.dx - previous.dx, motion.dy - previous.dy) : 0;
    const pan = motion ? Math.hypot(motion.dx, motion.dy) : 0;
    if (motion) previous = motion;
    const face = row.f?.faceDetected ? row.f : undefined;
    const faceH = face?.faceHeight ?? 0;
    const readable = !!face && faceH >= READABLE_FACE;
    const front = readable && face!.yaw != null && Math.abs(face!.yaw) < FRONTAL_YAW;
    const present = sources.presence ? (nearest(sources.presence, row.time, Math.max(0.6, step * 3))?.value ?? 0) >= 0.5 : false;
    const people = Math.max(face ? face.prominentFaceCount : 0, present ? 1 : 0);
    return {
      shake,
      pan,
      people,
      face: !!face,
      front,
      faceH: readable ? faceH : 0,
      mouth: readable && face!.mouthReadable && face!.lipApertureRatio != null && Math.abs(face!.yaw ?? 0) < 0.6 ? face!.lipApertureRatio : null,
      sharp: ((row.q?.sharpness ?? meanSharp) - meanSharp) / spread,
      bright: row.q?.brightness ?? 0.5,
      cut: (row.q?.change ?? 0) > cutAt,
    };
  });
}
