/**
 * Whiteboard clips — a graphic block whose content is a structured board document
 * (`{ templateId: 'whiteboard', slots: { doc, fontFamily } }`).
 *
 * The engine only stores and places these clips. Rendering is provided by whichever host registers
 * the `whiteboard` template; without one the block degrades to an empty element, like any unknown
 * template. The checks here are structural so a malformed document never reaches the timeline.
 */

export const WHITEBOARD_TEMPLATE_ID = 'whiteboard';

/** Handwriting face from the web font library; the block's fontFamily slot makes the document link it. */
export const WHITEBOARD_FONT_ID = 'web:long-cang';

/** Upper bound on the serialized board document, far above a few minutes of explanation. */
export const WHITEBOARD_DOC_MAX_CHARS = 200_000;

const TAIL_SEC = 1.6;
const MIN_SEC = 3;

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value);

export interface WhiteboardDocCheck {
  ok: boolean;
  errors: string[];
  nodes: number;
  beats: number;
}

/** Structural check of a board document: required collections, ids, and references between them. */
export function checkWhiteboardDoc(doc: unknown): WhiteboardDocCheck {
  const errors: string[] = [];
  if (!isObject(doc)) return { ok: false, errors: ['doc must be an object'], nodes: 0, beats: 0 };
  const size = JSON.stringify(doc).length;
  if (size > WHITEBOARD_DOC_MAX_CHARS) errors.push(`doc is ${size} characters; the limit is ${WHITEBOARD_DOC_MAX_CHARS}`);

  const board = isObject(doc.board) ? doc.board : null;
  const nodes = board && Array.isArray(board.nodes) ? board.nodes.filter(isObject) : [];
  const edges = board && Array.isArray(board.edges) ? board.edges.filter(isObject) : [];
  const scenes = Array.isArray(doc.scenes) ? doc.scenes.filter(isObject) : [];
  const beats = Array.isArray(doc.beats) ? doc.beats.filter(isObject) : [];
  const narration = isObject(doc.narration) ? doc.narration : null;
  const sentences = narration && Array.isArray(narration.sentences) ? narration.sentences.filter(isObject) : [];

  if (!board || !Array.isArray(board.nodes)) errors.push('doc.board.nodes must be an array');
  else if (!nodes.length) errors.push('doc.board has no nodes');
  if (!Array.isArray(doc.scenes)) errors.push('doc.scenes must be an array');
  if (!Array.isArray(doc.beats)) errors.push('doc.beats must be an array');
  if (!narration || !sentences.length) errors.push('doc.narration.sentences must list the spoken sentences');
  else {
    const timed = sentences.every((sentence) => Array.isArray(sentence.words) && sentence.words.length > 0);
    if (!timed && !(typeof narration.durationSec === 'number' && narration.durationSec > 0)) {
      errors.push('doc.narration needs durationSec (the voiceover length in seconds) when sentences carry no timed words');
    }
  }

  const nodeIds = new Set(nodes.map((node) => node.id).filter((id): id is string => typeof id === 'string'));
  const targets = new Set([...nodeIds, ...edges.map((edge) => edge.id).filter((id): id is string => typeof id === 'string')]);
  const sentenceIds = new Set(sentences.map((sentence) => sentence.id).filter((id): id is string => typeof id === 'string'));
  if (nodeIds.size !== nodes.length) errors.push('every board node needs a unique string id');
  for (const edge of edges) {
    if (!nodeIds.has(edge.from as string) || !nodeIds.has(edge.to as string)) errors.push(`edge ${String(edge.id)} connects unknown nodes`);
  }
  for (const scene of scenes) {
    for (const id of Array.isArray(scene.nodeIds) ? scene.nodeIds : []) {
      if (!nodeIds.has(id as string)) errors.push(`scene ${String(scene.id)} lists unknown node ${String(id)}`);
    }
  }
  for (const beat of beats) {
    const anchor = isObject(beat.anchor) ? beat.anchor : null;
    if (!anchor || !sentenceIds.has(anchor.sentence as string)) errors.push(`beat ${String(beat.id)} is anchored to an unknown sentence`);
    for (const action of Array.isArray(beat.actions) ? beat.actions.filter(isObject) : []) {
      if (!targets.has(action.target as string)) errors.push(`beat ${String(beat.id)} targets unknown ${String(action.target)}`);
    }
  }
  return { ok: errors.length === 0, errors: errors.slice(0, 12), nodes: nodes.length, beats: beats.length };
}

/** Clip length a board needs: the narration's end (declared duration or last timed word) plus a closing hold. */
export function whiteboardDurationSec(doc: unknown): number {
  if (!isObject(doc) || !isObject(doc.narration)) return MIN_SEC;
  const narration = doc.narration;
  const start = typeof narration.leadInSec === 'number' ? narration.leadInSec : 0;
  let end = typeof narration.durationSec === 'number' && narration.durationSec > 0 ? start + narration.durationSec : 0;
  for (const sentence of Array.isArray(narration.sentences) ? narration.sentences : []) {
    for (const word of isObject(sentence) && Array.isArray(sentence.words) ? sentence.words : []) {
      if (isObject(word) && typeof word.end === 'number') end = Math.max(end, word.end);
    }
  }
  return Math.max(MIN_SEC, end + TAIL_SEC);
}
