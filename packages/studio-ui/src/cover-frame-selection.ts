import { primaryNarrativeClips, type EditorDocumentV2 } from '@pireel/studio-engine/composition';

export interface CoverSourceFrame { assetId: string; sourceSec: number; timelineSec?: number }
export interface CoverFrameRange { assetId: string; startSec: number; endSec: number; sourceInSec: number; sourceOutSec: number }
export interface CoverFrameSample extends CoverSourceFrame { timelineSec: number; url: string }
export interface CoverFrameStripData { frames: CoverFrameSample[]; ranges: CoverFrameRange[]; durationSec: number; fps: number }

export function coverFrameRanges(document: EditorDocumentV2): CoverFrameRange[] {
  return primaryNarrativeClips(document).filter(clip => clip.enabled && document.assets[clip.assetId]?.kind === 'video').map(clip => ({ assetId: clip.assetId, startSec: clip.startFrame / document.canvas.fps, endSec: (clip.startFrame + clip.durationFrames) / document.canvas.fps, sourceInSec: clip.sourceInSec, sourceOutSec: clip.sourceOutSec })).sort((a, b) => a.startSec - b.startSec);
}
/** A time in the edited video maps to a retained source frame, including retiming and timeline gaps. */
export function coverFrameAtTime(ranges: readonly CoverFrameRange[], timelineSec: number, fps: number): CoverSourceFrame | null {
  if (!ranges.length || !Number.isFinite(timelineSec) || !(fps > 0)) return null;
  const distance = (range: CoverFrameRange) => timelineSec < range.startSec ? range.startSec - timelineSec : timelineSec >= range.endSec ? timelineSec - range.endSec : 0;
  const range = ranges.find(range => timelineSec >= range.startSec && timelineSec < range.endSec) ?? [...ranges].sort((a, b) => distance(a) - distance(b))[0]!;
  const at = Math.min(Math.max(range.startSec, Math.round(timelineSec * fps) / fps), Math.max(range.startSec, range.endSec - 1 / fps));
  const rate = (range.sourceOutSec - range.sourceInSec) / (range.endSec - range.startSec);
  return { assetId: range.assetId, sourceSec: range.sourceInSec + (at - range.startSec) * rate, timelineSec: at };
}
export function retainedCoverFrame(document: EditorDocumentV2, frame: CoverSourceFrame): boolean {
  return Number.isFinite(frame.sourceSec) && coverFrameRanges(document).some(range => range.assetId === frame.assetId && frame.sourceSec >= range.sourceInSec && frame.sourceSec < range.sourceOutSec);
}
export function coverFrameTime(ranges: readonly CoverFrameRange[], frame?: CoverSourceFrame): number {
  if (!frame) return 0;
  const range = ranges.find(range => range.assetId === frame.assetId && frame.sourceSec >= range.sourceInSec && frame.sourceSec < range.sourceOutSec && (frame.timelineSec === undefined || frame.timelineSec >= range.startSec && frame.timelineSec < range.endSec));
  return range ? range.startSec + (frame.sourceSec - range.sourceInSec) / (range.sourceOutSec - range.sourceInSec) * (range.endSec - range.startSec) : 0;
}

/** Thumbnail URLs are runtime-only; persist just the media identity and exact selected moment. */
export function coverFrameIdentity(frame: CoverSourceFrame): CoverSourceFrame {
  return { assetId: frame.assetId, sourceSec: frame.sourceSec, ...(Number.isFinite(frame.timelineSec) ? { timelineSec: frame.timelineSec } : {}) };
}
