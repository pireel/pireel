import { describe, expect, it } from 'vitest';
import { runAgentTimelineTool } from '@pireel/studio-engine/agent-timeline';
import { emptyEditorDocumentV2 } from '@pireel/studio-engine/editor-document';
import { validateEditorDocumentV2 } from '@pireel/studio-engine/editor-document/validation';
import type { EditorDocumentV2 } from '@pireel/studio-engine/editor-document/types';
import type { Block } from '@pireel/studio-engine/composition-core';
import { componentSchemaOf } from '@pireel/studio-engine/component-schema';
import { renderV3State } from '@pireel/studio-engine/agent-surface-v3/state';
import { applyEditorCommand } from '@pireel/studio-engine/editor-document/commands/dispatcher';
import { refusedLookFix } from '@pireel/studio-engine/look-tools';

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
  it('set_look refuses a list field no tool call can fill, naming the fields a row can carry', () => {
    const rows = '{"rows":{"type":"array","items":{"type":"object","properties":{"label":{"type":"string"},"unit":{"type":"string"}}}}}';
    const refused = setLook(withSpeech(), [{ id: 'price-card', label: 'Price', source: card, propsSchema: rows }]);
    expect(refused).toMatchObject({ ok: false, error: 'invalid_value', data: { path: 'look.pieces[0].propsSchema.rows.items.properties.unit', fix: expect.stringContaining('text, note, label, value, trend, emphasis') } });
    expect(setLook(withSpeech(), [{ id: 'price-card', label: 'Price', source: card, propsSchema: rows.replace('"unit"', '"note"') }]).ok).toBe(true);
  });
  it('set_look stores the look (pieces as a list, schema as JSON text) and refuses one that breaks the runtime', () => {
    const written = setLook(withSpeech());
    expect(written.ok, JSON.stringify(written)).toBe(true);
    const look = written.document!.appearance.look!;
    expect(look.pieces['item-card']).toMatchObject({ label: 'Item card', propsSchema: { type: 'object', properties: { title: { type: 'string' } } } });
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
    // The creator answers in place (a document command, so it undoes and syncs), and the agent reads the answer back.
    const answeredInPanel = applyEditorCommand(rewritten.document!, { type: 'handoff.patch', id: 'confirm-2', status: 'changed', answer: '用 AI 配音' });
    expect(answeredInPanel.ok).toBe(true);
    expect(renderV3State(answeredInPanel.document).confirmList).toContainEqual({ id: 'confirm-2', kind: 'voice', text: '用你的克隆声音配旁白？', status: 'changed', answer: '用 AI 配音' });
    const reopened = applyEditorCommand(answeredInPanel.document, { type: 'handoff.patch', id: 'confirm-2', status: 'open' });
    expect(reopened.document.semantics.handoff![1]).toEqual({ id: 'confirm-2', kind: 'voice', text: '用你的克隆声音配旁白？', status: 'open' });
    expect(applyEditorCommand(reopened.document, { type: 'handoff.patch', id: 'nope', status: 'confirmed' }).ok).toBe(false);
  });
  it('fit:false places an instance as designed, and a box set later drops the geometry an earlier fit wrote', () => {
    const document = setLook(withSpeech()).document!;
    const placed = runAgentTimelineTool(document, 'place_graphics', { items: [
      { pieceId: 'item-card', props: [{ key: 'title', value: 'A' }], box: { x: 0, y: 0.55, w: 1, h: 0.45 }, startFrame: 0, durationFrames: 60, fit: false },
      { pieceId: 'item-card', props: [{ key: 'title', value: 'B' }], startFrame: 0, durationFrames: 60 },
    ] });
    expect(placed.ok, JSON.stringify(placed)).toBe(true);
    const [kept, fitted] = (placed.data as { clipIds: string[] }).clipIds;
    const blockOf = (doc: typeof document, id: string) => (doc.timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === id) as unknown as { block: Block }).block;
    expect(blockOf(placed.document!, kept!).autoFit).toBe(false);
    expect(blockOf(placed.document!, fitted!).autoFit).toBeUndefined();

    // What a fit writes: a layout rect and a scale under the window.
    const asFitted = runAgentTimelineTool(placed.document!, 'set_clip_properties', { items: [{ clipId: fitted!, box: { x: 0.04, y: 0.55, w: 0.92, h: 0.42 } }] }).document!;
    const withGeometry = { ...asFitted, timeline: { ...asFitted.timeline, tracks: asFitted.timeline.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => (
      clip.id === fitted ? { ...clip, block: { ...(clip as unknown as { block: Block }).block, contentBox: { x: 0.04, y: 0.55, w: 1, h: 0.45 }, scale: 0.926 } } : clip
    )) })) } } as typeof document;
    const reset = runAgentTimelineTool(withGeometry, 'set_clip_properties', { items: [{ clipId: fitted!, box: { x: 0, y: 0.55, w: 1, h: 0.45 } }] });
    expect(reset.ok, JSON.stringify(reset)).toBe(true);
    const block = blockOf(reset.document!, fitted!);
    expect(block.box).toEqual({ x: 0, y: 0.55, w: 1, h: 0.45 });
    expect(block.contentBox).toBeUndefined();
    expect(block.scale).toBeUndefined();
  });

  it('an instance edits through the piece schema: set_clip_properties, get_state and the component contract', () => {
    const schema = JSON.stringify({ title: { type: 'string', title: '标题' }, price: { type: 'integer', title: '价格', default: 0 } });
    const document = setLook(withSpeech(), [{ id: 'item-card', label: 'Item card', source: card, propsSchema: schema }]).document!;
    const placed = runAgentTimelineTool(document, 'place_graphics', { items: [{ pieceId: 'item-card', props: [{ key: 'title', value: 'VIP 年卡' }, { key: 'extra', value: 'kept' }], startFrame: 0, durationFrames: 60 }] });
    const clipId = (placed.data as { clipIds: string[] }).clipIds[0]!;
    const edited = runAgentTimelineTool(placed.document!, 'set_clip_properties', { items: [{ clipId, props: [{ key: 'price', value: 34800 }] }] });
    expect(edited.ok, JSON.stringify(edited)).toBe(true);
    const block = edited.document!.timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === clipId) as unknown as { block: Block };
    // Undeclared props the piece was placed with survive an edit.
    expect(block.block.slots.props).toEqual({ title: 'VIP 年卡', extra: 'kept', price: 34800 });
    const view = componentSchemaOf(block.block, edited.document!.appearance.look);
    expect(view).toMatchObject({ source: 'look', values: { title: 'VIP 年卡', price: 34800 } });
    expect(componentSchemaOf(block.block)).toBeNull();
    const state = JSON.stringify(renderV3State(edited.document!));
    expect(state).toContain('"key":"price","type":"number","value":34800');
    expect(runAgentTimelineTool(edited.document!, 'set_clip_properties', { items: [{ clipId, props: [{ key: 'nope', value: 1 }] }] }).ok).toBe(false);
  });
});

describe('set_look updates an existing look in place', () => {
  it('replaces only the pieces sent, keeps css, fonts and notes, and drops removePieces', () => {
    const first = setLook(withSpeech(), [
      { id: 'item-card', label: 'Item card', source: card, propsSchema: '{"title":{"type":"string"}}' },
      { id: 'stat', label: 'Stat', source: card, propsSchema: '{"title":{"type":"string"}}' },
    ]).document!;
    const tweaked = card.replace('<b>', '<strong>').replace('</b>', '</strong>');
    const updated = runAgentTimelineTool(first, 'set_look', { look: { pieces: [{ id: 'item-card', label: 'Item card', source: tweaked, propsSchema: '{"title":{"type":"string"}}' }] } });
    expect(updated.ok, JSON.stringify(updated)).toBe(true);
    const look = updated.document!.appearance.look!;
    expect(look.pieces['item-card']!.source).toBe(tweaked);
    expect(look.pieces.stat!.source).toBe(card);
    expect(look.css).toBe('.x { color: red; }');
    expect(look.notes).toBe('Red means a count.');
    expect(look.id).not.toBe(first.appearance.look!.id);
    const restyled = runAgentTimelineTool(updated.document!, 'set_look', { look: { css: '.x { color: blue; }', removePieces: ['stat'] } });
    expect(Object.keys(restyled.document!.appearance.look!.pieces)).toEqual(['item-card']);
    expect(restyled.document!.appearance.look!.css).toBe('.x { color: blue; }');
  });
  it('refuses a stylesheet that drops the rules of classes the pieces still wear', () => {
    // The look of a real edit: a chapter label styled through .ch, .mk, .ix and .tt. A later call sent
    // only the palette and the shared class, and every label became bare white text.
    const label = "function (props, ctx) { return { html: `<div class=\"lk ch\"><div class=\"row\"><span class=\"mk\"></span><span class=\"ix\">${props.index || ''}</span><span class=\"tt\">${props.title || ''}</span></div></div>`, animate(tl, el) { tl.from(el.querySelector('.mk'), { scaleX: 0, duration: 0.28 }); } }; }";
    const full = ':root{--ink:#fff;--panel:rgba(10,12,16,.82);--accent:#ffd84a} .lk{color:var(--ink)} .ch{background:var(--panel);padding:10px 16px} .ch .mk{display:inline-block;width:12px;height:12px;background:var(--accent)} .ch .ix{color:#b9bec6} .ch .tt{font-weight:700}';
    const first = runAgentTimelineTool(withSpeech(), 'set_look', { look: { css: full, pieces: [{ id: 'chapter-label', label: 'Chapter', source: label, propsSchema: '{"title":{"type":"string"},"index":{"type":"string"}}' }] } });
    expect(first.ok, JSON.stringify(first)).toBe(true);
    expect((first.data as { unstyled?: unknown }).unstyled).toBeUndefined();

    const partial = runAgentTimelineTool(first.document!, 'set_look', { look: { css: ':root{--ink:#fff;--accent:#ffd84a} .lk{color:var(--ink)} .lk-rule{background:rgba(255,255,255,.22);height:1px}' } });
    expect(partial).toMatchObject({ ok: false, error: 'invalid_look' });
    expect(JSON.stringify(partial.data)).toContain('piece chapter-label loses its rules for .ch, .mk, .ix, .tt');
    expect(JSON.stringify(partial.data)).toContain('css replaces the whole stylesheet');

    // The complete stylesheet with a changed colour goes through, and so does a piece-only update.
    const recoloured = runAgentTimelineTool(first.document!, 'set_look', { look: { css: full.replace('#ffd84a', '#37e1ff') } });
    expect(recoloured.ok, JSON.stringify(recoloured)).toBe(true);
    expect(recoloured.document!.appearance.look!.css).toContain('#37e1ff');
    // Dropping a piece frees its classes: the stylesheet may then drop their rules.
    const other = runAgentTimelineTool(first.document!, 'set_look', { look: { pieces: [{ id: 'item-card', label: 'Item', source: card, propsSchema: '{"title":{"type":"string"}}' }] } });
    const dropped = runAgentTimelineTool(other.document!, 'set_look', { look: { css: '.lk{color:#fff}', removePieces: ['chapter-label'] } });
    expect(dropped.ok, JSON.stringify(dropped)).toBe(true);
  });
  it('names a piece most of whose classes the first stylesheet gives no rule', () => {
    const label = "function (props, ctx) { return { html: `<div class=\"lk ch\"><span class=\"mk\"></span><span class=\"tt\">${props.title || ''}</span></div>`, animate(tl, el) { tl.from(el, { opacity: 0, duration: 0.3 }, 0); } }; }";
    const bare = runAgentTimelineTool(withSpeech(), 'set_look', { look: { css: '.lk{color:#fff}', pieces: [{ id: 'chapter-label', label: 'Chapter', source: label, propsSchema: '{"title":{"type":"string"}}' }] } });
    expect(bare.ok, JSON.stringify(bare)).toBe(true);
    expect((bare.data as { unstyled?: Record<string, string[]> }).unstyled).toEqual({ 'chapter-label': ['.ch', '.mk', '.tt'] });
  });
  it('says, when it refuses a look, that the stylesheet of that call was not saved either', () => {
    const first = setLook(withSpeech()).document!;
    // The full stylesheet arrives with one faulty piece.
    const faulty = "function (props, ctx) { return { html: '<b>' + props.title + '</b>', animate: function (tl, el) { tl.from(el, { opacity: 0, duration: 0.3 }, 0); } }; ";
    const refused = runAgentTimelineTool(first, 'set_look', { look: { css: '.x { color: red; } .card { padding: 8px; }', pieces: [{ id: 'stat', label: 'Stat', source: faulty, propsSchema: '{"title":{"type":"string"}}' }] } });
    expect(refused).toMatchObject({ ok: false, error: 'invalid_look' });
    const fix = (refused.data as { fix: string }).fix;
    expect(fix).toContain('Nothing from this call was saved (css, pieces included)');
    expect(fix).toContain('the css too');
    expect(first.appearance.look!.css).toBe('.x { color: red; }');
    expect(refusedLookFix({ look: { pieces: [{ id: 'stat' }] } })).toContain('Nothing from this call was saved (pieces included)');
    expect(refusedLookFix({ look: { pieces: [{ id: 'stat' }] } })).not.toContain('the css too');
  });
  it('asks for the stylesheet when there is no look yet', () => {
    expect(runAgentTimelineTool(withSpeech(), 'set_look', { look: { pieces: [{ id: 'item-card', source: card }] } })).toMatchObject({ ok: false, error: 'missing_field', data: { path: 'look.css' } });
  });
});

describe('placing through the tools never leaves a fault a viewer sees', () => {
  const talk = (): EditorDocumentV2 => {
    let document = emptyEditorDocumentV2({ width: 1920, height: 1080, fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', { assets: [
      { id: 'cam', kind: 'video', url: 'https://cdn.example/cam.mp4', durationSec: 60, width: 1920, height: 1080, hasAudio: true },
      { id: 'stock', kind: 'video', url: 'https://cdn.example/stock.mp4', durationSec: 12, width: 1920, height: 1080 },
    ] }).document!;
    document = runAgentTimelineTool(document, 'add_clips', { clips: [{ id: 'spine', assetId: 'cam', role: 'primary', startFrame: 0, durationFrames: 1800 }] }).document!;
    // The recording speaks a word every second.
    return { ...document, semantics: { ...document.semantics, transcripts: { cam: Array.from({ length: 60 }, (_, at) => ({ start: at, end: at + 1, text: `w${at}`, words: [{ text: `w${at}`, start: at + 0.1, end: at + 0.9 }] })) as never } } };
  };

  it('refuses the recording added again over speech already on the spine, and says how to restore a passage', () => {
    const before = talk();
    const again = runAgentTimelineTool(before, 'add_clips', { clips: [{ assetId: 'cam', role: 'primary', startFrame: 226, durationFrames: 250, source: [11.9, 20.23] }] });
    expect(again).toMatchObject({ ok: false, error: 'repeats_spine_speech' });
    expect(JSON.stringify(again.data)).toContain('insert_clips with words');
    expect(again.document ?? before).toBe(before);
  });

  it('refuses the recording as B-roll over the moment the spine is playing, and points at framing', () => {
    const over = runAgentTimelineTool(talk(), 'add_clips', { clips: [{ assetId: 'cam', role: 'broll', startFrame: 300, durationFrames: 120, source: [10, 14] }] });
    expect(over).toMatchObject({ ok: false, error: 'recording_over_itself' });
    expect(JSON.stringify(over.data)).toContain('set_clip_framing');
    // Other footage is what B-roll is for.
    expect(runAgentTimelineTool(talk(), 'add_clips', { clips: [{ assetId: 'stock', role: 'broll', startFrame: 300, durationFrames: 120, source: [2, 6] }] }).ok).toBe(true);
  });

  it('lets one short line be copied to the start as a cold open, not a long passage', () => {
    const hook = runAgentTimelineTool(talk(), 'insert_clips', { clips: [{ assetId: 'cam', role: 'primary', source: [30, 34] }], atFrame: 0 });
    expect(hook.ok, JSON.stringify(hook)).toBe(true);
    const long = runAgentTimelineTool(talk(), 'insert_clips', { clips: [{ assetId: 'cam', role: 'primary', source: [30, 45] }], atFrame: 0 });
    expect(long).toMatchObject({ ok: false, error: 'repeats_spine_speech' });
  });

  it('refuses the same graphic placed again where it already shows', () => {
    const withLook = setLook(talk()).document!;
    const item = { pieceId: 'item-card', props: [{ key: 'title', value: 'Chapter one' }], box: { x: 0.05, y: 0.1, w: 0.4, h: 0.15 }, startFrame: 300, durationFrames: 240 };
    const first = runAgentTimelineTool(withLook, 'place_graphics', { items: [item] });
    expect(first.ok, JSON.stringify(first)).toBe(true);
    const again = runAgentTimelineTool(first.document!, 'place_graphics', { items: [{ ...item, box: { x: 0.04, y: 0.08, w: 0.4, h: 0.1 } }] });
    expect(again).toMatchObject({ ok: false, error: 'graphic_already_placed' });
    expect(JSON.stringify(again.data)).toContain('set_clip_properties');
    // A different title at the same time, or the same title later, is another graphic.
    expect(runAgentTimelineTool(first.document!, 'place_graphics', { items: [{ ...item, props: [{ key: 'title', value: 'Another' }] }] }).ok).toBe(true);
    expect(runAgentTimelineTool(first.document!, 'place_graphics', { items: [{ ...item, startFrame: 900 }] }).ok).toBe(true);
  });
});

describe('authored function syntax feedback', () => {
  it('rejects incomplete code at submission and preserves the prior look', () => {
    const current=setLook(withSpeech()).document!;
    const failed=setLook(current,[{id:'broken',source:'function(props){return {html:"x",animate(tl){tl.to({},{});}}'}]);
    expect(failed.ok).toBe(false);expect(JSON.stringify(failed)).toContain('JavaScript syntax error');
    expect(current.appearance.look!.pieces['item-card'].source).toBe(card);
  });
  it('allows repairing a legacy malformed look without executing its source', () => {
    const current=setLook(withSpeech()).document!;
    current.appearance.look!.pieces['item-card'].source='function(){';
    const fixed=setLook(current);expect(fixed.ok,JSON.stringify(fixed)).toBe(true);
    expect(fixed.document!.appearance.look!.pieces['item-card'].source).toBe(card);
    const invoked=setLook(current,[{id:'side-effect',source:'(function(){throw Error("must never run")})()'}]);
    expect(invoked.ok).toBe(false);expect(JSON.stringify(invoked)).toContain('one function expression');
  });
});
