import { describe, expect, it } from 'vitest';
import {
  resolveSourceLocalSig,
  shouldReconnectNarrativeSource,
  sourceRuntimeIsLive,
} from './local-source-runtime';

describe('local source runtime identity', () => {
  it('reports a local source live when its bytes are in the shared runtime map', () => {
    expect(sourceRuntimeIsLive('blob:chat-primary', {
      runtimeFileUrls: new Set(['blob:chat-primary']),
    })).toBe(true);
  });

  it('reports a blob URL missing when the shared runtime does not own its bytes', () => {
    expect(sourceRuntimeIsLive('blob:missing-primary', {
      runtimeFileUrls: new Set(),
    })).toBe(false);
  });

  it('uses the canonical asset sig before React restores the legacy session ref', () => {
    expect(resolveSourceLocalSig({
      sessionSig: null,
      assetLocalSig: 'teacher.mov:1024:8',
      loadedFileSig: null,
    })).toBe('teacher.mov:1024:8');
  });

  it('reconnects a hydrated narrative asset when the legacy project videoSig is absent', () => {
    expect(shouldReconnectNarrativeSource({
      candidateSig: 'teacher.mov:1024:8',
      pendingVideoSig: null,
      assetLocalSig: 'teacher.mov:1024:8',
    })).toBe(true);
  });

  it('still treats a genuinely different source as a new import', () => {
    expect(shouldReconnectNarrativeSource({
      candidateSig: 'replacement.mov:2048:9',
      pendingVideoSig: 'teacher.mov:1024:8',
      assetLocalSig: 'teacher.mov:1024:8',
    })).toBe(false);
  });

});
