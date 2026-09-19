import { expect, it } from 'vitest';
import { buildCaptionBaseDocument } from './caption-task';
import { contentSource, validateContentPlan, frameContentPlan, constrainPlannedBroll, type ContentSource } from './editing-plan';
import { applyEditorialFraming } from './editing-framing';
import { applyDocumentTransaction } from './document-transaction';
import { moveEditorClip } from './editor-document/commands/clip-move';
import { removeEditorClips } from './editor-document/commands/remove';
const doc = () => buildCaptionBaseDocument({ projectId: 'p', sourceSig: 'source', sourceUrl: '', width: 1080, height: 1920, durationSec: 20, transcript: [], options: { presetId: 'clean', aspect: 'original', shortenPauses: false } });
const source: ContentSource = { sourceKey: 'test', durationSec: 20, settings: { enabled: ['motion-graphics', 'broll'], maxGraphics: 2, instruction: '' }, beats: [{ id: 'a', start: 1, end: 6, text: 'Compare the two approaches' }, { id: 'b', start: 8, end: 12, text: 'Here is the actual product' }, { id: 'c', start: 14, end: 18, text: 'Remember the caveat' }], candidates: [{ id: 'asset', description: 'product' }] };
const proposal = () => ({ sourceKey: 'test', beats: source.beats.map((beat, index) => ({ id: beat.id, purpose: index === 0 ? 'compare' : index === 1 ? 'example' : 'summary', visual: index === 0 ? 'graphic' : index === 1 ? 'broll' : 'speaker', description: 'Show the point', reason: 'Matches speech' })) });
const plan = () => validateContentPlan(source, proposal());
it('anchors decisions to supplied time, rejects missing/foreign ids and disabled effects', () => {
  expect(plan().beats[0]).toMatchObject({ start: 1, end: 6, text: source.beats[0].text });
  const foreign = proposal(); foreign.beats[0].id = 'invented'; expect(() => validateContentPlan(source, foreign)).toThrow();
  const missing = proposal(); missing.beats.pop(); expect(() => validateContentPlan(source, missing)).toThrow();
  expect(() => validateContentPlan({ ...source, candidates: [] }, proposal())).toThrow('不可用');
  expect(() => validateContentPlan({ ...source, settings: { ...source.settings, enabled: [] } }, proposal())).toThrow('已开启');
});
it.each([{ width: 1080, height: 1920 }, { width: 1920, height: 1080 }, { width: 1080, height: 1080 }])('keeps payload, full-source seat and captions separate on %j', canvas => {
  const framed = frameContentPlan(plan(), canvas, true, { x: .04, y: .77, w: .92, h: .15 });
  const beat = framed.beats[0]; const p = beat.payload!; const s = beat.speaker!;
  expect(p.x + p.w).toBeLessThanOrEqual(1); expect(s.x + s.w).toBeLessThanOrEqual(1);
  expect(p.y + p.h).toBeLessThan(beat.captions.y); expect(s.y + s.h).toBeLessThan(beat.captions.y);
  expect(p.x + p.w <= s.x || p.y + p.h <= s.y).toBe(true);
  expect(framed.beats[1].speaker).toBeNull(); expect(framed.beats[2].payload).toBeNull();
});
it('clips footage to its planned window and never places it over a graphic beat', () => {
  const framed = frameContentPlan(plan(), doc().canvas, true, { x: 0, y: .8, w: 1, h: .1 });
  expect(constrainPlannedBroll([{ start: 1, duration: 3 }, { start: 8, duration: 10 }], framed)).toEqual([{ start: 8, duration: 4 }]);
});
it('groups long input without dropping any speech and uses the edited clock', () => {
  const raw = Array.from({ length: 100 }, (_, i) => ({ text: 'word' + i, start: i * .1, end: (i + 1) * .1 }));
  const value = contentSource(doc(), raw, source.settings);
  expect(value.beats.length).toBeLessThanOrEqual(40);
  expect(value.beats.map(beat => beat.text).join(' ')).toBe(raw.map(segment => segment.text).join(' '));
  const cut = applyDocumentTransaction(doc(), { ops: [{ op: 'narration.removeRanges', input: { ranges: [{ fromSec: 0, toSec: 2 }], mainTranscript: raw, clipTranscripts: {} } }] }, { projectId: 'p' });
  if (!cut.ok) throw new Error(cut.error.message);
  expect(contentSource(cut.document, [{ text: 'later', start: 4, end: 6 }], source.settings).beats[0].start).toBe(2);
});
it('links the figure, ground and silent source seat so moving/deleting the visual keeps ownership', () => {
  let document = doc();
  const insert = applyDocumentTransaction(document, { ops: [{ op: 'overlay.insert', input: { block: { id: 'workflow-graphic-a', templateId: 'custom', slots: { innerHtml: '<div>Compare</div>', timelineBody: '' }, startSec: 1, durationSec: 5, trackIndex: 4 } } }] }, { projectId: 'p' });
  if (!insert.ok) throw new Error(insert.error.message); document = insert.document;
  const framed = applyEditorialFraming(document, frameContentPlan(plan(), document.canvas, true, { x: 0, y: .8, w: 1, h: .1 }));
  const group = framed.timeline.tracks.flatMap(track => track.clips).filter(clip => clip.linkGroupId === 'editorial-a'); expect(group).toHaveLength(3);
  const seat = group.find(clip => clip.kind === 'media'); expect(seat).toMatchObject({ fit: 'contain', sourceInSec: 1, sourceOutSec: 6, video: { audioMuted: true } });
  const trackId = framed.timeline.tracks.find(track => track.clips.some(clip => clip.id === 'workflow-graphic-a'))!.id;
  const moved = moveEditorClip(framed, { trackId, clipId: 'workflow-graphic-a', startFrame: 60 });
  expect(moved.ok).toBe(true); if (!moved.ok) return;
  expect(moved.document.timeline.tracks.flatMap(track => track.clips).filter(clip => clip.linkGroupId === 'editorial-a').every(clip => clip.startFrame === 60)).toBe(true);
  const removed = removeEditorClips(framed, { trackId, clipIds: ['workflow-graphic-a'] }); expect(removed.ok).toBe(true); if (!removed.ok) return;
  expect(removed.document.timeline.tracks.flatMap(track => track.clips).some(clip => clip.linkGroupId === 'editorial-a')).toBe(false);
  expect(removed.document.timeline.tracks.find(track => track.id === document.semantics.primaryNarrativeTrackId)?.clips).toEqual(document.timeline.tracks.find(track => track.id === document.semantics.primaryNarrativeTrackId)?.clips);
});
