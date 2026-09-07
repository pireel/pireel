import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2 } from './create';
import { listDocumentAddressedWords, resolveDocumentWordIds, resolveWordQueryAsset, transcriptWordTiming } from './transcript-address';
import type { EditorDocumentV2 } from './types';

/** A narrated montage: muted B-roll on the primary lane, a script-backed narration mp3 on the audio lane. */
function narratedMontage(): EditorDocumentV2 {
  const document = emptyEditorDocumentV2({ fps: 30 });
  document.assets.broll = { id: 'broll', kind: 'video', locator: { localSig: 'b-sig' }, metadata: { durationSec: 20 } };
  document.assets.voice = { id: 'voice', kind: 'audio', locator: { remoteUrl: 'https://cdn.example/voice.mp3' }, metadata: { durationSec: 12, hasAudio: true } };
  document.timeline.tracks[0]!.clips = [{
    id: 'shot1', kind: 'narrative', assetId: 'broll', startFrame: 0, durationFrames: 300,
    sourceInSec: 0, sourceOutSec: 10, properties: { treatment: 'full', audioMuted: true }, enabled: true,
  }];
  document.timeline.tracks.push({
    id: 'track_narration', type: 'audio', role: 'narration', muted: false, hidden: false, locked: false, syncLocked: false, stackOrder: 0,
    clips: [{
      id: 'nar1', kind: 'audio', assetId: 'voice', startFrame: 0, durationFrames: 180,
      sourceInSec: 0, sourceOutSec: 6, properties: {}, anchor: { type: 'timeline' }, enabled: true,
    }],
  });
  document.semantics.transcripts.broll = [{ start: 1, end: 2, text: 'street noise', words: [{ text: 'street', start: 1, end: 1.5 }, { text: 'noise', start: 1.5, end: 2 }] }];
  // Script-backed narration: sentence timing only, no measured words.
  document.semantics.transcripts.voice = [
    { start: 0, end: 4, text: '最近去看了奥德赛' },
    { start: 4, end: 12, text: '突然觉得自己也进入了奥德赛时期' },
  ];
  return document;
}

describe('transcript word addressing on any lane', () => {
  it('defaults to the primary footage', () => {
    const listed = listDocumentAddressedWords(narratedMontage());
    expect('error' in listed).toBe(false);
    if ('error' in listed) return;
    expect(listed.assetId).toBe('broll');
    expect(listed.wordTiming).toBe('measured');
  });

  it('addresses the audio-lane narration by assetId or trackId and reports estimated timing', () => {
    const document = narratedMontage();
    expect(resolveWordQueryAsset(document, { trackId: 'track_narration' })).toEqual({ assetId: 'voice' });
    const listed = listDocumentAddressedWords(document, { assetId: 'voice' });
    expect('error' in listed).toBe(false);
    if ('error' in listed) return;
    expect(listed.assetId).toBe('voice');
    expect(listed.wordTiming).toBe('estimated');
    // Only the placed part of the narration survives (the clip plays source 0–6 s).
    expect(listed.words.every((word) => word.start < 6)).toBe(true);
    expect(listed.words.map((word) => word.text).join('')).toContain('奥德赛');
    // The ids resolve back to the narration asset, so mask_words can address them.
    const resolved = resolveDocumentWordIds(document, listed.words.slice(0, 2).map((word) => word.id));
    expect(resolved.missing).toEqual([]);
    expect(resolved.words.map((word) => word.assetId)).toEqual(['voice', 'voice']);
  });

  it('addresses a placed clip on any lane through shotId', () => {
    const listed = listDocumentAddressedWords(narratedMontage(), { shotId: 'nar1' });
    expect('error' in listed).toBe(false);
    if ('error' in listed) return;
    expect(listed.assetId).toBe('voice');
  });

  it('classifies word timing', () => {
    expect(transcriptWordTiming(undefined)).toBe('none');
    expect(transcriptWordTiming([{ start: 0, end: 1, text: 'a' }])).toBe('estimated');
    expect(transcriptWordTiming([{ start: 0, end: 1, text: 'a', words: [{ text: 'a', start: 0, end: 1 }] }])).toBe('measured');
  });
});
