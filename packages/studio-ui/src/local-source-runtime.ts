interface SourceRuntimeIndex {
  has(sourceUrl: string): boolean;
}

interface PrimarySourceEngine<T> {
  setSource(key: string, source: T | null): void;
  seek(atSec: number): void;
}

/** Publish primary bytes to every synchronous runtime owner before React schedules a render.
 * Agent imports can add the timeline and ask for the current frame inside one async turn; leaving
 * the ref/decoder behind state made that interval render as a blank canvas. */
export function activatePrimarySourceDecoder<T>(options: {
  source: T;
  sourceRef: { current: T | null };
  engine: PrimarySourceEngine<T> | null;
  atSec: number;
  publish: (source: T) => void;
}): void {
  options.sourceRef.current = options.source;
  options.engine?.setSource('main', options.source);
  options.engine?.seek(options.atSec);
  options.publish(options.source);
}

export function sourceRuntimeIsLive(
  sourceUrl: string,
  options: {
    primarySourceUrl?: string | null;
    primaryFileLoaded: boolean;
    runtimeFileUrls: SourceRuntimeIndex;
  },
): boolean {
  const runtimeLoaded = options.runtimeFileUrls.has(sourceUrl);
  if (sourceUrl === options.primarySourceUrl) {
    // A generic clip URL proves that bytes exist, not that the resident primary decoder owns them.
    // Treating that as live hides a blank canvas behind an apparently healthy timeline.
    return options.primaryFileLoaded || !sourceUrl.startsWith('blob:');
  }
  return runtimeLoaded || !sourceUrl.startsWith('blob:');
}

export function resolvePrimaryLocalSig(options: {
  sessionSig?: string | null;
  assetLocalSig?: string | null;
  loadedFileSig?: string | null;
}): string | null {
  return options.sessionSig ?? options.assetLocalSig ?? options.loadedFileSig ?? null;
}

/** Decide whether mounting primary bytes is a runtime reconnect instead of a destructive source
 * import. Newer documents keep the durable identity on the primary asset, while older project
 * rows may have no top-level videoSig. Treat either identity as authoritative so a delayed OPFS
 * restore can never rebuild an already-hydrated timeline. */
export function shouldReconnectPrimarySource(options: {
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
