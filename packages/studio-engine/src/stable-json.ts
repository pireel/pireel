/** Dependency-free canonical JSON + compact deterministic hash shared by project sync and jobs. */

/** A key as it is written, quoted once: a document is the same few hundred keys a million times. */
const quotedKeys = new Map<string, string>();
function quotedKey(key: string): string {
  let quoted = quotedKeys.get(key);
  if (quoted === undefined) {
    quoted = `${JSON.stringify(key)}:`;
    if (quotedKeys.size < 4096) quotedKeys.set(key, quoted);
  }
  return quoted;
}

/** An object's keys in code-unit order, as `sort()` gives them. Objects are a handful of keys
 *  each and a document is tens of thousands of objects: sorted in place here, the general sort is
 *  only called for a large object. */
function sortedKeys(object: Record<string, unknown>): string[] {
  const keys = Object.keys(object);
  if (keys.length > 24) return keys.sort();
  for (let index = 1; index < keys.length; index += 1) {
    const key = keys[index]!;
    let at = index - 1;
    if (keys[at]! <= key) continue;
    while (at >= 0 && keys[at]! > key) { keys[at + 1] = keys[at]!; at -= 1; }
    keys[at + 1] = key;
  }
  return keys;
}

/** Where the pieces of a serialization go: joined into the text, or hashed as they come. */
interface CanonicalSink {
  /** A piece of the output, as it is written. */
  text(piece: string): void;
  /** A string value, to be written quoted and escaped. */
  string(value: string): void;
}

/** One pass over the value, every piece handed to the sink: nothing is built up level by level. */
function writeCanonical(value: unknown, sink: CanonicalSink): void {
  if (value === undefined || value === null) { sink.text('null'); return; }
  if (typeof value !== 'object') {
    if (typeof value === 'string') sink.string(value);
    else if (typeof value === 'number') sink.text(Number.isFinite(value) ? String(value) : 'null');
    else if (typeof value === 'boolean') sink.text(value ? 'true' : 'false');
    // A function or a symbol has no JSON: it is written as the text `undefined`, as it always was.
    else sink.text(String(JSON.stringify(value)));
    return;
  }
  if (Array.isArray(value)) {
    sink.text('[');
    for (let index = 0; index < value.length; index += 1) {
      if (index) sink.text(',');
      // A hole in a sparse array writes nothing between its commas.
      const item: unknown = value[index];
      if (item !== undefined || index in value) writeCanonical(item, sink);
    }
    sink.text(']');
    return;
  }
  const object = value as Record<string, unknown>;
  const keys = sortedKeys(object);
  sink.text('{');
  let written = false;
  for (const key of keys) {
    const item = object[key];
    if (item === undefined) continue;
    if (written) sink.text(',');
    written = true;
    sink.text(quotedKey(key));
    writeCanonical(item, sink);
  }
  sink.text('}');
}

/** Canonical serialization (object keys sorted). JSONB storage may reorder keys, so ordinary
 * JSON.stringify is not a stable cross-surface revision token.
 *
 * Written in one pass and joined once. Joining each object and array as it closed copied every
 * character once per level it sat under: a 1.6 MB document cost 70 MB and 24 ms a call. To ask
 * whether two values are the same use canonicalEqual, and for the hash of one use canonicalHash:
 * neither writes the text at all. */
export function canonicalJson(value: unknown): string {
  const out: string[] = [];
  writeCanonical(value, { text: (piece) => { out.push(piece); }, string: (text) => { out.push(JSON.stringify(text)); } });
  return out.length === 1 ? out[0]! : out.join('');
}

/** Anything JSON writes other than as itself: quotes, backslashes, control characters, and
 *  surrogates (a lone one is escaped; a pair is rare enough to take the same road). */
// eslint-disable-next-line no-control-regex -- control characters are exactly what JSON escapes
const NEEDS_ESCAPING = /["\\\u0000-\u001f\ud800-\udfff]/;

/**
 * `hashSection(canonicalJson(value))` without the text: each piece is hashed as it is written, so
 * the hash of a document costs no memory to speak of. The editor takes it on every save.
 */
export function canonicalHash(value: unknown): string {
  let a = 0x811c9dc5;
  let b = 0x12345679;
  let length = 0;
  const text = (piece: string) => {
    for (let index = 0; index < piece.length; index += 1) {
      const code = piece.charCodeAt(index);
      a = Math.imul(a ^ code, 0x01000193);
      b = (Math.imul(b + code, 0x85ebca6b) ^ (b >>> 13)) | 0;
    }
    length += piece.length;
  };
  writeCanonical(value, {
    text,
    string: (content) => {
      if (NEEDS_ESCAPING.test(content)) { text(JSON.stringify(content)); return; }
      text('"'); text(content); text('"');
    },
  });
  return `${(a >>> 0).toString(36)}.${(b >>> 0).toString(36)}.${length}`;
}

/** What a value that is not an object or array is written as, for comparing two of them. */
function canonicalToken(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'function' || typeof value === 'symbol') return canonicalToken; // one token for "no JSON"
  return value;
}

/**
 * Whether two values have the same canonical JSON, without writing either: true exactly when
 * `canonicalJson(left) === canonicalJson(right)`. Anything the two share by reference is not
 * looked into, and an edited document shares nearly everything with the one before it, so asking
 * "did this change anything" costs what changed, not the size of the document.
 */
export function canonicalEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  const leftObject = left !== null && typeof left === 'object';
  const rightObject = right !== null && typeof right === 'object';
  if (!leftObject || !rightObject) return !leftObject && !rightObject && canonicalToken(left) === canonicalToken(right);
  const leftArray = Array.isArray(left);
  if (leftArray !== Array.isArray(right)) return false;
  if (leftArray) {
    const a = left as unknown[];
    const b = right as unknown[];
    if (a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
      const x = a[index];
      const y = b[index];
      // A hole writes nothing, an `undefined` that is there writes null: only like matches like.
      if (x === undefined || y === undefined) {
        if ((x === undefined && !(index in a)) !== (y === undefined && !(index in b))) return false;
      }
      if (x !== y && !canonicalEqual(x, y)) return false;
    }
    return true;
  }
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  let defined = 0;
  for (const key of Object.keys(a)) {
    const x = a[key];
    if (x === undefined) continue;
    defined += 1;
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    const y = b[key];
    if (y === undefined || (x !== y && !canonicalEqual(x, y))) return false;
  }
  for (const key of Object.keys(b)) if (b[key] !== undefined) defined -= 1;
  return defined === 0;
}

/** Two 32-bit rolling hashes plus length: compact enough for optimistic edit-state comparison. */
export function hashSection(value: string): string {
  let a = 0x811c9dc5;
  let b = 0x12345679;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193);
    b = (Math.imul(b + code, 0x85ebca6b) ^ (b >>> 13)) | 0;
  }
  return `${(a >>> 0).toString(36)}.${(b >>> 0).toString(36)}.${value.length}`;
}
