/** Clip kinds as the v3 surface names them; the document's own kinds plus `text` for title graphics. */
export type V3ClipKind = 'narrative' | 'media' | 'graphic' | 'audio' | 'text' | 'caption';

/** What a v3 call needs from the active output to be checked, executed and explained. */
export interface V3ToolContext {
  /** Frames per second of the active output. */
  fps: number;
  /** Resolves a clip id to its kind; `undefined` when the id is unknown. */
  kindOf: (clipId: string) => V3ClipKind | undefined;
  /** Host-resolved catalog records for this placement, not model-authored locators. */
  placementAssets?: ReadonlyArray<Record<string, unknown>>;
  hasAsset?: (assetId: string) => boolean;
}
