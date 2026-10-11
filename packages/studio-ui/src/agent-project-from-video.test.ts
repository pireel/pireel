// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ save: vi.fn(), load: vi.fn(), cache: vi.fn() }));
vi.mock('./current-user', () => ({ loadCurrentUser: async () => ({ id: 'user', auth_method: 'email' }) }));
vi.mock('./media', () => ({ probeVideoFile: async () => ({ width: 1080, height: 1920, durationSec: 10 }), durableFileSig: async () => 'source-sig', fileSig: () => 'source-sig' }));
vi.mock('./local-media', () => ({ saveLocalVideo: async () => true }));
vi.mock('./local-import-session', () => ({ importLocalSource: vi.fn(), localAssetIndexEntry: vi.fn() }));
vi.mock('./use-draft-persist', () => ({ newProjectId: () => 'project-model', serverSaveProject: mocks.save, serverLoadProject: mocks.load, cacheProjectLocally: mocks.cache }));
import { createAgentProjectFromVideo, takeAgentStartPrompt } from './agent-project-from-video';
import type { StudioAgentModelId } from '@pireel/studio-engine/agent-models';
import { normalizeStoredThreads } from './chat-thread-store';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });
describe('homepage Agent launch model', () => {
  it.each<StudioAgentModelId>(['auto', 'deepseek', 'opus', 'sonnet', 'gpt-sol'])('persists %s with the project before handing off its first prompt', async agentModel => {
    URL.createObjectURL = vi.fn(() => 'blob:source'); URL.revokeObjectURL = vi.fn();
    let stored: unknown;
    mocks.save.mockImplementation(async (id, payload) => {
      stored = { id, document: payload.transactions[0].ops[0].input.document };
      return { status: 'saved', applied: [payload.transactions[0].id] };
    });
    mocks.load.mockImplementation(async () => JSON.parse(JSON.stringify(stored)));
    await createAgentProjectFromVideo(new File(['source'], 'demo.mp4', { type: 'video/mp4' }), { brand: null, skills: ['rough-cut', 'captions'], prompt: '剪辑这条视频', agentModel });
    expect(mocks.cache).toHaveBeenLastCalledWith(expect.objectContaining({ document: expect.objectContaining({ semantics: expect.objectContaining({ agentModel }) }) }));
    expect(takeAgentStartPrompt('project-model')).toBe('剪辑这条视频');
  });
  it('does not replace a saved chat model with the project launch default', () => {
    const [chat] = normalizeStoredThreads([{ id: 'chat', title: 'Edit', messages: [], updatedAt: 1, agentModel: 'sonnet' }]);
    expect(chat.agentModel).toBe('sonnet');
  });
});
