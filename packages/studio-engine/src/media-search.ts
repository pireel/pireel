/**
 * Project-scoped media segment search.
 *
 * The index is rebuilt from persisted source-clock observations (ASR + optional visual labels),
 * so segment ids survive timeline cuts and do not need another database table. Search stays pure:
 * the browser can add its cached visual timeline, while offline MCP uses the same function with the
 * transcripts stored in the canonical editor document.
 */

import { desegmentCues, type AsrSegment } from './build-blocks';
import type { VideoShot } from './composition-core';
import type { EditorDocumentV2, NarrativeTimelineClip } from './editor-document';
import { spans as clipSpans } from './trim';
import type { VisualLabel, VisualTimeline } from './visual-types';

export const MEDIA_SEARCH_INDEX_VERSION = 1;

export type MediaSearchScope = 'all' | 'main' | 'inserted';

export interface MediaSearchQuery {
  query: string;
  scope?: MediaSearchScope;
  /** Narrow to the source that owns this shot. */
  shotId?: string;
  limit?: number;
}

export interface MediaSearchProject {
  projectId: string;
  shots: VideoShot[];
  mainTranscript: AsrSegment[];
  clipTranscripts: Record<string, AsrSegment[]>;
  /** Today visual analysis describes the main source only. */
  visualTimeline?: VisualTimeline | null;
}

export interface MediaEditedRange {
  shotId: string;
  fromSec: number;
  toSec: number;
  sourceFromSec: number;
  sourceToSec: number;
}

export interface MediaSearchResult {
  /** Stable across timeline edits; source identity + source-clock interval. */
  segmentId: string;
  assetId: string;
  source: {
    kind: 'main' | 'inserted';
    token: string;
    shotIds: string[];
  };
  sourceStartSec: number;
  sourceEndSec: number;
  durationSec: number;
  transcript?: string;
  sentenceIndexes?: number[];
  visual?: string[];
  /** Every surviving occurrence on the current edited timeline. Empty means the source range is not currently used. */
  editedRanges: MediaEditedRange[];
  score: number;
  matchedSignals: ('phrase' | 'transcript' | 'visual' | 'semantic')[];
}

export interface MediaSearchResponse {
  indexVersion: number;
  query: string;
  scope: MediaSearchScope;
  results: MediaSearchResult[];
  coverage: {
    assetId: string;
    source: { kind: 'main' | 'inserted'; token: string; shotIds: string[] };
    transcriptSegments: number;
    visualSegments: number;
  }[];
  stats: {
    sources: number;
    transcriptSegments: number;
    visualSegments: number;
    candidates: number;
  };
}

export interface MediaSearchOptions {
  /** Future local-embedding hook. Keys are the deterministic candidate segment ids. */
  semanticScores?: Readonly<Record<string, number>>;
}

/**
 * Resolve source-clock transcripts from the canonical V2 document while retaining the runtime
 * source URLs used by the render projection. Keeping this adapter beside the search index prevents
 * browser and offline-agent callers from drifting back to the retired Composition context fields.
 */
export function mediaSearchTranscriptsFromDocument(
  document: EditorDocumentV2,
  shots: readonly VideoShot[],
): Pick<MediaSearchProject, 'mainTranscript' | 'clipTranscripts'> {
  const asAsr = (segments: EditorDocumentV2['semantics']['transcripts'][string] | undefined): AsrSegment[] =>
    desegmentCues((segments ?? []) as AsrSegment[]);
  const primary = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId);
  const assetIdByClipId = new Map(
    (primary?.clips ?? [])
      .filter((clip): clip is NarrativeTimelineClip => clip.kind === 'narrative')
      .map((clip) => [clip.id, clip.assetId] as const),
  );
  const clipTranscripts: Record<string, AsrSegment[]> = {};
  for (const shot of shots) {
    if (!shot.src) continue;
    const assetId = assetIdByClipId.get(shot.id);
    const segments = assetId ? asAsr(document.semantics.transcripts[assetId]) : [];
    if (segments.length) clipTranscripts[shot.src] = segments;
  }
  const primaryAssetId = document.semantics.primaryNarrativeAssetId;
  return {
    mainTranscript: primaryAssetId ? asAsr(document.semantics.transcripts[primaryAssetId]) : [],
    clipTranscripts,
  };
}

interface SourceDescriptor {
  source: string | null;
  token: string;
  kind: 'main' | 'inserted';
  shotIds: string[];
  transcript: AsrSegment[];
  visual: VisualTimeline['segments'];
}

interface Candidate {
  id: string;
  source: SourceDescriptor;
  start: number;
  end: number;
  transcript: string;
  sentenceIndexes: number[];
  visual: string[];
  transcriptSearchText: string;
  visualSearchText: string;
}

interface LexicalScore {
  score: number;
  phrase: boolean;
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const hashToken = (value: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
};

function sourceToken(shots: VideoShot[], source: string | null): string {
  if (source == null) return 'main';
  const shot = shots.find((item) => item.src === source);
  return `clip_${hashToken(shot?.srcSig || source)}`;
}

function segmentId(source: SourceDescriptor, start: number, end: number): string {
  const a = Math.max(0, Math.round(start * 1000)).toString(36);
  const b = Math.max(0, Math.round(end * 1000)).toString(36);
  return `media_${source.token}_${a}_${b}`;
}

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function compact(value: string): string {
  return normalize(value).replace(/\s+/g, '');
}

function terms(value: string): Set<string> {
  const normalized = normalize(value);
  const out = new Set<string>();
  for (const word of normalized.split(' ')) {
    if (!word || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(word)) continue;
    out.add(word);
    // A deliberately small local normalization, not a language model or an English-only stemmer.
    if (/^[a-z0-9]+$/.test(word)) {
      if (word.length > 5 && word.endsWith('ing')) out.add(word.slice(0, -3));
      else if (word.length > 4 && word.endsWith('ed')) out.add(word.slice(0, -2));
      else if (word.length > 4 && word.endsWith('s')) out.add(word.slice(0, -1));
    }
  }
  for (const run of normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu) ?? []) {
    const chars = [...run];
    // Unigrams preserve intent when a short CJK query reverses two concepts ("产品验证" vs
    // "验证产品"); bigrams/trigrams still carry the stronger phrase/order signal.
    for (const char of chars) out.add(char);
    for (let size = 2; size <= Math.min(3, chars.length); size++) {
      for (let i = 0; i + size <= chars.length; i++) out.add(chars.slice(i, i + size).join(''));
    }
  }
  return out;
}

const VISUAL_ALIASES: Record<VisualLabel['content'], string> = {
  talkinghead: 'talking head speaker presenter interview person portrait face 口播 人物 人像 说话 主播 演讲 采访',
  screen: 'screen screencast interface app website desktop code dashboard chart 屏幕 录屏 界面 软件 网页 代码 仪表盘 图表',
  broll: 'b roll b-roll footage product object place scene 素材 空镜 产品 物品 场景',
  slide: 'slide slides presentation deck ppt 幻灯片 演示文稿 演示',
  other: 'other scene footage 其他 画面 素材',
};

const PERSON_ALIASES: Record<VisualLabel['person'], string> = {
  left: 'person left subject left 人物左侧 主体左侧',
  center: 'person center subject center centered 人物居中 主体居中',
  right: 'person right subject right 人物右侧 主体右侧',
  none: 'no person empty 无人物 空画面',
};

const SAFE_ALIASES: Record<VisualLabel['safe'], string> = {
  left: 'space left safe left 左侧留白 左侧安全区',
  right: 'space right safe right 右侧留白 右侧安全区',
  top: 'space top safe top 顶部留白 顶部安全区',
  bottom: 'space bottom safe bottom 底部留白 底部安全区',
  full: 'full frame open space 全画面 留白',
  none: 'no safe area no space 无留白 无安全区',
};

function visualText(label: VisualLabel): string {
  return [label.desc, VISUAL_ALIASES[label.content], PERSON_ALIASES[label.person], SAFE_ALIASES[label.safe], label.hasText ? 'text words title 字幕 文字 标题' : ''].filter(Boolean).join(' ');
}

function visualDisplay(label: VisualLabel): string {
  return [label.content, label.person !== 'none' ? `person:${label.person}` : '', label.safe !== 'none' ? `safe:${label.safe}` : '', label.hasText ? 'has-text' : '', label.desc].filter(Boolean).join(' · ');
}

function descriptors(project: MediaSearchProject, query: MediaSearchQuery): SourceDescriptor[] | { error: string } {
  const bySource = new Map<string, VideoShot[]>();
  for (const shot of project.shots) {
    if (!shot.src) continue;
    bySource.set(shot.src, [...(bySource.get(shot.src) ?? []), shot]);
  }
  const all: SourceDescriptor[] = [
    {
      source: null,
      token: 'main',
      kind: 'main',
      shotIds: project.shots.filter((shot) => !shot.src).map((shot) => shot.id),
      transcript: project.mainTranscript,
      visual: project.visualTimeline?.segments ?? [],
    },
    ...[...bySource.entries()].map(([source, shots]): SourceDescriptor => ({
      source,
      token: sourceToken(project.shots, source),
      kind: 'inserted',
      shotIds: shots.map((shot) => shot.id),
      transcript: project.clipTranscripts[source] ?? [],
      visual: [],
    })),
  ];
  if (query.shotId) {
    const shot = project.shots.find((item) => item.id === query.shotId);
    if (!shot) return { error: 'shot not found' };
    return all.filter((source) => source.source === (shot.src ?? null));
  }
  const scope = query.scope ?? 'all';
  return all.filter((source) => scope === 'all' || source.kind === scope);
}

function overlappingVisual(source: SourceDescriptor, start: number, end: number): VisualTimeline['segments'] {
  return source.visual.filter((segment) => segment.end > start && segment.start < end);
}

function buildCandidates(sources: SourceDescriptor[]): Candidate[] {
  const out: Candidate[] = [];
  for (const source of sources) {
    for (let i = 0; i < source.transcript.length; i++) {
      const rows: AsrSegment[] = [];
      for (let j = i; j < Math.min(source.transcript.length, i + 3); j++) {
        const row = source.transcript[j]!;
        if (rows.length && (row.start - rows.at(-1)!.end > 8 || row.end - rows[0]!.start > 30)) break;
        rows.push(row);
        const start = rows[0]!.start;
        const end = rows.at(-1)!.end;
        const visualRows = overlappingVisual(source, start, end);
        const visual = [...new Set(visualRows.map((segment) => visualDisplay(segment.label)))];
        out.push({
          id: segmentId(source, start, end),
          source,
          start,
          end,
          transcript: rows.map((segment) => segment.text.trim()).filter(Boolean).join(' '),
          sentenceIndexes: rows.map((_, offset) => i + offset),
          visual,
          transcriptSearchText: rows.map((segment) => segment.text).join(' '),
          visualSearchText: visualRows.map((segment) => visualText(segment.label)).join(' '),
        });
      }
    }
    for (const segment of source.visual) {
      out.push({
        id: segmentId(source, segment.start, segment.end),
        source,
        start: segment.start,
        end: segment.end,
        transcript: '',
        sentenceIndexes: [],
        visual: [visualDisplay(segment.label)],
        transcriptSearchText: '',
        visualSearchText: visualText(segment.label),
      });
    }
  }
  // A visual segment and a transcript window can share the same stable interval. Merge their evidence.
  const merged = new Map<string, Candidate>();
  for (const candidate of out) {
    const previous = merged.get(candidate.id);
    if (!previous) {
      merged.set(candidate.id, candidate);
      continue;
    }
    merged.set(candidate.id, {
      ...previous,
      transcript: previous.transcript || candidate.transcript,
      sentenceIndexes: previous.sentenceIndexes.length ? previous.sentenceIndexes : candidate.sentenceIndexes,
      visual: [...new Set([...previous.visual, ...candidate.visual])],
      transcriptSearchText: [previous.transcriptSearchText, candidate.transcriptSearchText].filter(Boolean).join(' '),
      visualSearchText: [previous.visualSearchText, candidate.visualSearchText].filter(Boolean).join(' '),
    });
  }
  return [...merged.values()];
}

function lexicalScore(query: string, text: string, queryTerms: Set<string>, idf: ReadonlyMap<string, number>): LexicalScore {
  if (!text.trim()) return { score: 0, phrase: false };
  const queryCompact = compact(query);
  const textCompact = compact(text);
  const phrase = queryCompact.length > 0 && textCompact.includes(queryCompact);
  const textTerms = terms(text);
  let hit = 0;
  let total = 0;
  let strongHit = false;
  let hasStrongQueryTerm = false;
  for (const term of queryTerms) {
    const weight = idf.get(term) ?? 1;
    total += weight;
    const strong = [...term].length >= 2;
    if (strong) hasStrongQueryTerm = true;
    if (textTerms.has(term)) {
      hit += weight;
      if (strong) strongHit = true;
    }
  }
  // One shared CJK character is not enough to claim a multi-character concept match.
  const coverage = (total ? hit / total : 0) * (hasStrongQueryTerm && !strongHit && !phrase ? 0.25 : 1);
  return { score: Math.min(1, (phrase ? 0.58 : 0) + coverage * 0.42), phrase };
}

function editedRanges(shots: VideoShot[], source: string | null, from: number, to: number): MediaEditedRange[] {
  const out: MediaEditedRange[] = [];
  for (const span of clipSpans(shots)) {
    const shot = span.clip;
    if ((shot.src ?? null) !== source) continue;
    const sourceFromSec = Math.max(from, shot.srcStart);
    const sourceToSec = Math.min(to, shot.srcEnd);
    if (sourceToSec - sourceFromSec <= 0.03) continue;
    out.push({
      shotId: shot.id,
      fromSec: round3(span.editedStart + sourceFromSec - shot.srcStart),
      toSec: round3(span.editedStart + sourceToSec - shot.srcStart),
      sourceFromSec: round3(sourceFromSec),
      sourceToSec: round3(sourceToSec),
    });
  }
  return out;
}

function overlapRatio(a: Candidate, b: Candidate): number {
  if (a.source.token !== b.source.token) return 0;
  const overlap = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  return overlap / Math.max(0.001, Math.min(a.end - a.start, b.end - b.start));
}

export function searchProjectMedia(
  project: MediaSearchProject,
  query: MediaSearchQuery,
  options: MediaSearchOptions = {},
): MediaSearchResponse | { error: string } {
  const rawQuery = typeof query.query === 'string' ? query.query.trim() : '';
  if (!rawQuery) return { error: 'query is required' };
  if (rawQuery.length > 200) return { error: 'query is too long (max 200 characters)' };
  const scope = query.scope === 'main' || query.scope === 'inserted' ? query.scope : 'all';
  const selected = descriptors(project, { ...query, scope });
  if ('error' in selected) return selected;
  const candidates = buildCandidates(selected);
  const queryTerms = terms(rawQuery);

  const documentFrequency = new Map<string, number>();
  for (const candidate of candidates) {
    const candidateTerms = terms(`${candidate.transcriptSearchText} ${candidate.visualSearchText}`);
    for (const term of queryTerms) if (candidateTerms.has(term)) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const term of queryTerms) idf.set(term, Math.log((candidates.length + 1) / ((documentFrequency.get(term) ?? 0) + 1)) + 1);

  const scored = candidates
    .map((candidate) => {
      const transcript = lexicalScore(rawQuery, candidate.transcriptSearchText, queryTerms, idf);
      const visual = lexicalScore(rawQuery, candidate.visualSearchText, queryTerms, idf);
      const combined = lexicalScore(rawQuery, `${candidate.transcriptSearchText} ${candidate.visualSearchText}`, queryTerms, idf);
      const local = Math.max(transcript.score, visual.score, combined.score * 0.88);
      const semanticRaw = options.semanticScores?.[candidate.id];
      const semantic = Number.isFinite(semanticRaw) ? Math.max(0, Math.min(1, semanticRaw!)) : null;
      const score = semantic == null ? local : local * 0.62 + semantic * 0.38;
      const matchedSignals: MediaSearchResult['matchedSignals'] = [];
      if (transcript.phrase || visual.phrase) matchedSignals.push('phrase');
      if (transcript.score >= 0.08) matchedSignals.push('transcript');
      if (visual.score >= 0.08) matchedSignals.push('visual');
      if (semantic != null && semantic >= 0.35) matchedSignals.push('semantic');
      return { candidate, score, matchedSignals };
    })
    .filter((item) => item.score >= 0.12)
    .sort((a, b) => b.score - a.score || Number(b.matchedSignals.includes('phrase')) - Number(a.matchedSignals.includes('phrase')) || (a.candidate.end - a.candidate.start) - (b.candidate.end - b.candidate.start) || a.candidate.id.localeCompare(b.candidate.id));

  const limit = Number.isInteger(query.limit) ? Math.max(1, Math.min(20, query.limit!)) : 8;
  const picked: typeof scored = [];
  for (const item of scored) {
    if (picked.some((previous) => overlapRatio(previous.candidate, item.candidate) >= 0.65)) continue;
    picked.push(item);
    if (picked.length >= limit) break;
  }

  const assetId = (source: SourceDescriptor) => `${project.projectId}:${source.token}`;
  return {
    indexVersion: MEDIA_SEARCH_INDEX_VERSION,
    query: rawQuery,
    scope,
    results: picked.map(({ candidate, score, matchedSignals }) => ({
      segmentId: candidate.id,
      assetId: assetId(candidate.source),
      source: { kind: candidate.source.kind, token: candidate.source.token, shotIds: candidate.source.shotIds },
      sourceStartSec: round3(candidate.start),
      sourceEndSec: round3(candidate.end),
      durationSec: round3(Math.max(0, candidate.end - candidate.start)),
      ...(candidate.transcript ? { transcript: candidate.transcript, sentenceIndexes: candidate.sentenceIndexes } : {}),
      ...(candidate.visual.length ? { visual: candidate.visual } : {}),
      editedRanges: editedRanges(project.shots, candidate.source.source, candidate.start, candidate.end),
      score: round3(score),
      matchedSignals,
    })),
    coverage: selected.map((source) => ({
      assetId: assetId(source),
      source: { kind: source.kind, token: source.token, shotIds: source.shotIds },
      transcriptSegments: source.transcript.length,
      visualSegments: source.visual.length,
    })),
    stats: {
      sources: selected.length,
      transcriptSegments: selected.reduce((sum, source) => sum + source.transcript.length, 0),
      visualSegments: selected.reduce((sum, source) => sum + source.visual.length, 0),
      candidates: candidates.length,
    },
  };
}
