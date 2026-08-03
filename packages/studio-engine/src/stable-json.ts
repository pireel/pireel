/** Dependency-free canonical JSON + compact deterministic hash shared by project sync and jobs. */

/** Canonical serialization (object keys sorted). JSONB storage may reorder keys, so ordinary
 * JSON.stringify is not a stable cross-surface revision token. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
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
