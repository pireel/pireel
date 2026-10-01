/** Small XML and timebase helpers shared by the interchange writers. */

export const xmlText = (value: string | number): string =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const xmlAttr = (value: string | number): string => xmlText(value).replace(/"/g, '&quot;');

/** A package path as a file URL under `rootUrl` (which ends with "/"); each segment percent-encoded. */
export function fileUrl(rootUrl: string, path: string): string {
  return rootUrl + path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

export interface Timebase {
  /** Nominal integer rate (30 for 29.97). */
  timebase: number;
  /** NTSC rate reduction (x1000/1001). */
  ntsc: boolean;
  /** One frame as a rational, seconds = num / den. */
  frameNum: number;
  frameDen: number;
}

export function timebaseOf(fps: number): Timebase {
  const nominal = Math.round(fps);
  const ntsc = Math.abs(fps - nominal) > 1e-3 && Math.abs(fps - (nominal * 1000) / 1001) < 0.01;
  return ntsc
    ? { timebase: nominal, ntsc: true, frameNum: 1001, frameDen: nominal * 1000 }
    : { timebase: nominal, ntsc: false, frameNum: 1, frameDen: nominal };
}

export const secondsToFrames = (seconds: number, fps: number): number => Math.round(seconds * fps);
