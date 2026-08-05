import { describe, expect, it } from 'vitest';
import type { AsrSegment } from './build-blocks';
import { applyEditorDocumentPersistenceMetadata, compositionToEditorDocument, type Composition, type VideoShot } from './composition';
import { mediaSearchTranscriptsFromDocument, type MediaSearchProject, searchProjectMedia } from './media-search';
import type { VisualTimeline } from './visual-types';

const main: AsrSegment[] = [
  { start: 0, end: 4, text: '今天讲人工智能视频剪辑。' },
  { start: 4, end: 8, text: 'First collect the customer interviews.' },
  { start: 8, end: 13, text: '然后验证产品是否真正解决问题。' },
];

const visual: VisualTimeline = {
  cuts: [6],
  segments: [
    { start: 0, end: 6, label: { content: 'talkinghead', person: 'center', safe: 'right', hasText: false, desc: 'A presenter at a desk' } },
    { start: 6, end: 13, label: { content: 'screen', person: 'none', safe: 'none', hasText: true, desc: 'Product dashboard and charts' } },
  ],
};

function project(shots?: VideoShot[]): MediaSearchProject {
  const baseShots: VideoShot[] = shots ?? [
    { id: 's1', srcStart: 0, srcEnd: 6, treatment: 'full' },
    { id: 's2', srcStart: 8, srcEnd: 13, treatment: 'full' },
    { id: 'b1', src: 'blob:clip-session', srcSig: 'clip-stable-sig', srcStart: 0, srcEnd: 7, treatment: 'full' },
  ];
  return {
    projectId: 'p1',
    shots: baseShots,
    mainTranscript: main,
    clipTranscripts: {
      'blob:clip-session': [
        { start: 0, end: 3, text: '咖啡机正在萃取浓缩咖啡。' },
        { start: 3, end: 7, text: 'Close-up of the finished drink.' },
      ],
    },
    visualTimeline: visual,
  };
}

describe('project media segment search', () => {
  it('derives main and inserted transcripts from V2 asset ownership instead of legacy context fields', () => {
    const shots: VideoShot[] = [
      { id: 'main-1', srcStart: 0, srcEnd: 8, treatment: 'full' },
      { id: 'insert-1', src: 'https://media.example/insert.mp4', srcStart: 0, srcEnd: 7, treatment: 'full' },
    ];
    const composition: Composition = { width: 1920, height: 1080, theme: 'general', video: null, blocks: [], shots };
    const converted = compositionToEditorDocument({ projectId: 'v2-search', composition }).document;
    const document = applyEditorDocumentPersistenceMetadata({
      projectId: 'v2-search',
      document: converted,
      mainTranscript: main,
      clipTranscripts: { 'https://media.example/insert.mp4': project().clipTranscripts['blob:clip-session']! },
    });

    expect(mediaSearchTranscriptsFromDocument(document, shots)).toEqual({
      mainTranscript: main,
      clipTranscripts: {
        'https://media.example/insert.mp4': project().clipTranscripts['blob:clip-session'],
      },
    });
  });

  it('finds Chinese transcript meaning by local n-grams and returns source + edited clocks', () => {
    const out = searchProjectMedia(project(), { query: '产品验证', scope: 'main' });
    if ('error' in out) throw new Error(out.error);
    expect(out.results[0]).toMatchObject({
      assetId: 'p1:main',
      sourceStartSec: 8,
      sourceEndSec: 13,
      transcript: '然后验证产品是否真正解决问题。',
      editedRanges: [{ shotId: 's2', fromSec: 6, toSec: 11, sourceFromSec: 8, sourceToSec: 13 }],
    });
    expect(out.results[0]!.matchedSignals).toContain('transcript');
  });

  it('uses deterministic visual aliases without sending frames to a cloud model', () => {
    const out = searchProjectMedia(project(), { query: '产品界面图表', scope: 'main' });
    if ('error' in out) throw new Error(out.error);
    expect(out.results[0]!.visual?.join(' ')).toContain('screen');
    expect(out.results[0]!.matchedSignals).toContain('visual');
    expect(out.coverage[0]).toMatchObject({ transcriptSegments: 3, visualSegments: 2 });
  });

  it('narrows to an inserted source by scope or shot and keeps ids stable across timeline edits', () => {
    const scoped = searchProjectMedia(project(), { query: '咖啡', scope: 'inserted' });
    const byShot = searchProjectMedia(project(), { query: '咖啡', shotId: 'b1' });
    if ('error' in scoped || 'error' in byShot) throw new Error('unexpected search error');
    expect(scoped.results[0]!.source).toMatchObject({ kind: 'inserted', shotIds: ['b1'] });
    expect(byShot.results[0]!.segmentId).toBe(scoped.results[0]!.segmentId);

    const edited = project([
      { id: 'new-main', srcStart: 8, srcEnd: 13, treatment: 'punch-in' },
      { id: 'new-clip', src: 'blob:clip-session-2', srcSig: 'clip-stable-sig', srcStart: 0, srcEnd: 7, treatment: 'full' },
    ]);
    edited.clipTranscripts = { 'blob:clip-session-2': project().clipTranscripts['blob:clip-session']! };
    const after = searchProjectMedia(edited, { query: '咖啡', scope: 'inserted' });
    if ('error' in after) throw new Error(after.error);
    expect(after.results[0]!.segmentId).toBe(scoped.results[0]!.segmentId);
    expect(after.results[0]!.source.shotIds).toEqual(['new-clip']);
  });

  it('can blend a future local semantic score without changing the public result contract', () => {
    const initial = searchProjectMedia(project(), { query: 'unrelated phrase' });
    if ('error' in initial) throw new Error(initial.error);
    expect(initial.results).toEqual([]);
    const candidate = searchProjectMedia(project(), { query: 'customer interviews' });
    if ('error' in candidate) throw new Error(candidate.error);
    const boostedId = candidate.results[0]!.segmentId;
    const semantic = searchProjectMedia(project(), { query: 'unrelated phrase' }, { semanticScores: { [boostedId]: 1 } });
    if ('error' in semantic) throw new Error(semantic.error);
    expect(semantic.results[0]).toMatchObject({ segmentId: boostedId });
    expect(semantic.results[0]!.matchedSignals).toContain('semantic');
  });

  it('rejects invalid queries and unknown shot filters explicitly', () => {
    expect(searchProjectMedia(project(), { query: '' })).toEqual({ error: 'query is required' });
    expect(searchProjectMedia(project(), { query: 'x', shotId: 'missing' })).toEqual({ error: 'shot not found' });
    const weak = searchProjectMedia(project(), { query: '咖房', scope: 'inserted' });
    if ('error' in weak) throw new Error(weak.error);
    expect(weak.results).toEqual([]); // one shared character is not a semantic match
  });
});
