/**
 * Agent surface v3 → legacy operation adapter (pure).
 *
 * Translates one v3 tool call into the ordered list of legacy tool calls that implement it on the
 * current engine. It does no I/O: both surfaces (browser runner, offline server tools, MCP) apply
 * the returned calls inside one undo group and shape the receipt. Timeline positions arrive in
 * integer frames and leave in seconds because every legacy tool speaks seconds; `ctx.fps` is the
 * only conversion factor and it comes from the active output's canvas.
 *
 * Coverage grows group by group. A v3 tool with no translation yet returns `{ status: 'pending' }`
 * so the surfaces can fall back to a clear error instead of guessing; the registry test tracks the
 * remaining set.
 */

import { V3_TOOL_IDS } from './registry';

export type V3ClipKind = 'narrative' | 'media' | 'graphic' | 'audio' | 'text' | 'caption';

export interface V3AdapterContext {
  /** Frames per second of the active output. Required for every frame ↔ second conversion. */
  fps: number;
  /** Resolves a clip id to its kind; `undefined` when the id is unknown. */
  kindOf: (clipId: string) => V3ClipKind | undefined;
}

export interface LegacyCall {
  tool: string;
  input: Record<string, unknown>;
}

export type V3Translation =
  | { status: 'ok'; calls: LegacyCall[]; note?: string }
  | { status: 'error'; error: string; path?: string; value?: unknown; allowed?: readonly unknown[]; fix?: string }
  | { status: 'pending'; reason: string };

type Input = Record<string, unknown>;

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

function assertFps(ctx: V3AdapterContext): V3Translation | null {
  if (!isFiniteNumber(ctx.fps) || ctx.fps <= 0) {
    return { status: 'error', error: 'fps_unavailable', fix: 'Call get_state first; the adapter needs the active output fps.' };
  }
  return null;
}

/** Timeline frames → edited-timeline seconds, rounded to milliseconds so legacy tools get stable input. */
export function framesToSec(frames: number, fps: number): number {
  return Math.round((frames / fps) * 1000) / 1000;
}

/** Edited-timeline seconds → integer timeline frames (nearest). */
export function secToFrames(sec: number, fps: number): number {
  return Math.round(sec * fps);
}

function frameField(input: Input, key: string, ctx: V3AdapterContext, options: { required?: boolean; min?: number } = {}): number | V3Translation | undefined {
  const raw = input[key];
  if (raw === undefined) {
    return options.required ? { status: 'error', error: 'missing_field', path: key, fix: `Pass ${key} as an integer timeline frame.` } : undefined;
  }
  if (!Number.isInteger(raw) || (raw as number) < (options.min ?? 0)) {
    return { status: 'error', error: 'invalid_frame', path: key, value: raw, fix: `${key} must be an integer frame ≥ ${options.min ?? 0}.` };
  }
  return raw as number;
}

/** Re-anchor an error at the field it came from; non-error translations pass through unchanged. */
function withPath(result: V3Translation, path: string): V3Translation {
  return result.status === 'error' ? { ...result, path } : result;
}

const isTranslation = (value: unknown): value is V3Translation =>
  typeof value === 'object' && value !== null && 'status' in (value as Record<string, unknown>);

function frameRange(input: Input, ctx: V3AdapterContext): [number, number] | V3Translation {
  const raw = input.frames;
  if (!Array.isArray(raw) || raw.length !== 2 || !Number.isInteger(raw[0]) || !Number.isInteger(raw[1]) || raw[0] < 0 || raw[1] <= raw[0]) {
    return { status: 'error', error: 'invalid_frames', path: 'frames', value: raw, fix: 'frames must be [startFrame, endFrame) with integer end > start ≥ 0.' };
  }
  return [raw[0] as number, raw[1] as number];
}

function stringArray(input: Input, key: string, required = true): string[] | V3Translation {
  const raw = input[key];
  if (raw === undefined && !required) return [];
  if (!Array.isArray(raw) || !raw.length || !raw.every(isNonEmptyString)) {
    return { status: 'error', error: 'invalid_ids', path: key, value: raw, fix: `${key} must be a non-empty array of ids from get_state.` };
  }
  return [...new Set(raw.map((value) => value.trim()))];
}

function groupByKind(ids: string[], ctx: V3AdapterContext): Map<V3ClipKind | 'unknown', string[]> {
  const groups = new Map<V3ClipKind | 'unknown', string[]>();
  for (const id of ids) {
    const kind = ctx.kindOf(id) ?? 'unknown';
    groups.set(kind, [...(groups.get(kind) ?? []), id]);
  }
  return groups;
}

function unknownIds(groups: Map<V3ClipKind | 'unknown', string[]>): V3Translation | null {
  const unknown = groups.get('unknown');
  if (!unknown?.length) return null;
  return { status: 'error', error: 'unknown_clip_id', path: 'clipIds', value: unknown, fix: 'Re-read get_state; these ids are not on the active output.' };
}

/* ------------------------------------------------------------------------------------------ */

function translateGetState(input: Input): V3Translation {
  const window = input.window;
  if (window === undefined) return { status: 'ok', calls: [{ tool: 'get_state', input: {} }] };
  return { status: 'ok', calls: [{ tool: 'get_state', input: {} }, { tool: 'get_timeline', input: {} }], note: 'Legacy get_timeline has no window; the surface trims the payload to the requested tracks/frames.' };
}

function translateGetTranscript(input: Input, ctx: V3AdapterContext): V3Translation {
  const granularity = input.granularity ?? 'segments';
  if (granularity !== 'segments' && granularity !== 'words') {
    return { status: 'error', error: 'invalid_value', path: 'granularity', value: granularity, allowed: ['segments', 'words'] };
  }
  const bad = assertFps(ctx);
  if (bad) return bad;
  if (granularity === 'segments') {
    const call: Input = {};
    if (isNonEmptyString(input.assetId)) call.assetId = input.assetId;
    if (isNonEmptyString(input.clipId)) call.clipId = input.clipId;
    return { status: 'ok', calls: [{ tool: 'read_script', input: call }] };
  }
  const call: Input = {};
  if (isNonEmptyString(input.clipId)) call.shotId = input.clipId;
  if (Array.isArray(input.segmentIndexes)) call.sentenceIndexes = input.segmentIndexes;
  const from = frameField(input, 'fromFrame', ctx);
  const to = frameField(input, 'toFrame', ctx);
  if (isTranslation(from)) return from;
  if (isTranslation(to)) return to;
  if (from !== undefined) call.fromSec = framesToSec(from, ctx.fps);
  if (to !== undefined) call.toSec = framesToSec(to, ctx.fps);
  if (isFiniteNumber(input.offset)) call.offset = input.offset;
  if (isFiniteNumber(input.limit)) call.limit = input.limit;
  return { status: 'ok', calls: [{ tool: 'list_words', input: call }] };
}

function translateInspectTimeline(input: Input, ctx: V3AdapterContext): V3Translation {
  const bad = assertFps(ctx);
  if (bad) return bad;
  if (Array.isArray(input.sceneIds) && input.sceneIds.length) {
    return { status: 'ok', calls: [{ tool: 'review_sequence', input: { sceneIds: input.sceneIds, ...(isFiniteNumber(input.maxFrames) ? { maxMoments: input.maxFrames } : {}) } }] };
  }
  if (Array.isArray(input.frames)) {
    if (!input.frames.length || input.frames.length > 12 || !input.frames.every((value) => Number.isInteger(value) && (value as number) >= 0)) {
      return { status: 'error', error: 'invalid_frames', path: 'frames', value: input.frames, fix: 'Pass 1–12 integer timeline frames.' };
    }
    return { status: 'ok', calls: (input.frames as number[]).map((frame) => ({ tool: 'capture_frame', input: { atSec: framesToSec(frame, ctx.fps) } })) };
  }
  const from = frameField(input, 'fromFrame', ctx);
  const to = frameField(input, 'toFrame', ctx);
  if (isTranslation(from)) return from;
  if (isTranslation(to)) return to;
  if (from !== undefined && to !== undefined) {
    if (to <= from) return { status: 'error', error: 'invalid_frames', path: 'toFrame', value: to, fix: 'toFrame must be greater than fromFrame.' };
    const count = Math.min(12, Math.max(1, isFiniteNumber(input.maxFrames) ? Math.round(input.maxFrames) : 6));
    const step = (to - from) / count;
    const frames = Array.from({ length: count }, (_, index) => Math.min(to - 1, Math.round(from + step * (index + 0.5))));
    return { status: 'ok', calls: [...new Set(frames)].map((frame) => ({ tool: 'capture_frame', input: { atSec: framesToSec(frame, ctx.fps) } })) };
  }
  return { status: 'ok', calls: [{ tool: 'review_sequence', input: {} }], note: 'No frames requested: whole-timeline review (planned Scenes when present, otherwise every visible clip).' };
}

function translateManageProject(input: Input): V3Translation {
  const scope = input.scope ?? 'output';
  const action = input.action;
  if (scope !== 'project' && scope !== 'output') return { status: 'error', error: 'invalid_value', path: 'scope', value: scope, allowed: ['project', 'output'] };
  const actions = scope === 'project' ? ['list', 'switch', 'create', 'rename'] : ['list', 'create', 'duplicate', 'switch', 'rename', 'delete'];
  if (typeof action !== 'string' || !actions.includes(action)) return { status: 'error', error: 'invalid_value', path: 'action', value: action, allowed: actions };
  if (scope === 'project') {
    const map: Record<string, LegacyCall> = {
      list: { tool: 'list_projects', input: {} },
      switch: { tool: 'switch_project', input: { project_id: input.id } },
      create: { tool: 'create_project', input: { ...(isNonEmptyString(input.title) ? { title: input.title } : {}) } },
      rename: { tool: 'rename_project', input: { ...(isNonEmptyString(input.id) ? { project_id: input.id } : {}), title: input.title } },
    };
    return { status: 'ok', calls: [map[action]!] };
  }
  const ref: Input = { ...(isNonEmptyString(input.id) ? { output_id: input.id } : {}), ...(isFiniteNumber(input.position) ? { position: input.position } : {}) };
  const map: Record<string, LegacyCall> = {
    list: { tool: 'list_outputs', input: {} },
    create: { tool: 'create_output', input: { ...(isNonEmptyString(input.title) ? { title: input.title } : {}) } },
    duplicate: { tool: 'duplicate_output', input: { ...ref, ...(isNonEmptyString(input.title) ? { title: input.title } : {}) } },
    switch: { tool: 'switch_output', input: ref },
    rename: { tool: 'rename_output', input: { ...ref, title: input.title } },
    delete: { tool: 'delete_output', input: ref },
  };
  return { status: 'ok', calls: [map[action]!] };
}

function translateMoveClips(input: Input, ctx: V3AdapterContext): V3Translation {
  const bad = assertFps(ctx);
  if (bad) return bad;
  const items = input.items;
  if (!Array.isArray(items) || !items.length) return { status: 'error', error: 'missing_field', path: 'items', fix: 'Pass items: [{clipId, startFrame, trackId?}].' };
  const clipRows: Input[] = [];
  const blockCalls: LegacyCall[] = [];
  for (const [index, row] of (items as Input[]).entries()) {
    if (!isNonEmptyString(row?.clipId)) return { status: 'error', error: 'missing_field', path: `items[${index}].clipId` };
    const start = frameField(row, 'startFrame', ctx, { required: true });
    if (isTranslation(start)) return withPath(start, `items[${index}].startFrame`);
    const kind = ctx.kindOf(row.clipId);
    if (!kind) return { status: 'error', error: 'unknown_clip_id', path: `items[${index}].clipId`, value: row.clipId, fix: 'Re-read get_state.' };
    if (kind === 'graphic') {
      blockCalls.push({ tool: 'move_block', input: { blockId: row.clipId, startSec: framesToSec(start as number, ctx.fps) } });
    } else {
      clipRows.push({ clipId: row.clipId, startSec: framesToSec(start as number, ctx.fps), ...(isNonEmptyString(row.trackId) ? { toTrackId: row.trackId } : {}) });
    }
  }
  const calls: LegacyCall[] = [];
  if (clipRows.length) calls.push({ tool: 'move_clips', input: { items: clipRows, ...(input.includeLinked === false ? { includeLinked: false } : {}) } });
  calls.push(...blockCalls);
  return { status: 'ok', calls };
}

function translateRemoveClips(input: Input, ctx: V3AdapterContext): V3Translation {
  const ids = stringArray(input, 'clipIds');
  if (isTranslation(ids)) return ids;
  const groups = groupByKind(ids, ctx);
  const unknown = unknownIds(groups);
  if (unknown) return unknown;
  const calls: LegacyCall[] = [];
  const graphics = groups.get('graphic') ?? [];
  if (graphics.length) calls.push({ tool: 'delete_blocks', input: { blockIds: graphics } });
  const narrative = groups.get('narrative') ?? [];
  const rest = ([...(groups.get('media') ?? []), ...(groups.get('audio') ?? []), ...(groups.get('text') ?? []), ...(groups.get('caption') ?? [])]);
  if (input.ripple === true && narrative.length) {
    // Ripple removal of story-spine clips is the legacy delete_shot semantics (later footage shifts earlier).
    for (const id of narrative) calls.push({ tool: 'delete_shot', input: { shotId: id } });
  } else if (narrative.length) {
    rest.push(...narrative);
  }
  if (rest.length) calls.push({ tool: 'remove_clips', input: { clipIds: rest, ...(input.includeLinked === false ? { includeLinked: false } : {}) } });
  return { status: 'ok', calls };
}

function translateSplitClips(input: Input, ctx: V3AdapterContext): V3Translation {
  const bad = assertFps(ctx);
  if (bad) return bad;
  const items = input.items;
  if (!Array.isArray(items) || !items.length) return { status: 'error', error: 'missing_field', path: 'items', fix: 'Pass items: [{clipId?, atFrame}].' };
  const narrativeSecs: number[] = [];
  const clipRows: Input[] = [];
  for (const [index, row] of (items as Input[]).entries()) {
    const at = frameField(row ?? {}, 'atFrame', ctx, { required: true, min: 1 });
    if (isTranslation(at)) return withPath(at, `items[${index}].atFrame`);
    const sec = framesToSec(at as number, ctx.fps);
    if (!isNonEmptyString(row.clipId)) { narrativeSecs.push(sec); continue; }
    const kind = ctx.kindOf(row.clipId);
    if (!kind) return { status: 'error', error: 'unknown_clip_id', path: `items[${index}].clipId`, value: row.clipId, fix: 'Re-read get_state.' };
    if (kind === 'narrative') narrativeSecs.push(sec);
    else clipRows.push({ clipId: row.clipId, atSec: sec });
  }
  const calls: LegacyCall[] = [];
  if (narrativeSecs.length) calls.push({ tool: 'split_shot', input: { atSecs: [...new Set(narrativeSecs)].sort((left, right) => left - right), purpose: input.purpose === 'framing' ? 'framing' : 'editing' } });
  if (clipRows.length) calls.push({ tool: 'split_clips', input: { items: clipRows, ...(input.includeLinked === false ? { includeLinked: false } : {}) } });
  return { status: 'ok', calls };
}

function translateRippleDeleteRanges(input: Input, ctx: V3AdapterContext): V3Translation {
  const bad = assertFps(ctx);
  if (bad) return bad;
  const ranges = input.ranges;
  if (!Array.isArray(ranges) || !ranges.length) return { status: 'error', error: 'missing_field', path: 'ranges', fix: 'Pass ranges: [[fromFrame, toFrame), …].' };
  const parsed: Array<[number, number]> = [];
  for (const [index, range] of ranges.entries()) {
    const value = frameRange({ frames: range }, ctx);
    if (isTranslation(value)) return withPath(value, `ranges[${index}]`);
    parsed.push(value);
  }
  parsed.sort((left, right) => left[0] - right[0]);
  for (let index = 1; index < parsed.length; index += 1) {
    if (parsed[index]![0] < parsed[index - 1]![1]) {
      return { status: 'error', error: 'overlapping_ranges', path: 'ranges', value: [parsed[index - 1], parsed[index]], fix: 'Merge overlapping ranges before calling.' };
    }
  }
  // Cut later ranges first so earlier frame positions stay valid while the timeline shortens.
  const calls = [...parsed].reverse().map(([from, to]) => ({ tool: 'cut_range', input: { fromSec: framesToSec(from, ctx.fps), toSec: framesToSec(to, ctx.fps) } }));
  return { status: 'ok', calls };
}

function translateSetClipProperties(input: Input, ctx: V3AdapterContext): V3Translation {
  const bad = assertFps(ctx);
  if (bad) return bad;
  const items = input.items;
  if (!Array.isArray(items) || !items.length) return { status: 'error', error: 'missing_field', path: 'items', fix: 'Pass items: [{clipId, …properties}].' };
  const calls: LegacyCall[] = [];
  const typedRows: Input[] = [];
  for (const [index, row] of (items as Input[]).entries()) {
    if (!isNonEmptyString(row?.clipId)) return { status: 'error', error: 'missing_field', path: `items[${index}].clipId` };
    const kind = ctx.kindOf(row.clipId);
    if (!kind) return { status: 'error', error: 'unknown_clip_id', path: `items[${index}].clipId`, value: row.clipId, fix: 'Re-read get_state.' };
    if (isNonEmptyString(row.assetId)) calls.push({ tool: 'swap_clip_media', input: { clipId: row.clipId, assetId: row.assetId } });
    const typed: Input = { clipId: row.clipId };
    if (Array.isArray(row.source) && row.source.length === 2 && row.source.every(isFiniteNumber)) {
      typed.sourceInSec = row.source[0];
      typed.sourceOutSec = row.source[1];
    }
    if (typeof row.enabled === 'boolean') typed.enabled = row.enabled;
    if (row.box && typeof row.box === 'object') typed.box = row.box;
    const fades = row.fades && typeof row.fades === 'object' ? (row.fades as Input) : undefined;
    const fadeIn = fades && isFiniteNumber(fades.in) ? framesToSec(fades.in, ctx.fps) : undefined;
    const fadeOut = fades && isFiniteNumber(fades.out) ? framesToSec(fades.out, ctx.fps) : undefined;
    if (kind === 'narrative' || kind === 'media') {
      // Visual clips keep the shot-era audio/speed/filter tools until their typed equivalents land.
      const audio: Input = { shotIds: [row.clipId] };
      if (isFiniteNumber(row.volumeDb)) audio.volumeDb = row.volumeDb;
      if (typeof row.mute === 'boolean') audio.mute = row.mute;
      if (fadeIn !== undefined) audio.fadeInSec = fadeIn;
      if (fadeOut !== undefined) audio.fadeOutSec = fadeOut;
      if (Object.keys(audio).length > 1) calls.push({ tool: 'set_shot_audio', input: audio });
      if (isFiniteNumber(row.speed)) calls.push({ tool: 'set_video_speed', input: { shotIds: [row.clipId], speed: row.speed, ...(typeof row.ripple === 'boolean' ? { ripple: row.ripple } : {}) } });
      if (row.filter && typeof row.filter === 'object') calls.push({ tool: 'set_video_filter', input: { shotId: row.clipId, ...(row.filter as Input) } });
    } else {
      if (isFiniteNumber(row.volumeDb)) typed.volumeDb = row.volumeDb;
      if (typeof row.mute === 'boolean') typed.muted = row.mute;
      if (isFiniteNumber(row.speed)) typed.speed = row.speed;
      if (fadeIn !== undefined) typed.audioFadeInSec = fadeIn;
      if (fadeOut !== undefined) typed.audioFadeOutSec = fadeOut;
    }
    if (isFiniteNumber(row.opacity)) typed.opacity = row.opacity;
    if (kind === 'graphic' && Number.isInteger(row.durationFrames)) {
      calls.push({ tool: 'resize_block', input: { blockId: row.clipId, durationSec: framesToSec(row.durationFrames as number, ctx.fps) } });
    }
    if (Object.keys(typed).length > 1) typedRows.push(typed);
  }
  if (typedRows.length) calls.unshift({ tool: 'set_clip_properties', input: { items: typedRows } });
  if (!calls.length) return { status: 'error', error: 'nothing_to_change', path: 'items', fix: 'Each item needs at least one property besides clipId.' };
  return { status: 'ok', calls };
}

function translateRemoveWords(input: Input): V3Translation {
  const calls: LegacyCall[] = [];
  if (Array.isArray(input.ranges) && input.ranges.length) {
    calls.push({ tool: 'cut_narration', input: { ranges: input.ranges, ...(isFiniteNumber(input.keepGapSec) ? { keepGapSec: input.keepGapSec } : {}) } });
  }
  if (Array.isArray(input.wordIds) && input.wordIds.length) {
    calls.push({ tool: 'delete_words', input: { wordIds: input.wordIds } });
  }
  if (!calls.length) return { status: 'error', error: 'missing_field', path: 'wordIds|ranges', fix: 'Pass wordIds from get_transcript words, or ranges in source seconds.' };
  return { status: 'ok', calls, note: 'Word ids and transcript positions shift after this call; re-read get_transcript before the next remove_words.' };
}

function translateAddTransition(input: Input, ctx: V3AdapterContext): V3Translation {
  const bad = assertFps(ctx);
  if (bad) return bad;
  const at = frameField(input, 'atFrame', ctx, { required: true, min: 1 });
  if (isTranslation(at)) return at;
  const call: Input = { atSec: framesToSec(at as number, ctx.fps) };
  if (isNonEmptyString(input.effect)) call.effect = input.effect;
  if (isNonEmptyString(input.direction)) call.direction = input.direction;
  if (Number.isInteger(input.durationFrames)) call.durationSec = framesToSec(input.durationFrames as number, ctx.fps);
  return { status: 'ok', calls: [{ tool: 'add_transition', input: call }] };
}

function translatePreview(input: Input, ctx: V3AdapterContext): V3Translation {
  const action = input.action;
  const allowed = ['focus', 'seek', 'play', 'pause'];
  if (typeof action !== 'string' || !allowed.includes(action)) return { status: 'error', error: 'invalid_value', path: 'action', value: action, allowed };
  if (action === 'pause') return { status: 'ok', calls: [{ tool: 'pause', input: {} }] };
  if (action === 'focus') {
    if (!isNonEmptyString(input.id)) return { status: 'error', error: 'missing_field', path: 'id' };
    return { status: 'ok', calls: [{ tool: 'focus_element', input: { id: input.id } }] };
  }
  const bad = assertFps(ctx);
  if (bad) return bad;
  const from = frameField(input, 'frame', ctx);
  const to = frameField(input, 'toFrame', ctx);
  if (isTranslation(from)) return from;
  if (isTranslation(to)) return to;
  if (action === 'seek') {
    if (from === undefined) return { status: 'error', error: 'missing_field', path: 'frame' };
    return { status: 'ok', calls: [{ tool: 'seek', input: { toSec: framesToSec(from, ctx.fps) } }] };
  }
  return { status: 'ok', calls: [{ tool: 'play', input: { ...(from !== undefined ? { fromSec: framesToSec(from, ctx.fps) } : {}), ...(to !== undefined ? { toSec: framesToSec(to, ctx.fps) } : {}) } }] };
}

function translateExport(input: Input): V3Translation {
  const action = input.action ?? 'start';
  if (action === 'status') return { status: 'ok', calls: [{ tool: 'track_export', input: {} }] };
  if (action !== 'start') return { status: 'error', error: 'invalid_value', path: 'action', value: action, allowed: ['start', 'status'] };
  const passthrough: Input = {};
  for (const key of ['resolution', 'fps', 'format', 'sink_url']) if (input[key] !== undefined) passthrough[key] = input[key];
  return { status: 'ok', calls: [{ tool: 'export_video', input: passthrough }] };
}

function translateGenerateAudio(input: Input): V3Translation {
  const kind = input.kind;
  if (kind !== 'music' && kind !== 'sfx') return { status: 'error', error: 'invalid_value', path: 'kind', value: kind, allowed: ['music', 'sfx'] };
  const { kind: _kind, ...rest } = input;
  return { status: 'ok', calls: [{ tool: kind === 'music' ? 'generate_music' : 'generate_sfx', input: rest }] };
}

function translateManageVoices(input: Input): V3Translation {
  const action = input.action;
  const map: Record<string, string> = { list: 'list_voices', clone: 'clone_voice', design: 'design_voice', delete: 'delete_voice' };
  if (typeof action !== 'string' || !map[action]) return { status: 'error', error: 'invalid_value', path: 'action', value: action, allowed: Object.keys(map) };
  const { action: _action, ...rest } = input;
  return { status: 'ok', calls: [{ tool: map[action]!, input: rest }] };
}

function translateAskUser(input: Input): V3Translation {
  const kind = input.kind ?? 'question';
  if (kind === 'approval') return { status: 'ok', calls: [{ tool: 'request_approval', input: { title: input.title, content: input.content } }] };
  if (kind !== 'question') return { status: 'error', error: 'invalid_value', path: 'kind', value: kind, allowed: ['question', 'approval'] };
  const { kind: _kind, ...rest } = input;
  return { status: 'ok', calls: [{ tool: 'ask_user', input: rest }] };
}

function translateManageFrame(input: Input): V3Translation {
  const action = input.action;
  if (action === 'list') return { status: 'ok', calls: [{ tool: 'list_frames', input: {} }] };
  if (action === 'attach') return { status: 'ok', calls: [{ tool: 'attach_frame', input: { frame_id: input.id } }] };
  if (action === 'read') return { status: 'ok', calls: [{ tool: 'read_frame', input: { ...(isNonEmptyString(input.id) ? { frame_id: input.id } : {}) } }] };
  return { status: 'error', error: 'invalid_value', path: 'action', value: action, allowed: ['list', 'attach', 'read'] };
}

function translateSetTexts(input: Input, ctx: V3AdapterContext): V3Translation {
  const bad = assertFps(ctx);
  if (bad) return bad;
  const items = input.items;
  if (!Array.isArray(items) || !items.length) return { status: 'error', error: 'missing_field', path: 'items' };
  const adds: Input[] = [];
  const updates: Input[] = [];
  for (const [index, row] of (items as Input[]).entries()) {
    const { id, startFrame, durationFrames, ...rest } = row ?? {};
    const converted: Input = { ...rest };
    if (startFrame !== undefined) {
      const start = frameField(row, 'startFrame', ctx);
      if (isTranslation(start)) return withPath(start, `items[${index}].startFrame`);
      converted.startSec = framesToSec(start as number, ctx.fps);
    }
    if (durationFrames !== undefined) {
      const duration = frameField(row, 'durationFrames', ctx, { min: 1 });
      if (isTranslation(duration)) return withPath(duration, `items[${index}].durationFrames`);
      converted.durationSec = framesToSec(duration as number, ctx.fps);
    }
    if (isNonEmptyString(id)) updates.push({ clipId: id, ...converted });
    else {
      if (!isNonEmptyString(converted.text) || converted.startSec === undefined) {
        return { status: 'error', error: 'missing_field', path: `items[${index}]`, fix: 'A new text needs text and startFrame; an update needs id.' };
      }
      adds.push(converted);
    }
  }
  const calls: LegacyCall[] = [];
  if (adds.length) calls.push({ tool: 'add_texts', input: { items: adds } });
  if (updates.length) calls.push({ tool: 'update_text', input: { items: updates } });
  return { status: 'ok', calls };
}

function translateManageClipLinks(input: Input): V3Translation {
  if (input.action === 'sync') {
    const { action: _action, ...rest } = input;
    return { status: 'ok', calls: [{ tool: 'sync_clips', input: rest }] };
  }
  return { status: 'ok', calls: [{ tool: 'manage_clip_links', input }] };
}

function translateManageTracks(input: Input): V3Translation {
  const { order, ...rest } = input;
  return { status: 'ok', calls: [{ tool: 'manage_tracks', input: { ...rest, ...(isFiniteNumber(order) ? { stackOrder: order } : {}) } }] };
}

const PASSTHROUGH: Record<string, string> = {
  search_media: 'search_media',
  get_beat_grid: 'get_beat_grid',
  organize_media: 'organize_media',
  get_icons: 'get_icons',
  create_browser_handoff: 'create_browser_handoff',
  apply_layout: 'apply_layout',
  set_keyframes: 'set_keyframes',
  set_canvas: 'set_canvas',
  remove_silence: 'remove_silence',
  denoise_audio: 'denoise_audio',
  compose_component: 'compose_block_brief',
  list_models: 'list_models',
  generate_image: 'generate_image',
  generate_video: 'generate_video',
  generate_speech: 'generate_speech',
  generate_foley: 'generate_foley',
  lip_sync: 'lip_sync',
  list_skills: 'list_skills',
  undo: 'undo',
};

/** v3 tools whose translation is not written yet (tracked by the registry test). */
export const V3_PENDING_TRANSLATIONS: readonly string[] = [
  'inspect_media',
  'search_assets',
  'register_media',
  'import_media',
  'prepare_local_asset',
  'add_clips',
  'insert_clips',
  'set_clip_framing',
  'apply_component',
  'set_captions',
  'read_skill',
];

/** Translate one v3 call into legacy calls. Pure; never touches the document. */
export function translateV3Call(name: string, rawInput: unknown, ctx: V3AdapterContext): V3Translation {
  if (!V3_TOOL_IDS.has(name)) return { status: 'error', error: 'unknown_tool', value: name, fix: 'Use a tool from the v3 surface.' };
  const input: Input = rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput) ? (rawInput as Input) : {};
  if (V3_PENDING_TRANSLATIONS.includes(name)) return { status: 'pending', reason: `${name} is not translated yet` };
  if (PASSTHROUGH[name]) return { status: 'ok', calls: [{ tool: PASSTHROUGH[name]!, input }] };
  switch (name) {
    case 'get_state': return translateGetState(input);
    case 'get_transcript': return translateGetTranscript(input, ctx);
    case 'inspect_timeline': return translateInspectTimeline(input, ctx);
    case 'manage_project': return translateManageProject(input);
    case 'move_clips': return translateMoveClips(input, ctx);
    case 'remove_clips': return translateRemoveClips(input, ctx);
    case 'split_clips': return translateSplitClips(input, ctx);
    case 'ripple_delete_ranges': return translateRippleDeleteRanges(input, ctx);
    case 'set_clip_properties': return translateSetClipProperties(input, ctx);
    case 'remove_words': return translateRemoveWords(input);
    case 'add_transition': return translateAddTransition(input, ctx);
    case 'preview': return translatePreview(input, ctx);
    case 'export': return translateExport(input);
    case 'generate_audio': return translateGenerateAudio(input);
    case 'manage_voices': return translateManageVoices(input);
    case 'ask_user': return translateAskUser(input);
    case 'manage_frame': return translateManageFrame(input);
    case 'set_texts': return translateSetTexts(input, ctx);
    case 'manage_clip_links': return translateManageClipLinks(input);
    case 'manage_tracks': return translateManageTracks(input);
    default: return { status: 'pending', reason: `${name} has no translation entry` };
  }
}
