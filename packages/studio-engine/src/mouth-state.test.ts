import { describe, expect, it } from 'vitest';
import {
  editorialFaceGateIssues,
  isMouthVisiblyOpen,
  mouthSampleTimes,
  refineEditorialRangeLocally,
  type EditorialFaceObservation,
} from './mouth-state';

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
      observation({ timeSec: 1.2, visiblyOpen: true, prominentFaceCount: 2 }),
      observation({ timeSec: 1.3, prominentFaceCount: 2 }),
    ], { startSec: 1, endSec: 1.3 }, {
      requiresClosedMouth: true,
      requiresSoloSubject: true,
    });
    expect(issues).toEqual(['open-mouth', 'multiple-people']);
  });

  it('does not turn distant background faces into competing co-subjects', () => {
    expect(editorialFaceGateIssues([
      observation({ timeSec: 1, backgroundFaceCount: 1 }),
      observation({ timeSec: 1.1, backgroundFaceCount: 1 }),
      observation({ timeSec: 1.2, backgroundFaceCount: 1 }),
    ], { startSec: 1, endSec: 1.2 }, { requiresSoloSubject: true })).toEqual([]);
    expect(editorialFaceGateIssues([
      observation({ timeSec: 1, backgroundFaceCount: 3 }),
      observation({ timeSec: 1.1, backgroundFaceCount: 4 }),
      observation({ timeSec: 1.2, backgroundFaceCount: 3 }),
    ], { startSec: 1, endSec: 1.2 }, { requiresSoloSubject: true })).toEqual([]);
  });

  it('ignores one-frame mouth and face-detector spikes', () => {
    expect(editorialFaceGateIssues([
      observation({ timeSec: 1 }),
      observation({ timeSec: 1.1, visiblyOpen: true, prominentFaceCount: 2 }),
      observation({ timeSec: 1.2 }),
    ], { startSec: 1, endSec: 1.2 }, {
      requiresClosedMouth: true,
      requiresSoloSubject: true,
    })).toEqual([]);
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

  it('uses the model range semantically, then keeps the clean local run around its peak', () => {
    const observations = [
      observation({ timeSec: 10.5, visiblyOpen: true }),
      observation({ timeSec: 10.6, visiblyOpen: true }),
      observation({ timeSec: 11.5 }),
      observation({ timeSec: 12 }),
      observation({ timeSec: 12.5 }),
      observation({ timeSec: 12.9, visiblyOpen: true }),
      observation({ timeSec: 13, visiblyOpen: true }),
    ];
    expect(refineEditorialRangeLocally({
      startSec: 10,
      endSec: 14,
      suggestedStartSec: 10.5,
      suggestedEndSec: 13,
      peakSec: 12,
    }, observations, { requiresClosedMouth: true })).toEqual({
      startSec: 11.313,
      endSec: 12.688,
    });
  });

  it('uses coarse model boundaries directly when no local hard gate applies', () => {
    expect(refineEditorialRangeLocally({
      startSec: 4,
      endSec: 9,
      suggestedStartSec: 5.2,
      suggestedEndSec: 7.8,
    }, [])).toEqual({ startSec: 5.2, endSec: 7.8 });
  });
});
