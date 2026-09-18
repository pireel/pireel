/**
 * The workflow-baseline reminder exists for installs with no update mechanism. A Plugin bundle's
 * host owns updates, and a release deploys the server before publishing the plugin — so telling a
 * Plugin user to update during that window points at a version that is not published yet.
 */
import { describe, expect, it } from 'vitest';
import { handleMcpRequest, type McpDeps } from './mcp';

const BASE: McpDeps = {
  skillVersion: '9.9.9',
  callBridge: async () => ({ ok: true, state: 'PROJECT: demo' }),
} as unknown as McpDeps;

const getState = (deps: McpDeps) =>
  handleMcpRequest(
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_state', arguments: {} } },
    deps,
  );

describe('workflow baseline is announced only where it can be acted on', () => {
  it('stays silent for a plugin install', async () => {
    const res = (await getState({ ...BASE, distribution: 'plugin' })) as { result?: unknown };
    expect(JSON.stringify(res)).not.toContain('workflow baseline');
    expect(JSON.stringify(res)).toContain('PROJECT: demo');
  });

  it('announces to a standalone install, and to one that sends no header', async () => {
    for (const deps of [{ ...BASE, distribution: 'standalone' as const }, BASE]) {
      const res = (await getState(deps)) as unknown;
      expect(JSON.stringify(res)).toContain('Pireel workflow baseline: 9.9.9');
    }
  });
});
