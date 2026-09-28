import type { CaptionStyle, CutTransitionEffect, PersonFx, ShotTreatment, ZoomPreset } from './composition-core';
import type { EditorDocumentV2, NarrativeProperties } from './editor-document/types';
import { applyEditorCommand } from './editor-document/commands/dispatcher';
import { validateEditorDocumentV2 } from './editor-document/validation';
import { validateStoredStyleSpec, type BrandStyleSpec } from './brand-style-spec';

/**
 * A creator's personal brand: the look they already use on their channels, extracted from their own
 * videos and editable afterwards. The palette/person-effect half has the same shape as a frame, so it
 * mounts through the same appearance path; the rest (captions, framing, pacing, logo, intro/outro,
 * cover) are brand properties a scene applies when the user picks the brand.
 */
export const BRAND_PALETTE_KEYS = ['paper', 'panel', 'panel-2', 'fg', 'muted', 'accent', 'accent-2', 'line', 'font-head', 'font-body', 'font-num'] as const;
export type BrandPaletteKey = typeof BRAND_PALETTE_KEYS[number];
export type BrandPlatform = 'douyin' | 'tiktok' | 'youtube' | 'bilibili' | 'upload';
export type BrandCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type BrandConfidence = 'high' | 'medium' | 'low';

/** A durable media file owned by the brand (R2 content-addressed key; never a temporary blob URL). */
export interface BrandAsset { key: string; kind: 'image' | 'video'; width: number; height: number; durationSec?: number }

export interface BrandSourceVideo { id: string; title?: string; sourceUrl?: string; durationSec: number; coverKey?: string }

/** Where a conclusion came from, so the review page can show the frames it was read from. */
export interface BrandEvidence { videos: string[]; frames?: { video: string; sec: number }[]; confidence: BrandConfidence; note?: string }

export interface BrandKit {
  id: string;
  name: string;
  version: number;
  source: { platform: BrandPlatform; account?: string; videos: BrandSourceVideo[] };
  /** Frame-compatible half: palette tokens + person effect + an English playbook prose for generated graphics. */
  frame: { palette: Partial<Record<BrandPaletteKey, string>>; personFx?: PersonFx; playbook: string };
  captions: Partial<CaptionStyle>;
  framing: { aspect: '9:16' | '16:9' | '1:1'; treatment: ShotTreatment; faceScale?: number };
  pacing: { avgShotSec?: number; zoom: { preset: ZoomPreset; everySec: number } | null; trimSilence: boolean };
  transitions: { effect: CutTransitionEffect | 'cut'; durationSec: number };
  logo: (BrandAsset & { corner: BrandCorner; widthPct: number; opacity: number }) | null;
  intro: BrandAsset | null;
  outro: BrandAsset | null;
  cover: { layout: string; textStyle: string; references: BrandAsset[] } | null;
  /** The creator's abstracted style, by system — the source the render fields above derive from. */
  style?: BrandStyleSpec | null;
  evidence: Partial<Record<BrandEvidenceTopic, BrandEvidence>>;
}
export type BrandEvidenceTopic = 'captions' | 'font' | 'palette' | 'framing' | 'pacing' | 'transitions' | 'logo' | 'intro' | 'outro' | 'cover' | 'playbook';

/** What a scene keeps: a copy taken when the brand was picked, so later brand edits never restyle past projects. */
export type BrandSnapshot = Omit<BrandKit, 'source' | 'evidence'>;

export function brandSnapshot(kit: BrandKit): BrandSnapshot {
  const { source: _source, evidence: _evidence, ...snapshot } = structuredClone(kit);
  return snapshot;
}

/** Caption base for a scene that uses the brand; the scene's own adjustments still layer on top. */
export function brandCaptionStyle(brand: BrandSnapshot): Partial<CaptionStyle> {
  const { sub: _sub, on: _on, ...style } = brand.captions;
  return style;
}

export function brandAppearance(brand: BrandSnapshot): { palette: Record<string, string>; personFx?: PersonFx } {
  const palette = Object.fromEntries(Object.entries(brand.frame.palette).filter(([, value]) => typeof value === 'string' && value)) as Record<string, string>;
  return { palette, ...(brand.frame.personFx ? { personFx: brand.frame.personFx } : {}) };
}

const HEX = /^#[0-9a-f]{6}$/i;
const CORNERS: readonly BrandCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const PLATFORMS: readonly BrandPlatform[] = ['douyin', 'tiktok', 'youtube', 'bilibili', 'upload'];

function fail(path: string, reason: string): never { throw new Error(`品牌模板字段无效：${path}（${reason}）`); }
function asset(value: unknown, path: string): BrandAsset {
  const item = value as BrandAsset;
  if (!item || typeof item.key !== 'string' || !item.key || /^(blob|data):/.test(item.key)) fail(path, '需要持久化的素材 key');
  if (item.kind !== 'image' && item.kind !== 'video') fail(path, 'kind 只能是 image 或 video');
  if (!(item.width > 0) || !(item.height > 0)) fail(path, '缺少尺寸');
  if (item.kind === 'video' && !(item.durationSec! > 0)) fail(path, '视频缺少时长');
  return item;
}

/** Server and client share one validator: an invalid kit is refused with the field that failed, never patched. */
export function validateBrandKit(value: unknown): BrandKit {
  const kit = value as BrandKit;
  if (!kit || typeof kit !== 'object') fail('', '不是对象');
  if (typeof kit.id !== 'string' || !kit.id) fail('id', '缺失');
  if (typeof kit.name !== 'string' || !kit.name.trim() || kit.name.length > 60) fail('name', '1–60 字');
  if (!Number.isInteger(kit.version) || kit.version < 1) fail('version', '正整数');
  if (!PLATFORMS.includes(kit.source?.platform)) fail('source.platform', PLATFORMS.join('/'));
  if (!Array.isArray(kit.source.videos) || kit.source.videos.length > 30) fail('source.videos', '最多 30 条');
  for (const [key, color] of Object.entries(kit.frame?.palette ?? {})) {
    if (!(BRAND_PALETTE_KEYS as readonly string[]).includes(key)) fail(`frame.palette.${key}`, '未知色板键');
    if (!key.startsWith('font-') && !HEX.test(String(color))) fail(`frame.palette.${key}`, '需要 #RRGGBB');
  }
  if (typeof kit.frame.playbook !== 'string' || kit.frame.playbook.length > 12000) fail('frame.playbook', '最多 12000 字');
  if (!kit.captions || typeof kit.captions !== 'object') fail('captions', '缺失');
  for (const key of ['color', 'accentColor', 'strokeColor', 'emphasis'] as const) {
    const color = kit.captions[key];
    if (color != null && !HEX.test(color)) fail(`captions.${key}`, '需要 #RRGGBB');
  }
  if (!['9:16', '16:9', '1:1'].includes(kit.framing?.aspect)) fail('framing.aspect', '9:16/16:9/1:1');
  if (kit.pacing?.zoom && !(kit.pacing.zoom.everySec > 0)) fail('pacing.zoom.everySec', '需要正数');
  if (!(kit.transitions?.durationSec >= 0) || kit.transitions.durationSec > 4) fail('transitions.durationSec', '0–4 秒');
  if (kit.logo) {
    asset(kit.logo, 'logo');
    if (!CORNERS.includes(kit.logo.corner)) fail('logo.corner', CORNERS.join('/'));
    if (!(kit.logo.widthPct > 0 && kit.logo.widthPct <= 40)) fail('logo.widthPct', '0–40');
    if (!(kit.logo.opacity > 0 && kit.logo.opacity <= 1)) fail('logo.opacity', '0–1');
  }
  if (kit.intro) { asset(kit.intro, 'intro'); if (kit.intro.kind !== 'video') fail('intro', '片头需要视频'); }
  if (kit.outro) { asset(kit.outro, 'outro'); if (kit.outro.kind !== 'video') fail('outro', '片尾需要视频'); }
  if (kit.cover) kit.cover.references.forEach((item, index) => asset(item, `cover.references.${index}`));
  if (kit.style) validateStoredStyleSpec(kit.style);
  return kit;
}

/** A blank brand for manual creation; analysis fills the same shape. */
export function emptyBrandKit(id: string, name: string, platform: BrandPlatform = 'upload'): BrandKit {
  return {
    id, name, version: 1, source: { platform, videos: [] },
    frame: { palette: {}, playbook: '' },
    captions: { preset: 'ln-clean', font: 'sans', bold: true },
    framing: { aspect: '9:16', treatment: 'full' },
    pacing: { zoom: null, trimSilence: true },
    transitions: { effect: 'cut', durationSec: 0 },
    logo: null, intro: null, outro: null, cover: null, evidence: {},
  };
}

/** True when the brand adds media to the timeline (a step only scenes with these need). */
export function brandHasMedia(brand: BrandSnapshot | undefined): boolean {
  return !!brand && !!(brand.logo || brand.intro || brand.outro);
}

const LOGO_MARGIN = 0.04;

/**
 * Add the brand's intro/outro to the primary track (ripple: captions and overlays follow the speech)
 * and its logo as a still layer over the main part. Pure document edit through the editor's own
 * commands; any refusal throws with the command's reason instead of leaving a partial document.
 */
export function applyBrandMedia(document: EditorDocumentV2, brand: BrandSnapshot): EditorDocumentV2 {
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

/** A scene's stored copy passes the same rules as the kit it was taken from. */
export function validateBrandSnapshot(value: unknown): BrandSnapshot {
  if (!value || typeof value !== 'object') fail('brand', '不是对象');
  return brandSnapshot(validateBrandKit({ ...(value as BrandSnapshot), source: { platform: 'upload', videos: [] }, evidence: {} }));
}
