import type { EditorDocumentV2 } from './types';

/** Strip the removed V2-era source hierarchy at every decode / persistence boundary. This is
 * lossless because every narrative clip already carries its own asset id. */
export function normalizePeerNarrativeSources(document: EditorDocumentV2): EditorDocumentV2 {
  const legacySemantics = document.semantics as EditorDocumentV2['semantics'] & {
    primaryNarrativeAssetId?: string;
  };
  if (!legacySemantics.primaryNarrativeAssetId) return document;
  const { primaryNarrativeAssetId: _legacyFirstSource, ...semantics } = legacySemantics;
  return { ...document, semantics };
}
