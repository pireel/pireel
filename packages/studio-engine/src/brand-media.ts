import type { CaptionStyle } from './composition-core';
import type { EditorDocumentV2 } from './editor-document/types';
import { validateEditorDocumentV2 } from './editor-document/validation';
import { brandMediaEntries, type PlaybookSnapshot } from './brand-playbook';

/**
 * What a brand's fixed blocks do to a scene's document and options: the caption look a scene starts
 * from, the palette and fonts for generated material, and the logo on the timeline.
 */

/** Caption base for a scene using the playbook; the scene's own adjustments still layer on top. */
export function playbookCaptionStyle(playbook: PlaybookSnapshot): Partial<CaptionStyle> {
  return { ...(playbook.blocks.captions?.style ?? {}) };
}

/** The palette generated material uses, in the document's appearance keys. Graphics colours and type are
 *  chosen per video from the brand's prose; only generated headings take the creator's overlay-text face. */
export function playbookAppearance(playbook: PlaybookSnapshot): { palette: Record<string, string> } {
  const palette: Record<string, string> = {};
  if (playbook.blocks.overlay_text?.font) palette['font-head'] = playbook.blocks.overlay_text.font;
  return { palette };
}

/** True when the playbook adds media to the timeline. */
export function playbookHasMedia(playbook: PlaybookSnapshot | undefined): boolean {
  return !!playbook && !!playbook.blocks.logo;
}

const LOGO_MARGIN = 0.04;

/**
 * Add the brand's logo as a still layer over the whole video. Pure document edit; it replaces a logo
 * layer added before.
 */
export function applyPlaybookMedia(document: EditorDocumentV2, playbook: PlaybookSnapshot): EditorDocumentV2 {
  const brand = { logo: playbook.blocks.logo };
  let next = document;
  const fps = next.canvas.fps;
  const primaryEnd = () => Math.max(0, ...(next.timeline.tracks.find(track => track.id === next.semantics.primaryNarrativeTrackId)?.clips ?? []).map(clip => clip.startFrame + clip.durationFrames));
  const mainStart = 0;
  const mainEnd = primaryEnd();
  if (brand.logo && mainEnd > mainStart) {
    const logo = brand.logo;
    const w = logo.widthPct / 100;
    const h = w * (logo.height / logo.width) * (next.canvas.width / next.canvas.height);
    const x = logo.corner.endsWith('left') ? LOGO_MARGIN : 1 - LOGO_MARGIN - w;
    const y = logo.corner.startsWith('top') ? LOGO_MARGIN : 1 - LOGO_MARGIN - h;
    const top = Math.max(0, ...next.timeline.tracks.map(track => track.stackOrder)) + 1;
    next = {
      ...next,
      assets: { ...next.assets, 'brand-logo': { id: 'brand-logo', kind: 'image', label: 'Logo', locator: { cloudKey: logo.key }, metadata: { width: logo.width, height: logo.height } } },
      timeline: { ...next.timeline, tracks: [...next.timeline.tracks, {
        id: 'brand-logo', type: 'visual', role: 'broll', name: 'Logo', stackOrder: top, hidden: false, muted: true, locked: false, syncLocked: true,
        clips: [{ id: 'brand-logo', kind: 'media', assetId: 'brand-logo', startFrame: mainStart, durationFrames: mainEnd - mainStart, sourceInSec: 0, sourceOutSec: (mainEnd - mainStart) / fps, enabled: true, fit: 'contain', box: { x, y, w, h }, opacity: logo.opacity }],
      }] },
    };
    const issue = validateEditorDocumentV2(next).find(candidate => candidate.severity === 'error');
    if (issue) throw new Error(`品牌 Logo 无法加入时间轴：${issue.message}`);
  }
  return next;
}


/** Supplied reusable media is registered in the project library, ready for the agent to place. */
export function brandMediaAssets(playbook: PlaybookSnapshot): EditorDocumentV2['assets'] {
  return Object.fromEntries(brandMediaEntries(playbook).map(({ role, id, asset }) => [id, {
    id, kind: asset.kind, label: role === 'intro' ? 'Brand intro' : role === 'outro' ? 'Brand outro' : ('name' in asset && asset.name) || 'Brand music',
    locator: { cloudKey: asset.key },
    metadata: { durationSec: asset.durationSec, ...('width' in asset ? { width: asset.width, height: asset.height } : {}) },
  }]));
}
