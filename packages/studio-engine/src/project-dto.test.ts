import { describe, expect, it } from 'vitest';
import { directorPlanFromDocument } from './director-plan-artifact';
import { emptyProjectDocument } from './project-document';
import {
  ackedFromDto,
  applyProjectSave,
  buildSaveWire,
  canonicalJson,
  diffOps,
  isRetiredSaveProtocol,
  mergeSaveIntoRow,
  rowToDto,
  rowToMeta,
  sanitizeProjectContext,
  sanitizeSavePayload,
  type ProjectSavePayload,
} from './project-dto';
import { normalizeCommittedDocument, type DocumentTransaction } from './document-transaction';

const document = () => {
  const value = emptyProjectDocument();
  value.timeline.tracks.push({
    id: 'graphics', type: 'graphics', role: 'graphics', name: 'Graphics', muted: false, hidden: false,
    locked: false, syncLocked: true, stackOrder: 1,
    clips: [{
      id: 'title', kind: 'graphic', startFrame: 0, durationFrames: 60, enabled: true,
      block: { templateId: 'custom', slots: {} }, anchor: { type: 'timeline' },
    }],
  });
  return value;
};

const payload = (over: Partial<ProjectSavePayload> = {}): ProjectSavePayload => ({
  videoSig: 'sig1',
  videoDurationSec: 12.5,
  coverThumb: 'data:image/jpeg;base64,xxx',
  ...over,
});

const existing = (value: unknown = document()) => ({
  title: '我的片子',
  document: value,
  videoSig: 'sig-old',
  videoDurationSec: '30' as string | number | null,
  coverThumb: 'thumb-old',
});

describe('canonical JSON', () => {
  it('is key-order independent and follows JSON undefined semantics', () => {
    expect(canonicalJson({ b: 1, a: [{ y: 2, x: 1 }] })).toBe(canonicalJson({ a: [{ x: 1, y: 2 }], b: 1 }));
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalJson([undefined, 1])).toBe('[null,1]');
  });
});

describe('strict V2 project DTO', () => {
  const row = {
    id: 'project-1', title: 'native', comp: document(), context: {}, videoSig: 'sig1',
    videoDurationSec: '12.5', coverThumb: null, version: 7, updatedAt: new Date(1000),
  };

  it('returns only the native V2 document', () => {
    const dto = rowToDto(row);
    expect(dto.document.version).toBe(2);
    expect(dto).not.toHaveProperty('comp');
    expect(dto.context).toEqual({ schemaVersion: 3 });
  });

  it('reads a V2 row with an inline V1 Director Plan and canonicalizes only that artifact', () => {
    const comp = document();
    const timeline = comp.timeline;
    (comp.semantics as typeof comp.semantics & { directorPlan?: unknown }).directorPlan = {
      version: 1,
      goal: 'Teach one durable idea.',
      creativeThesis: 'Evidence first, explanation second.',
      scenes: [{
        id: 'proof', label: 'Proof', startFrame: 0, durationFrames: 60,
        viewerTask: 'believe', narrativeRole: 'prove', sceneFamily: 'media-evidence',
        purpose: 'Show evidence.',
      }],
    };

    const dto = rowToDto({ ...row, comp });
    expect(dto.document.timeline).toBe(timeline);
    expect(directorPlanFromDocument(dto.document)).toMatchObject({ goal: 'Teach one durable idea.' });
    expect(directorPlanFromDocument(dto.document)).not.toHaveProperty('version');
    expect((dto.document.semantics as unknown as Record<string, unknown>).directorPlan).toBeUndefined();
    expect(dto.document.semantics.artifacts).toMatchObject({
      directorPlan: { kind: 'pireel.director-plan', mediaType: 'text/markdown' },
    });
    expect((dto.document.semantics.artifacts as { directorPlan: { content: string; payload?: unknown } }).directorPlan.content)
      .toContain('# Director Plan');
    expect((dto.document.semantics.artifacts as { directorPlan: { payload?: unknown } }).directorPlan.payload).toBeUndefined();
  });

  it('rejects V1 rows instead of normalizing them at runtime', () => {
    expect(() => rowToDto({ ...row, comp: { width: 1080, height: 1920, blocks: [] } })).toThrow(/not V2/);
  });

  it('builds list metadata without reading the project document', () => {
    expect(rowToMeta({
      id: row.id,
      title: row.title,
      videoDurationSec: row.videoDurationSec,
      coverThumb: row.coverThumb,
      version: row.version,
      updatedAt: row.updatedAt,
    })).toEqual({
      id: 'project-1',
      title: 'native',
      videoDurationSec: 12.5,
      coverThumb: null,
      version: 7,
      updatedAt: 1000,
    });
  });
});

describe('save wire', () => {
  const tx = (id: string, startSec = 1): DocumentTransaction => ({ id, origin: 'user', ops: [{
    op: 'overlay.insert',
    input: { block: { id: `card-${id.slice(-2)}`, templateId: 'custom', slots: {}, startSec, durationSec: 2, trackIndex: 5 } },
  }] });

  it('sends pending transactions plus meta on a cold baseline and nothing when idle', () => {
    const first = buildSaveWire(payload({ transactions: [tx('tx_0000000000000001')] }), 3, null)!;
    expect(first.wire).toMatchObject({ knownVersion: 3, documentSchemaVersion: 2, videoSig: 'sig1' });
    expect(first.wire.transactions).toHaveLength(1);
    expect(first.wire).not.toHaveProperty('document');
    expect(first.wire).not.toHaveProperty('baseVersion');
    expect(buildSaveWire(payload(), 4, first.acked)).toBeNull();
  });

  it('always sends transactions even when every section is unchanged', () => {
    const first = buildSaveWire(payload(), 3, null)!;
    const next = buildSaveWire(payload({ transactions: [tx('tx_0000000000000002')] }), 4, first.acked)!;
    expect(next.wire.transactions).toHaveLength(1);
    expect(next.wire.videoSig).toBeUndefined();
  });

  it('preserves an acknowledged title when a normal workbench save omits title', () => {
    const acked = ackedFromDto({
      context: sanitizeProjectContext(null), coverThumb: 'data:image/jpeg;base64,xxx',
      title: 'Hydrated project', videoSig: 'sig1', videoDurationSec: 12.5,
    });
    expect(buildSaveWire(payload(), 7, acked)).toBeNull();
  });

  it('preserves a server-held cover key when the payload omits coverThumb entirely', () => {
    const current = payload();
    delete current.coverThumb;
    const acked = ackedFromDto({
      context: sanitizeProjectContext(null), coverThumb: 'studio-covers/u1/p1-abc.jpg',
      title: 'Hydrated project', videoSig: current.videoSig, videoDurationSec: current.videoDurationSec,
    });
    // Covers travel as bytes through saveCover; an absent field must neither clear the
    // server's cover key nor register as a changed section (fake no-op PUT churns versions).
    expect(buildSaveWire(current, 7, acked)).toBeNull();
  });

  it('emits only the changed section', () => {
    const first = buildSaveWire(payload({ context: { schemaVersion: 3 } }), 3, null)!;
    const next = buildSaveWire(payload({ context: {
      schemaVersion: 3,
      localAssets: [{ assetId: 'asset-1', contentSig: 'clip.mp4:1:1', sig: 'clip.mp4:1:1', label: 'clip.mp4', createdAt: 1 }],
    } }), 4, first.acked)!;
    expect(next.wire.context ?? next.wire.contextPatch).toBeDefined();
    expect(next.wire.transactions).toBeUndefined();
    expect(next.wire.coverThumb).toBeUndefined();
    expect(next.wire.videoSig).toBeUndefined();
  });

  it('aligns stable-id arrays rather than replacing every shifted item', () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({ id: `row-${index}`, value: index }));
    const inserted = structuredClone(rows);
    inserted.splice(30, 0, { id: 'new-row', value: 999 });
    const ops = diffOps({ rows }, { rows: inserted });
    expect(ops.length).toBeLessThanOrEqual(2);
  });
});

describe('save request boundary', () => {
  it('parses transactions and refuses the retired snapshot protocol outright', () => {
    const ok = sanitizeSavePayload({ documentSchemaVersion: 2, knownVersion: 4, transactions: [{
      id: 'tx_0000000000000001', origin: 'user', ops: [{ op: 'command', input: { command: { type: 'canvas.patch', patch: { width: 720 } } } }],
    }] })!;
    expect(ok.transactions).toHaveLength(1);
    expect(ok.knownVersion).toBe(4);
    expect(sanitizeSavePayload({ transactions: 'nope' })).toBeNull();
    expect(sanitizeSavePayload({ documentSchemaVersion: 2, document: document() })).toBeNull();
    expect(sanitizeSavePayload({ documentSchemaVersion: 2, baseVersion: 3, title: 'x' })).toBeNull();
    expect(isRetiredSaveProtocol({ documentSchemaVersion: 2, baseVersion: 3 })).toBe(true);
    expect(isRetiredSaveProtocol({ documentSchemaVersion: 2, transactions: [] })).toBe(false);
  });

  it('rejects retired document/context wire fields instead of silently accepting them', () => {
    expect(sanitizeSavePayload({ comp: document() })).toBeNull();
    expect(sanitizeSavePayload({ compPatch: [], compHash: 'legacy' })).toBeNull();
    expect(sanitizeSavePayload({ chat: [] })).toBeNull();
    expect(sanitizeSavePayload({ context: { asr: ['legacy'] } })).toBeNull();
    expect(sanitizeSavePayload({ context: {} })).toBeNull();
    expect(sanitizeSavePayload({ context: { schemaVersion: 2 } })).toBeNull();
    expect(sanitizeSavePayload({
      context: {
        schemaVersion: 3,
        localAssets: [
          { sig: 'shared.mp4:9:1', label: 'shared.mp4', kind: 'video', createdAt: 9 },
          { sig: 'shared.mp4:9:1', label: 'duplicate', createdAt: 1 },
          { nope: true },
        ],
      },
    })?.context).toEqual({
      schemaVersion: 3,
      localAssets: [],
    });
  });

  it('keeps new logical asset ids distinct even when content signatures match', () => {
    expect(sanitizeSavePayload({
      context: {
        schemaVersion: 3,
        localAssets: [
          { assetId: 'asset-a', contentSig: 'same.mp4:9:1', sig: 'same.mp4:9:1', label: 'from A', createdAt: 2 },
          { assetId: 'asset-b', contentSig: 'same.mp4:9:1', sig: 'same.mp4:9:1', label: 'from B', createdAt: 1 },
        ],
      },
    })?.context).toEqual({
      schemaVersion: 3,
      localAssets: [
        { assetId: 'asset-a', contentSig: 'same.mp4:9:1', sig: 'same.mp4:9:1', label: 'from A', createdAt: 2 },
        { assetId: 'asset-b', contentSig: 'same.mp4:9:1', sig: 'same.mp4:9:1', label: 'from B', createdAt: 1 },
      ],
    });
  });

  it('drops directory entries that carry no logical id instead of deriving one', () => {
    const legacy = {
      schemaVersion: 3,
      localAssets: [
        { sig: 'shared.mp4:9:1', label: 'shared.mp4', createdAt: 9 },
        { assetId: 'local_keep', contentSig: 'kept.mp4:9:1', label: 'kept.mp4', createdAt: 8 },
      ],
    };
    expect(sanitizeProjectContext(legacy).localAssets?.map((entry) => entry.assetId)).toEqual(['local_keep']);
  });

  it('rejects a stale context patch instead of applying it', () => {
    const wrongHash = sanitizeSavePayload({
      contextPatch: [{ op: 'add', path: '/localAssets', value: [] }], contextHash: 'wrong',
    })!;
    expect(mergeSaveIntoRow(existing(), wrongHash)).toBeNull();
  });

  it('clears an explicitly null cover while preserving unavailable media metadata', () => {
    const merged = mergeSaveIntoRow(existing(), sanitizeSavePayload({ videoSig: null, coverThumb: null, videoDurationSec: 42 })!)!;
    expect(merged.videoSig).toBe('sig-old');
    expect(merged.coverThumb).toBeNull();
    expect(merged.videoDurationSec).toBe('42');
  });

  it('keeps the existing cover when the cover section is absent', () => {
    const merged = mergeSaveIntoRow(existing(), sanitizeSavePayload({ videoSig: null, videoDurationSec: null })!)!;
    expect(merged.coverThumb).toBe('thumb-old');
  });
});

describe('applying a save to the stored row', () => {
  const ctx = { projectId: 'p1' };
  const move = (id: string, startSec: number): DocumentTransaction => ({ id, origin: 'user', ops: [{
    op: 'overlay.patch', input: { updates: [{ clipId: 'title', startSec }] },
  }] });

  it('replays transactions onto the stored document and remembers their ids', () => {
    const row = { ...existing(), document: document(), appliedTransactionIds: [] };
    const applied = applyProjectSave(row, sanitizeSavePayload({ documentSchemaVersion: 2, knownVersion: 1, transactions: [move('tx_0000000000000001', 3)] })!, ctx)!;
    expect(applied.applied).toEqual(['tx_0000000000000001']);
    expect(applied.appliedTransactionIds).toEqual(['tx_0000000000000001']);
    expect(applied.documentChanged).toBe(true);
    expect(applied.document.timeline.tracks[1]!.clips[0]!.startFrame).toBe(90);
  });

  it('answers a resend as done without applying twice and keeps going past a rejected one', () => {
    const row = { ...existing(), document: document(), appliedTransactionIds: ['tx_0000000000000001'] };
    const bad: DocumentTransaction = { id: 'tx_0000000000000bad', origin: 'user', ops: [{ op: 'canvas.resize', input: { width: 0, height: 0 } }] };
    const applied = applyProjectSave(row, sanitizeSavePayload({ documentSchemaVersion: 2, transactions: [move('tx_0000000000000001', 9), bad, move('tx_0000000000000002', 4)] })!, ctx)!;
    expect(applied.duplicates).toEqual(['tx_0000000000000001']);
    expect(applied.rejected.map((r) => r.id)).toEqual(['tx_0000000000000bad']);
    expect(applied.applied).toEqual(['tx_0000000000000002', 'tx_0000000000000001']);
    expect(applied.document.timeline.tracks[1]!.clips[0]!.startFrame).toBe(120);
  });

  it('acknowledges a transaction that rebuilt an identical document without counting it as a change', () => {
    // A stored row is already in committed (normalized) form; the fixture is normalized the same way.
    const row = { ...existing(), document: normalizeCommittedDocument(document()), appliedTransactionIds: [] };
    const relay: DocumentTransaction = { id: 'tx_0000000000relay', origin: 'system', ops: [{ op: 'document.foldMetadata', input: {} }] };
    const applied = applyProjectSave(row, sanitizeSavePayload({ documentSchemaVersion: 2, transactions: [relay] })!, ctx)!;
    expect(applied.applied).toEqual(['tx_0000000000relay']);
    expect(applied.documentChanged).toBe(false);
  });

  it('merges the small sections next to the replayed document', () => {
    const row = { ...existing(), document: document(), appliedTransactionIds: [] };
    const applied = applyProjectSave(row, sanitizeSavePayload({ documentSchemaVersion: 2, title: 'Renamed', videoSig: null, videoDurationSec: 42 })!, ctx)!;
    expect(applied.title).toBe('Renamed');
    expect(applied.videoSig).toBe('sig-old');
    expect(applied.documentChanged).toBe(false);
  });
});
