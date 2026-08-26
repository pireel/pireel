import { describe, expect, it, vi } from 'vitest';
import { inspectTimelineFrameEvidence } from './chat-timeline-frame-evidence';

const frame = {
  id: 'shot-1',
  atSec: 1.25,
  fps: 30,
  width: 720,
  height: 1280,
  dataUrl: 'data:image/jpeg;base64,ZmFrZQ==',
};

describe('inspectTimelineFrameEvidence', () => {
  it('persists a vision description alongside the frame identity', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        mode: 'assets',
        frames: [{ atSec: 1.25, mime: 'image/jpeg', image_base64: 'ZmFrZQ==' }],
      });
      return Response.json({ frames: [{ scene: 'A hand opens a cardboard box.' }] });
    });

    await expect(inspectTimelineFrameEvidence([frame], { fetch: fetcher as typeof fetch })).resolves.toEqual([{
      id: 'shot-1',
      atSec: 1.25,
      fps: 30,
      width: 720,
      height: 1280,
      description: 'A hand opens a cardboard box.',
    }]);
  });

  it('does not send a frame to chat when vision returned no usable evidence', async () => {
    const fetcher = vi.fn(async () => Response.json({ frames: [{ scene: '' }] }));
    await expect(inspectTimelineFrameEvidence([frame], { fetch: fetcher as typeof fetch }))
      .rejects.toThrow('timeline_frame_description_missing');
  });
});
