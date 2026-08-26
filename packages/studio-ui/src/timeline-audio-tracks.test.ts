import { describe, expect, it } from 'vitest';
import type { AudioClip } from '@pireel/studio-engine/composition';
import {
  timelineAudioLanes,
  timelineCompatibleTrackDropTarget,
  timelineTrackDisplayOrder,
  timelineTrackDropTarget,
} from './timeline-audio-tracks';

const clips: AudioClip[] = [
  { id: 'foley-a', src: 'a.wav', startSec: 0 },
  { id: 'foley-b', src: 'b.wav', startSec: 0 },
];

describe('timelineAudioLanes', () => {
  it('keeps audio tracks at the document position chosen by the user', () => {
    expect(timelineTrackDisplayOrder([
      { trackId: 'visual', timelineIndex: 2 },
      { trackId: 'audio', timelineIndex: 0 },
      { trackId: 'primary', timelineIndex: 1 },
    ])).toEqual(['audio', 'primary', 'visual']);
  });

  it('maps the boundary below the primary row to the exact document insertion index', () => {
    expect(timelineTrackDropTarget([
      { trackId: 'primary', trackIndex: 0, top: 0, height: 96 },
      { trackId: 'visual', trackIndex: 1, top: 100, height: 36 },
      { trackId: 'audio', trackIndex: 2, top: 140, height: 36 },
    ], 98, 40)).toEqual({
      kind: 'new-track',
      newTrackIndex: 1,
      lineTop: 98,
      top: 78,
    });
  });

  it('keeps the body of a component row as an existing-track target', () => {
    expect(timelineTrackDropTarget([
      { trackId: 'primary', trackIndex: 0, top: 0, height: 96 },
      { trackId: 'visual', trackIndex: 1, top: 100, height: 36 },
      { trackId: 'audio', trackIndex: 2, top: 140, height: 36 },
    ], 118, 40)).toEqual({
      kind: 'existing-track',
      trackId: 'visual',
      trackIndex: 1,
      top: 100,
    });
  });

  it('keeps an audio row body on that audio track instead of creating another lane', () => {
    expect(timelineTrackDropTarget([
      { trackId: 'primary', trackIndex: 0, top: 0, height: 96 },
      { trackId: 'audio', trackIndex: 1, top: 100, height: 40 },
    ], 120, 40)).toEqual({
      kind: 'existing-track',
      trackId: 'audio',
      trackIndex: 1,
      top: 100,
    });
  });

  it('lets a component target the exact document gap between two audio tracks', () => {
    const rows = [
      { trackId: 'primary', trackIndex: 0, top: 0, height: 96 },
      { trackId: 'audio-1', trackIndex: 1, top: 100, height: 40 },
      { trackId: 'audio-2', trackIndex: 2, top: 144, height: 40 },
      { trackId: 'graphics', trackIndex: 3, top: 188, height: 36 },
    ];
    expect(timelineCompatibleTrackDropTarget(
      rows,
      142,
      36,
      new Set(['graphics']),
    )).toEqual({
      kind: 'new-track',
      newTrackIndex: 2,
      lineTop: 142,
      top: 124,
    });
  });

  it('keeps a component under the pointer over an incompatible audio row and targets its upper boundary', () => {
    const rows = [
      { trackId: 'primary', trackIndex: 0, top: 0, height: 96 },
      { trackId: 'audio', trackIndex: 1, top: 100, height: 40 },
      { trackId: 'graphics', trackIndex: 2, top: 144, height: 36 },
    ];
    expect(timelineCompatibleTrackDropTarget(
      rows,
      115,
      36,
      new Set(['graphics']),
    )).toEqual({
      kind: 'new-track',
      newTrackIndex: 1,
      lineTop: 98,
      top: 97,
    });
  });

  it('targets the lower boundary when the pointer crosses the incompatible row midpoint', () => {
    const rows = [
      { trackId: 'primary', trackIndex: 0, top: 0, height: 96 },
      { trackId: 'audio', trackIndex: 1, top: 100, height: 40 },
      { trackId: 'graphics', trackIndex: 2, top: 144, height: 36 },
    ];
    expect(timelineCompatibleTrackDropTarget(
      rows,
      125,
      36,
      new Set(['graphics']),
    )).toEqual({
      kind: 'new-track',
      newTrackIndex: 2,
      lineTop: 142,
      top: 107,
    });
  });

  it('keeps the primary track first when an incompatible clip hovers its body', () => {
    const rows = [
      { trackId: 'primary', trackIndex: 0, top: 0, height: 96 },
      { trackId: 'audio', trackIndex: 1, top: 100, height: 40 },
    ];
    expect(timelineCompatibleTrackDropTarget(
      rows,
      20,
      36,
      new Set(['graphics']),
      new Set(['primary']),
    )).toEqual({
      kind: 'new-track',
      newTrackIndex: 1,
      lineTop: 98,
      top: 2,
    });
  });

  it('preserves native audio track identity instead of flattening overlapping clips', () => {
    expect(timelineAudioLanes(clips, [
      { trackId: 'audio-1', clipIds: ['foley-a'] },
      { trackId: 'audio-2', clipIds: ['foley-b'] },
    ])).toEqual([
      { trackId: 'audio-1', clips: [clips[0]] },
      { trackId: 'audio-2', clips: [clips[1]] },
    ]);
  });

  it('keeps the legacy single-lane fallback when native track state is unavailable', () => {
    expect(timelineAudioLanes(clips, [])).toEqual([
      { trackId: undefined, clips },
    ]);
  });
});
