import { expect, it } from 'vitest';
import { WorkflowArtifactStore, artifactVersion, workflowRequestId } from './workflow-artifacts';
it('resolves exact immutable artifact versions and refuses missing or wrong-kind references', async () => {
  const entries = {}; const store = new WorkflowArtifactStore(entries);
  const original = { rows: [{ id: 's1', text: 'first' }] };
  const first = await store.put('transcript', 'source', original);
  original.rows[0].text = 'second';
  const second = await store.put('transcript', 'source', original);
  expect(first.version).not.toBe(second.version);
  expect(store.read(first, 'transcript')).toEqual({ rows: [{ id: 's1', text: 'first' }] });
  expect(new WorkflowArtifactStore(JSON.parse(JSON.stringify(entries))).read(second, 'transcript')).toEqual(original);
  expect(() => store.read({ ...first, version: 'missing' }, 'transcript')).toThrow('unavailable');
  expect(() => store.read(first, 'document')).toThrow('Invalid');
});
it('uses canonical content identity and stable UUIDs accepted by paid legacy endpoints', async () => {
  expect(await artifactVersion({ a: 1, b: 2 })).toBe(await artifactVersion({ b: 2, a: 1 }));
  expect(await workflowRequestId('run:node:inputs')).toMatch(/^[a-f0-9-]{36}$/);
  expect(await workflowRequestId('run:node:inputs')).not.toBe(await workflowRequestId('run:node:changed'));
});
