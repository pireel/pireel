import { describe, expect, it } from 'vitest';
import { videoFrameShim } from './assemble';
import { CUT_TRANSITION_EFFECTS, DIRECTIONAL_TRANSITIONS } from './composition-core';
import { TRANSITION_GLSL } from './transition-gl';

describe('transition shaders', () => {
  it('give every listed effect a shader that follows the mixer contract', () => {
    const ids = CUT_TRANSITION_EFFECTS.map((effect) => effect.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(TRANSITION_GLSL).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      const glsl = TRANSITION_GLSL[id];
      expect(glsl, id).toMatch(/vec4\s+transition\s*\(\s*vec2\s+\w+\s*\)/);
      // progress / ratio / direction come from the mixer; parameters are baked to constants
      expect(glsl, id).not.toMatch(/^\s*uniform\b/m);
    }
    for (const id of DIRECTIONAL_TRANSITIONS) expect(TRANSITION_GLSL[id], id).toContain('direction');
  });

  it('puts only the shaders a document plays into its preview shim', () => {
    const shim = videoFrameShim([{ s: 1, e: 2, cut: 1.5, effect: 'cube', dx: 1, dy: 0 }]);
    expect(shim).toContain(JSON.stringify(TRANSITION_GLSL.cube).slice(1, 60));
    expect(shim).not.toContain(JSON.stringify(TRANSITION_GLSL.vhs).slice(1, 60));
    expect(videoFrameShim([]).length).toBeLessThan(shim.length);
  });
});
