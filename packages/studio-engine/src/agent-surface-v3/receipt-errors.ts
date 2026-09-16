import type { V3ClipKind } from './adapter';

/**
 * Failure receipts are the agent's correction channel, so every refused call must say what to do
 * next in the same shape (`error` code, `fix`, `detail`). The legacy step layer reports failures as
 * prose (`items[0] is not a title text clip`, `clip not found`) with no code and no fix; a model
 * reading that cannot tell "this id does not exist" from "this id is the wrong kind of clip", and
 * picks the wrong repair. This one classifier sits at the run_v3 boundary for every tool, on both
 * surfaces, and turns those messages into receipts the model can act on:
 *
 * - `unknown_id`: an id in the call is not in this project — the fix is to read state and use real ids.
 * - `wrong_kind`: the id exists but the tool does not act on that kind — the fix names the tool that does.
 * - anything else keeps the legacy message as its code, with the detail attached.
 */

export interface StepFailureContext {
  kindOf: (clipId: string) => V3ClipKind | undefined;
  hasAsset?: (assetId: string) => boolean;
}

export interface StepFailure {
  error: string;
  fix?: string;
  detail: string;
  unknownIds?: string[];
}

const ID_KEYS = new Set(['id', 'ids', 'clipId', 'clipIds', 'sourceClipId', 'targetClipId', 'anchorClipId']);
const ID_RELATED = /not found|unknown|no (?:such )?clip|does not exist|is not a\b|isn't a\b|missing clip|no clip/i;
const WRONG_KIND = /is not an? (?:[a-z]+ )*?clip|isn't an? (?:[a-z]+ )*?clip/i;

const KIND_TOOLS: Record<V3ClipKind | 'component', string> = {
  narrative: 'set_clip_properties for timing and sound, set_clip_framing for its picture, remove_words for its speech',
  media: 'set_clip_properties for timing and sound, set_clip_framing for its picture',
  graphic: 'apply_component to change its content, set_clip_properties for its box and timing',
  component: 'apply_component to change its content, set_clip_properties for its box and timing',
  audio: 'set_clip_properties',
  text: 'set_texts',
  caption: 'set_captions',
};

function collectIds(value: unknown, out: string[], key?: string): void {
  if (typeof value === 'string') {
    if (key && ID_KEYS.has(key) && value.trim()) out.push(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectIds(entry, out, key);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) collectIds(child, out, childKey);
  }
}

/** The id an `items[N]` message points at, when the message indexes the call's items. */
function indexedId(message: string, args: Record<string, unknown>): string | undefined {
  const match = /items\[(\d+)\]/.exec(message);
  if (!match || !Array.isArray(args.items)) return undefined;
  const item = args.items[Number(match[1])];
  if (!item || typeof item !== 'object') return undefined;
  const record = item as Record<string, unknown>;
  const candidate = record.clipId ?? record.id;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}

export function describeStepFailure(
  tool: string,
  args: Record<string, unknown>,
  legacyError: string | undefined,
  ctx: StepFailureContext,
  legacyData?: unknown,
): StepFailure {
  const message = legacyError && legacyError.trim() ? legacyError.trim() : 'step_failed';
  const detail = message;
  // A legacy step that already knows the next move says so under data.fix; it becomes the receipt's fix.
  const carriedFix = legacyData && typeof legacyData === 'object' && typeof (legacyData as { fix?: unknown }).fix === 'string'
    ? (legacyData as { fix: string }).fix
    : undefined;
  const ids: string[] = [];
  collectIds(args, ids);
  const pointed = indexedId(message, args);
  if (pointed) ids.unshift(pointed);
  const seen = new Set<string>();
  const unique = ids.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
  const known = (id: string) => ctx.kindOf(id) !== undefined || ctx.hasAsset?.(id) === true;
  const unknown = unique.filter((id) => !known(id));
  const mentioned = (id: string) => message.includes(id);

  if (unknown.length && (ID_RELATED.test(message) || unknown.some(mentioned))) {
    const list = unknown.map((id) => `"${id}"`).join(', ');
    return {
      error: 'unknown_id',
      unknownIds: unknown,
      detail,
      fix: `${unknown.length === 1 ? `${list} is not a clip or asset in this project` : `${list} are not clips or assets in this project`}. Ids come only from get_state or a receipt; read get_state and send ${tool} again with real ids.`,
    };
  }

  if (WRONG_KIND.test(message)) {
    const subject = pointed ?? unique.find((id) => mentioned(id)) ?? unique.find((id) => ctx.kindOf(id) !== undefined);
    const kind = subject ? ctx.kindOf(subject) : undefined;
    if (subject && kind) {
      return {
        error: 'wrong_kind',
        detail,
        fix: `"${subject}" is a ${kind} clip, which ${tool} does not act on. Use ${KIND_TOOLS[kind]}.`,
      };
    }
  }

  return { error: message, detail, ...(carriedFix ? { fix: carriedFix } : {}) };
}
