interface SourceRuntimeIndex {
  has(sourceUrl: string): boolean;
}

export function sourceRuntimeIsLive(
  sourceUrl: string,
  options: {
    runtimeFileUrls: SourceRuntimeIndex;
  },
): boolean {
  return options.runtimeFileUrls.has(sourceUrl) || !sourceUrl.startsWith('blob:');
}

export function resolveSourceLocalSig(options: {
  sessionSig?: string | null;
  assetLocalSig?: string | null;
  loadedFileSig?: string | null;
}): string | null {
  return options.sessionSig ?? options.assetLocalSig ?? options.loadedFileSig ?? null;
}

/** Decide whether mounting source bytes is a runtime reconnect instead of a destructive import.
 * The asset signature is canonical; pendingVideoSig is accepted only at the retired DTO boundary. */
export function shouldReconnectNarrativeSource(options: {
  candidateSig: string;
  explicitReconnect?: boolean;
  pendingVideoSig?: string | null;
  assetLocalSig?: string | null;
}): boolean {
  if (options.explicitReconnect) return true;
  return (
    options.pendingVideoSig === options.candidateSig ||
    options.assetLocalSig === options.candidateSig
  );
}
