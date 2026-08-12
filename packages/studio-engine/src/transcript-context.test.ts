import { describe, expect, it } from 'vitest';
import { transcriptContextAt } from './transcript-context';

describe('transcriptContextAt', () => {
  it('maps an edited moment through cuts instead of returning the transcript prefix', () => {
    const transcript = Array.from({ length: 80 }, (_, index) => ({
      start: index * 10,
      end: index * 10 + 8,
      text: index === 0 ? 'INTRO ONLY' : index === 60 ? 'LATE TARGET PHRASE' : `segment-${index}`,
    }));
    const script = transcriptContextAt({
      shots: [
        { id: 'intro', srcStart: 0, srcEnd: 10, treatment: 'full' },
        { id: 'late', srcStart: 590, srcEnd: 620, treatment: 'full' },
      ],
      mainTranscript: transcript,
      atSec: 20,
      maxChars: 120,
    });
    expect(script).toContain('LATE TARGET PHRASE');
    expect(script).not.toContain('INTRO ONLY');
  });

  it('uses the inserted clip transcript at that timeline moment', () => {
    expect(transcriptContextAt({
      shots: [
        { id: 'main', srcStart: 0, srcEnd: 5, treatment: 'full' },
        { id: 'insert', srcStart: 20, srcEnd: 30, src: 'https://media.example/broll.mp4', treatment: 'full' },
      ],
      mainTranscript: [{ start: 0, end: 5, text: 'main narration' }],
      clipTranscripts: { 'https://media.example/broll.mp4': [{ start: 20, end: 30, text: 'inserted source topic' }] },
      atSec: 8,
    })).toBe('inserted source topic');
  });
});
