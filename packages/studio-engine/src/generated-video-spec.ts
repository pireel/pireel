/** Shared canvas-derived video generation defaults for browser and server agents. */
export function adaptiveGeneratedVideoSpec(width: number, height: number): {
  aspectRatio: '9:16' | '16:9' | '1:1';
  resolution: '480p' | '720p' | '1080p';
} {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1080;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 1920;
  const ratio = safeWidth / safeHeight;
  const candidates = [
    { aspectRatio: '9:16' as const, ratio: 9 / 16 },
    { aspectRatio: '1:1' as const, ratio: 1 },
    { aspectRatio: '16:9' as const, ratio: 16 / 9 },
  ];
  const aspectRatio = candidates
    .slice()
    .sort((a, b) => Math.abs(Math.log(ratio / a.ratio)) - Math.abs(Math.log(ratio / b.ratio)))[0]!
    .aspectRatio;
  const shortSide = Math.min(safeWidth, safeHeight);
  const resolution = shortSide >= 1080 ? '1080p' : shortSide >= 720 ? '720p' : '480p';
  return { aspectRatio, resolution };
}
