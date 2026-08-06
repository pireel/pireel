import { describe, expect, it } from 'vitest';
import { emptyProjectDocument } from './project-document';
import {
  ackedFromDto,
  buildSaveWire,
  canonicalJson,
  diffOps,
  hashSection,
  mergeSaveIntoRow,
  rowToDto,
  rowToMeta,
  sanitizeSavePayload,
  type ProjectSavePayload,
} from './project-dto';

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
  document: document(),
  chat: [{ id: 't1' }],
  videoSig: 'sig1',
  videoDurationSec: 12.5,
  coverThumb: 'data:image/jpeg;base64,xxx',
  ...over,
});

const existing = (value: unknown = document()) => ({
  title: '我的片子',
  document: value,
  chat: [{ id: 'old' }],
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
    id: 'project-1', title: 'native', comp: document(), chat: [], context: {}, videoSig: 'sig1',
    videoDurationSec: '12.5', coverThumb: null, version: 7, updatedAt: new Date(1000),
  };

  it('returns only the native V2 document', () => {
    const dto = rowToDto(row);
    expect(dto.document.version).toBe(2);
    expect(dto).not.toHaveProperty('comp');
    expect(dto.context).toEqual({ schemaVersion: 2 });
    expect(rowToMeta(row)).toMatchObject({ blocks: 1, shots: 0 });
  });

  it('rejects V1 rows instead of normalizing them at runtime', () => {
    expect(() => rowToDto({ ...row, comp: { width: 1080, height: 1920, blocks: [] } })).toThrow(/not V2/);
    expect(() => rowToMeta({ ...row, comp: { width: 1080, height: 1920, blocks: [] } })).toThrow(/not V2/);
  });
});

describe('V2 incremental save wire', () => {
  it('sends native document/chat/meta on a cold baseline and skips an unchanged save', () => {
    const first = buildSaveWire(payload(), 3, null)!;
    expect(first.wire).toMatchObject({ baseVersion: 3, documentSchemaVersion: 2, videoSig: 'sig1' });
    expect(first.wire.document).toBeDefined();
    expect(first.wire.chat).toBeDefined();
    expect(first.wire).not.toHaveProperty('context');
    expect(buildSaveWire(payload(), 4, first.acked)).toBeNull();
  });

  it('keeps document absent for chat-only saves', () => {
    const chatOnly = payload({ document: undefined, chat: [{ id: 'consultation' }] });
    const first = buildSaveWire(chatOnly, null, null)!;
    expect(first.wire.document).toBeUndefined();
    expect(first.wire.chat).toBeDefined();
    const next = buildSaveWire(payload({ chat: chatOnly.chat }), 1, first.acked)!;
    expect(next.wire.document ?? next.wire.documentPatch).toBeDefined();
  });

  it('emits only the changed section', () => {
    const first = buildSaveWire(payload(), 3, null)!;
    const next = buildSaveWire(payload({ chat: [{ id: 't1' }, { id: 't2' }] }), 4, first.acked)!;
    expect(next.wire.chat ?? next.wire.chatPatch).toBeDefined();
    expect(next.wire.document).toBeUndefined();
    expect(next.wire.documentPatch).toBeUndefined();
    expect(next.wire.coverThumb).toBeUndefined();
    expect(next.wire.videoSig).toBeUndefined();
  });

  it('uses a compact verified patch for a small native document edit', () => {
    const base = document();
    const many = {
      ...base,
      semantics: { ...base.semantics, plan: { rows: Array.from({ length: 100 }, (_, index) => ({ id: `row-${index}`, text: `long row ${index} ${'x'.repeat(40)}` })) } },
    };
    const first = buildSaveWire(payload({ document: many }), 1, null)!;
    const changed = structuredClone(many);
    (changed.semantics.plan as { rows: { text: string }[] }).rows[40]!.text = 'changed';
    const next = buildSaveWire(payload({ document: changed }), 2, first.acked)!;
    expect(next.wire.document).toBeUndefined();
    expect(next.wire.documentPatch).toBeDefined();
    const merged = mergeSaveIntoRow(
      existing(first.acked.values.document),
      sanitizeSavePayload({ baseVersion: 2, documentPatch: next.wire.documentPatch, documentHash: next.wire.documentHash })!,
    );
    expect(hashSection(canonicalJson(merged!.document))).toBe(next.wire.documentHash);
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
  it('accepts only structurally valid V2 full documents', () => {
    expect(sanitizeSavePayload({ document: document() })?.document?.version).toBe(2);
    expect(sanitizeSavePayload({ document: { width: 1080, height: 1920, blocks: [] } })).toBeNull();
    expect(sanitizeSavePayload({ document: { ...document(), timeline: { tracks: [] } } })).toBeNull();
  });

  it('rejects retired document/context wire fields instead of silently accepting them', () => {
    expect(sanitizeSavePayload({ comp: document() })).toBeNull();
    expect(sanitizeSavePayload({ compPatch: [], compHash: 'legacy' })).toBeNull();
    expect(sanitizeSavePayload({ context: { asr: ['legacy'] } })).toBeNull();
  });

  it('rejects stale/corrupt patches and patched legacy top-level fields', () => {
    const wrongHash = sanitizeSavePayload({
      documentPatch: [{ op: 'replace', path: '/canvas/width', value: 720 }], documentHash: 'wrong',
    })!;
    expect(mergeSaveIntoRow(existing(), wrongHash)).toBeNull();
    const base = document();
    const legacy = sanitizeSavePayload({
      documentPatch: [{ op: 'add', path: '/video', value: { runtime: true } }],
      documentHash: hashSection(canonicalJson({ ...base, video: { runtime: true } })),
    })!;
    expect(mergeSaveIntoRow(existing(base), legacy)).toBeNull();
  });

  it('preserves row metadata on null and serializes a supplied duration', () => {
    const merged = mergeSaveIntoRow(existing(), sanitizeSavePayload({ videoSig: null, coverThumb: null, videoDurationSec: 42 })!)!;
    expect(merged.videoSig).toBe('sig-old');
    expect(merged.coverThumb).toBe('thumb-old');
    expect(merged.videoDurationSec).toBe('42');
  });
});

describe('conflict baseline', () => {
  it('re-seeds from a server V2 DTO using the same canonical hashes', () => {
    const value = payload();
    const acked = ackedFromDto({
      document: value.document!, chat: value.chat, context: { schemaVersion: 2 }, coverThumb: value.coverThumb,
      title: '未命名项目', videoSig: value.videoSig, videoDurationSec: value.videoDurationSec,
    });
    const next = buildSaveWire(value, 9, acked);
    if (next) {
      expect(next.wire.document).toBeUndefined();
      expect(next.wire.documentPatch).toBeUndefined();
      expect(next.wire.chat).toBeUndefined();
      expect(next.wire.coverThumb).toBeUndefined();
    }
  });
});
