import { canonicalJson, hashSection } from './stable-json';
import { parseEditorDocumentV2, validateEditorDocumentV2 } from './editor-document';
import { normalizeProjectOutputs, type StudioProjectOutputSnapshot } from './project-outputs';
import { prepareEditorDocumentForPersistence } from './project-document';
import { sanitizeProjectContext, type ProjectSavePayload, type StudioProjectDto } from './project-dto';

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const equal = (a: unknown, b: unknown) => a === b || (a !== undefined && b !== undefined && canonicalJson(a) === canonicalJson(b));
const identity = (v: unknown): string | null => record(v)
  ? typeof v.id === 'string' ? v.id : typeof v.assetId === 'string' ? v.assetId : null : null;

/** Replay only local changes over remote state. Entity arrays use durable ids, never indices.
 * Concurrent edits to one scalar use the local intent; callers retain the other version. */
export function reconcileValue(base: unknown, local: unknown, remote: unknown): { value: unknown; collided: boolean } {
  if (equal(local, base)) return { value: remote, collided: false };
  if (equal(remote, base) || equal(local, remote)) return { value: local, collided: false };
  if ((record(base) || base === undefined) && record(local) && record(remote)) {
    const original = record(base) ? base : {};
    let collided = false;
    const entries: Array<[string, unknown]> = [];
    for (const key of new Set([...Object.keys(original), ...Object.keys(local), ...Object.keys(remote)])) {
      const result = reconcileValue(original[key], local[key], remote[key]);
      collided ||= result.collided;
      if (result.value !== undefined) entries.push([key, result.value]);
    }
    return { value: Object.fromEntries(entries), collided };
  }
  if ((Array.isArray(base) || base === undefined) && Array.isArray(local) && Array.isArray(remote)
    && [base ?? [], local, remote].every(a => a.every(v => identity(v) !== null) && new Set(a.map(identity)).size === a.length)) {
    const original: unknown[] = Array.isArray(base) ? base : [];
    const index = (a: unknown[]) => new Map(a.map(v => [identity(v)!, v]));
    const b = index(original), l = index(local), r = index(remote);
    const values = new Map<string, unknown>();
    let collided = false;
    for (const id of new Set([...b.keys(), ...l.keys(), ...r.keys()])) {
      const next = reconcileValue(b.get(id), l.get(id), r.get(id));
      collided ||= next.collided;
      if (next.value !== undefined) values.set(id, next.value);
    }
    const common = (a: unknown[]) => a.map(identity).filter(id => b.has(id!) && l.has(id!) && r.has(id!));
    const locallyReordered = !equal(common(original), common(local));
    const order = (locallyReordered ? local : remote).map(identity).filter((id): id is string => id !== null && values.has(id));
    // Insert new identities next to their authored neighbour without moving remote-only items.
    for (const source of [local, remote]) {
      const ids = source.map(identity) as string[];
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]!;
        if (!values.has(id) || order.includes(id)) continue;
        const following = ids.slice(i + 1).find(key => order.includes(key));
        const previous = ids.slice(0, i).reverse().find(key => order.includes(key));
        order.splice(following ? order.indexOf(following) : previous ? order.indexOf(previous) + 1 : order.length, 0, id);
      }
    }
    return { value: order.map(id => values.get(id)), collided };
  }
  return { value: local, collided: true };
}

/** Outputs are independent documents. Normalize them by id before merging so changing which
 * output is active never mixes one film's tracks into another film. */
function outputState(p: ProjectSavePayload) {
  const outputs = normalizeProjectOutputs(p.context?.outputs, 0);
  const active: StudioProjectOutputSnapshot = { ...outputs.active, document: p.document!, videoSig: p.videoSig,
    videoDurationSec: p.videoDurationSec, coverThumb: p.coverThumb ?? null };
  return { activeId: active.id, outputs: [active, ...outputs.inactive] };
}

/** Merge a local save with an acknowledged cloud snapshot. Only true overlapping edits create
 * a normal, switchable recovery output; routine background imports never interrupt editing. */
export function reconcileProjectSave(base: ProjectSavePayload, local: ProjectSavePayload, remote: StudioProjectDto, unknownBase = false): ProjectSavePayload {
  if (!unknownBase && equal(base.document, remote.document) && equal(base.context, remote.context)) return local;
  const complete = (p: ProjectSavePayload): ProjectSavePayload => ({ ...base, ...p,
    document: p.document ?? base.document ?? remote.document, context: p.context ?? base.context ?? remote.context });
  const b = complete(base), l = complete(local);
  const bs = outputState(b), ls = outputState(l), rs = outputState(remote);
  const merged = reconcileValue(bs.outputs, ls.outputs, rs.outputs);
  let outputs = merged.value as StudioProjectOutputSnapshot[];
  let invalid = false;
  outputs = outputs.map(output => {
    const parsed = parseEditorDocumentV2(output.document);
    if (!parsed || validateEditorDocumentV2(parsed).some(issue => issue.severity === 'error')) {
      invalid = true;
      return ls.outputs.find(o => o.id === output.id) ?? rs.outputs.find(o => o.id === output.id) ?? output;
    }
    return { ...output, document: prepareEditorDocumentForPersistence(parsed) };
  });
  const activeId = ls.activeId; // a remote tab switching its view must not switch this editor's view
  let active = outputs.find(o => o.id === activeId);
  if (!active) { active = ls.outputs[0]!; outputs = [...outputs, active]; }
  const contextResult = reconcileValue(b.context, l.context, remote.context);
  const context = sanitizeProjectContext(contextResult.value);
  let inactive = outputs.filter(o => o.id !== activeId);
  // Keep the remote branch for a real collision; stable snapshot ids make retries idempotent.
  if (merged.collided || invalid || unknownBase) {
    for (const source of rs.outputs) {
      const kept = source.id === activeId ? active : inactive.find(o => o.id === source.id);
      if (equal(source.document, kept?.document)) continue;
      const id = `recovery-${hashSection(canonicalJson({ id: source.id, document: source.document }))}`;
      if (!inactive.some(o => o.id === id)) inactive = [...inactive, { ...source, id,
        title: `${source.title || 'Output'} · recovered`, order: Math.max(0, ...outputs.map(o => o.order)) + 1,
        createdAt: remote.updatedAt, updatedAt: remote.updatedAt }];
    }
  }
  const { document, videoSig, videoDurationSec, coverThumb, ...meta } = active;
  return { ...local, document, videoSig, videoDurationSec,
    ...(local.title !== undefined ? { title: reconcileValue(base.title, local.title, remote.title).value as string } : {}),
    ...(local.coverThumb !== undefined ? { coverThumb } : {}),
    context: { ...context, outputs: { active: meta, inactive } } };
}
