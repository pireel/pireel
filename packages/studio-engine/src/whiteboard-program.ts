/** Full JavaScript scene files. Source is stored as data; only the isolated browser runner evaluates it. */
export type ProgramContent = {
  kind: 'program';
  /** SVG by default; three enables the pinned Three.js worker and transparent raster output. */
  renderer?: 'svg' | 'three';
  /** Offscreen pixel density; fixed per instance so random seeks reproduce the same pixels. */
  pixelRatio?: number;
  width: number;
  height: number;
  filename?: string;
  source: string;
  /** Extra glyphs for labels synthesized rather than written literally in source/narration. */
  fontText?: string;
  /** Only one module per board may return a world-space camera. */
  controlsCamera?: boolean;
};
export const PROGRAM_MAX_SOURCE = 80_000;
export const PROGRAM_MAX_NODES = 8;
export function programErrors(nodes: readonly { content?: unknown }[]): string[] {
  const programs = nodes.map(n => n.content as Partial<ProgramContent> | undefined).filter(c => c?.kind === 'program');
  const errors: string[] = [];
  if (programs.length > PROGRAM_MAX_NODES) errors.push('A board supports at most 8 program nodes');
  if (programs.filter(c => c?.controlsCamera).length > 1) errors.push('Only one program may control the board camera');
  for (const p of programs) {
    if (!p) continue;
    if (p.renderer !== undefined && !['svg', 'three'].includes(p.renderer)) errors.push('program renderer must be svg or three');
    if (p.pixelRatio !== undefined && (typeof p.pixelRatio !== 'number' || !Number.isFinite(p.pixelRatio) || p.pixelRatio < .25 || p.pixelRatio > 2)) errors.push('program pixelRatio must be 0.25..2');
    if (p.pixelRatio !== undefined && p.renderer !== 'three') errors.push('program pixelRatio requires renderer three');
    if (p.renderer === 'three' && Number.isFinite(p.width) && Number.isFinite(p.height)) {
      const w = Math.floor(p.width! * (p.pixelRatio ?? 1)), h = Math.floor(p.height! * (p.pixelRatio ?? 1));
      if (w < 1 || h < 1 || w > 4096 || h > 4096 || w * h > 4194304) errors.push('three render target must fit 4096 per side and 4194304 pixels; reduce size or pixelRatio');
    }
    if (typeof p.source !== 'string' || !p.source.trim() || p.source.length > PROGRAM_MAX_SOURCE) errors.push('program source must contain 1..80000 characters of JavaScript');
    for (const key of ['width', 'height'] as const) if (typeof p[key] !== 'number' || !Number.isFinite(p[key]) || p[key]! < 1 || p[key]! > 16384) errors.push(`program ${key} must be 1..16384`);
    if (p.filename !== undefined && !/^[a-zA-Z0-9_.-]{1,100}\.m?js$/.test(p.filename)) errors.push('program filename must be a plain .js or .mjs filename');
    if (p.fontText !== undefined && (typeof p.fontText !== 'string' || p.fontText.length > 10000)) errors.push('program fontText must be a string of at most 10000 characters');
    if (p.controlsCamera !== undefined && typeof p.controlsCamera !== 'boolean') errors.push('program controlsCamera must be boolean');
  }
  return errors;
}
export const PROGRAM_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['kind', 'width', 'height', 'source'],
  properties: {
    kind: { type: 'string', enum: ['program'] },
    renderer: { type: 'string', enum: ['svg', 'three'], description: 'Default svg. three enables ctx.libs.THREE and ctx.createRenderer() on an OffscreenCanvas. Render into it in seek(t); the platform captures transparent PNG pixels, composites them on the board and awaits them during export.' },
    pixelRatio: { type: 'number', minimum: .25, maximum: 2, description: 'three only: fixed render density, default 1. Pixel target max 4096 per side / 4,194,304 pixels. Set 1.5 or 2 for close-ups when within budget.' },
    width: { type: 'number', minimum: 1, maximum: 16384 },
    height: { type: 'number', minimum: 1, maximum: 16384 },
    filename: { type: 'string', description: 'Plain .js/.mjs filename, e.g. cash-flow.js. Source is persisted in the project, not fetched from this name.' },
    source: { type: 'string', minLength: 1, maxLength: PROGRAM_MAX_SOURCE, description: 'Complete JavaScript ES module exporting createScene(ctx). It returns {seek(seconds): {svg, camera?}, dispose?}. With renderer three, ctx.libs.THREE is Three.js 0.186.1; ctx.createRenderer() supplies a transparent WebGLRenderer on ctx.canvas, already sized with pixelRatio. Use scene.background=null; render with renderer.render(scene,threeCamera) inside seek and return {} or {svg?,camera?}. The optional SVG overlays the pixels. WebGL2/OffscreenCanvas required; missing support or context loss fails visibly. No animation loop or remote model/texture loading. ctx={libs:{rough,gsap},width,height,theme,beats,narration,boxes,viewport,nodeId,random(seed)}. rough.generator() exposes the full geometry API; GSAP animates plain objects on paused timelines. seek returns an inline SVG with arbitrary paths/text/gradients/filters; camera={cx,cy,zoom} uses world coordinates. Same time must return identical output even after backward seeks. Worker environment: no DOM, external imports, network or storage. Do not use timers, unseeded randomness or wall time for animation. Modules have an execution deadline; exceptions and invalid SVG fail the export rather than producing blank frames.' },
    fontText: { type: 'string', maxLength: 10000, description: 'Extra characters for dynamically constructed labels (e.g. Unicode escapes). Export includes literal source text and narration automatically; list any additional glyphs here for font embedding.' },
    controlsCamera: { type: 'boolean', description: 'Allow this module to return the board camera on each frame; only one per board. Omit to use ordinary camera beats.' },
  },
};

/** Export font subsetting must include text that an authored scene reveals after its first frame. */
export function whiteboardProgramFontText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const doc = value as { board?: { nodes?: { content?: Partial<ProgramContent> }[] }; narration?: { sentences?: { text?: string }[] } };
  const modules = Array.isArray(doc.board?.nodes) ? doc.board.nodes.filter(n => n.content?.kind === 'program') : [];
  if (!modules.length) return '';
  const narration = Array.isArray(doc.narration?.sentences) ? doc.narration.sentences.map(s => typeof s.text === 'string' ? s.text : '').join('') : '';
  return '0123456789.,%+-' + narration + modules.map(n => [n.content?.source, n.content?.fontText].filter(v => typeof v === 'string').join('')).join('');
}
