export interface NarrativeSourceRuntime {
  file: File;
  url: string;
  sig: string;
  durationSec: number;
}

/** Narrative sources have one runtime registration path regardless of lane order. */
export function registerNarrativeSourceRuntime(input: {
  source: NarrativeSourceRuntime;
  clipFiles: Map<string, File>;
}): 'clip' {
  input.clipFiles.set(input.source.url, input.source.file);
  return 'clip';
}
