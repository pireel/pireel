import { describe, expect, it } from 'vitest';
import type { EditingRunConfig } from '@pireel/studio-engine/editing-run-config';
import { needsDirectorPlan } from './editing-task-review';

const task = (skills: string[], visual: Partial<NonNullable<EditingRunConfig['visual']>> = {}) => ({ skills, config: { skills, visual } as unknown as EditingRunConfig });
const oneClick = { oneClick: true, wholeWhiteboard: false };

describe('director plan', () => {
  it('is drawn up for creative work only', () => {
    expect(needsDirectorPlan(task(['rough-cut', 'captions', 'voice-cleanup', 'cover']), oneClick)).toBe(false);
    for (const skill of ['graphics', 'b-roll', 'sound']) expect(needsDirectorPlan(task(['rough-cut', skill]), oneClick)).toBe(true);
    expect(needsDirectorPlan(task(['rough-cut'], { zoom: true }), oneClick)).toBe(true);
    expect(needsDirectorPlan(task(['rough-cut'], { headlines: true }), oneClick)).toBe(true);
  });

  it('is always drawn up for a whole whiteboard, and never for an ordinary request', () => {
    expect(needsDirectorPlan(task([]), { oneClick: false, wholeWhiteboard: true })).toBe(true);
    expect(needsDirectorPlan(task(['graphics']), { oneClick: false, wholeWhiteboard: false })).toBe(false);
  });
});
