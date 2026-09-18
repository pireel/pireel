import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2 } from '@pireel/studio-engine/editor-document';
import { runAgentTimelineTool } from '@pireel/studio-engine/agent-timeline';
import { agentMediaClipRefs, buildAgentElementRoster } from './agent-element-roster';

describe('agent element roster', () => {
  it('lists B-roll and image clips next to blocks and spine shots so they can be pinned and @mentioned', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', { assets: [
      { id: 'v', kind: 'video', url: 'https://cdn.example/v.mp4', durationSec: 30 },
      { id: 'cut', kind: 'video', url: 'https://cdn.example/cut.mp4', durationSec: 30, label: '海边空镜' },
      { id: 'still', kind: 'image', url: 'https://cdn.example/still.png' },
    ] }).document!;
    document = runAgentTimelineTool(document, 'add_clips', { clips: [
      { id: 's1', role: 'primary', assetId: 'v', startFrame: 0, source: [0, 4] },
      { id: 'b1', role: 'broll', assetId: 'cut', startFrame: 30, source: [0, 2] },
      { id: 'i1', role: 'broll', assetId: 'still', startFrame: 90, durationFrames: 30 },
    ] }).document!;
    const media = agentMediaClipRefs(document);
    expect(media).toEqual([{ id: 'b1', kind: 'video', label: '海边空镜' }, { id: 'i1', kind: 'image' }]);
    const roster = buildAgentElementRoster([], [{ id: 's1', srcStart: 0, srcEnd: 4, treatment: 'full' }], media);
    expect(roster.map((element) => [element.id, element.kind, element.isShot])).toEqual([
      ['s1', 'shot', true], ['b1', 'video', false], ['i1', 'image', false],
    ]);
    expect(roster[1]!.label).toBe('海边空镜');
    expect(roster[2]!.label).toContain('#2');
  });
});
