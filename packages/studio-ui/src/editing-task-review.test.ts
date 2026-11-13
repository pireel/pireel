import { describe, expect, it } from 'vitest';
import type { EditingRunConfig } from '@pireel/studio-engine/editing-run-config';
import { emptyEditorDocumentV2 } from '@pireel/studio-engine/editor-document';
import type { ChatTask } from './chat-task';
import { composeReviewPending, needsDirectorPlan, reviewEditingTask, taskTakesReview } from './editing-task-review';

const task = (skills: string[], visual: Partial<NonNullable<EditingRunConfig['visual']>> = {}) => ({ skills, config: { skills, visual } as unknown as EditingRunConfig });
const oneClick = { oneClick: true, wholeWhiteboard: false };

describe('director plan', () => {
  it('is drawn up for creative work only', () => {
    expect(needsDirectorPlan(task(['rough-cut', 'captions', 'voice-cleanup', 'cover']), oneClick)).toBe(false);
    for (const skill of ['graphics', 'b-roll', 'sound']) expect(needsDirectorPlan(task(['rough-cut', skill]), oneClick)).toBe(true);
    expect(needsDirectorPlan(task(['rough-cut'], { zoom: true }), oneClick)).toBe(true);
    expect(needsDirectorPlan(task(['rough-cut'], { headlines: true }), oneClick)).toBe(true);
  });

  it('is always drawn up for a whole whiteboard, and never for an ordinary request', () => {
    expect(needsDirectorPlan(task([]), { oneClick: false, wholeWhiteboard: true })).toBe(true);
    expect(needsDirectorPlan(task(['graphics']), { oneClick: false, wholeWhiteboard: false })).toBe(false);
  });
});

describe('a video built from scratch', () => {
  const compose = (skills: string[]): ChatTask => ({ id: 't', goal: 'make it', skills: [], config: { skills, visual: {} } as unknown as EditingRunConfig, mode: 'request', compose: true, state: 'running' });
  const evidence = { graphics: ['g1'], 'b-roll': [], sound: [], zoom: [], transitions: [], emptyMusicTracks: [] };
  const withCaptions = () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    return { ...document, semantics: { ...document.semantics, managedCaptionTrackId: 'caps' }, timeline: { ...document.timeline, tracks: [...document.timeline.tracks, { id: 'caps', name: 'Captions', role: 'managedCaptions', type: 'caption', order: 9, clips: [{ id: 'c1' }] } as never] } };
  };

  it('takes the whole-video review without a rough cut, and checks what it reports', () => {
    expect(taskTakesReview(compose([]))).toBe(true);
    const done = reviewEditingTask(compose([]), { features: [{ feature: 'graphics', status: 'applied', reason: '六处观点花字落在口播重点', atFrame: 60 }] }, evidence, emptyEditorDocumentV2({ fps: 30 }));
    expect(done).toMatchObject({ ok: true, review: { completed: true, items: [{ feature: 'graphics', status: 'applied' }] } });
    const claimed = reviewEditingTask(compose([]), { features: [{ feature: 'sound', status: 'applied', reason: '加了转场音效点', atFrame: 30 }] }, evidence, emptyEditorDocumentV2({ fps: 30 }));
    expect(claimed.ok).toBe(false);
  });

  it('asks for the captions the project switched on', () => {
    const missing = reviewEditingTask(compose(['captions']), { features: [] }, evidence, emptyEditorDocumentV2({ fps: 30 }));
    expect(missing).toMatchObject({ ok: false, error: expect.stringContaining('set_captions') });
    expect(reviewEditingTask(compose(['captions']), { features: [] }, evidence, withCaptions() as never).ok).toBe(true);
  });

  it('is unfinished only once it built something and its review has not passed', () => {
    expect(composeReviewPending(compose([]), false)).toBe(false);
    expect(composeReviewPending(compose([]), true)).toBe(true);
    expect(composeReviewPending({ ...compose([]), review: { completed: true, items: [] } }, true)).toBe(false);
    expect(composeReviewPending({ ...compose([]), compose: undefined }, true)).toBe(false);
  });

  it('notes, once and without refusing, a narration that outlasts the picture', () => {
    const empty = emptyEditorDocumentV2({ fps: 30 });
    const spineId = empty.semantics.primaryNarrativeTrackId!;
    const document = { ...empty, timeline: { ...empty.timeline, tracks: [
      ...empty.timeline.tracks.map(track => track.id === spineId ? { ...track, clips: [{ id: 's1', startFrame: 0, durationFrames: 300 }] } : track),
      { id: 'voice', name: 'Narration', role: 'narration', type: 'audio', order: 1, clips: [{ id: 'n1', startFrame: 0, durationFrames: 390 }] },
    ] } } as never;
    const features = { features: [{ feature: 'graphics', status: 'applied', reason: '六处观点花字落在口播重点', atFrame: 60 }] };
    const first = reviewEditingTask(compose([]), features, evidence, document);
    expect(first.ok).toBe(true);
    expect(first.ok && first.review.notes?.[0]).toContain('ends at 10s but the narration runs to 13s');
    const again = reviewEditingTask({ ...compose([]), reviewNoted: true }, features, evidence, document);
    expect(again.ok && again.review.notes).toBeUndefined();
  });

  it('refuses to finish while speech plays twice, and passes a clean timeline', () => {
    const empty = emptyEditorDocumentV2({ fps: 30 });
    const spineId = empty.semantics.primaryNarrativeTrackId!;
    const clip = (id: string, startFrame: number, durationFrames: number, sourceInSec: number) => ({ id, kind: 'narrative', assetId: 'talk', enabled: true, startFrame, durationFrames, sourceInSec, sourceOutSec: sourceInSec + durationFrames / 30, properties: { treatment: 'full' } });
    const build = (clips: unknown[]) => ({ ...empty,
      semantics: { ...empty.semantics, transcripts: { talk: Array.from({ length: 40 }, (_, at) => ({ start: at, end: at + 1, text: `w${at}`, words: [{ text: `w${at}`, start: at + 0.1, end: at + 0.9 }] })) } },
      timeline: { ...empty.timeline, tracks: empty.timeline.tracks.map(track => track.id === spineId ? { ...track, clips } : track) } }) as never;
    const features = { features: [{ feature: 'graphics', status: 'applied', reason: '六处观点花字落在口播重点', atFrame: 60 }] };
    const broken = reviewEditingTask(compose([]), features, evidence, build([clip('a', 0, 300, 0), clip('again', 300, 150, 4), clip('b', 450, 300, 10)]));
    expect(broken.ok).toBe(false);
    expect(!broken.ok && broken.error).toContain('The timeline has faults a viewer sees');
    expect(!broken.ok && broken.error).toContain('is spoken at 0:00.0 and again at 0:10.0 (clips a, again)');
    expect(reviewEditingTask(compose([]), features, evidence, build([clip('a', 0, 300, 0), clip('b', 300, 300, 10)])).ok).toBe(true);
  });

});
