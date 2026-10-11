import type { WorkflowInputs, WorkflowValue } from './workflow';

export type ArtifactKind = 'media' | 'transcript' | 'caption-plan' | 'translation' | 'edit-plan' | 'document' | 'speech-plan' | 'speech' | 'visual-analysis';
export interface ArtifactRef { kind: ArtifactKind; id: string; version: string }
export interface ArtifactEntry { ref: ArtifactRef; value: WorkflowValue }
export interface SceneWorkflowData {
  artifacts: Record<string, ArtifactEntry>;
  receipts: Record<string, { status: 'running' | 'completed'; runId: string; idempotencyKey: string; outputs?: WorkflowInputs; usage?: import('./workflow').WorkflowUsage[] }>;
  /** Small resumable receipts (for example completed TTS chunks), never media bytes. */
  partials: Record<string, WorkflowValue>;
}
export const emptySceneWorkflowData = (): SceneWorkflowData => ({ artifacts: {}, receipts: {}, partials: {} });
export function workflowJson(value: unknown): WorkflowValue { return JSON.parse(JSON.stringify(value)); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
export async function artifactVersion(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
/** Immutable, content-versioned JSON artifacts. Hosts resolve media identities to bytes separately. */
export class WorkflowArtifactStore {
  constructor(readonly entries: SceneWorkflowData['artifacts']) {}
  async put(kind: ArtifactKind, id: string, value: unknown): Promise<ArtifactRef> {
    const json = workflowJson(value);
    const ref = { kind, id, version: await artifactVersion(json) };
    this.entries[await artifactVersion(ref)] = { ref, value: json };
    return ref;
  }
  read<T>(value: unknown, kind: ArtifactKind): T {
    const ref = value as ArtifactRef;
    if (!ref || ref.kind !== kind || !ref.id || !ref.version) throw new Error('Invalid ' + kind + ' artifact reference');
    const entry = Object.values(this.entries).find(entry => entry.ref.kind === kind && entry.ref.id === ref.id && entry.ref.version === ref.version);
    if (!entry) throw new Error('Artifact version unavailable: ' + ref.id + '@' + ref.version);
    return structuredClone(entry.value) as T;
  }
}

/** Fits legacy paid endpoints' UUID contract while preserving the workflow input identity. */
export async function workflowRequestId(key: string): Promise<string> {
  const hash = await artifactVersion(key);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
