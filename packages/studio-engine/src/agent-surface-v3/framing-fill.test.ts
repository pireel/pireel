import { describe, expect, it } from 'vitest';
import { runAgentTimelineTool } from '@pireel/studio-engine/agent-timeline';
import { fillFraming } from '@pireel/studio-engine/agent-timeline-v3';
import { emptyEditorDocumentV2 } from '@pireel/studio-engine/editor-document';
import { renderV3State } from '@pireel/studio-engine/agent-surface-v3/state';

/** A landscape interview on a portrait canvas. legacy = a clip saved before placed clips carried
 *  source-normalized framing: its layer is contain-fitted and covers 0.316 of the height. */
function landscapeOnPortrait(legacy: boolean) {
  let document = emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 });
  document = runAgentTimelineTool(document, 'register_media', { assets: [
    { id: 'cam', kind: 'video', url: 'https://cdn.example/cam.mp4', durationSec: 10, width: 1920, height: 1080, hasAudio: true },
  ] }).document!;
  const placed = runAgentTimelineTool(document, 'add_clips', { clips: [{ id: 'spine', assetId: 'cam', role: 'primary', startFrame: 0, durationFrames: 150 }] });
  expect(placed.ok, JSON.stringify(placed)).toBe(true);
  // The first clip sizes the canvas to the footage; the short is then turned portrait.
  const portrait = runAgentTimelineTool(placed.document!, 'set_canvas', { width: 1080, height: 1920 });
  expect(portrait.ok, JSON.stringify(portrait)).toBe(true);
  const document_ = portrait.document!;
  if (legacy) for (const clip of document_.timeline.tracks.flatMap((track) => track.clips)) if (clip.kind === 'narrative') delete clip.properties.preciseFraming;
  return document_;
}

describe('set_clip_framing keeps a punched-in picture over the canvas', () => {
  it('computes the fill range per axis from the contain-fitted layer', () => {
    // Height: 0.316 of the canvas, ×4 = 1.266 → anchorY within 0.5 ± 0.105.
    expect(fillFraming({ scale: 4, anchorX: 0.5, anchorY: 0.3 }, 1920, 1080, 1080, 1920)).toMatchObject({ anchorY: 0.395 });
    expect(fillFraming({ scale: 4, anchorX: 0.6, anchorY: 0.47 }, 1920, 1080, 1080, 1920)).toEqual({ notes: [] });
    // Under the fill scale the bands cannot be avoided: centre them and say what fills.
    const short = fillFraming({ scale: 2, anchorX: 0.5, anchorY: 0.4 }, 1920, 1080, 1080, 1920);
    expect(short.anchorY).toBe(0.5);
    expect(short.notes.join(' ')).toContain('scale ≥ 3.17');
  });

  it('holds an anchor that would show black bands and says so in the receipt', () => {
    const written = runAgentTimelineTool(landscapeOnPortrait(true), 'set_clip_framing', { items: [{ clipId: 'spine', treatment: 'full', scale: 3.2, anchorX: 0.6, anchorY: 0.3 }] });
    expect(written.ok, JSON.stringify(written)).toBe(true);
    const spine = renderV3State(written.document!).tracks.flatMap((track) => track.clips ?? []).find((clip) => clip.id === 'spine')!;
    expect(spine.preciseFraming).toMatchObject({ scale: 3.2, anchorX: 0.6, anchorY: 0.494 });
    expect(JSON.stringify(written.data)).toContain('anchorY 0.3 would show the canvas');
  });

  it('leaves source-normalized framing alone: it is cover-fitted and clamped where it is drawn', () => {
    const written = runAgentTimelineTool(landscapeOnPortrait(false), 'set_clip_framing', { items: [{ clipId: 'spine', scale: 1.5, anchorY: 0.2 }] });
    expect(written.ok, JSON.stringify(written)).toBe(true);
    expect(JSON.stringify(written.data)).not.toContain('would show the canvas');
  });
});
