import { describe, expect, it } from 'vitest';
import { visualTimelineForAgent, type VisualTimeline } from './visual-types';

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
});
