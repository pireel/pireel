import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';

/** Optional host-owned material preparation surface. It does not mutate the timeline. */
export interface EditorMaterialEntryProps {
  document: EditorDocumentV2;
  projectId: string;
  blocked: boolean;
  onReadTranscript?: () => Promise<string>;
}
