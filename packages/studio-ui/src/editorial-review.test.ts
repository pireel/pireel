import { describe, expect, it } from 'vitest';
import { editorialBriefFaceRequirements, editorialContentRoleUsesFaceGates } from './editorial-review';

describe('editorialBriefFaceRequirements', () => {
  it('allows back and side views in a female-lead brief while enforcing visible mouth state', () => {
    expect(editorialBriefFaceRequirements(
      '大女主风格，人物明确；正脸、侧脸和背影都可用，脸部可见时不得张嘴。',
    )).toEqual({ requiresClosedMouth: true, requiresSoloSubject: false });
  });

  it('activates the competing-face gate only for an explicit one-person requirement', () => {
    expect(editorialBriefFaceRequirements('只允许单人主体，不得出现其他人物。')).toEqual({
      requiresClosedMouth: false,
      requiresSoloSubject: true,
    });
  });
});

describe('editorialContentRoleUsesFaceGates', () => {
  it('does not apply protagonist mouth rules to environment, detail or transition material', () => {
    expect(editorialContentRoleUsesFaceGates('environment')).toBe(false);
    expect(editorialContentRoleUsesFaceGates('detail')).toBe(false);
    expect(editorialContentRoleUsesFaceGates('transition')).toBe(false);
    expect(editorialContentRoleUsesFaceGates('person-primary')).toBe(true);
    expect(editorialContentRoleUsesFaceGates('mixed')).toBe(true);
  });
});
