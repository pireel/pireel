import { describe, expect, it } from 'vitest';
import type { Composition } from '@pireel/studio-engine/composition';
import type { AgentToolCtx } from './agent-tool-runner';

async function runAtomicCompositionTool(ctx: AgentToolCtx, execute: () => Promise<{ ok: boolean; summary?: string; error?: string }>) {
  // agent-tool-runner also owns browser export tools; this unit only needs the transaction helper.
  // Supply the one harmless import-time DOM primitive before loading that module in Node.
  if (!('XMLSerializer' in globalThis)) {
    Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
  }
  const mod = await import('./agent-tool-runner');
  return mod.runAtomicCompositionTool(ctx, execute);
}

const composition = (): Composition => ({
  width: 1080,
  height: 1920,
  theme: 'general',
  video: null,
  blocks: [],
  shots: [{ id: 's1', srcStart: 0, srcEnd: 3, treatment: 'full' }],
});

function harness() {
  const compRef = { current: composition() };
  const undoStackRef = { current: [] as Composition[] };
  const redoStackRef = { current: [composition()] };
  const setComp = (action: Composition | ((c: Composition) => Composition)) => {
    compRef.current = typeof action === 'function' ? action(compRef.current) : action;
  };
  return { ctx: { compRef, undoStackRef, redoStackRef, setComp } as unknown as AgentToolCtx, compRef, undoStackRef, redoStackRef };
}

describe('Agent composition transaction boundary', () => {
  it('failed synchronous mutation rolls back state and both history lines', async () => {
    const h = harness();
    const redo = h.redoStackRef.current[0];
    const result = await runAtomicCompositionTool(h.ctx, async () => {
      h.undoStackRef.current.push(h.compRef.current);
      h.redoStackRef.current = [];
      h.ctx.setComp((c) => ({ ...c, width: 1920 }));
      return { ok: false, error: 'bad input' };
    });
    expect(result.ok).toBe(false);
    expect(h.compRef.current.width).toBe(1080);
    expect(h.undoStackRef.current).toEqual([]);
    expect(h.redoStackRef.current).toEqual([redo]);
  });

  it('invalid final composition rejects atomically; valid commit returns compact delta', async () => {
    const invalid = harness();
    const rejected = await runAtomicCompositionTool(invalid.ctx, async () => {
      invalid.ctx.setComp((c) => ({ ...c, shots: [...c.shots!, { ...c.shots![0]! }] }));
      return { ok: true, summary: 'candidate' };
    });
    expect(rejected.ok).toBe(false);
    expect(invalid.compRef.current.shots).toHaveLength(1);

    const valid = harness();
    const committed = await runAtomicCompositionTool(valid.ctx, async () => {
      valid.ctx.setComp((c) => ({ ...c, width: 1920, height: 1080 }));
      return { ok: true, summary: 'canvas' };
    });
    expect(committed.ok).toBe(true);
    expect((committed.data as { delta: { canvas: unknown } }).delta.canvas).toEqual({ from: [1080, 1920], to: [1920, 1080] });
  });

  it('async failure preserves a later manual edit and removes only the tool ghost snapshot', async () => {
    const h = harness();
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runAtomicCompositionTool: run } = await import('./agent-tool-runner');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const pending = run(h.ctx, async () => {
      h.undoStackRef.current.push(h.compRef.current); // raw tool snapshot
      h.redoStackRef.current = [];
      await gate;
      return { ok: false, error: 'provider failed' };
    });
    h.undoStackRef.current.push(h.compRef.current); // manual edit snapshot
    h.ctx.setComp((c) => ({ ...c, width: 1440 }));
    release();
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(h.compRef.current.width).toBe(1440);
    expect(h.undoStackRef.current).toHaveLength(1);
  });
});
