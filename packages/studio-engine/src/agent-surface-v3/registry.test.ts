import { describe, expect, it } from 'vitest';
import { STUDIO_TOOLS } from '../prompts/l0-agent-tools';
import { MCP_BRIDGE_EXTRA_TOOL_IDS, MCP_BRIEF_TOOLS, MCP_SERVER_TOOL_IDS } from '../mcp';
import { V3_PENDING_TRANSLATIONS, translateV3Call } from './adapter';
import { V3_RETIRED_TOOL_IDS, V3_TOOL_IDS, V3_TOOL_LIMIT, V3_TOOLS, v3ReplacementIndex } from './registry';

/** Every tool id an agent can call today on any surface: the chat tool table, the MCP server-direct
 *  set, the MCP bridge-only extras, and the BYO brief tools. */
const legacyIds = () => new Set<string>([
  ...(STUDIO_TOOLS as Array<{ id: string }>).map((tool) => tool.id),
  ...MCP_SERVER_TOOL_IDS,
  ...[...MCP_BRIDGE_EXTRA_TOOL_IDS].filter((id) => id !== 'run_v3'), // run_v3 is the v3 transport itself, not an agent tool
  ...Object.keys(MCP_BRIEF_TOOLS),
]);

describe('agent surface v3 registry', () => {
  it('stays within the fifty-tool budget with unique ids', () => {
    expect(V3_TOOLS.length).toBeLessThanOrEqual(V3_TOOL_LIMIT);
    expect(V3_TOOL_IDS.size).toBe(V3_TOOLS.length);
  });

  it('maps every current tool id to exactly one v3 tool or retires it', () => {
    const index = v3ReplacementIndex();
    const retired = new Set(V3_RETIRED_TOOL_IDS);
    const unmapped = [...legacyIds()].filter((id) => !index.has(id) && !retired.has(id));
    expect(unmapped).toEqual([]);
    const claimedAndRetired = [...retired].filter((id) => index.has(id));
    expect(claimedAndRetired).toEqual([]);
  });

  it('references only legacy ids that exist (no stale mapping rows)', () => {
    const known = legacyIds();
    const stale = V3_TOOLS.flatMap((tool) => tool.replaces.filter((legacy) => !known.has(legacy)));
    expect(stale).toEqual([]);
    expect(V3_RETIRED_TOOL_IDS.filter((id) => !known.has(id))).toEqual([]);
  });

  it('tracks which v3 tools still lack a translation', () => {
    const pending = V3_PENDING_TRANSLATIONS.filter((id) => !V3_TOOL_IDS.has(id));
    expect(pending).toEqual([]);
    const ctx = { fps: 30, kindOf: () => undefined };
    for (const tool of V3_TOOLS) {
      const result = translateV3Call(tool.id, {}, ctx);
      if (V3_PENDING_TRANSLATIONS.includes(tool.id)) expect(result.status).toBe('pending');
      else expect(result.status, tool.id).not.toBe('pending');
    }
  });
});
