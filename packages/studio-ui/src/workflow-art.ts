export const WORKFLOW_ART = {
  search: new URL('./workflow-art/search.webp', import.meta.url).href,
  'pause-cleanup': new URL('./workflow-art/pause-cleanup.webp', import.meta.url).href,
  captions: new URL('./workflow-art/captions.webp', import.meta.url).href,
  'frame-video': new URL('./workflow-art/frame-video.webp', import.meta.url).href,
} as const;

export const CAPTIONS_ENTRY_ICON = new URL('./workflow-art/captions-cc-v4.png', import.meta.url).href;
export const AGENT_ENTRY_ICON = new URL('./workflow-art/agent-editor-v2.png', import.meta.url).href;

export const DUBBING_ENTRY_ICON = new URL('./workflow-art/dubbing-v2.png', import.meta.url).href;

export const BROLL_ENTRY_ICON = new URL('./workflow-art/broll-v2.png', import.meta.url).href;

export const BROLL_SHOWCASE = new URL('./workflow-art/broll-showcase-v1.png', import.meta.url).href;
export const UGC_SHOWCASE = new URL('./workflow-art/ugc-showcase-v1.png', import.meta.url).href;
export const ERASER_SHOWCASE = new URL('./workflow-art/eraser-showcase-v1.png', import.meta.url).href;
export const PIP_SHOWCASE = new URL('./workflow-art/pip-showcase-v1.png', import.meta.url).href;

export const PIP_ENTRY_ICON = new URL('./workflow-art/pip-v2.png', import.meta.url).href;
export const SFX_ENTRY_ICON = new URL('./workflow-art/sfx-v1.png', import.meta.url).href;

/** Shared by scene launchers and empty project covers. Keep each scene's identity consistent. */
export const UGC_AD_ENTRY_ICON = new URL('./workflow-art/ugc-ad-v4.png', import.meta.url).href;
export const SUBTITLE_REMOVAL_ENTRY_ICON = new URL('./workflow-art/subtitle-removal-v2.png', import.meta.url).href;
/** The scene hues stay distinct; a shared chroma treatment keeps their ceramic finish restrained. */
export const SCENE_ICON_STYLE = { filter: 'saturate(.48)' } as const;
export const SCENE_ENTRY_ICONS = {
  'ugc-ad': UGC_AD_ENTRY_ICON,
  'subtitle-removal': SUBTITLE_REMOVAL_ENTRY_ICON,
  agent: AGENT_ENTRY_ICON,
  captions: CAPTIONS_ENTRY_ICON,
  dubbing: DUBBING_ENTRY_ICON,
  broll: BROLL_ENTRY_ICON,
  pip: PIP_ENTRY_ICON,
  sfx: SFX_ENTRY_ICON,
} as const;
