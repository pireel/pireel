import { describe, expect, it } from 'vitest';
import { describeAudioTargets, resolveAudioTarget } from './audio-target';
import type { EditorDocumentV2 } from './editor-document/types';

const document = {
  timeline: {
    tracks: [
      { id: 'track_music', type: 'audio', clips: [
        { id: 'clip_b', kind: 'audio', startFrame: 300 },
        { id: 'clip_a', kind: 'audio', startFrame: 0 },
      ] },
      { id: 'track_narration', type: 'audio', clips: [{ id: 'clip_n', kind: 'audio', startFrame: 0 }] },
    ],
  },
} as unknown as EditorDocumentV2;

describe('resolveAudioTarget', () => {
  it('accepts a clip id directly', () => {
    expect(resolveAudioTarget(document, ['clip_a', 'clip_b', 'clip_n'], 'clip_b')).toEqual({ clipIds: ['clip_b'] });
  });

  it('accepts a lane id and resolves the audio clips on that lane in timeline order', () => {
    expect(resolveAudioTarget(document, ['clip_a', 'clip_b', 'clip_n'], 'track_music')).toEqual({ laneId: 'track_music', clipIds: ['clip_a', 'clip_b'] });
  });

  it('returns nothing for an unknown id and lists what would have worked', () => {
    expect(resolveAudioTarget(document, ['clip_a'], 'track_sfx')).toEqual({ clipIds: [] });
    expect(describeAudioTargets(document, ['clip_a', 'clip_n'])).toBe('audio clips: clip_a, clip_n · lanes: track_music, track_narration');
  });
});
