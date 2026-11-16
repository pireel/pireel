import { describe, expect, it } from 'vitest';
import { canonicalEqual, canonicalHash, canonicalJson, hashSection } from './stable-json';

/** The serialization as it was first written: the text every stored hash was made from. */
function reference(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => reference(item)).join(',')}]`;
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).filter((key) => object[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${reference(object[key])}`).join(',')}}`;
}

/** A small deterministic generator, so a failure names the same value on every run. */
function generator(seed: number) {
  let state = seed >>> 0;
  const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const leaves: unknown[] = [null, undefined, true, false, 0, -0, 1, -1.5, 1e21, 1e-7, NaN, Infinity, '', 'a', '中文', 'quote"d', 'line\nbreak', ' ', 'undefined', 'null', '{}'];
  const keys = ['a', 'b', 'id', 'startFrame', '中', '10', '2', 'a"b', '', 'toString', 'constructor'];
  const value = (depth: number): unknown => {
    const roll = next();
    if (depth <= 0 || roll < 0.35) return pick(leaves);
    if (roll < 0.65) return Array.from({ length: Math.floor(next() * 5) }, () => value(depth - 1));
    const object: Record<string, unknown> = {};
    for (let count = Math.floor(next() * 5); count > 0; count -= 1) object[pick(keys)] = value(depth - 1);
    return object;
  };
  /** The same content again: keys in another order, missing keys spelled `undefined`, shared or copied parts. */
  const again = (source: unknown): unknown => {
    if (source === null || typeof source !== 'object') return source;
    if (next() < 0.3) return source;
    if (Array.isArray(source)) return source.map(again);
    const entries = Object.entries(source as Record<string, unknown>).map(([key, item]) => [key, again(item)] as const);
    if (next() < 0.5) entries.reverse();
    const copy: Record<string, unknown> = Object.fromEntries(entries);
    if (next() < 0.3) copy.absent = undefined;
    return copy;
  };
  /** A copy with one thing different somewhere inside. */
  const changed = (source: unknown): unknown => {
    if (source === null || typeof source !== 'object') return typeof source === 'string' ? `${source}!` : 'changed';
    if (Array.isArray(source)) {
      if (!source.length || next() < 0.3) return [...source, 0];
      const at = Math.floor(next() * source.length);
      return source.map((item, index) => (index === at ? changed(item) : item));
    }
    const record = source as Record<string, unknown>;
    const present = Object.keys(record).filter((key) => record[key] !== undefined);
    if (!present.length || next() < 0.3) return { ...record, added: 1 };
    const key = pick(present);
    return { ...record, [key]: changed(record[key]) };
  };
  return { value, again, changed };
}

describe('canonical JSON', () => {
  it('writes exactly what it always wrote', () => {
    const { value } = generator(7);
    for (let round = 0; round < 3000; round += 1) {
      const sample = value(5);
      expect(canonicalJson(sample)).toBe(reference(sample));
    }
  });

  it('sorts keys, drops undefined fields and writes what has no JSON as it did', () => {
    expect(canonicalJson({ b: 1, a: [undefined, null, NaN], c: undefined })).toBe('{"a":[null,null,null],"b":1}');
    expect(canonicalJson(undefined)).toBe('null');
    expect(canonicalJson('text')).toBe('"text"');
    const sparse = [1, , 3]; // eslint-disable-line no-sparse-arrays
    expect(canonicalJson(sparse)).toBe(reference(sparse));
    const odd = { run: () => 1, when: new Date(0), mark: Symbol('x') };
    expect(canonicalJson(odd)).toBe(reference(odd));
  });

  it('keeps the hash of a document it serialized before', () => {
    const document = { timeline: { tracks: [{ id: 't1', clips: [{ id: 'c1', startFrame: 0, durationFrames: 90 }] }] }, canvas: { fps: 30, width: 1080 } };
    expect(hashSection(canonicalJson(document))).toBe(hashSection(reference(document)));
  });
});

describe('canonical hash', () => {
  it('is the hash of the serialization, without writing it', () => {
    const { value } = generator(13);
    for (let round = 0; round < 3000; round += 1) {
      const sample = value(5);
      expect(canonicalHash(sample), reference(sample)).toBe(hashSection(reference(sample)));
    }
  });

  it('hashes text that JSON escapes as JSON writes it', () => {
    for (const text of ['plain', '中文字幕', 'say "hi"', 'back\\slash', 'tab\there', '\u0000', '\u001f', '\u007f', '  ', '😀 pair', '\ud83d lone', '\ude00']) {
      expect(canonicalHash({ text, list: [text] }), JSON.stringify(text)).toBe(hashSection(reference({ text, list: [text] })));
    }
  });
});

describe('canonical equality', () => {
  it('agrees with comparing the two serializations', () => {
    const { value, again, changed } = generator(11);
    let equal = 0; let different = 0;
    for (let round = 0; round < 3000; round += 1) {
      const sample = value(5);
      for (const other of [again(sample), changed(sample), value(3)]) {
        const expected = reference(sample) === reference(other);
        if (expected) equal += 1; else different += 1;
        expect(canonicalEqual(sample, other), `${reference(sample)} against ${reference(other)}`).toBe(expected);
        expect(canonicalEqual(other, sample)).toBe(expected);
      }
    }
    expect(equal).toBeGreaterThan(1000);
    expect(different).toBeGreaterThan(1000);
  });

  it('reads the cases a document meets', () => {
    expect(canonicalEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(canonicalEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(canonicalEqual({ a: null }, {})).toBe(false);
    expect(canonicalEqual([undefined], [null])).toBe(true);
    expect(canonicalEqual(undefined, null)).toBe(true);
    expect(canonicalEqual([], {})).toBe(false);
    expect(canonicalEqual({ toString: 1 }, {})).toBe(false);
    expect(canonicalEqual({}, { toString: 1 })).toBe(false);
    expect(canonicalEqual(NaN, null)).toBe(true);
    expect(canonicalEqual('1', 1)).toBe(false);
    const sparse = [1, , 3]; // eslint-disable-line no-sparse-arrays
    expect(canonicalEqual(sparse, [1, undefined, 3])).toBe(false);
    expect(canonicalEqual(sparse, [1, , 3])).toBe(true); // eslint-disable-line no-sparse-arrays
  });

  it('does not look into what the two values share', () => {
    let read = 0;
    const shared = new Proxy({ words: [1, 2, 3] }, { ownKeys(target) { read += 1; return Reflect.ownKeys(target); } });
    const before = { transcripts: shared, canvas: { fps: 30 } };
    const after = { transcripts: shared, canvas: { fps: 30 } };
    expect(canonicalEqual(before, after)).toBe(true);
    expect(read).toBe(0);
  });
});
