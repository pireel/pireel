import { describe, expect, it } from 'vitest';
import { emptyComposition } from './composition-core';
import { compositionToEditorDocument } from './project-document';
import { canonicalJson } from './stable-json';
import {
  applyDocumentOp,
  applyDocumentTransaction,
  decodeOpInput,
  encodeOpInput,
  replayDocumentTransactions,
  sanitizeDocumentTransactions,
  transcriptInputsFor,
  type DocumentOp,
  type DocumentTransaction,
} from './document-transaction';

const ctx = { projectId: 'tx-test' };

function emptyDocument() {
  return compositionToEditorDocument({ projectId: ctx.projectId, composition: emptyComposition() }).document;
}

const card = (id: string, startSec = 1): DocumentOp<'overlay.insert'> => ({
  op: 'overlay.insert',
  input: { block: { id, templateId: 'custom', slots: { innerHtml: `<b>${id}</b>` }, startSec, durationSec: 2, trackIndex: 5 } },
});

const narration: DocumentOp<'narrative.add'> = {
  op: 'narrative.add',
  input: { mode: 'overwrite', atSec: 0, shot: { id: 'primary', src: 'https://cdn.test/primary.mp4', srcStart: 0, srcEnd: 6, treatment: 'full' } },
};

/** Documents that went over the wire are what the server sees: force the round trip. */
const overWire = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('document operations', () => {
  it('runs a helper-level edit from JSON input and reports the helper result fields', () => {
    const inserted = applyDocumentOp(emptyDocument(), overWire(card('proof')), ctx);
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(inserted.clipId).toBe('proof');
    expect(inserted.trackId).toBe('track_graphics_5');
    const clip = inserted.document.timeline.tracks.flatMap((track) => track.clips).find((c) => c.id === 'proof');
    expect(clip).toMatchObject({ kind: 'graphic', startFrame: 30 });
  });

  it('leaves the input document untouched when the operation fails', () => {
    const document = emptyDocument();
    const missing = applyDocumentOp(document, { op: 'overlay.remove', input: { clipIds: ['nope'] } }, ctx);
    expect(missing.ok).toBe(false);
    expect(missing.document).toBe(document);
    if (missing.ok) return;
    expect(missing.error.code).toBe('clip-not-found');
  });

  it('produces the same document on two hosts, including every derived id', () => {
    const base = applyDocumentTransaction(emptyDocument(), { ops: [narration, {
      op: 'audio.add', input: { clip: { id: 'music', src: 'https://cdn.test/m.wav', durationSec: 8 } },
    }] }, ctx);
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const transaction: DocumentTransaction = { id: 'tx_deterministic_00', origin: 'user', ops: [
      { op: 'audio.split', input: { clipId: 'music', atSec: 3 } },
      { op: 'command', input: { command: { type: 'clip.split', trackId: base.document.semantics.primaryNarrativeTrackId!, clipId: 'primary', atFrame: 60 } } },
      card('later', 4),
      { op: 'canvas.resize', input: { width: 1080, height: 1920 } },
    ] };
    const here = applyDocumentTransaction(base.document, transaction, ctx);
    const there = applyDocumentTransaction(overWire(base.document), overWire(transaction), ctx);
    expect(here.ok && there.ok).toBe(true);
    if (!here.ok || !there.ok) return;
    expect(canonicalJson(there.document)).toBe(canonicalJson(here.document));
    // Two lanes gained a derived clip each; the derivations must not depend on the host.
    const ids = here.document.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.id));
    expect(ids.length).toBe(5);
  });
});

describe('document transactions', () => {
  it('applies atomically: a hard failure in the middle returns the input document', () => {
    const document = emptyDocument();
    const result = applyDocumentTransaction(document, { ops: [
      card('a'),
      { op: 'canvas.resize', input: { width: -1, height: 0 } },
      card('b'),
    ] }, ctx);
    expect(result.ok).toBe(false);
    expect(result.document).toBe(document);
    if (result.ok) return;
    expect(result.opIndex).toBe(1);
  });

  it('skips missing targets only in replay mode', () => {
    const seeded = applyDocumentTransaction(emptyDocument(), { ops: [card('keep')] }, ctx);
    if (!seeded.ok) throw new Error('seed failed');
    const ops: DocumentOp[] = [
      { op: 'overlay.patch', input: { updates: [{ clipId: 'gone', startSec: 3 }] } },
      { op: 'overlay.patch', input: { updates: [{ clipId: 'keep', startSec: 3 }] } },
    ];
    const strict = applyDocumentTransaction(seeded.document, { ops }, ctx);
    expect(strict.ok).toBe(false);
    const replayed = applyDocumentTransaction(seeded.document, { ops }, ctx, { skipMissing: true });
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) return;
    expect(replayed.skipped).toBe(1);
    const kept = replayed.document.timeline.tracks.flatMap((t) => t.clips).find((c) => c.id === 'keep')!;
    expect(kept.startFrame).toBe(90);
  });

  it('keeps an edit made elsewhere when a stale writer replays on top of it', () => {
    // The scenario that used to lose data: a tab holds document A, an offline agent adds a text
    // card (B = A + card), the tab then saves an unrelated change made against A. With snapshot
    // saves B was overwritten; with intents the tab's change lands on B and the card survives.
    const a = applyDocumentTransaction(emptyDocument(), { ops: [narration, card('mine')] }, ctx);
    if (!a.ok) throw new Error('seed failed');
    const agent = replayDocumentTransactions(a.document, [
      { id: 'tx_agent_000001', origin: 'agent', ops: [card('offline-text', 3)] },
    ], ctx);
    expect(agent.applied).toEqual(['tx_agent_000001']);

    const staleTab: DocumentTransaction = { id: 'tx_tab_00000001', origin: 'user', ops: [
      { op: 'canvas.resize', input: { width: 1080, height: 1920 } },
      { op: 'overlay.patch', input: { updates: [{ clipId: 'mine', startSec: 2 }] } },
    ] };
    const merged = replayDocumentTransactions(agent.document, [staleTab], ctx, new Set(agent.applied));
    expect(merged.applied).toEqual(['tx_tab_00000001']);
    const clips = merged.document.timeline.tracks.flatMap((t) => t.clips.map((c) => c.id));
    expect(clips).toEqual(expect.arrayContaining(['mine', 'offline-text', 'primary']));
    expect(merged.document.canvas).toMatchObject({ width: 1080, height: 1920 });
    expect(merged.document.timeline.tracks.flatMap((t) => t.clips).find((c) => c.id === 'mine')!.startFrame).toBe(60);
  });

  it('treats a resent transaction as already done and rejects only the transaction that cannot apply', () => {
    const seeded = applyDocumentTransaction(emptyDocument(), { ops: [card('one')] }, ctx);
    if (!seeded.ok) throw new Error('seed failed');
    const first: DocumentTransaction = { id: 'tx_first_00000001', origin: 'user', ops: [card('two', 4)] };
    const bad: DocumentTransaction = { id: 'tx_bad_0000000001', origin: 'user', ops: [{ op: 'canvas.resize', input: { width: 0, height: 0 } }] };
    const third: DocumentTransaction = { id: 'tx_third_00000001', origin: 'user', ops: [{ op: 'overlay.patch', input: { updates: [{ clipId: 'two', durationSec: 1 }] } }] };

    const once = replayDocumentTransactions(seeded.document, [first], ctx);
    const again = replayDocumentTransactions(once.document, [first, bad, third], ctx, new Set(once.applied));
    expect(again.duplicates).toEqual(['tx_first_00000001']);
    expect(again.rejected.map((r) => r.id)).toEqual(['tx_bad_0000000001']);
    expect(again.applied).toEqual(['tx_third_00000001']);
    const two = again.document.timeline.tracks.flatMap((t) => t.clips).filter((c) => c.id === 'two');
    expect(two).toHaveLength(1);
    expect(two[0]!.durationFrames).toBe(30);
  });

  it('validates the wire shape without trusting operation inputs', () => {
    expect(sanitizeDocumentTransactions([{ id: 'tx_ok_0000000001', origin: 'user', ops: [card('x')] }])).toHaveLength(1);
    expect(sanitizeDocumentTransactions([{ id: 'short', origin: 'user', ops: [card('x')] }])).toBeNull();
    expect(sanitizeDocumentTransactions([{ id: 'tx_ok_0000000001', origin: 'elsewhere', ops: [card('x')] }])).toBeNull();
    expect(sanitizeDocumentTransactions([{ id: 'tx_ok_0000000001', origin: 'user', ops: [] }])).toBeNull();
    expect(sanitizeDocumentTransactions([{ id: 'tx_ok_0000000001', origin: 'user', ops: [{ op: 'not.an.op', input: {} }] }])).toBeNull();
    expect(sanitizeDocumentTransactions('nope')).toBeNull();
  });

  it('carries transcripts only when the document does not already hold them', () => {
    const seeded = applyDocumentTransaction(emptyDocument(), { ops: [narration] }, ctx);
    if (!seeded.ok) throw new Error('seed failed');
    const main = [{ start: 0, end: 2, text: 'hello there' }];
    expect(transcriptInputsFor(seeded.document, main, {})).toEqual({ mainTranscript: main });
    const folded = applyDocumentOp(seeded.document, { op: 'document.foldMetadata', input: { mainTranscript: main } }, ctx);
    if (!folded.ok) throw new Error('fold failed');
    expect(transcriptInputsFor(folded.document, main, {})).toEqual({});
  });

  it('keeps a clearing `undefined` alive across JSON so the server clears the same field', () => {
    const seeded = applyDocumentTransaction(emptyDocument(), { ops: [{ op: 'command', input: { command: { type: 'appearance.patch', patch: { palette: { accent: '#f00' } } } } }] }, ctx);
    if (!seeded.ok) throw new Error('seed failed');
    expect(seeded.document.appearance.palette).toBeDefined();
    const clearing: DocumentOp<'command'> = { op: 'command', input: { command: { type: 'appearance.patch', patch: { palette: undefined } } } };
    const encoded = encodeOpInput(clearing);
    expect(JSON.stringify(encoded)).toContain('$undefined');
    expect(decodeOpInput(overWire(encoded))).toEqual(clearing);
    const here = applyDocumentOp(seeded.document, encoded, ctx);
    const there = applyDocumentOp(overWire(seeded.document), overWire(encoded), ctx);
    expect(here.ok && there.ok).toBe(true);
    if (!here.ok || !there.ok) return;
    expect(here.document.appearance.palette).toBeUndefined();
    expect(canonicalJson(there.document)).toBe(canonicalJson(here.document));
  });
});
