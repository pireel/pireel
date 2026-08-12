import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CloudProjectSaveQueue,
  DeferredEffectDisposer,
  type CloudProjectSaveResult,
} from './cloud-project-save';

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

describe('CloudProjectSaveQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function queueWith(results: CloudProjectSaveResult[]) {
    const pending = [...results];
    const save = vi.fn(async () => pending.shift() ?? 'ok');
    const queue = new CloudProjectSaveQueue({
      getPayload: () => ({ title: 'latest' }),
      save,
      canWrite: () => true,
    });
    return { queue, save };
  }

  it('retries a last failed save without requiring another edit', async () => {
    const { queue, save } = queueWith(['skip', 'ok']);
    queue.markDirty();

    await queue.flush();
    expect(queue.hasPendingSave).toBe(true);
    expect(save).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1_000);
    await queue.whenIdle();
    expect(save).toHaveBeenCalledTimes(2);
    expect(queue.hasPendingSave).toBe(false);
  });

  it('observes the conflict retry and retries again when that request fails', async () => {
    const onConflict = vi.fn();
    const results: CloudProjectSaveResult[] = ['conflict', 'skip', 'ok'];
    const save = vi.fn(async () => results.shift() ?? 'ok');
    const queue = new CloudProjectSaveQueue({
      getPayload: () => ({ title: 'latest' }),
      save,
      canWrite: () => true,
      onConflict,
    });
    queue.markDirty();

    await queue.flush();
    expect(onConflict).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledTimes(2);
    expect(queue.hasPendingSave).toBe(true);

    await vi.advanceTimersByTimeAsync(1_000);
    await queue.whenIdle();
    expect(save).toHaveBeenCalledTimes(3);
    expect(queue.hasPendingSave).toBe(false);
  });

  it('keeps edits dirty while writing is disabled and flushes after reclaim', async () => {
    let canWrite = false;
    const save = vi.fn(async () => 'ok' as const);
    const queue = new CloudProjectSaveQueue({
      getPayload: () => ({ title: 'latest' }),
      save,
      canWrite: () => canWrite,
    });
    queue.markDirty();

    await queue.flush();
    expect(save).not.toHaveBeenCalled();
    expect(queue.hasPendingSave).toBe(true);

    canWrite = true;
    await queue.flush();
    expect(save).toHaveBeenCalledOnce();
    expect(queue.hasPendingSave).toBe(false);
  });

  it('flushes a newer edit made while the previous request is in flight', async () => {
    let finishFirst: ((result: CloudProjectSaveResult) => void) | undefined;
    const first = new Promise<CloudProjectSaveResult>((resolve) => {
      finishFirst = resolve;
    });
    const save = vi.fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValue('ok');
    const queue = new CloudProjectSaveQueue({
      getPayload: () => ({ title: 'latest' }),
      save,
      canWrite: () => true,
    });
    queue.markDirty();
    const firstFlush = queue.flush();
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());

    queue.markDirty();
    void queue.flush();
    finishFirst?.('ok');
    await firstFlush;
    await queue.whenIdle();

    expect(save).toHaveBeenCalledTimes(2);
    expect(queue.hasPendingSave).toBe(false);
  });

  it('stops retrying when the server requires a schema reload', async () => {
    const onSchemaUpgrade = vi.fn();
    const save = vi.fn(async () => 'schema-upgraded' as const);
    const queue = new CloudProjectSaveQueue({
      getPayload: () => ({ title: 'latest' }),
      save,
      canWrite: () => true,
      onSchemaUpgrade,
    });
    queue.markDirty();

    await queue.flush();
    await vi.runAllTimersAsync();
    expect(onSchemaUpgrade).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
  });

  it('does not continue a conflicted save after the queue is disposed', async () => {
    let finishSave: ((result: CloudProjectSaveResult) => void) | undefined;
    const first = new Promise<CloudProjectSaveResult>((resolve) => {
      finishSave = resolve;
    });
    const onConflict = vi.fn();
    const save = vi.fn().mockImplementationOnce(() => first).mockResolvedValue('ok');
    const queue = new CloudProjectSaveQueue({
      getPayload: () => ({ title: 'old project' }),
      save,
      canWrite: () => true,
      onConflict,
    });
    queue.markDirty();
    const flushing = queue.flush();
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());

    queue.dispose();
    finishSave?.('conflict');
    await flushing;

    expect(save).toHaveBeenCalledOnce();
    expect(onConflict).not.toHaveBeenCalled();
  });
});
