import type { Composition } from './composition';

/** One editable deliverable inside a Studio project. The active deliverable stays in the
 * project's top-level comp fields; inactive deliverables are compact, video-free snapshots. */
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
  comp: Composition;
  videoSig: string | null;
  videoDurationSec: number | null;
  coverThumb: string | null;
}

export interface StudioProjectOutputs {
  active: StudioProjectOutputMeta;
  inactive: StudioProjectOutputSnapshot[];
}

export interface ActiveProjectOutputState {
  comp: Composition;
  videoSig: string | null;
  videoDurationSec: number | null;
  coverThumb: string | null;
}

const DEFAULT_OUTPUT_ID = 'output-main';

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finiteNumber = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/** Persistence boundary: detach nested arrays/objects and make sure browser-only blob URLs in comp.video never enter a snapshot. */
export function storedOutputComposition(comp: Composition): Composition {
  return JSON.parse(JSON.stringify({ ...comp, video: null })) as Composition;
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
    if (!isRecord(raw) || !isRecord(raw.comp)) continue;
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
      comp: storedOutputComposition(raw.comp as unknown as Composition),
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
    comp: storedOutputComposition(state.comp),
    videoSig: state.videoSig,
    videoDurationSec: state.videoDurationSec,
    coverThumb: state.coverThumb,
  };
}

/** Complete ordered list for preview/UI rendering, including a fresh snapshot of the active output. */
export function listProjectOutputs(outputs: StudioProjectOutputs, state: ActiveProjectOutputState): StudioProjectOutputSnapshot[] {
  return [captureActiveOutput(outputs, state, outputs.active.updatedAt), ...outputs.inactive].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
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

/** Duplicate the current deliverable and check out the copy immediately (the original becomes an inactive snapshot). */
export function duplicateProjectOutput(
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
  const target: StudioProjectOutputSnapshot = { ...current, ...meta };
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
