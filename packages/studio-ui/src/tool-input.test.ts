import { describe, expect, it } from 'vitest';
import { toolInputObject } from '@pireel/studio-ui/tool-input';

describe('tool input', () => {
  it('reads double-encoded arguments as the object they carry', () => {
    expect(toolInputObject('{"direction":"开场直接进入主题"}')).toEqual({ direction: '开场直接进入主题' });
    expect(toolInputObject({ a: 1 })).toEqual({ a: 1 });
    for (const value of [undefined, null, '[1]', 'not json', 3, [1]]) expect(toolInputObject(value)).toEqual({});
  });
});
