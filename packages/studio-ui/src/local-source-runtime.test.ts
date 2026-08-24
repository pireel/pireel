import { describe, expect, it } from 'vitest';
import {
  activatePrimarySourceDecoder,
  resolvePrimaryLocalSig,
  shouldReconnectPrimarySource,
  sourceRuntimeIsLive,
} from './local-source-runtime';

describe('local source runtime identity', () => {
  it('does not mistake a generic clip runtime for the resident primary decoder', () => {
    expect(sourceRuntimeIsLive('blob:chat-primary', {
      primarySourceUrl: 'blob:chat-primary',
      primaryFileLoaded: false,
      runtimeFileUrls: new Set(['blob:chat-primary']),
    })).toBe(false);
  });

  it('still reports a primary blob URL missing when neither runtime owns its bytes', () => {
    expect(sourceRuntimeIsLive('blob:missing-primary', {
      primarySourceUrl: 'blob:missing-primary',
      primaryFileLoaded: false,
      runtimeFileUrls: new Set(),
    })).toBe(false);
  });

  it('uses the canonical primary asset sig before React restores the legacy session ref', () => {
    expect(resolvePrimaryLocalSig({
      sessionSig: null,
      assetLocalSig: 'teacher.mov:1024:8',
      loadedFileSig: null,
    })).toBe('teacher.mov:1024:8');
  });

  it('reconnects a hydrated primary asset when the legacy project videoSig is absent', () => {
    expect(shouldReconnectPrimarySource({
      candidateSig: 'teacher.mov:1024:8',
      pendingVideoSig: null,
      assetLocalSig: 'teacher.mov:1024:8',
    })).toBe(true);
  });

  it('still treats a genuinely different source as a new import', () => {
    expect(shouldReconnectPrimarySource({
      candidateSig: 'replacement.mov:2048:9',
      pendingVideoSig: 'teacher.mov:1024:8',
      assetLocalSig: 'teacher.mov:1024:8',
    })).toBe(false);
  });

  it('mounts primary bytes in the ref and resident decoder before publishing React state', () => {
    const order: string[] = [];
    const source = { name: 'teacher.mov' };
    const sourceRef = { current: null as typeof source | null };
    const engine = {
      setSource: (key: string, mounted: typeof source | null) => {
        expect(key).toBe('main');
        expect(mounted).toBe(source);
        expect(sourceRef.current).toBe(source);
        order.push('source');
      },
      seek: (atSec: number) => {
        expect(atSec).toBe(3.2);
        order.push('seek');
      },
    };

    activatePrimarySourceDecoder({
      source,
      sourceRef,
      engine,
      atSec: 3.2,
      publish: (mounted) => {
        expect(mounted).toBe(source);
        expect(sourceRef.current).toBe(source);
        order.push('publish');
      },
    });

    expect(order).toEqual(['source', 'seek', 'publish']);
  });
});
