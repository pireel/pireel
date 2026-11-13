import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2, type EditorDocumentV2 } from './editor-document';
import { auditTimeline, introducedFindings } from './timeline-audit';

type Track = EditorDocumentV2['timeline']['tracks'][number];
const narrative = (id: string, startFrame: number, durationFrames: number, sourceInSec: number, sourceOutSec: number) => ({ id, kind: 'narrative', assetId: 'talk', startFrame, durationFrames, enabled: true, sourceInSec, sourceOutSec, properties: { treatment: 'full' } });
const media = (id: string, assetId: string, startFrame: number, durationFrames: number, sourceInSec: number) => ({ id, kind: 'media', assetId, startFrame, durationFrames, enabled: true, sourceInSec, sourceOutSec: sourceInSec + durationFrames / 30 });
const graphic = (id: string, startFrame: number, durationFrames: number, title: string, templateId = 'look:chapter-label') => ({ id, kind: 'graphic', startFrame, durationFrames, enabled: true, anchor: { type: 'timeline' }, block: { templateId, slots: { props: { title } } } });
const lane = (id: string, type: Track['type'], clips: unknown[], extra: Partial<Track> = {}) => ({ id, type, muted: false, hidden: false, locked: false, syncLocked: true, stackOrder: 1, clips, ...extra }) as Track;

/** A clean edit: one recording with a filler cut out, a stock cutaway, two different titles. */
function clean(): EditorDocumentV2 {
  const document = emptyEditorDocumentV2({ fps: 30 });
  // The recording speaks a word every second.
  document.semantics.transcripts.talk = Array.from({ length: 50 }, (_, at) => ({ start: at, end: at + 1, text: `w${at}`, words: [{ text: `w${at}`, start: at + 0.1, end: at + 0.9 }] })) as never;
  document.timeline.tracks[0]!.clips = [narrative('a', 0, 300, 0, 10), narrative('b', 300, 600, 10.5, 30.5)] as never;
  document.timeline.tracks.push(
    lane('broll', 'visual', [media('stock', 'factory', 90, 90, 4)], { role: 'broll' }),
    lane('graphics', 'graphics', [graphic('t1', 0, 240, 'One'), graphic('t2', 300, 240, 'Two')]),
  );
  return document;
}
const spine = (document: EditorDocumentV2) => document.timeline.tracks[0]!;
const codes = (document: EditorDocumentV2) => auditTimeline(document).map((finding) => finding.code);

describe('auditTimeline', () => {
  it('finds nothing in a clean edit', () => {
    expect(auditTimeline(clean())).toEqual([]);
  });

  it('names speech that plays twice on the story spine, and a sliver between cuts', () => {
    const document = clean();
    // What an overwrite of the recording onto the spine left in a real edit: a copy of a later
    // passage, a third of a second of the original, then the original from before the copy's end.
    spine(document).clips = [narrative('a', 0, 226, 0, 7.53), narrative('copy', 226, 250, 11.9, 20.23), narrative('sliver', 476, 10, 15.87, 16.2), narrative('rest', 486, 900, 19.4, 49.4)] as never;
    const findings = auditTimeline(document);
    expect(findings.filter((finding) => finding.code === 'spine-repeat').map((finding) => finding.clipIds)).toEqual([['copy', 'sliver'], ['copy', 'rest']]);
    expect(findings.find((finding) => finding.code === 'spine-repeat')!.message).toBe('"w15w16" (source 15.9–16.2 s) is spoken at 0:07.5 and again at 0:15.9');
    expect(findings.filter((finding) => finding.code === 'spine-fragment').map((finding) => finding.clipIds)).toEqual([['sliver']]);
    expect(findings.every((finding) => finding.code !== 'spine-repeat' || finding.severity === 'error')).toBe(true);
  });

  it('lets footage without words be shown again', () => {
    const document = clean();
    document.semantics.transcripts.talk = [] as never;
    spine(document).clips = [narrative('a', 0, 300, 0, 10), narrative('again', 300, 150, 2, 7)] as never;
    expect(codes(document)).toEqual([]);
  });

  it('does not call two clips that meet at a cut a repeat', () => {
    const document = clean();
    spine(document).clips = [narrative('a', 0, 300, 0, 10.1), narrative('b', 300, 600, 10, 30)] as never;
    expect(codes(document)).toEqual([]);
  });

  it('tells the recording laid over itself from a cutaway to another moment of it', () => {
    const document = clean();
    const broll = document.timeline.tracks.find((track) => track.id === 'broll')!;
    broll.clips = [media('same', 'talk', 60, 90, 2), media('other', 'talk', 400, 90, 25)] as never;
    const findings = auditTimeline(document);
    expect(findings.map((finding) => [finding.code, finding.severity, finding.clipIds])).toEqual([
      ['self-overlay', 'error', ['same', 'a']],
      ['same-recording-cutaway', 'warning', ['other', 'b']],
    ]);
    broll.hidden = true;
    expect(codes(document)).toEqual([]);
  });

  it('names the same graphic on screen twice, not two different ones that overlap', () => {
    const document = clean();
    document.timeline.tracks.push(lane('graphics-2', 'graphics', [graphic('t1-again', 0, 240, 'One'), graphic('other', 300, 240, 'Something else')]));
    expect(auditTimeline(document).map((finding) => [finding.code, finding.clipIds])).toEqual([['graphic-duplicate', ['t1', 't1-again']]]);
  });

  it('names footage used again within a minute, captions that overlap, and graphics the look does not style', () => {
    const document = clean();
    document.timeline.tracks.find((track) => track.id === 'broll')!.clips = [media('first', 'factory', 90, 90, 4), media('again', 'factory', 600, 90, 5), media('later', 'factory', 9000, 90, 4)] as never;
    document.timeline.tracks.push(lane('captions', 'caption', [
      { id: 'c1', kind: 'caption', startFrame: 0, durationFrames: 22, enabled: true, managed: true, anchor: { type: 'timeline' }, block: { templateId: 'caption', slots: {} } },
      { id: 'c2', kind: 'caption', startFrame: 21, durationFrames: 30, enabled: true, managed: true, anchor: { type: 'timeline' }, block: { templateId: 'caption', slots: {} } },
    ]));
    document.semantics.managedCaptionTrackId = 'captions';
    document.appearance.look = { id: 'look-1', css: '.lk{color:#fff}', pieces: { 'chapter-label': { label: 'Chapter', source: 'function (props) { return { html: `<div class="lk ch"><span class="mk"></span><span class="tt">${props.title}</span></div>` }; }' } } } as never;
    expect(auditTimeline(document).map((finding) => [finding.code, finding.severity, finding.clipIds])).toEqual([
      ['caption-overlap', 'warning', ['c1']],
      ['look-unstyled', 'error', ['t1', 't2']],
      ['broll-reuse', 'warning', ['first', 'again']],
    ]);
  });

  it('reports only what an edit introduced', () => {
    const before = clean();
    spine(before).clips = [narrative('a', 0, 300, 0, 10), narrative('old-repeat', 300, 150, 5, 10), narrative('b', 450, 600, 10.5, 30.5)] as never;
    const after = structuredClone(before);
    after.timeline.tracks.find((track) => track.id === 'broll')!.clips = [media('same', 'talk', 60, 90, 2)] as never;
    expect(introducedFindings(before, after).map((finding) => finding.code)).toEqual(['self-overlay']);
    expect(introducedFindings(before, after, ['spine-repeat'])).toEqual([]);
  });
});
