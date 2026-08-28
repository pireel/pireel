import { describe, expect, it } from 'vitest';
import { editorialFaceGateIssues, isMouthVisiblyOpen, mouthSampleTimes, type EditorialFaceObservation } from './mouth-state';

const observation = (patch: Partial<EditorialFaceObservation> = {}): EditorialFaceObservation => ({
  timeSec: 1,
  faceDetected: true,
  mouthReadable: true,
  jawOpenScore: 0.04,
  lipApertureRatio: 0.03,
  visiblyOpen: false,
  prominentFaceCount: 1,
  backgroundFaceCount: 0,
  ...patch,
});

describe('mouth-state', () => {
  it('requires convincing jaw or lip separation evidence', () => {
    expect(isMouthVisiblyOpen({ jawOpenScore: 0.08, lipApertureRatio: 0.04 })).toBe(false);
    expect(isMouthVisiblyOpen({ jawOpenScore: 0.15, lipApertureRatio: 0.08 })).toBe(true);
    expect(isMouthVisiblyOpen({ jawOpenScore: 0.35, lipApertureRatio: null })).toBe(true);
    expect(isMouthVisiblyOpen({ jawOpenScore: null, lipApertureRatio: 0.15 })).toBe(true);
  });

  it('samples short candidate ranges densely while staying bounded', () => {
    const stamps = mouthSampleTimes([{ startSec: 10, endSec: 12 }]);
    expect(stamps.length).toBeGreaterThanOrEqual(31);
    expect(stamps[0]).toBeGreaterThan(10);
    expect(stamps.at(-1)).toBeLessThan(12);
    expect(mouthSampleTimes([{ startSec: 0, endSec: 100 }], 12, 20)).toHaveLength(20);
  });

  it('rejects open mouths and multiple prominent people without treating distant faces as co-subjects', () => {
    const issues = editorialFaceGateIssues([
      observation({ timeSec: 1, backgroundFaceCount: 1 }),
      observation({ timeSec: 1.1, visiblyOpen: true }),
      observation({ timeSec: 1.2, prominentFaceCount: 2 }),
    ], { startSec: 1, endSec: 1.2 }, {
      requiresClosedMouth: true,
      requiresSoloSubject: true,
    });
    expect(issues).toEqual(['open-mouth', 'multiple-people']);
  });

  it('treats a dense background crowd differently from one distant passerby', () => {
    expect(editorialFaceGateIssues([
      observation({ timeSec: 1, backgroundFaceCount: 1 }),
      observation({ timeSec: 1.1, backgroundFaceCount: 1 }),
      observation({ timeSec: 1.2, backgroundFaceCount: 1 }),
    ], { startSec: 1, endSec: 1.2 }, { requiresSoloSubject: true })).toEqual([]);
    expect(editorialFaceGateIssues([
      observation({ timeSec: 1, backgroundFaceCount: 3 }),
      observation({ timeSec: 1.1 }),
      observation({ timeSec: 1.2 }),
    ], { startSec: 1, endSec: 1.2 }, { requiresSoloSubject: true })).toContain('multiple-people');
  });

  it('fails closed when a visible face cannot be read, but permits a genuine back-view range', () => {
    expect(editorialFaceGateIssues([
      observation({ timeSec: 1, mouthReadable: false }),
      observation({ timeSec: 1.1, mouthReadable: false }),
      observation({ timeSec: 1.2 }),
    ], { startSec: 1, endSec: 1.2 }, { requiresClosedMouth: true })).toContain('technical-risk');

    expect(editorialFaceGateIssues([
      observation({ timeSec: 1, faceDetected: false, mouthReadable: false }),
      observation({ timeSec: 1.1, faceDetected: false, mouthReadable: false }),
      observation({ timeSec: 1.2, faceDetected: false, mouthReadable: false }),
    ], { startSec: 1, endSec: 1.2 }, { requiresClosedMouth: true })).toEqual([]);
  });
});
