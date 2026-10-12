import { describe, expect, it } from 'vitest';
import { whiteboardSceneReady } from './whiteboard-scene-result';
import type { Block } from '@pireel/studio-engine/composition-core';
const board = (startSec = 0, durationSec = 10, aspect = '16:9'): Block => ({ id: `b-${startSec}`, templateId: 'whiteboard', startSec, durationSec, trackIndex: 2, slots: { doc: { aspect, board: { nodes: [{ id: 'n' }] }, beats: [{ id: 'step' }] } } });
describe('whiteboard scene completion', () => {
  it('requires actual board content, correct aspect and full-duration coverage', () => {
    expect(whiteboardSceneReady([], 1920, 1080, 10)).toBe(false);
    expect(whiteboardSceneReady([board()], 1920, 1080, 10)).toBe(true);
    expect(whiteboardSceneReady([board(0, 5)], 1920, 1080, 10)).toBe(false);
    expect(whiteboardSceneReady([board(1, 10)], 1920, 1080, 10)).toBe(false);
    expect(whiteboardSceneReady([board(0, 10, '9:16')], 1920, 1080, 10)).toBe(false);
    expect(whiteboardSceneReady([board(0, 5), board(5, 5)], 1920, 1080, 10)).toBe(true);
  });
  it('does not count a small overlay or an empty draft as a generated result', () => {
    expect(whiteboardSceneReady([{ ...board(), box: { x: .2, y: .2, w: .5, h: .5 } }], 1920, 1080, 10)).toBe(false);
    expect(whiteboardSceneReady([{ ...board(), slots: { doc: { aspect: '16:9', board: { nodes: [] }, beats: [] } } }], 1920, 1080, 10)).toBe(false);
  });
});
