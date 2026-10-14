/** Serializable drawing vocabulary shared by the agent contract and the whiteboard renderer. */
export const DRAWING_PROPERTIES = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity', 'draw', 'strokeWidth', 'progress', 'value'] as const;
export const DRAWING_COLORS = ['ink', 'accent', 'secondary', 'muted', 'surface', 'blue', 'orange', 'green', 'purple', 'pink', 'yellow', 'none'] as const;
export const DRAWING_EASINGS = ['linear', 'smooth', 'out', 'back'] as const;
export type DrawingProperty = typeof DRAWING_PROPERTIES[number];
export type DrawingColor = typeof DRAWING_COLORS[number];
export type DrawingTrack = {
  property: DrawingProperty;
  /** If present, keyframe times are offsets from this narration beat (including board lead). */
  beat?: string;
  ease?: typeof DRAWING_EASINGS[number];
  keyframes: { t: number; value: number }[];
};
export type DrawingPoint = [number, number];
export type WhiteboardCameraTarget = string | { nodeId: string; elements: string[] };

/** Validate camera references before storing a board. Ordinary node/edge/group ids remain valid. */
export function whiteboardCameraErrors(camera: unknown, nodes: readonly { id?: unknown; content?: unknown }[], targets: Set<string>): string[] {
  if (!camera || typeof camera !== 'object') return [];
  const c = camera as Record<string, unknown>;
  const errors: string[] = [];
  for (const [key, min, max] of [['padding', 0, 1], ['maxZoom', .2, 4], ['durationSec', .3, 4]] as const) {
    if (c[key] !== undefined && !(typeof c[key] === 'number' && Number.isFinite(c[key]) && c[key] >= min && c[key] <= max)) errors.push(`camera ${key} must be ${min}..${max}`);
  }
  if (!Array.isArray(c.focus) || !c.focus.length) return [...errors, 'camera focus must list at least one target'];
  for (const target of c.focus) {
    if (typeof target === 'string') {
      if (!targets.has(target)) errors.push(`camera references unknown target ${target}`);
      continue;
    }
    if (!target || typeof target !== 'object') { errors.push('camera focus target must be an id or drawing selection'); continue; }
    const node = nodes.find((n) => n.id === target.nodeId);
    const content = node?.content as Partial<DrawingContent> | undefined;
    if (content?.kind !== 'drawing') { errors.push(`camera ${String(target.nodeId)} is not a drawing node`); continue; }
    if (!Array.isArray(target.elements) || !target.elements.length) { errors.push('camera drawing selection needs element ids'); continue; }
    const ids = new Set((content.elements ?? []).map((e) => e.id));
    for (const id of target.elements) if (!ids.has(id)) errors.push(`camera references unknown drawing element ${String(target.nodeId)}/${String(id)}`);
  }
  return errors;
}
export type DrawingElement = {
  id: string;
  x?: number;
  y?: number;
  stroke?: DrawingColor;
  fill?: DrawingColor;
  strokeWidth?: number;
  /** 0 = clean geometry; otherwise Rough.js geometry is prepared once on the host. */
  roughness?: number;
  fillStyle?: 'solid' | 'hachure' | 'cross-hatch';
  opacity?: number;
  /** Polyline in drawing coordinates, traversed by the progress track at constant distance. */
  route?: DrawingPoint[];
  tracks?: DrawingTrack[];
} & (
  | { shape: 'ellipse'; w: number; h: number }
  | { shape: 'rect'; w: number; h: number }
  | { shape: 'path'; points: DrawingPoint[]; closed?: boolean }
  | { shape: 'text'; text: string; fontSize?: number; align?: 'start' | 'middle' | 'end' }
  | { shape: 'number'; value: number; decimals?: number; prefix?: string; suffix?: string; fontSize?: number; align?: 'start' | 'middle' | 'end' }
);
export type DrawingContent = {
  kind: 'drawing';
  /** Local SVG coordinate space. Node size can scale it, but never changes motion timing. */
  width: number;
  height: number;
  elements: DrawingElement[];
  /** Host-derived geometry, never authored by the agent or persisted in its tool input. */
  prepared?: Record<string, { d: string; role: 'stroke' | 'fill' | 'hatch' }[]>;
};

/** Cross-field and bound checks. The general tool schema validator only checks types/enums. */
export function drawingReferenceErrors(content: unknown, beatIds: Set<string>): string[] {
  const c = content as Partial<DrawingContent> | null;
  if (!c || c.kind !== 'drawing' || !Array.isArray(c.elements)) return [];
  const errors: string[] = [];
  const bounded = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const pointsValid = (points: unknown): boolean => Array.isArray(points) && points.length >= 2 && points.length <= 200
    && points.every((p) => Array.isArray(p) && p.length === 2 && p.every((v) => bounded(v, -100_000, 100_000)));
  if (!bounded(c.width, 1, 4096) || !bounded(c.height, 1, 4096)) errors.push('drawing dimensions must be 1..4096');
  if (c.elements.length < 1 || c.elements.length > 160) errors.push('drawing needs 1..160 elements');
  const ids = new Set<string>();
  for (const e of c.elements) {
    if (!e || typeof e !== 'object') { errors.push('drawing element must be an object'); continue; }
    if (typeof e.id !== 'string' || !e.id.length || e.id.length > 500 || ['__proto__', 'constructor', 'prototype'].includes(e.id)) errors.push('drawing element needs a non-reserved id');
    if (ids.has(e.id)) errors.push(`drawing element id ${e.id} is duplicated`);
    ids.add(e.id);
    if ((e.shape === 'ellipse' || e.shape === 'rect') && (!bounded(e.w, 1, 4096) || !bounded(e.h, 1, 4096))) errors.push(`drawing ${e.id} needs positive geometry dimensions`);
    if (e.shape === 'path' && !pointsValid(e.points)) errors.push(`drawing ${e.id} needs 2..200 finite points`);
    if (e.route !== undefined && !pointsValid(e.route)) errors.push(`drawing ${e.id} needs a valid route`);
    if (e.roughness !== undefined && !bounded(e.roughness, 0, 3)) errors.push(`drawing ${e.id} roughness must be 0..3`);
    if (e.strokeWidth !== undefined && !bounded(e.strokeWidth, 0, 40)) errors.push(`drawing ${e.id} strokeWidth must be 0..40`);
    if (e.opacity !== undefined && !bounded(e.opacity, 0, 1)) errors.push(`drawing ${e.id} opacity must be 0..1`);
    if (e.shape === 'text' || e.shape === 'number') {
      if (e.fontSize !== undefined && !bounded(e.fontSize, 12, 180)) errors.push(`drawing ${e.id} fontSize must be 12..180`);
      if (e.shape === 'number' && e.decimals !== undefined && (!Number.isInteger(e.decimals) || !bounded(e.decimals, 0, 4))) errors.push(`drawing ${e.id} decimals must be 0..4`);
    }
    if ((e.tracks?.length ?? 0) > DRAWING_PROPERTIES.length) errors.push(`drawing ${e.id} has too many tracks`);
    const properties = new Set<string>();
    for (const track of Array.isArray(e.tracks) ? e.tracks : []) {
      if (!track || typeof track !== 'object') continue;
      if (properties.has(track.property)) errors.push(`drawing ${e.id} repeats track ${track.property}`);
      properties.add(track.property);
      if (track.beat !== undefined && !beatIds.has(track.beat)) errors.push(`drawing ${e.id} references unknown beat ${track.beat}`);
      if (track.property === 'progress' && !e.route) errors.push(`drawing ${e.id} needs a route for progress`);
      if (track.property === 'value' && e.shape !== 'number') errors.push(`drawing ${e.id} needs shape number for value`);
      const frames = Array.isArray(track.keyframes) ? track.keyframes : [];
      if (frames.length < 2 || frames.length > 64 || frames.some((f) => !f || !bounded(f.t, 0, 3600) || !bounded(f.value, -100_000, 100_000))) errors.push(`drawing ${e.id} needs 2..64 finite keyframes within 0..3600 seconds`);
      for (let i = 1; i < frames.length; i++) {
        if (!(frames[i]?.t > frames[i - 1]?.t)) errors.push(`drawing ${e.id} keyframe times must strictly increase`);
      }
    }
  }
  return errors;
}
