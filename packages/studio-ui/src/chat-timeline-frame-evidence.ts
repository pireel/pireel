import type { AttachedTimelineFrame } from './studio-chat';

export interface TimelineFrameEvidence {
  id: string;
  atSec: number;
  fps: number;
  width: number;
  height: number;
  description: string;
}

function dataUrlPayload(dataUrl: string): { mime: string; base64: string } | null {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(dataUrl);
  if (!match?.[1] || !match[2]) return null;
  return { mime: match[1], base64: match[2] };
}

/** Turn exact timeline pixels into stable text evidence before the text-only chat model sees them. */
export async function inspectTimelineFrameEvidence(
  frames: readonly AttachedTimelineFrame[],
  options: { signal?: AbortSignal; fetch?: typeof fetch } = {},
): Promise<TimelineFrameEvidence[]> {
  if (!frames.length) return [];
  const encoded = frames.map((frame) => ({ frame, payload: dataUrlPayload(frame.dataUrl) }));
  if (encoded.some((item) => !item.payload)) throw new Error('invalid_timeline_frame');

  const response = await (options.fetch ?? fetch)('/api/studio/review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'assets',
      frames: encoded.map(({ frame, payload }) => ({
        atSec: frame.atSec,
        mime: payload!.mime,
        image_base64: payload!.base64,
        expected: `Exact rendered timeline frame at ${frame.atSec.toFixed(3)}s`,
      })),
    }),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const json = (await response.json().catch(() => ({}))) as {
    frames?: Array<{ scene?: unknown }>;
    error?: string;
    detail?: string;
  };
  if (!response.ok || !Array.isArray(json.frames) || json.frames.length !== frames.length) {
    throw new Error(json.detail || json.error || `timeline_frame_review_${response.status}`);
  }

  return frames.map((frame, index) => {
    const description = typeof json.frames?.[index]?.scene === 'string'
      ? json.frames[index]!.scene.trim()
      : '';
    if (!description) throw new Error('timeline_frame_description_missing');
    return {
      id: frame.id,
      atSec: frame.atSec,
      fps: frame.fps,
      width: frame.width,
      height: frame.height,
      description,
    };
  });
}
