'use client';

export interface OfficialAssetSemanticResult {
  query?: string;
  mode: 'semantic' | 'metadata';
  results: Array<{ assetId: string; kind?: string; score: number }>;
}

const CACHE_TTL_MS = 5 * 60_000;
const MAX_CACHE_ENTRIES = 80;
const resultCache = new Map<string, { expiresAt: number; value: OfficialAssetSemanticResult }>();

function remember(key: string, value: OfficialAssetSemanticResult): void {
  while (resultCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = resultCache.keys().next().value as string | undefined;
    if (!oldest) break;
    resultCache.delete(oldest);
  }
  resultCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
}

/** Cloud-ranked official ids shared by the panel and the open-tab Agent. The cache is deliberately
 * browser-local and bounded: official results can be reused without retaining private asset data. */
export async function searchOfficialAssetDocuments(args: {
  query: string;
  kind: 'all' | 'image' | 'video' | 'audio' | 'element';
  limit: number;
  signal?: AbortSignal;
}): Promise<OfficialAssetSemanticResult | null> {
  const query = args.query.trim();
  if (!query) return null;
  const key = `${args.kind}:${args.limit}:${query.toLocaleLowerCase()}`;
  const cached = resultCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) resultCache.delete(key);

  const params = new URLSearchParams({ q: query, limit: String(args.limit) });
  if (args.kind !== 'all') params.set('kind', args.kind);
  try {
    const response = await fetch(`/api/studio/official-assets/search?${params}`, { signal: args.signal });
    if (!response.ok) return null;
    const value = await response.json() as OfficialAssetSemanticResult;
    remember(key, value);
    return value;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return null;
  }
}
