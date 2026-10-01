/** Export a timeline other editors can keep editing: Premiere / Resolve (xmeml), Final Cut / Resolve (FCPXML), subtitles (SRT). */
export { buildNleTimeline, nleAssetName } from './timeline';
export type { BuildNleTimelineOptions, NleClip, NleMedia, NleMediaFile, NleNote, NleNoteCode, NlePlacement, NleTimeline, NleTrack, NleTransition } from './timeline';
export { toXmeml, type XmemlOptions } from './xmeml';
export { toFcpxml, type FcpxmlOptions } from './fcpxml';
export { toSrt, type SubtitleCue } from './srt';
