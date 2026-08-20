import { emptyEditorDocumentV2, parseEditorDocumentV2, type EditorDocumentV2 } from './editor-document';

/** One editable deliverable inside a Studio project. The active deliverable stays in the
 * project's top-level document; inactive deliverables are self-contained V2 snapshots. */
export interface StudioProjectOutputMeta {
  id: string;
  title: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  /** Scenario skill that created this deliverable (informational; editing is never locked to it). */
  skill?: string;
}

export interface StudioProjectOutputSnapshot extends StudioProjectOutputMeta {
  document: EditorDocumentV2;
  videoSig: string | null;
  videoDurationSec: number | null;
  coverThumb: string | null;
}

export interface StudioProjectOutputs {
  active: StudioProjectOutputMeta;
  inactive: StudioProjectOutputSnapshot[];
}

export interface ActiveProjectOutputState {
  document: EditorDocumentV2;
  videoSig: string | null;
  videoDurationSec: number | null;
  coverThumb: string | null;
}

export interface ProjectOutputReference {
  id?: string;
  /** One-based position in the current UI order. Positions are dynamic; ids are durable. */
  position?: number;
}

const DEFAULT_OUTPUT_ID = 'output-main';

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finiteNumber = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/** Persistence boundary: detach nested arrays/objects. V2 locators are durable identities;
 * browser-only object URLs live in the runtime resolver and never enter the document. */
export function storedOutputDocument(document: EditorDocumentV2): EditorDocumentV2 {
  return JSON.parse(JSON.stringify(document)) as EditorDocumentV2;
}

export function createProjectOutputs(now = Date.now()): StudioProjectOutputs {
  return {
    active: { id: DEFAULT_OUTPUT_ID, title: '', order: 0, createdAt: now, updatedAt: now },
    inactive: [],
  };
}

function normalizeMeta(value: unknown, fallback: StudioProjectOutputMeta): StudioProjectOutputMeta {
  if (!isRecord(value)) return fallback;
  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : fallback.id,
    title: typeof value.title === 'string' ? value.title.trim().slice(0, 80) : fallback.title,
    order: Math.max(0, Math.floor(finiteNumber(value.order, fallback.order))),
    createdAt: finiteNumber(value.createdAt, fallback.createdAt),
    updatedAt: finiteNumber(value.updatedAt, fallback.updatedAt),
    ...(typeof value.skill === 'string' && value.skill.trim() ? { skill: value.skill.trim().slice(0, 80) } : {}),
  };
}

/** Old projects have no outputs key and become a one-output project without a migration script. */
export function normalizeProjectOutputs(value: unknown, now = Date.now()): StudioProjectOutputs {
  const empty = createProjectOutputs(now);
  if (!isRecord(value)) return empty;
  const active = normalizeMeta(value.active, empty.active);
  const seen = new Set([active.id]);
  const inactive: StudioProjectOutputSnapshot[] = [];
  for (const [index, raw] of (Array.isArray(value.inactive) ? value.inactive : []).entries()) {
    if (!isRecord(raw)) continue;
    const document = parseEditorDocumentV2(raw.document);
    if (!document) continue;
    const meta = normalizeMeta(raw, {
      id: `output-${index + 2}`,
      title: '',
      order: index + 1,
      createdAt: now,
      updatedAt: now,
    });
    if (seen.has(meta.id)) continue;
    seen.add(meta.id);
    inactive.push({
      ...meta,
      document: storedOutputDocument(document),
      videoSig: typeof raw.videoSig === 'string' ? raw.videoSig : null,
      videoDurationSec: typeof raw.videoDurationSec === 'number' && Number.isFinite(raw.videoDurationSec) ? raw.videoDurationSec : null,
      coverThumb: typeof raw.coverThumb === 'string' ? raw.coverThumb : null,
    });
  }
  return { active, inactive };
}

export function captureActiveOutput(outputs: StudioProjectOutputs, state: ActiveProjectOutputState, now = Date.now()): StudioProjectOutputSnapshot {
  return {
    ...outputs.active,
    updatedAt: now,
    document: storedOutputDocument(state.document),
    videoSig: state.videoSig,
    videoDurationSec: state.videoDurationSec,
    coverThumb: state.coverThumb,
  };
}

/** Complete ordered list for preview/UI rendering, including a fresh snapshot of the active output. */
export function listProjectOutputs(outputs: StudioProjectOutputs, state: ActiveProjectOutputState): StudioProjectOutputSnapshot[] {
  return [captureActiveOutput(outputs, state, outputs.active.updatedAt), ...outputs.inactive].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

/** Current ordinal map for natural-language references such as "the second output". Recompute for
 * every operation: positions may change after deletion, while the mapped ids never do. */
export function projectOutputPositionMap(outputs: StudioProjectOutputs): ReadonlyMap<number, string> {
  const ordered = [outputs.active, ...outputs.inactive].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  return new Map(ordered.map((output, index) => [index + 1, output.id]));
}

/** Resolve either a durable id or a live one-based position. When both are supplied they must agree. */
export function resolveProjectOutputId(
  outputs: StudioProjectOutputs,
  reference: ProjectOutputReference,
  defaultToActive = true,
): string | null {
  const ids = new Set([outputs.active.id, ...outputs.inactive.map((output) => output.id)]);
  const id = reference.id?.trim() || null;
  const positionId = Number.isInteger(reference.position) && (reference.position ?? 0) > 0
    ? projectOutputPositionMap(outputs).get(reference.position!) ?? null
    : null;
  if (id && positionId) return id === positionId && ids.has(id) ? id : null;
  if (id) return ids.has(id) ? id : null;
  if (reference.position != null) return positionId;
  return defaultToActive ? outputs.active.id : null;
}

export function switchProjectOutput(
  outputs: StudioProjectOutputs,
  state: ActiveProjectOutputState,
  targetId: string,
  now = Date.now(),
): { outputs: StudioProjectOutputs; target: StudioProjectOutputSnapshot } | null {
  if (targetId === outputs.active.id) return { outputs, target: captureActiveOutput(outputs, state, now) };
  const target = outputs.inactive.find((item) => item.id === targetId);
  if (!target) return null;
  const current = captureActiveOutput(outputs, state, now);
  return {
    outputs: {
      active: { id: target.id, title: target.title, order: target.order, createdAt: target.createdAt, updatedAt: now, ...(target.skill ? { skill: target.skill } : {}) },
      inactive: [...outputs.inactive.filter((item) => item.id !== targetId), current],
    },
    target,
  };
}

const outputId = (now: number) => `output-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Create and check out an empty deliverable while snapshotting the current one. Canvas format and
 * the reusable project media manifest carry forward; timeline clips, Director artifacts and output
 * presentation do not. An asset registered for output A must remain addressable while building B. */
export function createBlankProjectOutput(
  outputs: StudioProjectOutputs,
  state: ActiveProjectOutputState,
  title: string,
  skill?: string,
  now = Date.now(),
): { outputs: StudioProjectOutputs; target: StudioProjectOutputSnapshot } {
  const current = captureActiveOutput(outputs, state, now);
  const order = Math.max(outputs.active.order, ...outputs.inactive.map((item) => item.order), -1) + 1;
  const meta: StudioProjectOutputMeta = {
    id: outputId(now),
    title: title.trim().slice(0, 80),
    order,
    createdAt: now,
    updatedAt: now,
    ...(skill?.trim() ? { skill: skill.trim().slice(0, 80) } : {}),
  };
  const empty = emptyEditorDocumentV2({
    width: state.document.canvas.width,
    height: state.document.canvas.height,
    fps: state.document.canvas.fps,
    theme: state.document.appearance.theme,
  });
  const shared = storedOutputDocument(state.document);
  const target: StudioProjectOutputSnapshot = {
    ...meta,
    document: {
      ...empty,
      canvas: { ...empty.canvas, configured: state.document.canvas.configured },
      assets: shared.assets,
      semantics: {
        ...empty.semantics,
        transcripts: shared.semantics.transcripts,
      },
    },
    videoSig: null,
    videoDurationSec: null,
    coverThumb: null,
  };
  return { outputs: { active: meta, inactive: [...outputs.inactive, current] }, target };
}

/** Copy the active deliverable into a new stable output id and check out the copy. This is
 * intentionally separate from blank creation so callers cannot confuse "new" with "duplicate". */
export function duplicateActiveProjectOutput(
  outputs: StudioProjectOutputs,
  state: ActiveProjectOutputState,
  title: string,
  now = Date.now(),
): { outputs: StudioProjectOutputs; target: StudioProjectOutputSnapshot } {
  const current = captureActiveOutput(outputs, state, now);
  const order = Math.max(outputs.active.order, ...outputs.inactive.map((item) => item.order), -1) + 1;
  const meta: StudioProjectOutputMeta = {
    id: outputId(now),
    title: title.trim().slice(0, 80),
    order,
    createdAt: now,
    updatedAt: now,
    ...(outputs.active.skill ? { skill: outputs.active.skill } : {}),
  };
  const target: StudioProjectOutputSnapshot = {
    ...current,
    ...meta,
    document: storedOutputDocument(current.document),
  };
  return { outputs: { active: meta, inactive: [...outputs.inactive, current] }, target };
}

export function renameProjectOutput(outputs: StudioProjectOutputs, id: string, title: string, now = Date.now()): StudioProjectOutputs {
  const clean = title.trim().slice(0, 80);
  if (!clean) return outputs;
  if (outputs.active.id === id) return { ...outputs, active: { ...outputs.active, title: clean, updatedAt: now } };
  return { ...outputs, inactive: outputs.inactive.map((item) => (item.id === id ? { ...item, title: clean, updatedAt: now } : item)) };
}

/** Delete an inactive output. The active output is deliberately protected; switch first so deletion never silently swaps the canvas. */
export function deleteInactiveProjectOutput(outputs: StudioProjectOutputs, id: string): StudioProjectOutputs {
  if (id === outputs.active.id) return outputs;
  return { ...outputs, inactive: outputs.inactive.filter((item) => item.id !== id) };
}
