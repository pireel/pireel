import { describe, expect, it } from 'vitest';
import { emptyComposition } from '@pireel/studio-engine/composition-core';
import { compositionToEditorDocument } from '@pireel/studio-engine/project-document';
import { diffOps } from '@pireel/studio-engine/project-dto';
import { canonicalJson, hashSection } from '@pireel/studio-engine/stable-json';
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
} from '@pireel/studio-engine/document-transaction';

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

  it('replaces a placed sound in one step on its own lane, where the old one stood', () => {
    const placed = applyDocumentTransaction(emptyDocument(), { ops: [
      { op: 'command', input: { command: { type: 'track.insert', track: { id: 'track_sfx', type: 'audio', role: 'sfx', name: 'SFX', syncLocked: true, stackOrder: 0 } } } },
      { op: 'audio.add', input: { clip: { id: 'pop', src: 'https://cdn.test/pop.wav', durationSec: 1, startSec: 2 }, toTrackId: 'track_sfx' } },
    ] }, ctx);
    expect(placed.ok, JSON.stringify(!placed.ok && placed.error)).toBe(true);
    if (!placed.ok) return;
    const tracks = placed.document.timeline.tracks.length;
    const replaced = applyDocumentTransaction(placed.document, { ops: [
      { op: 'audio.replace', input: { clipId: 'pop', clip: { id: 'ding', src: 'https://cdn.test/ding.wav', durationSec: 0.8, volumeDb: -6 } } },
    ] }, ctx);
    expect(replaced.ok, JSON.stringify(!replaced.ok && replaced.error)).toBe(true);
    if (!replaced.ok) return;
    const lane = replaced.document.timeline.tracks.find((track) => track.id === 'track_sfx')!;
    expect(lane.clips.map((clip) => [clip.id, clip.startFrame, clip.durationFrames])).toEqual([['ding', 60, 24]]);
    expect(replaced.document.timeline.tracks).toHaveLength(tracks);
    // A longer sound stops where the next clip on the lane begins.
    const crowded = applyDocumentTransaction(placed.document, { ops: [
      { op: 'audio.add', input: { clip: { id: 'next', src: 'https://cdn.test/next.wav', durationSec: 1, startSec: 3.5 }, toTrackId: 'track_sfx' } },
      { op: 'audio.replace', input: { clipId: 'pop', clip: { id: 'long', src: 'https://cdn.test/long.wav', durationSec: 3 } } },
    ] }, ctx);
    expect(crowded.ok).toBe(true);
    if (!crowded.ok) return;
    const long = crowded.document.timeline.tracks.find((track) => track.id === 'track_sfx')!.clips.find((clip) => clip.id === 'long')!;
    expect([long.startFrame, long.durationFrames]).toEqual([60, 45]);
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
    // A stored copy with reordered keys (jsonb) is the same transcript.
    const reordered = { ...folded.document, semantics: { ...folded.document.semantics, transcripts: Object.fromEntries(
      Object.entries(folded.document.semantics.transcripts).map(([id, segs]) => [id, segs.map((s) => ({ text: s.text, end: s.end, start: s.start }))]),
    ) } };
    expect(transcriptInputsFor(reordered, main, {})).toEqual({});
  });

  it('sends only the clip transcripts that change the document, never the whole library map', () => {
    const seeded = applyDocumentTransaction(emptyDocument(), { ops: [narration] }, ctx);
    if (!seeded.ok) throw new Error('seed failed');
    const main = [{ start: 0, end: 2, text: 'hello there' }];
    const folded = applyDocumentOp(seeded.document, { op: 'document.foldMetadata', input: { mainTranscript: main } }, ctx);
    if (!folded.ok) throw new Error('fold failed');
    const assetId = Object.keys(folded.document.semantics.transcripts)[0]!;
    const library = { 'https://cdn.test/unplaced.mp4': [{ start: 0, end: 1, text: 'library only' }] };
    // Nothing on the timeline uses the library clip; the main transcript is already folded.
    expect(transcriptInputsFor(folded.document, main, library)).toEqual({});
    // A runtime copy of the main source is owned by the main transcript: still nothing.
    expect(transcriptInputsFor(folded.document, main, { ...library, [assetId]: [{ start: 0, end: 2, text: 'edited' }] })).toEqual({});
    // Without a main transcript, the changed copy travels alone.
    expect(transcriptInputsFor(folded.document, null, { ...library, [assetId]: [{ start: 0, end: 2, text: 'edited' }] }))
      .toEqual({ clipTranscripts: { [assetId]: [{ start: 0, end: 2, text: 'edited' }] } });
  });

  it('applies a restore patch only on the document it was made against', () => {
    const seeded = applyDocumentTransaction(emptyDocument(), { ops: [narration] }, ctx);
    if (!seeded.ok) throw new Error('seed failed');
    const before = seeded.document;
    const after = applyDocumentOp(before, { op: 'command', input: { command: { type: 'canvas.patch', patch: { width: 720, height: 1280 } } } }, ctx);
    if (!after.ok) throw new Error('edit failed');
    const patch = diffOps(JSON.parse(canonicalJson(before)), JSON.parse(canonicalJson(after.document)));
    const op = { op: 'document.patch' as const, input: { baseHash: hashSection(canonicalJson(before)), patch } };
    // The server holds a JSON round-tripped copy (key order, no undefined): the hash still matches.
    const onServer = applyDocumentOp(overWire(before), overWire(op), ctx);
    expect(onServer.ok).toBe(true);
    expect(canonicalJson(onServer.document)).toBe(canonicalJson(after.document));
    // Anywhere else it refuses instead of guessing.
    const elsewhere = applyDocumentOp(after.document, op, ctx);
    expect(elsewhere.ok).toBe(false);
    if (!elsewhere.ok) expect(elsewhere.error.code).toBe('stale-base');
    expect(sanitizeDocumentTransactions([{ id: 'tx_patch_000000001', origin: 'restore', ops: [op] }])).not.toBeNull();
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

describe('ids minted inside a transaction', () => {
  const addText: DocumentOp<'agent.timeline'> = {
    op: 'agent.timeline',
    input: { tool: 'set_texts', input: { items: [{ text: 'Hello', startFrame: 30, durationFrames: 60 }, { text: 'World', startFrame: 120, durationFrames: 60 }] } },
  };
  const textIds = (document: ReturnType<typeof emptyDocument>) =>
    document.timeline.tracks.flatMap((track) => track.clips.filter((clip) => clip.kind === 'graphic').map((clip) => clip.id));

  it('come out identical wherever the same transaction is replayed', () => {
    const transaction: DocumentTransaction = { id: 'tx_same_seed_0001', origin: 'agent', ops: [addText] };
    const here = applyDocumentTransaction(emptyDocument(), transaction, ctx);
    const there = applyDocumentTransaction(emptyDocument(), overWire(transaction), ctx);
    expect(here.ok && there.ok).toBe(true);
    if (!here.ok || !there.ok) return;
    expect(textIds(here.document)).toHaveLength(2);
    expect(textIds(there.document)).toEqual(textIds(here.document));
  });

  it('differ between transactions and still mint without a transaction id', () => {
    const first = applyDocumentTransaction(emptyDocument(), { id: 'tx_seed_a', origin: 'agent', ops: [addText] }, ctx);
    const second = applyDocumentTransaction(emptyDocument(), { id: 'tx_seed_b', origin: 'agent', ops: [addText] }, ctx);
    const loose = applyDocumentTransaction(emptyDocument(), { ops: [addText] }, ctx);
    expect(first.ok && second.ok && loose.ok).toBe(true);
    if (!first.ok || !second.ok || !loose.ok) return;
    expect(textIds(first.document)).not.toEqual(textIds(second.document));
    expect(textIds(loose.document)).toHaveLength(2);
    expect(new Set(textIds(loose.document)).size).toBe(2);
  });
});

describe('clip-level picture-in-picture layouts', () => {
  const withBroll = () => {
    const added = applyDocumentTransaction(emptyDocument(), { ops: [narration] }, ctx);
    if (!added.ok) throw new Error(added.error.message);
    const document = structuredClone(added.document);
    document.assets.footage = { id: 'footage', kind: 'video', label: 'Footage', locator: { remoteUrl: 'https://cdn.test/footage.mp4' }, metadata: { width: 1920, height: 1080, durationSec: 10 } } as never;
    document.timeline.tracks.push({ id: 'track_broll', type: 'visual', role: 'broll', name: 'B-roll', muted: true, hidden: false, locked: false, syncLocked: true, stackOrder: 1, clips: [
      { id: 'shot', kind: 'media', assetId: 'footage', enabled: true, startFrame: 60, durationFrames: 60, sourceInSec: 0, sourceOutSec: 2, fit: 'contain' },
    ] });
    return document;
  };
  const lanes = (document: ReturnType<typeof withBroll>) => document.timeline.tracks.filter((track) => track.role === 'pipLayer');
  const spine = (document: ReturnType<typeof withBroll>) => document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId)!;

  it('derives the speaker seat from the words under the picture, and keeps deriving it after a move', () => {
    const laid = applyDocumentTransaction(withBroll(), { ops: [{ op: 'media.pipLayout', input: { clipId: 'shot', layout: { layout: 'presenter', position: 'top-left' } } }] }, ctx);
    expect(laid.ok, JSON.stringify(!laid.ok && laid.error)).toBe(true);
    if (!laid.ok) return;
    const speaker = lanes(laid.document).find((track) => track.type === 'visual');
    expect(speaker).toMatchObject({ type: 'visual', syncLocked: false, locked: false });
    expect(speaker!.stackOrder).toBeGreaterThan(1);
    const narrationAsset = (spine(laid.document).clips[0] as { assetId: string }).assetId;
    expect(speaker!.clips).toEqual([expect.objectContaining({ assetId: narrationAsset, startFrame: 60, durationFrames: 60, sourceInSec: 2, sourceOutSec: 4 })]);
    const shot = laid.document.timeline.tracks.find((track) => track.id === 'track_broll')!.clips[0]!;
    expect(shot).toMatchObject({ box: { x: 0, y: 0, w: 1, h: 1 }, pipLayout: { layout: 'presenter' } });
    const moved = applyDocumentTransaction(laid.document, { ops: [{ op: 'command', input: { command: { type: 'clip.move', trackId: 'track_broll', clipId: 'shot', startFrame: 90 } } }] }, ctx);
    expect(moved.ok, JSON.stringify(!moved.ok && moved.error)).toBe(true);
    if (!moved.ok) return;
    expect(lanes(moved.document).find((track) => track.type === 'visual')!.clips).toEqual([expect.objectContaining({ startFrame: 90, sourceInSec: 3, sourceOutSec: 5 })]);
  });

  it('puts a split backdrop between the main video and the picture, and lets go when the picture is placed by hand', () => {
    const laid = applyDocumentTransaction(withBroll(), { ops: [{ op: 'media.pipLayout', input: { clipId: 'shot', layout: { layout: 'split' } } }] }, ctx);
    expect(laid.ok).toBe(true);
    if (!laid.ok) return;
    const backdrop = lanes(laid.document).find((track) => track.type === 'graphics')!;
    expect(backdrop.stackOrder).toBeGreaterThan(0);
    expect(backdrop.stackOrder).toBeLessThan(1);
    expect(laid.document.timeline.tracks.indexOf(backdrop)).toBeLessThan(laid.document.timeline.tracks.findIndex((track) => track.id === 'track_broll'));
    const placed = applyDocumentTransaction(laid.document, { ops: [{ op: 'command', input: { command: { type: 'clip.patch', trackId: 'track_broll', clipId: 'shot', patch: { box: { x: .1, y: .1, w: .5, h: .5 } } } } }] }, ctx);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(lanes(placed.document)).toEqual([]);
    expect(placed.document.timeline.tracks.find((track) => track.id === 'track_broll')!.clips[0]).not.toHaveProperty('pipLayout');
  });

  it('gives the agent the same layouts through set_clip_framing, and reports them in get_state', async () => {
    const { renderV3State } = await import('@pireel/studio-engine/agent-surface-v3/state');
    const { validateV3Input } = await import('@pireel/studio-engine/agent-surface-v3/validate');
    const input = { items: [{ clipId: 'shot', pip: { layout: 'split-bottom' } }] };
    expect(validateV3Input('set_clip_framing', input)).toBeNull();
    const laid = applyDocumentTransaction(withBroll(), { ops: [{ op: 'agent.timeline', input: { tool: 'set_clip_framing', input } }] }, ctx);
    expect(laid.ok, JSON.stringify(!laid.ok && laid.error)).toBe(true);
    if (!laid.ok) return;
    const state = renderV3State(laid.document);
    expect(state.tracks.find((track) => track.id === 'track_broll')!.clips![0]).toMatchObject({ pip: { layout: 'split-bottom' }, box: { x: .5, y: 0, w: .5, h: 1 } });
    expect(state.tracks.filter((track) => track.role === 'pipLayer').map((track) => track.derivedFrom)).toEqual([['shot'], ['shot']]);
    const conflicting = applyDocumentTransaction(withBroll(), { ops: [{ op: 'agent.timeline', input: { tool: 'set_clip_framing', input: { items: [{ clipId: 'shot', pip: { layout: 'inset' }, box: { x: 0, y: 0, w: .5, h: .5 } }] } } }] }, ctx);
    expect(conflicting.ok).toBe(false);
  });

  it('returns the picture to full frame and refuses the story spine', () => {
    const laid = applyDocumentTransaction(withBroll(), { ops: [{ op: 'media.pipLayout', input: { clipId: 'shot', layout: { layout: 'inset' } } }] }, ctx);
    if (!laid.ok) throw new Error(laid.error.message);
    const cleared = applyDocumentTransaction(laid.document, { ops: [{ op: 'media.pipLayout', input: { clipId: 'shot', layout: null } }] }, ctx);
    if (!cleared.ok) throw new Error(cleared.error.message);
    const shot = cleared.document.timeline.tracks.find((track) => track.id === 'track_broll')!.clips[0]!;
    expect(shot).toMatchObject({ fit: 'cover' });
    expect(shot).not.toHaveProperty('box');
    expect(shot).not.toHaveProperty('keyframes');
    const spineClip = spine(laid.document).clips[0]!.id;
    expect(applyDocumentTransaction(laid.document, { ops: [{ op: 'media.pipLayout', input: { clipId: spineClip, layout: { layout: 'inset' } } }] }, ctx)).toMatchObject({ ok: false, error: { code: 'invalid-command' } });
  });
});
