import { type CaptionStyle, isCaptionsOn, resolveCaptionStyle } from '../composition-core';
import { overlayBlocks } from './legacy-projection';
import type { EditorDocumentV2 } from './types';

/** The caption layer's stored state as the style resolver reads it: the appearance flag first, the
 * persisted caption clips of a legacy project otherwise. */
function captionView(document: EditorDocumentV2) {
  return {
    ...(document.appearance.captionStyle ? { captionStyle: document.appearance.captionStyle } : {}),
    blocks: overlayBlocks(document),
  };
}

/** Is the captions layer on, read from the document. */
export function documentCaptionsOn(document: EditorDocumentV2): boolean {
  return isCaptionsOn(captionView(document));
}

/** The effective global caption style, read from the document. */
export function documentCaptionStyle(document: EditorDocumentV2): CaptionStyle {
  return resolveCaptionStyle(captionView(document));
}
