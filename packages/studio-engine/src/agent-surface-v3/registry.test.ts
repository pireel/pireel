import { describe, expect, it } from 'vitest';
import { MCP_SERVER_TOOL_IDS, serverOwnsCall } from '../mcp';
import { V3_TOOL_IDS, V3_TOOL_LIMIT, V3_TOOLS } from './registry';
import { V3_TOOL_SCHEMAS } from './schemas';
import { STUDIO_SKILL_CAPABILITIES } from './skill-capabilities';

describe('agent surface v3 registry', () => {
  it('stays within the tool budget with unique ids', () => {
    expect(V3_TOOLS.length).toBeLessThanOrEqual(V3_TOOL_LIMIT);
    expect(V3_TOOL_IDS.size).toBe(V3_TOOLS.length);
  });

  it('gives every tool a published schema and every schema a tool', () => {
    expect(V3_TOOLS.filter((tool) => !V3_TOOL_SCHEMAS[tool.id]).map((tool) => tool.id)).toEqual([]);
    expect(Object.keys(V3_TOOL_SCHEMAS).filter((id) => !V3_TOOL_IDS.has(id))).toEqual([]);
  });

  it('answers server-direct tools on the server and never sends chat-only tools there', () => {
    for (const tool of V3_TOOLS) {
      if (tool.serverDirect) expect(MCP_SERVER_TOOL_IDS.has(tool.id), tool.id).toBe(true);
      if (tool.chatOnly) expect(serverOwnsCall(tool.id, {}), tool.id).toBe(false);
    }
  });

  it('derives the skill-safe capability catalog from stable contracts only', () => {
    const stable = V3_TOOLS.filter((tool) => tool.skillContract?.stability === 'stable').map((tool) => tool.id);
    expect(STUDIO_SKILL_CAPABILITIES.map((capability) => capability.id)).toEqual(stable);
    expect(stable).toEqual(expect.arrayContaining(['get_state', 'get_transcript', 'remove_words', 'set_captions', 'apply_layout']));
    for (const capability of STUDIO_SKILL_CAPABILITIES) {
      expect(capability.version).toBe(1);
      expect(capability.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    }
  });
});
