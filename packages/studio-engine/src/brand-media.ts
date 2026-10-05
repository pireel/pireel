import type { CaptionStyle } from './composition-core';
import type { EditorDocumentV2, NarrativeProperties } from './editor-document/types';
import { applyEditorCommand } from './editor-document/commands/dispatcher';
import { validateEditorDocumentV2 } from './editor-document/validation';
import type { BrandAsset, PlaybookSnapshot } from './brand-playbook';

/**
 * What a brand's fixed blocks do to a scene's document and options: the caption look a scene starts
 * from, the palette and fonts for generated material, and the intro, outro and logo on the timeline.
 */

/** Caption base for a scene using the playbook; the scene's own adjustments still layer on top. */
export function playbookCaptionStyle(playbook: PlaybookSnapshot): Partial<CaptionStyle> {
  return { ...(playbook.blocks.captions?.style ?? {}) };
}

/** The palette generated material uses, in the document's appearance keys. */
export function playbookAppearance(playbook: PlaybookSnapshot): { palette: Record<string, string> } {
  const p = playbook.blocks.palette ?? {};
  const palette: Record<string, string> = {};
  if (p.accent) palette.accent = p.accent;
  if (p.accent2) palette['accent-2'] = p.accent2;
  if (p.text) palette.fg = p.text;
  if (p.ground) palette.paper = p.ground;
  if (playbook.blocks.fonts?.heading) palette['font-head'] = playbook.blocks.fonts.heading;
  if (playbook.blocks.fonts?.body) palette['font-body'] = playbook.blocks.fonts.body;
  return { palette };
}

/** True when the playbook adds media to the timeline. */
export function playbookHasMedia(playbook: PlaybookSnapshot | undefined): boolean {
  return !!playbook && !!(playbook.blocks.logo || playbook.blocks.bookends?.intro || playbook.blocks.bookends?.outro);
}

const LOGO_MARGIN = 0.04;

/**
 * Add the brand's intro/outro to the primary track (ripple: captions and overlays follow the speech)
 * and its logo as a still layer over the main part. Pure document edit through the editor's own
 * commands; any refusal throws with the command's reason instead of leaving a partial document.
 */
export function applyPlaybookMedia(document: EditorDocumentV2, playbook: PlaybookSnapshot): EditorDocumentV2 {
  const brand = { logo: playbook.blocks.logo, intro: playbook.blocks.bookends?.intro, outro: playbook.blocks.bookends?.outro };
  let next = document;
  const fps = next.canvas.fps;
  const run = (command: Parameters<typeof applyEditorCommand>[1]) => {
    const result = applyEditorCommand(next, command);
    if (!result.ok) throw new Error(`品牌素材无法加入时间轴：${result.error.message}`);
    next = result.document;
  };
  const primaryEnd = () => Math.max(0, ...(next.timeline.tracks.find(track => track.id === next.semantics.primaryNarrativeTrackId)?.clips ?? []).map(clip => clip.startFrame + clip.durationFrames));
  const bookend = (asset: BrandAsset, id: 'brand-intro' | 'brand-outro', atFrame: number) => {
    if (asset.kind !== 'video' || !asset.durationSec) throw new Error('品牌片头片尾需要视频素材。');
    run({ type: 'narrative.insert', atFrame, mode: 'ripple',
      asset: { id, kind: 'video', label: id === 'brand-intro' ? 'Intro' : 'Outro', locator: { cloudKey: asset.key }, metadata: { durationSec: asset.durationSec, width: asset.width, height: asset.height, hasAudio: true } },
      clip: { id, kind: 'narrative', assetId: id, durationFrames: Math.max(1, Math.round(asset.durationSec * fps)), sourceInSec: 0, sourceOutSec: asset.durationSec, enabled: true, properties: { treatment: 'full' } as NarrativeProperties } });
  };
  if (brand.intro) bookend(brand.intro, 'brand-intro', 0);
  const mainStart = brand.intro ? Math.max(1, Math.round(brand.intro.durationSec! * fps)) : 0;
  const mainEnd = primaryEnd();
  if (brand.outro) bookend(brand.outro, 'brand-outro', mainEnd);
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

