import { describe, expect, it } from 'vitest';
import { directorPlanFromDocument } from './director-plan-artifact';
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
  sanitizeProjectContext,
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

describe('V2 incremental save wire', () => {
  it('sends native document/meta on a cold baseline and skips an unchanged save', () => {
    const first = buildSaveWire(payload(), 3, null)!;
    expect(first.wire).toMatchObject({ baseVersion: 3, documentSchemaVersion: 2, videoSig: 'sig1' });
    expect(first.wire.document).toBeDefined();
    expect(first.wire).not.toHaveProperty('context');
    expect(buildSaveWire(payload(), 4, first.acked)).toBeNull();
  });

  it('preserves an acknowledged title when a normal workbench save omits title', () => {
    const current = payload();
    const acked = ackedFromDto({
      document: current.document!,
      context: sanitizeProjectContext(null),
      coverThumb: current.coverThumb,
      title: 'Hydrated project',
      videoSig: current.videoSig,
      videoDurationSec: current.videoDurationSec,
    });

    expect(buildSaveWire(current, 7, acked)).toBeNull();
  });

  it('keeps document absent for context-only saves', () => {
    const contextOnly = payload({ document: undefined, context: { schemaVersion: 3 } });
    const first = buildSaveWire(contextOnly, null, null)!;
    expect(first.wire.document).toBeUndefined();
    expect(first.wire.context).toBeDefined();
    const next = buildSaveWire(payload(), 1, first.acked)!;
    expect(next.wire.document ?? next.wire.documentPatch).toBeDefined();
  });

  it('emits only the changed section', () => {
    const first = buildSaveWire(payload({ context: { schemaVersion: 3 } }), 3, null)!;
    const next = buildSaveWire(payload({ context: {
      schemaVersion: 3,
      localAssets: [{ assetId: 'asset-1', contentSig: 'clip.mp4:1:1', sig: 'clip.mp4:1:1', label: 'clip.mp4', createdAt: 1 }],
    } }), 4, first.acked)!;
    expect(next.wire.context ?? next.wire.contextPatch).toBeDefined();
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
      localAssets: [{
        assetId: expect.stringMatching(/^local_/),
        contentSig: 'shared.mp4:9:1',
        sig: 'shared.mp4:9:1',
        label: 'shared.mp4',
        kind: 'video',
        createdAt: 9,
      }],
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

  it('derives the same legacy asset id on every device and preserves the compatibility sig', () => {
    const legacy = {
      schemaVersion: 3,
      localAssets: [{
        sig: 'shared.mp4:9:1',
        label: 'shared.mp4',
        folder: { id: 'folder-a', name: 'A', path: 'clips/shared.mp4' },
        createdAt: 9,
      }],
    };

    const first = sanitizeProjectContext(legacy).localAssets?.[0];
    const second = sanitizeProjectContext(structuredClone(legacy)).localAssets?.[0];
    expect(first?.assetId).toMatch(/^local_/);
    expect(second?.assetId).toBe(first?.assetId);
    expect(first).toMatchObject({
      contentSig: legacy.localAssets[0]!.sig,
      sig: legacy.localAssets[0]!.sig,
    });
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

describe('conflict baseline', () => {
  it('re-seeds from a server V2 DTO using the same canonical hashes', () => {
    const value = payload();
    const acked = ackedFromDto({
      document: value.document!, context: { schemaVersion: 3 }, coverThumb: value.coverThumb,
      title: '未命名项目', videoSig: value.videoSig, videoDurationSec: value.videoDurationSec,
    });
    const next = buildSaveWire(value, 9, acked);
    if (next) {
      expect(next.wire.document).toBeUndefined();
      expect(next.wire.documentPatch).toBeUndefined();
      expect(next.wire.coverThumb).toBeUndefined();
    }
  });
});
