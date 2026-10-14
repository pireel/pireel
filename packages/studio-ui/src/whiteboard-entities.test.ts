import { expect, it } from 'vitest';
import { readWhiteboardEntities } from './whiteboard-entities';
const base = { id: 'person', name: '真实人物', kind: 'person', beatIds: ['intro'], queries: [], status: 'selected', assetId: 'portrait', treatment: 'person-cutout', reason: '已检查原片中的人物照片并确认身份。' };
const parse = (rows: unknown) => readWhiteboardEntities(rows, new Set(['intro']), new Set(['portrait']));
it('preserves registered real material provenance without requiring a redundant search', () => {
  expect(parse([base]).entities?.[0]).toEqual(base);
  expect(parse([{ ...base, assetId: 'invented' }]).error).toContain('register');
  expect(parse([{ ...base, beatIds: ['missing'] }]).error).toBeTruthy();
  expect(parse([base, base]).error).toBeTruthy();
});
it('accepts bounded failed retrieval only with an explicit fallback and never a false asset claim', () => {
  const fallback = { ...base, status: 'fallback', assetId: undefined, queries: ['真实人物 portrait'], reason: '检索无可靠身份匹配，使用姓名节点及口播明确的关系线。' };
  expect(parse([fallback]).error).toBeUndefined();
  expect(parse([{ ...fallback, queries: [] }]).error).toBeTruthy();
  expect(parse([{ ...fallback, assetId: 'portrait' }]).error).toBeTruthy();
  expect(parse([{ ...fallback, queries: ['a', 'b', 'c'] }]).error).toBeTruthy();
  expect(parse([{ ...base, kind: 'company' }]).error).toBeTruthy();
  expect(parse([]).entities).toEqual([]);
});
