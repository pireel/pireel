import type { AsrSegment } from './build-blocks';
import type { EditorDocumentV2 } from './composition';
/** Project source-clock speech through native clip geometry once, shared by all added effects. */
export function editingSpeechCues(document: EditorDocumentV2, transcript: AsrSegment[]): AsrSegment[] {
  const narration = document.timeline.tracks.find(track => track.role === 'narration' && !track.muted && track.clips.length);
  const primary = document.timeline.tracks.find(track => track.id === document.semantics.primaryNarrativeTrackId);
  const track = narration ?? primary; const fps = document.canvas.fps; const result: AsrSegment[] = [];
  for (const clip of track?.clips ?? []) {
    if (!clip.enabled || (clip.kind !== 'narrative' && clip.kind !== 'audio')) continue;
    const sourceStart = clip.sourceInSec; const sourceEnd = clip.sourceOutSec ?? (clip.sourceInSec + clip.durationFrames / fps);
    const start = clip.startFrame / fps; const duration = clip.durationFrames / fps;
    const rate = (sourceEnd - sourceStart) / duration;
    if (!(rate > 0)) continue;
    for (const segment of transcript) {
      const from = Math.max(sourceStart, segment.start); const to = Math.min(sourceEnd, segment.end);
      if (to <= from) continue;
      const words = segment.words?.filter(word => word.end > from && word.start < to).map(word => ({ ...word, start: start + (Math.max(from, word.start) - sourceStart) / rate, end: start + (Math.min(to, word.end) - sourceStart) / rate }));
      result.push({ ...segment, start: start + (from - sourceStart) / rate, end: start + (to - sourceStart) / rate, ...(words?.length ? { text: words.map(word => word.text).join(' '), words } : {}) });
    }
  }
  return result.sort((a, b) => a.start - b.start);
}
export function editingDuration(document: EditorDocumentV2) {
  const primary = document.timeline.tracks.find(track => track.id === document.semantics.primaryNarrativeTrackId);
  return Math.max(0, ...(primary?.clips ?? []).map(clip => (clip.startFrame + clip.durationFrames) / document.canvas.fps));
}
export function editingMoments(cues: AsrSegment[], maxCount: number, gap = 5) {
  const chosen: AsrSegment[] = [];
  for (const cue of cues) {
    if (!cue.text.trim() || cue.end - cue.start < .4 || chosen.length >= maxCount) continue;
    if (chosen.length && cue.start < chosen.at(-1)!.end + gap) continue;
    chosen.push({ ...cue, end: Math.min(cue.end, cue.start + 6) });
  }
  return chosen;
}
export function mergeEditingCuts(cuts: { fromSec: number; toSec: number }[], duration: number) {
  const result: typeof cuts = [];
  for (const cut of cuts.map(c => ({ fromSec: Math.max(0, c.fromSec), toSec: Math.min(duration, c.toSec) })).filter(c => c.toSec > c.fromSec).sort((a, b) => a.fromSec - b.fromSec)) {
    const last = result.at(-1); if (last && cut.fromSec <= last.toSec) last.toSec = Math.max(last.toSec, cut.toSec); else result.push(cut);
  }
  if (result.reduce((sum, cut) => sum + cut.toSec - cut.fromSec, 0) > duration - .2) throw new Error('粗剪会删除全部讲话，请降低清理强度。');
  return result;
}
/** Sample-accurate ducking, looping and fades baked into a derivative, equal in preview/export. */
export function musicBedPcm(source: Float32Array, sampleRate: number, duration: number, cues: Pick<AsrSegment, 'start' | 'end'>[], volumeDb: number, duckDb: number): Float32Array {
  if (!source.length || !(sampleRate > 0 && duration > 0)) throw new Error('配乐音频无效。');
  const output = new Float32Array(Math.ceil(duration * sampleRate)); const level = 10 ** (volumeDb / 20); const duck = 10 ** (duckDb / 20);
  const spans = [...cues].sort((a, b) => a.start - b.start); let at = 0; let envelope = 1;
  const loopFade = Math.min(Math.floor(sampleRate * .03), Math.floor(source.length / 4));
  for (let i = 0; i < output.length; i++) {
    const t = i / sampleRate; while (at < spans.length && spans[at].end + .25 < t) at++;
    const speaking = at < spans.length && t >= spans[at].start - .1 && t <= spans[at].end + .25;
    const target = speaking ? duck : 1; envelope += (target - envelope) / (sampleRate * (speaking ? .04 : .3));
    const pos = i % source.length; const seam = loopFade ? Math.min(1, pos / loopFade, (source.length - 1 - pos) / loopFade) : 1;
    const fade = Math.min(1, t / .5, (duration - t) / .8);
    output[i] = source[pos] * level * envelope * Math.max(0, seam) * Math.max(0, fade);
  }
  return output;
}
export function soundEffectPcm(style: 'soft' | 'pop' | 'whoosh', sampleRate = 48000): Float32Array {
  const duration = style === 'whoosh' ? .5 : .25; const out = new Float32Array(Math.ceil(duration * sampleRate));
  let noise = 937; let smooth = 0;
  for (let i = 0; i < out.length; i++) { const t = i / sampleRate; const p = t / duration; noise = (Math.imul(noise, 1664525) + 1013904223) | 0; smooth = smooth * .8 + (noise / 2147483648) * .2; const wave = style === 'whoosh' ? smooth * 2 : Math.sin(2 * Math.PI * (style === 'pop' ? 600 * t - 600 * t * t : 880 * t)) * Math.exp(-t * 22); out[i] = .6 * wave * Math.min(1, i / 200) * (style === 'whoosh' ? Math.sin(Math.PI * p) ** 2 : 1 - p); }
  return out;
}
