import { WHITEBOARD_MEDIA_LIMITS } from '@pireel/studio-engine/whiteboard-workflow';
/** Task metadata: the model resolves identity; validation checks references and honest outcomes. */
export interface WhiteboardEntity {
  id: string;
  name: string;
  kind: 'person' | 'company' | 'object' | 'product' | 'event';
  beatIds: string[];
  queries: string[];
  status: 'selected' | 'fallback';
  assetId?: string;
  sourceUrl?: string;
  credit?: string;
  treatment?: 'photo' | 'person-cutout' | 'logo' | 'footage';
  reason: string;
}

export function readWhiteboardEntities(value: unknown, beatIds: Set<string>, assetIds: Set<string>): { entities: WhiteboardEntity[]; error?: undefined } | { error: string; entities?: undefined } {
  if (!Array.isArray(value) || value.length > WHITEBOARD_MEDIA_LIMITS.entities) return { error: `Whiteboard planning needs entities (up to ${WHITEBOARD_MEDIA_LIMITS.entities}; [] only for abstract content).` };
  const entities: WhiteboardEntity[] = [], ids = new Set<string>();
  const text = (v: unknown, max = 500): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  for (const row of value) {
    const e = row as WhiteboardEntity | null;
    if (!e || !text(e.id, 80) || ids.has(e.id) || !text(e.name, 160) || !['person', 'company', 'object', 'product', 'event'].includes(e.kind)
      || !Array.isArray(e.beatIds) || !e.beatIds.length || e.beatIds.some(id => !beatIds.has(id))
      || !Array.isArray(e.queries) || e.queries.length > WHITEBOARD_MEDIA_LIMITS.queriesPerEntity || e.queries.some(q => !text(q, 200)) || !text(e.reason, 1000)) return { error: `Each entity needs a unique id, exact identity, real beatIds, at most ${WHITEBOARD_MEDIA_LIMITS.queriesPerEntity} search queries and an inspection/selection or fallback reason.` };
    if (e.status === 'selected') {
      if (!text(e.assetId, 160) || !assetIds.has(e.assetId)) return { error: `Entity ${e.id}: register the selected real asset before saving the plan.` };
    } else if (e.status === 'fallback') {
      if (!e.queries.length || e.assetId) return { error: `Entity ${e.id}: record the attempted query and concrete text/diagram fallback, without claiming a selected asset.` };
    } else return { error: `Entity ${e.id}: use selected or fallback.` };
    if (e.treatment && (!['photo', 'person-cutout', 'logo', 'footage'].includes(e.treatment) || e.treatment === 'person-cutout' && e.kind !== 'person')) return { error: `Entity ${e.id}: invalid treatment for this entity.` };
    if (e.sourceUrl !== undefined && (!text(e.sourceUrl, 2000) || !/^https?:\/\//.test(e.sourceUrl))) return { error: `Entity ${e.id}: invalid source URL.` };
    if (e.credit !== undefined && !text(e.credit, 1000)) return { error: `Entity ${e.id}: invalid credit.` };
    ids.add(e.id);
    entities.push({ id: e.id, name: e.name, kind: e.kind, beatIds: [...new Set(e.beatIds)], queries: [...e.queries], status: e.status, reason: e.reason,
      ...(e.assetId ? { assetId: e.assetId } : {}), ...(e.sourceUrl ? { sourceUrl: e.sourceUrl } : {}), ...(e.credit ? { credit: e.credit } : {}), ...(e.treatment ? { treatment: e.treatment } : {}) });
  }
  return { entities };
}
