import { describe, expect, it } from 'vitest';
import { rejectStableFramingSplits, visualGeometryForAgent, visualTimelineForAgent, type VisualTimeline } from './visual-types';
import type { VideoShot } from './composition';

describe('visualTimelineForAgent', () => {
  it('returns source observations without prescribing edits', () => {
    const timeline: VisualTimeline = {
      cuts: [2.3456],
      segments: [
        {
          start: 0,
          end: 4.5678,
          label: { content: 'talkinghead', person: 'left', safe: 'right', hasText: false, desc: 'Speaker at a desk' },
          geom: {
            subject: { x: 0.1, y: 0.2, w: 0.3, h: 0.6 },
            face: { x: 0.15, y: 0.22, w: 0.1, h: 0.12 },
            rects: [{ x: 0.5, y: 0.1, w: 0.45, h: 0.7 }],
          },
        },
      ],
      qualityWindows: [{ rank: 1, startSec: 1, endSec: 3, score: 88, sharpness: 0.9, exposure: 0.8, stability: 0.85, subjectPresence: 1, sampleCount: 5, worstFrameScore: 82, edgeScore: 84, hardFailureFraction: 0 }],
    };

    expect(visualTimelineForAgent(timeline)).toEqual({
      sceneCutsSec: [2.346],
      subjectTracks: [
        {
          startSec: 0,
          endSec: 4.568,
          samples: 1,
          subject: {
            x: 0.1,
            y: 0.2,
            w: 0.3,
            h: 0.6,
            coordinateSpace: 'source-normalized',
            anchorX: 0.25,
            anchorY: 0.5,
          },
          face: { x: 0.15, y: 0.22, w: 0.1, h: 0.12 },
          safeAreas: [{ x: 0.5, y: 0.1, w: 0.45, h: 0.7 }],
        },
      ],
      segments: [
        {
          startSec: 0,
          endSec: 4.568,
          content: 'talkinghead',
          person: 'left',
          safe: 'right',
          description: 'Speaker at a desk',
        },
      ],
      qualityWindows: [{ rank: 1, startSec: 1, endSec: 3, score: 88, sharpness: 0.9, exposure: 0.8, stability: 0.85, subjectPresence: 1, sampleCount: 5, worstFrameScore: 82, edgeScore: 84, hardFailureFraction: 0 }],
    });
  });

  it('omits unavailable geometry instead of inventing a centered subject', () => {
    const summary = visualTimelineForAgent({
      cuts: [],
      segments: [
        {
          start: 0,
          end: 1,
          label: { content: 'broll', person: 'none', safe: 'full', hasText: false, desc: '' },
        },
      ],
    });
    expect(summary.subjectTracks).toEqual([]);
    expect(summary.segments[0]).not.toHaveProperty('subject');
  });

  it('returns local geometry without exposing placeholder semantic labels', () => {
    const timeline: VisualTimeline = {
      cuts: [3.25],
      qualityWindows: [{ rank: 1, startSec: 0, endSec: 2, score: 90, sharpness: 0.9, exposure: 0.9, stability: 0.9, subjectPresence: 1, sampleCount: 4, worstFrameScore: 88, edgeScore: 89, hardFailureFraction: 0 }],
      segments: [{
        start: 0,
        end: 6,
        label: { content: 'talkinghead', person: 'center', safe: 'full', hasText: false, desc: '' },
        geom: { subject: { x: 0.2, y: 0.1, w: 0.4, h: 0.8 }, face: null, rects: [] },
      }],
    };
    const summary = visualGeometryForAgent(timeline);
    expect(summary.sceneCutsSec).toEqual([3.25]);
    expect(summary.subjectTracks).toHaveLength(1);
    expect(summary.qualityWindows).toHaveLength(1);
    expect(summary).not.toHaveProperty('segments');
  });

  it('locally merges repeated talking-head geometry into stable tracks and semantic intervals', () => {
    const label = { content: 'talkinghead', person: 'center', safe: 'right', hasText: false, desc: 'Same speaker' } as const;
    const summary = visualTimelineForAgent({
      cuts: [1, 2],
      segments: [
        { start: 0, end: 1, label, geom: { subject: { x: 0.3, y: 0.1, w: 0.3, h: 0.7 }, face: null, rects: [] } },
        { start: 1, end: 2, label, geom: { subject: { x: 0.32, y: 0.11, w: 0.3, h: 0.69 }, face: null, rects: [] } },
        { start: 2, end: 3, label, geom: { subject: { x: 0.7, y: 0.1, w: 0.25, h: 0.7 }, face: null, rects: [] } },
      ],
    });

    expect(summary.segments).toEqual([
      { startSec: 0, endSec: 3, content: 'talkinghead', person: 'center', safe: 'right', description: 'Same speaker' },
    ]);
    expect(summary.subjectTracks).toHaveLength(2);
    expect(summary.subjectTracks[0]).toMatchObject({ startSec: 0, endSec: 2, samples: 2 });
    expect(summary.subjectTracks[0]!.subject).toMatchObject({ x: 0.31, y: 0.105, w: 0.3, h: 0.695, anchorX: 0.46, anchorY: 0.452 });
    expect(summary.subjectTracks[1]).toMatchObject({ startSec: 2, endSec: 3, samples: 1 });
  });

  it('rejects framing-only cuts inside a stable main-source track but not inserted footage', () => {
    const timeline: VisualTimeline = {
      cuts: [3, 6],
      segments: [
        {
          start: 0,
          end: 10,
          label: { content: 'talkinghead', person: 'center', safe: 'right', hasText: false, desc: 'Speaker' },
          geom: { subject: { x: 0.3, y: 0.1, w: 0.3, h: 0.7 }, face: null, rects: [] },
        },
      ],
    };
    const main: VideoShot[] = [{ id: 's1', srcStart: 0, srcEnd: 10, treatment: 'full' }];
    expect(rejectStableFramingSplits(main, timeline, [0.5, 5, 9.5])).toEqual([
      { atSec: 5, sourceSec: 5, stableSourceRange: [0, 10], suggestedAtSecs: [] },
    ]);
    const inserted: VideoShot[] = [{ ...main[0]!, src: 'https://cdn.example/clip.mp4' }];
    expect(rejectStableFramingSplits(inserted, timeline, [5])).toEqual([]);
  });
});
