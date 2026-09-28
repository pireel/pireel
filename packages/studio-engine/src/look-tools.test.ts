import { describe, expect, it } from 'vitest';
import { runAgentTimelineTool } from './agent-timeline';
import { emptyEditorDocumentV2 } from './editor-document';
import { validateEditorDocumentV2 } from './editor-document/validation';
import type { EditorDocumentV2 } from './editor-document/types';

const card = "function (props, ctx) { return { html: '<b>' + props.title + '</b>', animate: function (tl, el) { tl.from(el, { opacity: 0, duration: 0.3 }, 0); } }; }";

function withSpeech(): EditorDocumentV2 {
  let document = emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 });
  document = runAgentTimelineTool(document, 'register_media', { assets: [{ id: 'cam', kind: 'video', url: 'https://cdn.example/cam.mp4', durationSec: 10, width: 1080, height: 1920, hasAudio: true }] }).document!;
  document = runAgentTimelineTool(document, 'add_clips', { clips: [{ id: 'spine', assetId: 'cam', role: 'primary', startFrame: 0, durationFrames: 300 }] }).document!;
  return {
    ...document,
    semantics: { ...document.semantics, transcripts: { cam: [{ start: 1, end: 3, text: '价值一千九百九十九', words: [{ text: '价值', start: 1, end: 1.4 }, { text: '一千九百九十九', start: 1.4, end: 2.6 }] }] as never } },
  };
}

const setLook = (document: EditorDocumentV2, pieces: unknown[] = [{ id: 'item-card', label: 'Item card', source: card, propsSchema: '{"title":{"type":"string"}}' }]) =>
  runAgentTimelineTool(document, 'set_look', { look: { css: '.x { color: red; }', pieces, notes: 'Red means a count.' } });

describe('video-level template tools', () => {
  it('set_look stores the look (pieces as a list, schema as JSON text) and refuses one that breaks the runtime', () => {
    const written = setLook(withSpeech());
    expect(written.ok, JSON.stringify(written)).toBe(true);
    const look = written.document!.appearance.look!;
    expect(look.pieces['item-card']).toMatchObject({ label: 'Item card', propsSchema: { title: { type: 'string' } } });
    expect(look.id).toMatch(/^look-/);
    expect(validateEditorDocumentV2(written.document!).filter((issue) => issue.severity === 'error')).toEqual([]);
    // The same call is the same look (replay-safe id).
    expect(setLook(withSpeech()).document!.appearance.look!.id).toBe(look.id);
    const refused = setLook(withSpeech(), [{ id: 'clock', source: 'function () { return { html: String(Date.now()) }; }' }]);
    expect(refused).toMatchObject({ ok: false, error: 'invalid_look' });
    expect(JSON.stringify(refused)).toContain('clock');
  });

  it('place_graphics places piece instances with their props, box and time, anchored to a word', () => {
    const document = setLook(withSpeech()).document!;
    const placed = runAgentTimelineTool(document, 'place_graphics', { items: [{
      pieceId: 'item-card',
      props: [{ key: 'title', value: 'VIP 年卡' }],
      box: { x: 0.05, y: 0.08, w: 0.9, h: 0.1 },
      startFrame: 42,
      durationFrames: 90,
      anchor: { assetId: 'cam', segmentIndex: 0, wordIndex: 1 },
      words: [{ text: '一千九百九十九', start: 0, end: 1.2 }],
    }] });
    expect(placed.ok, JSON.stringify(placed)).toBe(true);
    const clipId = (placed.data as { clipIds: string[] }).clipIds[0]!;
    const clip = placed.document!.timeline.tracks.flatMap((track) => track.clips).find((candidate) => candidate.id === clipId)!;
    expect(clip).toMatchObject({ kind: 'graphic', startFrame: 42, durationFrames: 90, anchor: { type: 'word', assetId: 'cam', segmentIndex: 0, wordIndex: 1 } });
    expect((clip as { block: { templateId: string; slots: Record<string, unknown> } }).block).toMatchObject({
      templateId: 'look:item-card',
      slots: { props: { title: 'VIP 年卡' }, words: [{ text: '一千九百九十九', start: 0, end: 1.2 }] },
    });
    expect(runAgentTimelineTool(document, 'place_graphics', { items: [{ pieceId: 'nope', startFrame: 0, durationFrames: 30 }] }))
      .toMatchObject({ ok: false, error: 'unknown_id', data: { fix: expect.stringContaining('item-card') } });
    expect(runAgentTimelineTool(withSpeech(), 'place_graphics', { items: [{ pieceId: 'item-card', startFrame: 0, durationFrames: 30 }] }))
      .toMatchObject({ ok: false, error: 'no_look' });
    expect(runAgentTimelineTool(document, 'place_graphics', { items: [{ pieceId: 'item-card', startFrame: 0, durationFrames: 30, anchor: { assetId: 'cam', segmentIndex: 0, wordIndex: 9 } }] }))
      .toMatchObject({ ok: false, error: 'invalid_value' });
  });

  it('set_confirm_list stores facts, music and voice to confirm, and keeps answers across rewrites', () => {
    const listed = runAgentTimelineTool(withSpeech(), 'set_confirm_list', { items: [
      { id: 'claim', kind: 'fact', text: '「完全不打药」是否属实', ref: 'c17' },
      { id: 'bgm', kind: 'music', text: '建议配一首轻快的吉他曲' },
    ] });
    expect(listed.ok).toBe(true);
    const answered: EditorDocumentV2 = { ...listed.document!, semantics: { ...listed.document!.semantics, handoff: listed.document!.semantics.handoff!.map((item) => (item.id === 'claim' ? { ...item, status: 'changed' as const, answer: '只有葡萄不打药' } : item)) } };
    const rewritten = runAgentTimelineTool(answered, 'set_confirm_list', { items: [{ id: 'claim', kind: 'fact', text: '「完全不打药」是否属实' }, { kind: 'voice', text: '用你的克隆声音配旁白？' }] });
    expect(rewritten.document!.semantics.handoff).toEqual([
      { id: 'claim', kind: 'fact', text: '「完全不打药」是否属实', status: 'changed', answer: '只有葡萄不打药' },
      { id: 'confirm-2', kind: 'voice', text: '用你的克隆声音配旁白？', status: 'open' },
    ]);
    expect(runAgentTimelineTool(rewritten.document!, 'set_confirm_list', { items: [] }).document!.semantics.handoff).toBeUndefined();
  });
});
