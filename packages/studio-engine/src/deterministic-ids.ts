/**
 * Ids minted while a document transaction is applied must come out the same on every host that
 * replays it. The editor applies a transaction locally and reports the new ids in its receipt; the
 * server replays the same operations onto the stored document. A generator that reads a clock or a
 * per-process counter yields a different id on the server, and the next divergence check makes the
 * editor adopt the server's copy — the ids the agent was just told stop existing.
 *
 * Inside `withDeterministicIds(seed, fn)` every generator that calls `mintIdSuffix` derives its
 * counter and suffix from the seed (the transaction id, unique per project) instead of the clock.
 * Outside a scope generators keep their clock-based fallback, so ad-hoc callers are unaffected.
 */

let scope: { seed: string; count: number } | null = null;

export function withDeterministicIds<T>(seed: string, fn: () => T): T {
  const previous = scope;
  scope = { seed, count: 0 };
  try {
    return fn();
  } finally {
    scope = previous;
  }
}

export function deterministicIdsActive(): boolean {
  return scope !== null;
}

/** FNV-1a over the seed and ordinal, base-36: short, selector-safe, stable across runtimes. */
function fnv1a36(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * The `<ordinal>_<suffix>` tail of a generated id. Scoped: ordinal and suffix follow the seed.
 * Unscoped: the caller's own counter and clock-based suffix, unchanged from before.
 */
export function mintIdSuffix(fallback: () => { ordinal: number; suffix: string }): string {
  if (scope) {
    scope.count += 1;
    return `${scope.count}_${fnv1a36(`${scope.seed}:${scope.count}`)}`;
  }
  const { ordinal, suffix } = fallback();
  return `${ordinal}_${suffix}`;
}
