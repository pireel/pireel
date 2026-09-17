import { describe, expect, it } from 'vitest';
import { applyDocumentTransaction } from '../document-transaction';
import { emptyEditorDocumentV2 } from './create';
import { carryCaptionEdits } from './caption-transcript-sync';
import type { AsrSegment } from '../build-blocks';

const spoken: AsrSegment[] = [
  { start: 0, end: 2, text: '大家好', words: [{ start: 0, end: 1, text: '大家' }, { start: 1, end: 2, text: '好' }] },
  { start: 2, end: 4, text: '今天讲翻译', words: [{ start: 2, end: 3, text: '今天' }, { start: 3, end: 4, text: '讲翻译' }] },
];
const edited: AsrSegment[] = [
  { ...spoken[0]!, sub: 'Hello everyone', subLang: 'English', cueLayout: { lines: 1 } as never },
  { ...spoken[1]!, cueSubs: { '0:0': 'Today', '1:1': 'about translation' }, subLang: 'English' },
];

describe('caption edits survive a transcript replacement', () => {
  it('keeps translations on sentences whose text is unchanged, never cue edits', () => {
    const carried = carryCaptionEdits(edited, spoken);
    expect(carried[0]).toMatchObject({ sub: 'Hello everyone', subLang: 'English' });
    expect(carried[0]).not.toHaveProperty('cueLayout');
    expect(carried[1]).toMatchObject({ cueSubs: { '0:0': 'Today' }, subLang: 'English' });
    // a re-recognized sentence with different words keeps only what the new copy says
    const changed = carryCaptionEdits(edited, [spoken[0]!, { ...spoken[1]!, text: '今天讲别的' }]);
    expect(changed[1]).not.toHaveProperty('cueSubs');
  });

  it('transcripts.set (the ASR landing op) never strips the document’s caption edits', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.semantics.transcripts = { cam: edited };
    const result = applyDocumentTransaction(document, { id: 'tx1', origin: 'user', ops: [{ op: 'transcripts.set', input: { transcripts: { cam: spoken } } }] }, { projectId: 'p' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.semantics.transcripts.cam![0]).toMatchObject({ sub: 'Hello everyone' });
    expect(result.document.semantics.transcripts.cam![1]).toMatchObject({ cueSubs: { '1:1': 'about translation' } });
  });
});
