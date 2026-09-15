import { describe, expect, it, vi } from 'vitest';
import { DeferredEffectDisposer } from './cloud-project-save';

describe('DeferredEffectDisposer', () => {
  it('keeps a reused resource alive through the Strict Mode effect probe', async () => {
    const resource = {};
    const dispose = vi.fn();
    const disposer = new DeferredEffectDisposer();
    const firstSetup = disposer.retain(resource);

    disposer.release(resource, firstSetup, dispose);
    disposer.retain(resource);
    await Promise.resolve();

    expect(dispose).not.toHaveBeenCalled();
  });

  it('disposes a resource after a real unmount', async () => {
    const resource = {};
    const dispose = vi.fn();
    const disposer = new DeferredEffectDisposer();
    const setup = disposer.retain(resource);

    disposer.release(resource, setup, dispose);
    await Promise.resolve();

    expect(dispose).toHaveBeenCalledOnce();
  });

  it('still disposes the old resource when an effect dependency changes', async () => {
    const oldResource = {};
    const newResource = {};
    const disposeOld = vi.fn();
    const disposer = new DeferredEffectDisposer();
    const oldSetup = disposer.retain(oldResource);

    disposer.release(oldResource, oldSetup, disposeOld);
    disposer.retain(newResource);
    await Promise.resolve();

    expect(disposeOld).toHaveBeenCalledOnce();
  });
});
