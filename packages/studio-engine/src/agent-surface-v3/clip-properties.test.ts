import { describe, expect, it } from 'vitest';
import { runAgentTimelineTool } from '../agent-timeline';
import { emptyEditorDocumentV2 } from '../editor-document';
import type { EditorDocumentV2, EditorTrack, TimelineClip } from '../editor-document/types';
import { CLIP_PROPERTIES, CLIP_PROPERTY_KEYS, clipPropertiesFor, clipPropertyDefaults, type ClipPropertyKey, type DocumentClipKind } from './clip-properties';
import { V3_TOOL_SCHEMAS } from './schemas';
import { validateV3Input } from './validate';
import { renderV3State } from './state';

/** One clip of every kind (a media clip both as video and as a still), built through the real tools. */
function project(): { document: EditorDocumentV2; clipIds: Record<DocumentClipKind | 'image', string> } {
  let document = emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 });
  document = runAgentTimelineTool(document, 'register_media', { assets: [
    { id: 'cam', kind: 'video', url: 'https://cdn.example/cam.mp4', durationSec: 10, width: 1080, height: 1920, hasAudio: true },
    { id: 'still', kind: 'image', url: 'https://cdn.example/still.jpg', width: 1080, height: 1920 },
    { id: 'music', kind: 'audio', url: 'https://cdn.example/music.mp3', durationSec: 30 },
  ] }).document!;
  const placed = runAgentTimelineTool(document, 'add_clips', { clips: [
    { id: 'spine', assetId: 'cam', role: 'primary', startFrame: 0, durationFrames: 150 },
    { id: 'broll', assetId: 'cam', role: 'broll', startFrame: 30, durationFrames: 60 },
    { id: 'still-clip', assetId: 'still', role: 'broll', startFrame: 100, durationFrames: 30 },
    { id: 'bed', assetId: 'music', role: 'music', startFrame: 0, durationFrames: 150 },
  ] });
  expect(placed.ok, JSON.stringify(placed)).toBe(true);
  document = placed.document!;
  const graphic: TimelineClip = {
    id: 'title', kind: 'graphic', startFrame: 0, durationFrames: 60, enabled: true, anchor: { type: 'timeline' },
    block: { templateId: 'custom', slots: { innerHtml: '<div>hi</div>', timelineBody: '' }, box: { x: 0.1, y: 0.1, w: 0.5, h: 0.2 } },
  } as unknown as TimelineClip;
  const cue: TimelineClip = {
    id: 'cue', kind: 'caption', startFrame: 0, durationFrames: 30, enabled: true, managed: true, anchor: { type: 'timeline' },
    block: { templateId: 'caption', slots: { text: 'hello' } },
  } as unknown as TimelineClip;
  document.timeline.tracks.push(
    { id: 'gfx', type: 'graphics', role: 'graphics', name: 'Graphics', stackOrder: 20, muted: false, hidden: false, locked: false, syncLocked: false, clips: [graphic] } as unknown as EditorTrack,
    { id: 'cap', type: 'caption', role: 'managedCaptions', name: 'Captions', stackOrder: 40, muted: false, hidden: false, locked: false, syncLocked: false, clips: [cue] } as unknown as EditorTrack,
  );
  document.semantics.managedCaptionTrackId = 'cap';
  return { document, clipIds: { narrative: 'spine', media: 'broll', image: 'still-clip', graphic: 'title', audio: 'bed', caption: 'cue' } };
}

const SAMPLE: Record<ClipPropertyKey, unknown> = {
  source: [0, 1.5], durationFrames: 45, speed: 2, ripple: true, volumeDb: -6, mute: true, fades: { in: 6, out: 6 },
  filter: { brightness: 1.1 }, opacity: 0.5, enabled: false, box: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, props: [{ key: 'x', value: 1 }],
};
/** Fields whose success depends on more than the kind (a modifier without its verb, a component's own schema). */
const KIND_ONLY = new Set<ClipPropertyKey>(['ripple', 'props']);

describe('clip capability table', () => {
  it('is the source of the set_clip_properties schema and description', () => {
    const items = ((V3_TOOL_SCHEMAS.set_clip_properties!.inputSchema as { properties: { items: { items: { properties: Record<string, unknown> } } } }).properties.items.items).properties;
    expect(Object.keys(items).sort()).toEqual(['clipId', ...CLIP_PROPERTY_KEYS].sort());
    const description = V3_TOOL_SCHEMAS.set_clip_properties!.description;
    for (const kind of ['narrative', 'media', 'graphic', 'audio', 'caption'] as const) {
      for (const key of clipPropertiesFor(kind)) expect(description).toContain(key);
    }
    expect(description).toContain('caption cue clips take enabled');
  });

  it('every field × every kind: taken fields apply, the rest are refused with the tool that does the job', () => {
    for (const spec of CLIP_PROPERTIES) {
      for (const [label, clipId] of Object.entries(project().clipIds)) {
        const kind = (label === 'image' ? 'media' : label) as DocumentClipKind;
        const { document } = project();
        const result = runAgentTimelineTool(document, 'set_clip_properties', { items: [{ clipId, [spec.key]: SAMPLE[spec.key] }] });
        const supported = spec.kinds.includes(kind) && !(spec.needsVideo && label === 'image');
        if (!supported) {
          expect(result, `${spec.key} on ${label}`).toMatchObject({ ok: false, error: 'unknown_field', data: { path: `items[0].${spec.key}`, fix: expect.any(String) } });
          continue;
        }
        expect(result.error, `${spec.key} on ${label}: ${JSON.stringify(result)}`).not.toBe('unknown_field');
        if (!KIND_ONLY.has(spec.key)) expect(result.ok, `${spec.key} on ${label}: ${JSON.stringify(result)}`).toBe(true);
      }
    }
  });

  it('names the owning tool when a field of another tool is sent', () => {
    expect(validateV3Input('set_clip_properties', { items: [{ clipId: 'c1', assetId: 'a2' }] })).toMatchObject({ error: 'unknown_field', path: 'items[0].assetId', fix: expect.stringContaining('swap_clip_media') });
    expect(validateV3Input('set_clip_properties', { items: [{ clipId: 'c1', keyframes: [] }] })).toMatchObject({ error: 'unknown_field', fix: expect.stringContaining('set_keyframes') });
    expect(validateV3Input('set_clip_properties', { items: [{ clipId: 'c1', treatment: 'full' }] })).toMatchObject({ error: 'unknown_field', fix: expect.stringContaining('set_clip_framing') });
    expect(validateV3Input('set_clip_properties', { items: [{ clipId: 'c1', bogus: 1 }] })).toMatchObject({ error: 'unknown_field', fix: expect.stringContaining('use only') });
  });

  it('read-back strips exactly the table defaults, so a written value comes back and a default does not', () => {
    const { document, clipIds } = project();
    const written = runAgentTimelineTool(document, 'set_clip_properties', { items: [
      { clipId: clipIds.media, opacity: 0.5, volumeDb: -6 },
      { clipId: clipIds.audio, fades: { in: 15, out: 30 } },
    ] });
    expect(written.ok, JSON.stringify(written)).toBe(true);
    const clips = renderV3State(written.document!).tracks.flatMap((track) => track.clips ?? []);
    const media = clips.find((clip) => clip.id === clipIds.media)!;
    expect(media).toMatchObject({ opacity: 0.5, volumeDb: -6 });
    expect(media).not.toHaveProperty('fit');
    expect(clipPropertyDefaults('media')).toMatchObject({ opacity: 1, fit: 'cover' });
    const bed = clips.find((clip) => clip.id === clipIds.audio)!;
    expect(bed).toMatchObject({ fadeInSec: 0.5, fadeOutSec: 1 });
    expect(clipPropertyDefaults('audio', 'music')).toMatchObject({ fadeInSec: expect.any(Number), fadeOutSec: expect.any(Number) });
  });
});
