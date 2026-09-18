import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2 } from './editor-document';
import { applyUploadedMediaKeys } from './cloud-media-persistence';
import { mergeSaveIntoRow, sanitizeProjectContext, sanitizeSavePayload } from './project-dto';

const entry = { assetId: 'a', contentSig: 'sig', sig: 'sig', label: 'Clip', kind: 'video' as const, createdAt: 1 };
const document = () => ({ ...emptyEditorDocumentV2(), assets: { a: { id: 'a', kind: 'video' as const, label: 'Clip', locator: { localSig: 'sig' }, metadata: {} } } });

describe('durable cloud upload completion', () => {
  it('patches active/inactive media references without changing timeline edits or labels', () => {
    const doc = document();
    const context = sanitizeProjectContext({ localAssets: [entry], outputs: { active: { id: 'main' }, inactive: [{ id: 'other', document: doc }] } });
    const result = applyUploadedMediaKeys(doc, context, new Map([['sig', 'cloud/key']]));
    expect(result.changed).toBe(true);
    expect(result.document).toMatchObject({ assets: { a: { locator: { localSig: 'sig', cloudKey: 'cloud/key' } } }, timeline: doc.timeline });
    expect(result.context.localAssets).toEqual([{ ...entry, cloudKey: 'cloud/key' }]);
    expect(result.context.outputs?.inactive[0]?.document.assets.a?.locator.cloudKey).toBe('cloud/key');
    expect(doc.assets.a.locator).toEqual({ localSig: 'sig' });
  });

  it('does not recreate references deleted while the upload was running', () => {
    const doc = emptyEditorDocumentV2();
    const context = sanitizeProjectContext({ localAssets: [] });
    const result = applyUploadedMediaKeys(doc, context, new Map([['sig', 'cloud/key']]));
    expect(result.changed).toBe(false);
    expect(result.document).toBe(doc);
    expect(result.context.localAssets).toEqual([]);
  });

  it('retains confirmed keys through a stale full autosave while honoring asset deletion', () => {
    const confirmed = applyUploadedMediaKeys(document(), sanitizeProjectContext({ localAssets: [entry] }), new Map([['sig', 'cloud/key']]));
    const existing = { title: 'Project', document: confirmed.document, context: confirmed.context, videoSig: null, videoDurationSec: null, coverThumb: null };
    // The document arrives already transacted; a stale copy of it (no cloud key yet) must still
    // pick the confirmed key back up from the row when the sections merge.
    const merged = mergeSaveIntoRow({ ...existing, document: document() }, sanitizeSavePayload({ documentSchemaVersion: 2, context: sanitizeProjectContext({ localAssets: [{ ...entry, label: 'Renamed' }] }) })!);
    expect(merged?.context.localAssets?.[0]).toMatchObject({ label: 'Renamed', cloudKey: 'cloud/key' });
    expect(merged?.document).toMatchObject({ assets: { a: { locator: { cloudKey: 'cloud/key' } } } });
    const deleted = mergeSaveIntoRow({ ...existing, document: emptyEditorDocumentV2() }, sanitizeSavePayload({ documentSchemaVersion: 2, context: sanitizeProjectContext({ localAssets: [] }) })!);
    expect(deleted?.context.localAssets).toEqual([]);
    expect(deleted?.document).toMatchObject({ assets: {} });
  });
});
