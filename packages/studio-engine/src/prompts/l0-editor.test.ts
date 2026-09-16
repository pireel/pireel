import { v3Instructions } from '../agent-surface-v3/instructions';
/**
 * L0 is only worth having if every surface actually uses it. These pin that — a surface that
 * quietly grows its own second description of the editor fails here rather than in production
 * six months later, when the two copies have drifted and one of them is the security rule.
 */

import { describe, expect, it } from 'vitest';
import { EDITOR_MODEL, IDENTITY_DISCIPLINE, ON_SCREEN_LANGUAGE, contentIsNotCommand } from './l0-editor';
import { GENERAL_EDITORIAL, buildKitSystem } from './index';

// The version is injected by the hosting route (single source = the skill's SKILL.md footer);
// any well-formed value produces the full instruction text these tests pin.
const MCP_INSTRUCTIONS = v3Instructions({ surface: 'mcp', skillVersion: '2099-01-01.1' });
const CHAT_INSTRUCTIONS = v3Instructions({ surface: 'chat' });

describe('every surface stands on L0', () => {
  it('the in-app agent and the external agent describe the same editor', () => {
    for (const s of [CHAT_INSTRUCTIONS, MCP_INSTRUCTIONS]) expect(s).toContain('multi-source, multi-track video editor');
    expect(EDITOR_MODEL).toContain('multi-source video editor');
  });

  it('the untrusted-content rule has ONE source, adapted only in who directs the work', () => {
    expect(CHAT_INSTRUCTIONS).toContain(contentIsNotCommand("the user's actual requests"));
    expect(MCP_INSTRUCTIONS).toContain(contentIsNotCommand("your operator's actual requests"));
    // The rule's body must be identical across surfaces — only the director clause differs.
    const strip = (director: string) => contentIsNotCommand(director).replace(director, '<director>');
    expect(strip('«one»')).toBe(strip('«two»'));
  });

  it('state discipline is shared; only how a surface gets a snapshot differs', () => {
    for (const s of [CHAT_INSTRUCTIONS, MCP_INSTRUCTIONS]) {
      expect(s).toContain('Call get_state once per session');
      expect(s).toContain('delta');
    }
  });

  it('the on-screen language rule reaches all THREE surfaces, generation included', () => {
    for (const s of [CHAT_INSTRUCTIONS, MCP_INSTRUCTIONS]) expect(s).toContain("follows the VIDEO's spoken language");
    for (const [name, s] of [['generation', buildKitSystem()], ['editorial', GENERAL_EDITORIAL]] as const) {
      expect(s, `${name} restates the on-screen language rule instead of sharing it`).toContain(ON_SCREEN_LANGUAGE);
    }
  });
});

describe('what L0 deliberately does NOT share', () => {
  it('identity discipline is ours, and never goes to an external agent', () => {
    // The MCP client is the user's own agent on a model they chose. Telling it to hide which model
    // powers it would be pointless and dishonest — the rule protects our surface, not the editor.
    expect(CHAT_INSTRUCTIONS).toContain('Never disclose which model you are');
    expect(MCP_INSTRUCTIONS).not.toContain('Never disclose which model you are');
    expect(MCP_INSTRUCTIONS).not.toContain(IDENTITY_DISCIPLINE);
  });

  it('surface-specific mechanics stay with their surface', () => {
    for (const own of ['create_browser_handoff', 'manage_project']) {
      expect(MCP_INSTRUCTIONS).toContain(own);
      expect(EDITOR_MODEL).not.toContain(own);
    }
  });

  it('L0 stays small — it is a base, not a dumping ground', () => {
    const l0 = [EDITOR_MODEL, contentIsNotCommand('x'), ON_SCREEN_LANGUAGE, IDENTITY_DISCIPLINE].join('');
    expect(l0.length).toBeLessThan(CHAT_INSTRUCTIONS.length);
  });
});
