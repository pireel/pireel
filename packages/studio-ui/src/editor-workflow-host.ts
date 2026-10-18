/** Optional host surface for product workflows. The editor contains no preset or executor here. */
export interface WorkflowStudioContext {
  source: { projectId: string; outputId: string; revision: string };
  title: string; sourceLabel?: string; hasContent: boolean; hasNarration: boolean; hasTranscript: boolean;
}
export interface WorkflowStudioHost {
  context(): WorkflowStudioContext;
  assertWritable(): void;
  emphasizeCaptions?(): Promise<void>;
  prepareMedia(): Promise<void>;
  call(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; error?: string; summary?: string; data?: unknown }>;
}
export interface EditorWorkflowEntryProps {
  projectId: string; initialTemplateId?: string; open: boolean; onOpenChange(open: boolean): void;
  host: WorkflowStudioHost; blocked: boolean; onBusyChange(busy: boolean): void; onImport(): void;
}
export function workflowDocumentRevision(document: unknown): string {
  const serialized = JSON.stringify(document); let hash = 2166136261;
  for (let i = 0; i < serialized.length; i++) hash = Math.imul(hash ^ serialized.charCodeAt(i), 16777619);
  return serialized.length + ':' + (hash >>> 0).toString(16);
}
