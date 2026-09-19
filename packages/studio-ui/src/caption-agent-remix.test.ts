import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dubbingVideoDocument } from '@pireel/studio-engine/dubbing-task';
import { firstNarrativeAssetId } from '@pireel/studio-engine/composition';
import type { CaptionTaskRecord } from './caption-task-store';
import type { ProjectSaveWire } from '@pireel/studio-engine/project-dto';
const mock = vi.hoisted(() => ({ user: vi.fn(), file: vi.fn(), cache: vi.fn(), save: vi.fn(), load: vi.fn(), local: vi.fn(), id: vi.fn() }));
vi.mock('./current-user', () => ({ loadCurrentUser: mock.user }));
vi.mock('./local-media', () => ({ loadLocalVideo: mock.file, saveLocalVideo: mock.cache }));
vi.mock('./use-draft-persist', () => ({ cacheProjectLocally: mock.local, newProjectId: mock.id, serverSaveProject: mock.save, serverLoadProject: mock.load }));
import { captionAgentRemixDocument, createCaptionAgentRemix } from './caption-agent-remix';
const task = (): CaptionTaskRecord => ({ id: 'caption-original', scope: 'owner', name: 'demo.mp4', sourceSig: 'source', width: 1080, height: 1920, durationSec: 4, updatedAt: 1, stage: 'ready', projectId: 'old-remix', options: { presetId: 'clean', aspect: 'original', shortenPauses: false } });
beforeEach(() => {
  vi.clearAllMocks();
  mock.user.mockResolvedValue({ user_id: 'owner', auth_method: 'session' });
  mock.file.mockResolvedValue(new File(['video'], 'demo.mp4', { type: 'video/mp4' })); mock.cache.mockResolvedValue(true);
  mock.save.mockImplementation(async (_id: string, wire: ProjectSaveWire) => ({ status: 'saved', applied: wire.transactions!.map(transaction => transaction.id) })); mock.load.mockResolvedValue({ id: 'saved-copy' });
  mock.id.mockReturnValueOnce('pnew001').mockReturnValueOnce('pnew002');
});
describe('Agent Remix', () => {
  it('creates a useful native video document even before captions are generated', () => {
    const document = captionAgentRemixDocument(task(), 'pnew001', 'blob:video');
    const source = firstNarrativeAssetId(document)!;
    expect(document.assets[source]?.locator.localSig).toBe('source');
    expect(document.appearance.captionStyle?.preset).toBe('ln-clean');
    expect(document.timeline.tracks.some((track) => track.clips.length > 0)).toBe(true);
  });
  it('creates a new project for each explicit remix and never writes the original or an earlier remix', async () => {
    const original = task(); const snapshot = structuredClone(original);
    expect(await createCaptionAgentRemix(original)).toBe('pnew001');
    expect(await createCaptionAgentRemix(original)).toBe('pnew002');
    expect(mock.save.mock.calls.map(([id]) => id)).toEqual(['pnew001', 'pnew002']);
    expect(original).toEqual(snapshot);
    expect(mock.save.mock.calls[0]![1].title).toBe('demo · Agent Remix');
    expect(mock.save.mock.calls[0]![1]).toMatchObject({ documentSchemaVersion: 2, knownVersion: null, transactions: [{ origin: 'user', ops: [{ op: 'document.replace' }] }] });
  });
  it('deep-copies an existing caption document', () => {
    const original = task(); original.document = captionAgentRemixDocument(original, 'source-project', 'blob:video');
    const copy = captionAgentRemixDocument(original, 'pnew001', 'blob:video');
    copy.canvas.width = 720;
    expect(original.document.canvas.width).toBe(1080);
    expect(copy.semantics.transcripts).not.toBe(original.document.semantics.transcripts);
  });
  it('remixes the dubbed output instead of reverting to the original voice', async () => {
    const original = task(); original.scene = 'dubbing';
    original.options.dubbing = { language: 'English', voiceId: 'voice', lipSync: false };
    original.dubbing = { outputSig: 'dubbed-output', outputWidth: 640, outputHeight: 360 };
    original.document = dubbingVideoDocument(original.id, 'dubbed-output', 'blob:dubbed', 'dubbed.mp4', 640, 360, 4);
    const dubbed = new File(['dubbed voice'], 'dubbed.mp4', { type: 'video/mp4' });
    mock.file.mockResolvedValueOnce(dubbed);
    await createCaptionAgentRemix(original, new File(['original voice'], 'original.mp4'));
    expect(mock.cache).toHaveBeenCalledWith(dubbed, 'dubbed-output');
    expect(mock.save.mock.calls[0]![1]).toMatchObject({ videoSig: 'dubbed-output', context: { localAssets: [{ w: 640, h: 360 }] } });
  });
  it('refuses a different account or missing source instead of making an empty project', async () => {
    mock.user.mockResolvedValueOnce({ user_id: 'other', auth_method: 'session' });
    await expect(createCaptionAgentRemix(task())).rejects.toThrow();
    mock.file.mockResolvedValueOnce(null);
    await expect(createCaptionAgentRemix(task())).rejects.toThrow();
    expect(mock.save).not.toHaveBeenCalled();
  });
});
it('keeps the original picture and separate dubbed narration when remixing a migrated result', async () => {
  const original = task(); original.scene = 'dubbing';
  original.dubbing = { outputSig: 'flattened-export' };
  original.document = dubbingVideoDocument(original.id, 'source', 'blob:source', 'source.mp4', 1080, 1920, 4);
  const { applyDocumentTransaction } = await import('@pireel/studio-engine/document-transaction');
  const edited = applyDocumentTransaction(original.document, { ops: [
    { op: 'command', input: { command: { type: 'track.insert', track: { id: 'voice', type: 'audio', role: 'narration' } } } },
    { op: 'audio.add', input: { toTrackId: 'voice', clip: { id: 'audio', sig: 'aligned-voice', src: 'blob:voice', durationSec: 4, startSec: 0, volumeDb: 0, fadeInSec: 0, fadeOutSec: 0 } } },
  ] }, { projectId: original.id });
  if (!edited.ok) throw new Error(edited.error.message);
  original.document = edited.document;
  original.workflow = { definition: { version: 2 } } as never;
  original.workflowData = { artifacts: {}, receipts: {}, partials: {} };
  await createCaptionAgentRemix(original, new File(['original'], 'source.mp4', { type: 'video/mp4' }));
  const payload = mock.save.mock.calls[0][1] as ProjectSaveWire;
  expect(payload.videoSig).toBe('source');
  expect(payload.context?.localAssets?.map(asset => asset.sig)).toEqual(expect.arrayContaining(['source', 'aligned-voice']));
  expect(JSON.stringify(payload.transactions)).not.toContain('flattened-export');
});
