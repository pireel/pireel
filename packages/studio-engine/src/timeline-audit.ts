/**
 * What is wrong with an edit, read from the document alone.
 *
 * An agent edits through many small tool calls and sees the timeline only as numbers; the faults it
 * leaves are structural, and a viewer notices them at once: a sentence spoken twice, a sliver of
 * a clip between two cuts, the recording laid over itself, the same title on screen twice, a graphic
 * whose styling is gone. Each is a fact about the document, so the program can state it, at the call
 * that causes it and again before an edit is called finished, without anyone watching the video.
 *
 * Every finding names where it is and which clips it involves, in the words a receipt can carry.
 */
import type { EditorDocumentV2 } from './editor-document/types';

export type TimelineFindingCode =
  | 'spine-repeat' | 'spine-fragment' | 'self-overlay' | 'same-recording-cutaway'
  | 'graphic-duplicate' | 'caption-overlap' | 'look-unstyled' | 'broll-reuse';

export interface TimelineFinding {
  code: TimelineFindingCode;
  /** An error is a fault a viewer sees; a warning is something to look at. */
  severity: 'error' | 'warning';
  /** Where on the timeline, in frames. */
  startFrame: number;
  endFrame: number;
  clipIds: string[];
  message: string;
}

/** Source overlap under this is the same word boundary seen from two clips, not a repeat. */
const REPEAT_MIN_SEC = 0.3;
/** A spine clip shorter than this cannot hold a spoken word. */
const FRAGMENT_MAX_SEC = 0.5;
/** A cutaway of the spine's own recording this close to what plays under it is the same picture. */
const SAME_PICTURE_SEC = 0.5;
/** A cold open: the edit's first clip, one line of at most this long, which plays again in place. */
export const COLD_OPEN_MAX_SEC = 8;
/** The same footage twice within this long reads as a loop. */
const REUSE_WINDOW_SEC = 60;

type Clip = EditorDocumentV2['timeline']['tracks'][number]['clips'][number];
type SourceClip = Clip & { assetId: string; sourceInSec: number; sourceOutSec: number };
const hasSource = (clip: Clip): clip is SourceClip => 'assetId' in clip && typeof (clip as { sourceInSec?: unknown }).sourceInSec === 'number' && typeof (clip as { sourceOutSec?: unknown }).sourceOutSec === 'number';
const end = (clip: Clip) => clip.startFrame + clip.durationFrames;
const clock = (frame: number, fps: number) => { const seconds = frame / fps; return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`; };

/** The text a graphic shows, for telling two instances of the same thing apart from two different ones. */
function graphicIdentity(clip: Clip): string | null {
  if (clip.kind !== 'graphic') return null;
  const block = clip.block as { templateId?: string; slots?: Record<string, unknown> };
  const slots = block.slots ?? {};
  const said = slots.props ?? slots.texts ?? slots.innerHtml ?? slots;
  return `${block.templateId ?? ''}\u0000${JSON.stringify(said)}`;
}

export function auditTimeline(document: EditorDocumentV2): TimelineFinding[] {
  const fps = document.canvas.fps;
  const findings: TimelineFinding[] = [];
  const tracks = document.timeline.tracks;
  const spineTrack = tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId);
  const spine = (spineTrack?.clips ?? []).filter((clip): clip is SourceClip => clip.enabled !== false && hasSource(clip)).sort((a, b) => a.startFrame - b.startFrame);

  // Speech that plays twice on the story spine. Footage without words may be shown again on
  // purpose (a montage); words said twice are a fault.
  const spokenIn = (assetId: string, from: number, to: number): string => {
    const segments = (document.semantics.transcripts?.[assetId] ?? []) as Array<{ start: number; end: number; text: string; words?: Array<{ text: string; start: number; end: number }> }>;
    let text = '';
    for (const segment of segments) {
      if (segment.end <= from || segment.start >= to) continue;
      for (const word of segment.words?.length ? segment.words : [segment]) if (word.end > from + 0.02 && word.start < to - 0.02) text += word.text;
    }
    return text.trim();
  };
  for (let a = 0; a < spine.length; a += 1) for (let b = a + 1; b < spine.length; b += 1) {
    if (spine[a]!.assetId !== spine[b]!.assetId) continue;
    const from = Math.max(spine[a]!.sourceInSec, spine[b]!.sourceInSec);
    const to = Math.min(spine[a]!.sourceOutSec, spine[b]!.sourceOutSec);
    if (to - from < REPEAT_MIN_SEC) continue;
    const said = spokenIn(spine[a]!.assetId, from, to);
    if (!said) continue;
    // The one repeat that is meant: a short line copied to the very start as a hook.
    const coldOpen = spine[a]!.startFrame === 0 && spine[a]!.durationFrames / fps <= COLD_OPEN_MAX_SEC;
    findings.push({
      code: 'spine-repeat', severity: coldOpen ? 'warning' : 'error', startFrame: spine[b]!.startFrame, endFrame: end(spine[b]!), clipIds: [spine[a]!.id, spine[b]!.id],
      message: `"${said.length > 28 ? `${said.slice(0, 28)}…` : said}" (source ${from.toFixed(1)}–${to.toFixed(1)} s) is spoken at ${clock(spine[a]!.startFrame, fps)} and again at ${clock(spine[b]!.startFrame, fps)}`,
    });
  }
  for (const clip of spine) {
    if (clip.durationFrames / fps >= FRAGMENT_MAX_SEC) continue;
    findings.push({ code: 'spine-fragment', severity: 'warning', startFrame: clip.startFrame, endFrame: end(clip), clipIds: [clip.id], message: `a ${(clip.durationFrames / fps).toFixed(2)} s sliver of speech at ${clock(clip.startFrame, fps)}` });
  }

  // The recording laid over itself: a media clip of the asset the spine is playing under it.
  const mediaLanes = tracks.filter((track) => track.type === 'visual' && track.id !== spineTrack?.id && !track.hidden);
  const media = mediaLanes.flatMap((track) => track.clips.filter((clip): clip is SourceClip => clip.enabled !== false && clip.kind === 'media' && hasSource(clip)));
  for (const clip of media) {
    const under = spine.find((candidate) => candidate.assetId === clip.assetId && candidate.startFrame < end(clip) && end(candidate) > clip.startFrame);
    if (!under) continue;
    const at = Math.max(clip.startFrame, under.startFrame);
    const spineSource = under.sourceInSec + ((at - under.startFrame) / fps) * ((under.sourceOutSec - under.sourceInSec) / Math.max(1 / fps, under.durationFrames / fps));
    const clipSource = clip.sourceInSec + (at - clip.startFrame) / fps;
    const same = Math.abs(spineSource - clipSource) <= SAME_PICTURE_SEC;
    findings.push(same
      ? { code: 'self-overlay', severity: 'error', startFrame: clip.startFrame, endFrame: end(clip), clipIds: [clip.id, under.id], message: `the recording is laid over itself at ${clock(clip.startFrame, fps)}: the clip on the media lane shows the moment the story spine is already playing` }
      : { code: 'same-recording-cutaway', severity: 'warning', startFrame: clip.startFrame, endFrame: end(clip), clipIds: [clip.id, under.id], message: `a cutaway at ${clock(clip.startFrame, fps)} shows another moment of the recording that is speaking under it` });
  }

  // The same footage as a cutaway twice in a short while.
  const cutaways = media.filter((clip) => !spine.some((candidate) => candidate.assetId === clip.assetId)).sort((a, b) => a.startFrame - b.startFrame);
  for (let a = 0; a < cutaways.length; a += 1) for (let b = a + 1; b < cutaways.length; b += 1) {
    if (cutaways[a]!.assetId !== cutaways[b]!.assetId || (cutaways[b]!.startFrame - end(cutaways[a]!)) / fps > REUSE_WINDOW_SEC) continue;
    if (Math.min(cutaways[a]!.sourceOutSec, cutaways[b]!.sourceOutSec) - Math.max(cutaways[a]!.sourceInSec, cutaways[b]!.sourceInSec) <= 0) continue;
    findings.push({ code: 'broll-reuse', severity: 'warning', startFrame: cutaways[b]!.startFrame, endFrame: end(cutaways[b]!), clipIds: [cutaways[a]!.id, cutaways[b]!.id], message: `the same footage is used at ${clock(cutaways[a]!.startFrame, fps)} and again at ${clock(cutaways[b]!.startFrame, fps)}` });
  }

  // The same graphic on screen twice at once.
  const graphics = tracks.filter((track) => track.type === 'graphics' && !track.hidden).flatMap((track) => track.clips.filter((clip) => clip.enabled !== false && clip.kind === 'graphic')).sort((a, b) => a.startFrame - b.startFrame);
  for (let a = 0; a < graphics.length; a += 1) for (let b = a + 1; b < graphics.length && graphics[b]!.startFrame < end(graphics[a]!); b += 1) {
    if (Math.min(end(graphics[a]!), end(graphics[b]!)) - graphics[b]!.startFrame < 3) continue;
    if (graphicIdentity(graphics[a]!) !== graphicIdentity(graphics[b]!)) continue;
    findings.push({ code: 'graphic-duplicate', severity: 'error', startFrame: graphics[b]!.startFrame, endFrame: Math.min(end(graphics[a]!), end(graphics[b]!)), clipIds: [graphics[a]!.id, graphics[b]!.id], message: `the same graphic is on screen twice at ${clock(graphics[b]!.startFrame, fps)}` });
  }

  // Two captions in the same frame.
  const captionTrack = tracks.find((track) => track.id === document.semantics.managedCaptionTrackId);
  const captions = (captionTrack && !captionTrack.hidden ? captionTrack.clips : []).filter((clip) => clip.enabled !== false).sort((a, b) => a.startFrame - b.startFrame);
  const overlapping = captions.filter((clip, index) => captions[index + 1] && end(clip) > captions[index + 1]!.startFrame);
  if (overlapping.length) {
    findings.push({ code: 'caption-overlap', severity: 'warning', startFrame: overlapping[0]!.startFrame, endFrame: end(overlapping[0]!), clipIds: overlapping.slice(0, 20).map((clip) => clip.id), message: `${overlapping.length} caption${overlapping.length === 1 ? '' : 's'} still show when the next one starts (first at ${clock(overlapping[0]!.startFrame, fps)})` });
  }

  // Graphics whose piece the look's stylesheet has no rules for: bare text on the picture.
  const look = document.appearance.look as { css?: string; pieces?: Record<string, { source?: string }> } | undefined;
  if (look?.pieces) {
    const styled = new Set<string>();
    for (const selector of (look.css ?? '').replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g)) {
      if (!selector[1]!.trim().startsWith('@')) for (const name of selector[1]!.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) styled.add(name[1]!);
    }
    for (const [pieceId, piece] of Object.entries(look.pieces)) {
      const names = new Set<string>();
      for (const attribute of (piece.source ?? '').matchAll(/class=\\?["']([^"'\\]*)/g)) for (const name of attribute[1]!.split(/\s+/)) if (/^-?[_a-zA-Z][\w-]*$/.test(name)) names.add(name);
      const missing = [...names].filter((name) => !styled.has(name));
      if (names.size < 2 || missing.length * 2 <= names.size) continue;
      const instances = graphics.filter((clip) => (clip as { block: { templateId?: string } }).block.templateId === `look:${pieceId}`);
      if (!instances.length) continue;
      findings.push({ code: 'look-unstyled', severity: 'error', startFrame: instances[0]!.startFrame, endFrame: end(instances[0]!), clipIds: instances.slice(0, 20).map((clip) => clip.id), message: `${instances.length} "${pieceId}" graphic${instances.length === 1 ? '' : 's'} render as bare text: the look's stylesheet has no rule for ${missing.map((name) => `.${name}`).join(', ')}` });
    }
  }
  return findings.sort((a, b) => a.startFrame - b.startFrame);
}

/** The findings of `after` that `before` did not have: what one edit introduced. */
export function introducedFindings(before: EditorDocumentV2, after: EditorDocumentV2, codes?: readonly TimelineFindingCode[]): TimelineFinding[] {
  const key = (finding: TimelineFinding) => `${finding.code}\u0000${[...finding.clipIds].sort().join(',')}`;
  const had = new Set(auditTimeline(before).map(key));
  return auditTimeline(after).filter((finding) => (!codes || codes.includes(finding.code)) && !had.has(key(finding)));
}
