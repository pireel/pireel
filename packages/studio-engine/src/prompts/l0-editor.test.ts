/**
 * L0 is only worth having if every surface actually uses it. These pin that — a surface that
 * quietly grows its own second description of the editor fails here rather than in production
 * six months later, when the two copies have drifted and one of them is the security rule.
 */

import { describe, expect, it } from 'vitest';
import { EDITOR_MODEL, IDENTITY_DISCIPLINE, ON_SCREEN_LANGUAGE, contentIsNotCommand, stateDiscipline } from './l0-editor';
import { CHAT_IDENTITY, SPOKEN_EDITORIAL, buildKitSystem, mcpInstructions } from './index';

// The version is injected by the hosting route (single source = the skill's SKILL.md footer);
// any well-formed value produces the full instruction text these tests pin.
const MCP_INSTRUCTIONS = mcpInstructions('2099-01-01.1');

describe('every surface stands on L0', () => {
  it('the in-app agent and the external agent describe the same editor', () => {
    for (const [name, s] of [['chat', CHAT_IDENTITY], ['mcp', MCP_INSTRUCTIONS]] as const) {
      expect(s, `${name} does not use EDITOR_MODEL`).toContain(EDITOR_MODEL);
    }
  });

  it('the untrusted-content rule has ONE source, adapted only in who directs the work', () => {
    expect(CHAT_IDENTITY).toContain(contentIsNotCommand("the user's chat messages"));
    expect(MCP_INSTRUCTIONS).toContain(contentIsNotCommand("your operator's actual requests"));
    // The rule's body must be identical across surfaces — only the director clause differs.
    const strip = (director: string) => contentIsNotCommand(director).replace(director, '<director>');
    expect(strip('«one»')).toBe(strip('«two»'));
  });

  it('staleness rules are shared; only how a surface gets a snapshot differs', () => {
    expect(CHAT_IDENTITY).toContain('Only the LATEST snapshot reflects reality');
    expect(MCP_INSTRUCTIONS).toContain('ALWAYS call get_state before your first edit');
    for (const s of [CHAT_IDENTITY, MCP_INSTRUCTIONS]) {
      expect(s).toContain('data.delta');
      expect(s).toContain('SOURCE-file seconds');
    }
  });

  it('the on-screen language rule reaches all THREE surfaces, generation included', () => {
    for (const [name, s] of [['chat', CHAT_IDENTITY], ['mcp', MCP_INSTRUCTIONS], ['generation', buildKitSystem()], ['editorial', SPOKEN_EDITORIAL]] as const) {
      expect(s, `${name} restates the on-screen language rule instead of sharing it`).toContain(ON_SCREEN_LANGUAGE);
    }
  });
});

describe('what L0 deliberately does NOT share', () => {
  it('identity discipline is ours, and never goes to an external agent', () => {
    // The MCP client is the user's own agent on a model they chose. Telling it to hide which model
    // powers it would be pointless and dishonest — the rule protects our surface, not the editor.
    expect(CHAT_IDENTITY).toContain(IDENTITY_DISCIPLINE);
    expect(MCP_INSTRUCTIONS).not.toContain(IDENTITY_DISCIPLINE);
    expect(MCP_INSTRUCTIONS).not.toContain('never state, confirm or deny');
  });

  it('surface-specific mechanics stay with their surface', () => {
    for (const own of ['OFFLINE MODE', 'create_browser_handoff', 'SKILL FRESHNESS']) {
      expect(MCP_INSTRUCTIONS).toContain(own);
      expect(EDITOR_MODEL).not.toContain(own);
    }
    for (const own of ['DRAFT PIPELINE', 'REPLY STYLE']) {
      expect(CHAT_IDENTITY).toContain(own);
      expect(EDITOR_MODEL).not.toContain(own);
    }
  });

  it('L0 stays small — it is a base, not a dumping ground', () => {
    const l0 = [EDITOR_MODEL, contentIsNotCommand('x'), stateDiscipline('s', 'h'), ON_SCREEN_LANGUAGE, IDENTITY_DISCIPLINE].join('');
    expect(l0.length).toBeLessThan(CHAT_IDENTITY.length);
  });
});
