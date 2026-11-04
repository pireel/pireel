import { describe, expect, it } from 'vitest';
import { montageFrameSignals } from './montage-signals';

describe('montageFrameSignals', () => {
  it('turns local scans into per-sample signals: shake, cuts, a readable frontal face, a back view', () => {
    const times = [0, 0.1, 0.2, 0.3, 0.4];
    const quality = times.map((timeSec, index) => ({
      timeSec, sharpness: 0.5, exposure: 0.8, stability: 1, brightness: 0.5,
      ...(index ? { motion: index === 2 ? { dx: 0.04, dy: 0 } : { dx: 0.005, dy: 0 } } : {}),
      ...(index ? { change: index === 4 ? 0.3 : 0.02 } : {}),
    }));
    const face = (timeSec: number, yaw: number, faceHeight: number, lips: number) => ({
      timeSec, faceDetected: true, mouthReadable: true, jawOpenScore: 0, lipApertureRatio: lips, visiblyOpen: false,
      prominentFaceCount: 1, backgroundFaceCount: 0, faceHeight, yaw,
    });
    const faces = [face(0, 0.05, 0.2, 0.03), face(0.1, 0.5, 0.2, 0.03), face(0.2, 0.05, 0.03, 0.2),
      { timeSec: 0.3, faceDetected: false, mouthReadable: false, jawOpenScore: null, lipApertureRatio: null, visiblyOpen: false, prominentFaceCount: 0, backgroundFaceCount: 0 },
      face(0.4, 0, 0.2, 0.03)];
    const signals = montageFrameSignals({ times, quality, faces, presence: [{ timeSec: 0.3, value: 1 }] });
    expect(signals.map((signal) => signal.front)).toEqual([true, false, false, false, true]);
    expect(signals[2]!.shake).toBeCloseTo(0.035, 6);
    expect(signals[2]!.mouth).toBeNull(); // too small a face to read a mouth
    expect(signals[3]).toMatchObject({ face: false, people: 1 }); // a back view: a person, no face
    expect(signals.map((signal) => signal.cut)).toEqual([false, false, false, false, true]);
  });
});
