export interface BrollAsset { id: string; sig: string; name: string; kind: 'video' | 'image'; durationSec: number; width: number; height: number }
export interface BrollOptions {
  /** Picture in picture footage sources: AI-generated stills from the narration (off unless set) and
   *  the user's own files (on unless set to false). */
  aiFootage?: boolean; localFootage?: boolean;
  pip?: import('./pip-layout').PipOptions; manualClips?: { id: string; assetId: string; start: number; duration: number; sourceIn: number }[]; edits?: Record<string, { start: number; duration: number; sourceIn: number }>; assets: BrollAsset[]; captions: boolean; replacements?: Record<string, string>; disabledPlacements?: string[] }
export interface BrollCandidate { id: string; assetId: string; start: number; end: number; description: string; /** Footage made for this shot (AI generated) carries its own asset; user footage lives in BrollOptions.assets. */ asset?: BrollAsset }
export interface BrollPlacement { id: string; candidateId: string; start: number; duration: number }
/** One narration sentence; `anchors` are its words, so a shot can start on the word it illustrates. */
export interface BrollCue { id: number; start: number; end: number; text: string; anchors?: { id: number; start: number; text: string }[] }

/** Narration sentences with word anchors, unmerged: a shot starts on a word, not where a sentence happens to begin. */
export function brollCues(transcript: readonly { start: number; end: number; text: string; words?: { start: number; text: string }[] }[], durationSec: number): BrollCue[] {
  return transcript.filter(row => row.text.trim() && Number.isFinite(row.start) && Number.isFinite(row.end) && row.end > row.start && row.start < durationSec)
    .map((row, id) => {
      const start = Math.max(0, row.start); const end = Math.min(durationSec, row.end);
      const anchors = (row.words ?? []).map((word, index) => ({ id: index, start: word.start, text: word.text.slice(0, 64) })).filter(word => word.start >= start && word.start < end).slice(0, 80);
      return { id, start, end, text: row.text.slice(0, 2000), ...(anchors.length ? { anchors } : {}) };
    });
}

/** `broll-<cue>` or `broll-<cue>-<word>`: the id carries where the shot starts, so a stored plan re-validates. */
export const brollPlacementAnchor = (id: string) => { const [cueId, wordId] = id.replace(/^broll-/, '').split('-').map(Number); return { cueId, ...(Number.isInteger(wordId) ? { wordId } : {}) }; };

/** Model chooses only known sentences, words and shots; timeline bounds, overlaps and coverage are enforced here.
 *  A shot starts on its word (or its sentence) and runs up to 5 seconds, past the sentence if needed. */
export function validateBrollPlan(value: unknown, cues: BrollCue[], candidates: BrollCandidate[], durationSec: number): BrollPlacement[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('配画面方案无效，请重试。');
  const used = new Set<string>();
  const result: BrollPlacement[] = [];
  for (const row of value) {
    const cue = cues.find((cue) => cue.id === row?.cueId);
    const candidate = candidates.find((candidate) => candidate.id === row?.candidateId);
    if (!cue || !candidate || used.has(candidate.id)) throw new Error('配画面方案引用了无效或重复的镜头。');
    const anchor = row.wordId !== undefined ? cue.anchors?.find(word => word.id === row.wordId) : undefined;
    if (row.wordId !== undefined && !anchor) throw new Error('配画面方案引用了无效的词位。');
    const start = anchor?.start ?? cue.start;
    const duration = Math.min(5, candidate.end - candidate.start, durationSec - start);
    if (duration < 1 || start < 0) continue;
    used.add(candidate.id);
    result.push({ id: anchor ? `broll-${cue.id}-${anchor.id}` : `broll-${cue.id}`, candidateId: candidate.id, start, duration });
  }
  result.sort((a, b) => a.start - b.start);
  let end = -2; let coverage = 0;
  return result.filter((row) => {
    if (row.start < end + 1 || coverage + row.duration > durationSec * .6) return false;
    end = row.start + row.duration; coverage += row.duration; return true;
  });
}

export function resolveBrollEdits(placements: BrollPlacement[], candidates: BrollCandidate[], options: BrollOptions, durationSec: number) {
  const manual = options.manualClips ?? [];
  if (manual.length > 100) throw new Error('最多添加 100 个镜头。');
  const all = [...placements, ...manual.map(p => ({ id: p.id, candidateId: `manual:${p.id}`, start: p.start, duration: p.duration }))];
  if (new Set(all.map(p => p.id)).size !== all.length) throw new Error('镜头编号重复。');
  const clips = all.filter(p => !options.disabledPlacements?.includes(p.id)).map(p => {
    const added = manual.find(c => c.id === p.id);
    const candidate = added ? { id: p.candidateId, assetId: added.assetId, start: added.sourceIn, end: added.sourceIn + added.duration, description: '' } : candidates.find(c => c.id === (options.replacements?.[p.id] ?? p.candidateId));
    const asset = options.assets.find(a => a.id === candidate?.assetId) ?? candidate?.asset;
    if (!candidate || !asset) throw new Error('所选素材已变化，请重新匹配。');
    const edit = options.edits?.[p.id];
    const start = edit?.start ?? p.start;
    const duration = edit?.duration ?? Math.min(p.duration, candidate.end - candidate.start);
    const sourceIn = asset.kind === 'image' ? 0 : edit?.sourceIn ?? candidate.start;
    if (![start, duration, sourceIn].every(Number.isFinite) || start < 0 || duration < .1 || sourceIn < 0 || start + duration > durationSec + .001 || (asset.kind === 'video' && sourceIn + duration > asset.durationSec + .001)) throw new Error('片段超出视频或素材时长。');
    return { ...p, candidateId: candidate.id, start, duration, sourceIn, candidate, asset };
  }).sort((a,b) => a.start - b.start);
  for (let i = 1; i < clips.length; i++) if (clips[i].start < clips[i-1].start + clips[i-1].duration - .001) throw new Error('B-roll 片段不能重叠。');
  return clips;
}

/** List order is presentation state, not a change to the analyzed media bytes. */
/** How many AI stills a run may make: about one per ten seconds, at most eight. */
export function brollStillBudget(durationSec: number): number {
  return Math.min(8, Math.max(1, Math.round(durationSec / 10)));
}
/** The user's files that take part in matching: none when that source is switched off. */
export function brollLocalAssets(options: BrollOptions | undefined): BrollAsset[] {
  return options && options.localFootage !== false ? options.assets : [];
}
/** Every asset a project's shots can use: the user's files plus stills generated for the narration. */
export function brollFootageAssets(options: BrollOptions, candidates: readonly BrollCandidate[] = []): BrollAsset[] {
  const all = [...options.assets];
  for (const candidate of candidates) if (candidate.asset && !all.some(asset => asset.id === candidate.asset!.id)) all.push(candidate.asset);
  return all;
}
export function brollAssetsMatch(key: string | undefined, assets: BrollAsset[]): boolean {
  if (!key) return false;
  try {
    const rows = JSON.parse(key);
    if (!Array.isArray(rows) || rows.some(row => !Array.isArray(row) || row.length !== 2 || row.some(value => typeof value !== 'string'))) return false;
    const canonical = (pairs: string[][]) => JSON.stringify([...pairs].sort((a,b) => a[0].localeCompare(b[0])));
    return canonical(rows) === canonical(assets.map(a => [a.id,a.sig]));
  } catch { return false; }
}

/** Reorder clips while keeping each duration/source trim and the total occupied span. */
export function reorderBrollClips(placements: BrollPlacement[], candidates: BrollCandidate[], options: BrollOptions, durationSec: number, id: string, target: number): BrollOptions {
  const clips = resolveBrollEdits(placements, candidates, options, durationSec);
  const index = clips.findIndex(p => p.id === id);
  if (index < 0 || target < 0 || target >= clips.length || index === target) return options;
  const gaps = clips.slice(1).map((p,i) => p.start - clips[i].start - clips[i].duration);
  const start = clips[0].start;
  const [moving] = clips.splice(index,1); clips.splice(target,0,moving);
  const edits = { ...options.edits }; let cursor = start;
  clips.forEach((p,i) => { edits[p.id] = {start:Math.round(cursor*1000)/1000,duration:p.duration,sourceIn:p.sourceIn}; cursor += p.duration + (gaps[i] ?? 0); });
  const next = {...options,edits}; resolveBrollEdits(placements,candidates,next,durationSec); return next;
}
