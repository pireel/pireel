import type { WorkflowDefinition, WorkflowRun, WorkflowValue } from './workflow';

/** Trigger services normalize wall-clock schedules to UTC before entering the run queue. */
export type WorkflowTriggerEvent =
  | { kind: 'manual'; requestId: string }
  | { kind: 'asset-ready'; assetId: string; assetVersion: string }
  | { kind: 'schedule'; dueAt: string };

export function workflowTriggerKey(scope: string, definition: WorkflowDefinition, event: WorkflowTriggerEvent): string {
  if (!scope) throw new Error('Trigger scope is required');
  const eventParts = event.kind === 'manual' ? [event.requestId] : event.kind === 'asset-ready'
    ? [event.assetId, event.assetVersion] : [event.dueAt];
  if (eventParts.some((part) => !part)) throw new Error('Trigger needs a stable event identity');
  if (event.kind !== 'manual' && event.kind !== definition.trigger.kind) throw new Error('Trigger does not match workflow');
  if (event.kind === 'schedule' && (!event.dueAt.endsWith('Z') || !Number.isFinite(Date.parse(event.dueAt)))) throw new Error('Scheduled event requires UTC');
  if (event.kind === 'schedule') eventParts[0] = new Date(event.dueAt).toISOString();
  return [scope, definition.id, String(definition.version), event.kind, ...eventParts].map(encodeURIComponent).join('/');
}

export interface WorkflowPublicationRequest {
  idempotencyKey: string;
  workflowRunId: string;
  connectionId: string;
  platform: string;
  artifact: { assetId: string; assetVersion: string };
  caption: string;
  timing: NonNullable<WorkflowDefinition['publication']>['timing'];
  status: 'awaiting-review' | 'ready';
}
export interface WorkflowPublicationReceipt {
  idempotencyKey: string;
  /** A platform accepting a job is not proof that the post has been published. */
  status: 'queued' | 'platform-processing' | 'published' | 'failed' | 'unknown';
  platformJobId?: string;
  postId?: string;
  postUrl?: string;
  error?: string;
}
export interface WorkflowPublisher {
  /** The host verifies account ownership, valid grants and approval before calling this. */
  submit(request: WorkflowPublicationRequest, grantId: string): Promise<WorkflowPublicationReceipt>;
  status(receipt: WorkflowPublicationReceipt): Promise<WorkflowPublicationReceipt>;
}

/** Pure preparation; does not connect accounts, authorize a destination, or publish anything. */
export function prepareWorkflowPublications(scope: string, run: WorkflowRun): WorkflowPublicationRequest[] {
  const publication = run.definition.publication;
  if (!scope || !publication || run.status !== 'completed') throw new Error('Publication requires a completed production run');
  if (!['review-required', 'pre-authorized'].includes(publication.approval) || !['after-approval', 'at'].includes(publication.timing.kind)) throw new Error('Unsupported publication policy');
  const artifact = run.steps.find((step) => step.id === publication.artifactStepId && step.status === 'completed')?.artifact;
  if (artifact?.kind !== 'rendered-video' || typeof artifact.data.assetId !== 'string' || typeof artifact.data.assetVersion !== 'string' || !artifact.data.assetId || !artifact.data.assetVersion) throw new Error('Publication requires a durable rendered video, not a project or temporary URL');
  let caption: WorkflowValue | undefined;
  const binding = publication.caption;
  if (binding.kind === 'literal') caption = binding.value;
  if (binding.kind === 'input') caption = run.inputs[binding.key];
  if (binding.kind === 'step') caption = run.steps.find((step) => step.id === binding.stepId && step.status === 'completed')?.artifact?.data[binding.key];
  if (typeof caption !== 'string') throw new Error('Publication caption must resolve to text');
  if (publication.timing.kind === 'at') {
    if (!/Z$|[+-]\d{2}:\d{2}$/.test(publication.timing.at) || !Number.isFinite(Date.parse(publication.timing.at))) throw new Error('Publication timing must be an absolute instant');
    try { new Intl.DateTimeFormat('en', { timeZone: publication.timing.timezone }); } catch { throw new Error('Invalid publication timezone'); }
  }
  const seen = new Set<string>();
  return publication.connections.map((connection) => {
    if (!connection.connectionId || !connection.platform || seen.has(connection.connectionId)) throw new Error('Publication destinations must be unique connected accounts');
    seen.add(connection.connectionId);
    return {
      idempotencyKey: [scope, run.id, connection.connectionId, artifact.data.assetId, artifact.data.assetVersion].map((part) => encodeURIComponent(String(part))).join('/'),
      workflowRunId: run.id,
      ...connection,
      artifact: { assetId: String(artifact.data.assetId), assetVersion: String(artifact.data.assetVersion) },
      caption,
      timing: structuredClone(publication.timing),
      status: publication.approval === 'review-required' ? 'awaiting-review' : 'ready',
    };
  });
}
