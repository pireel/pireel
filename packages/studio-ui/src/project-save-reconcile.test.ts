import { afterEach, expect, it, vi } from 'vitest';
import { emptyProjectDocument, projectDocumentToComposition } from '@pireel/studio-engine/composition';
import { mergeSaveIntoRow, sanitizeSavePayload, type StudioProjectDto } from '@pireel/studio-engine/project-dto';
import { createProjectOutputs } from '@pireel/studio-engine/project-outputs';
import { cacheProjectLocally, serverSaveProject, projectVersion, restoreCloudProject } from './use-draft-persist';
import { CloudProjectSaveQueue } from './cloud-project-save';
import { reconcileProjectSave } from '@pireel/studio-engine/project-reconcile';
import { runServerTool } from '@pireel/studio-engine/server-tools';

afterEach(() => vi.unstubAllGlobals());
function scenario(id: string) {
  vi.stubGlobal('window', { localStorage: { setItem() {} } });
  const baseline: StudioProjectDto = { id, title: 'Edit', document: emptyProjectDocument(), context: { schemaVersion: 3, outputs: createProjectOutputs(1) },
    videoSig: null, videoDurationSec: null, coverThumb: null, version: 1, updatedAt: 1 };
  cacheProjectLocally(baseline);
  let cloud = structuredClone(baseline);
  let loseReply = false;
  const writes: number[] = [];
  const fetcher = vi.fn(async (_url, init) => {
    const raw = JSON.parse(String(init.body));
    if (raw.baseVersion !== cloud.version) return Response.json({ error: 'version_conflict', project: cloud }, { status: 409 });
    const patch = sanitizeSavePayload(raw)!;
    const merged = mergeSaveIntoRow(cloud, patch);
    expect(merged).not.toBeNull();
    cloud = { ...cloud, ...merged!, document: merged!.document as StudioProjectDto['document'], videoDurationSec: null, version: cloud.version + 1 };
    writes.push(cloud.version);
    if (loseReply) { loseReply = false; throw new Error('reply lost after commit'); }
    return Response.json({ project: cloud });
  });
  vi.stubGlobal('fetch', fetcher);
  return { baseline, fetcher, writes, get cloud() { return cloud; }, loseReply() { loseReply = true; } };
}

it('silently merges background changes and never replays the stale document on later saves', async () => {
  const h = scenario('merge');
  h.cloud.document.canvas.height = 900; h.cloud.version++;
  const local = structuredClone(h.baseline); local.document.canvas.width = 800;
  expect(await serverSaveProject(local.id, local)).toMatchObject({ status: 'saved' });
  expect(h.cloud.document.canvas).toMatchObject({ width: 800, height: 900 });
  await serverSaveProject(local.id, local);
  expect(h.writes).toHaveLength(1);
  local.document.canvas.width = 850;
  await serverSaveProject(local.id, local);
  expect(h.cloud.document.canvas).toMatchObject({ width: 850, height: 900 });
});

it('keeps a normal recovery output for a real collision and continues saving', async () => {
  const h = scenario('overlap');
  h.cloud.document.canvas.width = 900; h.cloud.version++;
  const local = structuredClone(h.baseline); local.document.canvas.width = 800;
  expect(await serverSaveProject(local.id, local)).toMatchObject({ status: 'saved' });
  expect(h.cloud.document.canvas.width).toBe(800);
  expect(h.cloud.context.outputs!.inactive[0]!.document.canvas.width).toBe(900);
  await serverSaveProject(local.id, local);
  expect(h.cloud.context.outputs!.inactive).toHaveLength(1);
});

it('retries an uncertain commit without applying the same edit twice', async () => {
  const h = scenario('uncertain');
  const local = structuredClone(h.baseline); local.document.canvas.width = 800;
  h.loseReply();
  expect(await serverSaveProject(local.id, local)).toBe('skip');
  expect(projectVersion(local.id)).toBe(1); // a fetched/committed wire revision is not an adopted editor revision
  expect(await serverSaveProject(local.id, local)).toMatchObject({ status: 'saved' });
  expect(h.writes).toHaveLength(1);
  expect(h.cloud.document.canvas.width).toBe(800);
});

it('reopens an unsaved local branch without discarding either version', () => {
  const h = scenario('reopen');
  const local = cacheProjectLocally(h.baseline);
  local.document = structuredClone(local.document); local.document.canvas.width = 800; local.pending = true;
  h.cloud.document.canvas.height = 900; h.cloud.version++;
  const restored = restoreCloudProject(h.cloud, local);
  expect(restored.document.canvas.width).toBe(800);
  expect(restored.context!.outputs!.inactive.some(o => o.document.canvas.height === 900)).toBe(true);
  expect(restored.pending).toBe(true);
});

it('uses the cloud directly when the cached draft was fully acknowledged', () => {
  const h = scenario('clean-reopen');
  const local = cacheProjectLocally(h.baseline);
  h.cloud.document.canvas.width = 900; h.cloud.version++;
  const restored = restoreCloudProject(h.cloud, local);
  expect(restored.document.canvas.width).toBe(900);
  expect(restored.context!.outputs!.inactive).toHaveLength(0);
  expect(restored.pending).toBe(false);
});

it('serializes concurrent calls for the same project', async () => {
  const h = scenario('serial');
  const first = structuredClone(h.baseline); first.document.canvas.width = 800;
  const second = structuredClone(first); second.document.canvas.height = 900;
  await Promise.all([serverSaveProject(first.id, first), serverSaveProject(second.id, second)]);
  expect(h.cloud.document.canvas).toMatchObject({ width: 800, height: 900 });
  expect(h.cloud.context.outputs!.inactive).toHaveLength(0);
});

it('preserves a real offline MCP text insertion while the browser changes the canvas', async () => {
  const h = scenario('offline-text');
  const added = runServerTool('add_texts', { items: [{ text: 'Remote title', startSec: 0, durationSec: 3 }] }, {
    id: h.cloud.id, title: h.cloud.title, document: h.cloud.document, comp: projectDocumentToComposition(h.cloud.document), context: h.cloud.context, videoDurationSec: null,
  });
  expect(added.result.ok).toBe(true);
  h.cloud.document = added.document!; h.cloud.version++;
  const local = structuredClone(h.baseline); local.document.canvas.width = 800;
  await serverSaveProject(local.id, local);
  expect(h.cloud.document.timeline.tracks.flatMap(t => t.clips).some(c => c.kind === 'graphic' && c.block.slots.text === 'Remote title')).toBe(true);
  expect(h.cloud.document.canvas.width).toBe(800);
  expect(h.cloud.context.outputs!.inactive).toHaveLength(0);
});

it('adopts merged state without overwriting edits made while the save is in flight', async () => {
  const h = scenario('inflight');
  h.cloud.document.canvas.height = 900; h.cloud.version++;
  let current = structuredClone(h.baseline);
  current.document.canvas.width = 800;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const dispatch = h.fetcher.getMockImplementation()!;
  h.fetcher.mockImplementationOnce(async (...args) => { await gate; return dispatch(...args); });
  const queue = new CloudProjectSaveQueue({
    getPayload: () => structuredClone(current), canWrite: () => true,
    save: p => serverSaveProject(p.id, p),
    onSaved: (submitted, remote) => { current = { ...current, ...reconcileProjectSave(submitted, current, remote) }; },
  });
  queue.markDirty();
  const saving = queue.flush();
  await vi.waitFor(() => expect(h.fetcher).toHaveBeenCalledOnce());
  current.document.canvas.width = 850; queue.markDirty();
  release(); await saving; await queue.whenIdle();
  expect(current.document.canvas).toMatchObject({ width: 850, height: 900 });
  expect(h.cloud.document.canvas).toMatchObject({ width: 850, height: 900 });
  expect(queue.hasPendingSave).toBe(false);
  queue.dispose();
});
