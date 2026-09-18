import { parseEditorDocumentV2, type EditorDocumentV2 } from './editor-document';
import { sanitizeProjectContext, type StudioProjectContext } from './project-context';

/** Cloud completion enriches references that still exist. Never resurrect a deleted asset. */
export function applyUploadedMediaKeys(document: unknown, context: StudioProjectContext, keys: ReadonlyMap<string, string>) {
  let changed = false;
  const patchDocument = (value: unknown): unknown => {
    const parsed = parseEditorDocumentV2(value);
    if (!parsed) return value;
    let documentChanged = false;
    const assets = Object.fromEntries(Object.entries(parsed.assets).map(([id, asset]) => {
      const key = asset.locator.localSig ? keys.get(asset.locator.localSig) : undefined;
      if (!key || asset.locator.cloudKey) return [id, asset];
      changed = documentChanged = true;
      return [id, { ...asset, locator: { ...asset.locator, cloudKey: key } }];
    }));
    return documentChanged ? { ...parsed, assets } : value;
  };
  const nextDocument = patchDocument(document);
  const localAssets = context.localAssets?.map((entry) => {
    const key = keys.get(entry.contentSig);
    if (!key || entry.cloudKey) return entry;
    changed = true;
    return { ...entry, cloudKey: key };
  });
  const outputs = context.outputs ? { ...context.outputs, inactive: context.outputs.inactive.map((output) => ({
    ...output, document: patchDocument(output.document) as EditorDocumentV2,
  })) } : undefined;
  return {
    changed,
    document: nextDocument,
    context: changed ? { ...context, ...(localAssets ? { localAssets } : {}), ...(outputs ? { outputs } : {}) } : context,
  };
}

/** An older tab can edit/delete references, but cannot erase a confirmed byte locator on ones it retains. */
export function collectUploadedMediaKeys(document: unknown, rawContext: unknown): Map<string, string> {
  const keys = new Map<string, string>();
  const context = sanitizeProjectContext(rawContext);
  for (const entry of context.localAssets ?? []) if (entry.cloudKey) keys.set(entry.contentSig, entry.cloudKey);
  for (const value of [document, ...(context.outputs?.inactive.map((output) => output.document) ?? [])]) {
    for (const asset of Object.values(parseEditorDocumentV2(value)?.assets ?? {})) {
      if (asset.locator.localSig && asset.locator.cloudKey) keys.set(asset.locator.localSig, asset.locator.cloudKey);
    }
  }
  return keys;
}
