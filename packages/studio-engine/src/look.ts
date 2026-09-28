/**
 * A look: one output's own video-level template. It is the visual system (a stylesheet) plus a few
 * parametric pieces the agent writes for this video; every graphic of the video is an instance of
 * a piece (`look:<pieceId>` + props). Authored once, instanced as data: changing words, place or time
 * is a data edit, and rewriting the look restyles every instance.
 *
 * Runtime contract, the same closed runtime as bespoke components (HTML, CSS, SVG, GSAP on a
 * paused timeline, every frame a pure function of time):
 *
 *   function (props, ctx) { return { html: "…", animate(tl, el, ctx) { … } }; }
 *   ctx = { width, height, duration, words: [{ text, start, end }] }  // px of the box; seconds from the instance start
 *
 * The document carries the look once (head stylesheet scoped to piece hosts + a piece registry);
 * each instance renders as an empty host whose timeline asks the registry to build it. Nothing
 * here evaluates piece code: it is emitted as text and runs inside the stage like any component.
 */

import { registerTemplate, type Slots } from './composition-core';

export const LOOK_TEMPLATE_PREFIX = 'look:';

export interface LookPiece {
  /** Shown to people: "Item card", "Hook"… */
  label: string;
  /** The piece function, as source text (a function expression). */
  source: string;
  /** JSON Schema of its props (the shared property vocabulary), for editing without regeneration. */
  propsSchema?: Record<string, unknown>;
}

export interface DocumentLook {
  /** Changes on every rewrite. */
  id: string;
  /** The visual system: custom properties and classes. Applies inside piece hosts only. */
  css: string;
  pieces: Record<string, LookPiece>;
  /** The author's own statement of the system (what colours mean, where graphics live…). */
  notes?: string;
}

export const LOOK_LIMITS = { pieces: 12, sourceChars: 20_000, cssChars: 40_000, notesChars: 4_000 } as const;

export interface LookIssue {
  path: string;
  message: string;
}

const PIECE_ID = /^[a-z][a-z0-9-]{0,39}$/;

/** Outside the closed runtime, or breaking "every frame is a pure function of time". */
const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bnavigator\s*\.\s*sendBeacon/, 'no network access'],
  [/\bimport\s*\(|\bimportScripts\b|<\s*script\b/i, 'no loading scripts'],
  [/\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(/, 'no evaluating code'],
  [/\bsetTimeout\b|\bsetInterval\b|\brequestAnimationFrame\b|\bqueueMicrotask\b/, 'no timers: animate on the timeline'],
  [/\bMath\s*\.\s*random\b|\bDate\s*\.\s*now\b|\bnew\s+Date\b|\bperformance\s*\.\s*now\b/, 'no clock or randomness: every frame must depend on time only (seed any pseudo-randomness)'],
  [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bdocument\s*\.\s*cookie\b/, 'no storage'],
  [/\bwindow\s*\.\s*(parent|top|opener)\b|\bpostMessage\s*\(/, 'no reaching outside the component'],
  [/<\s*(iframe|video|audio|canvas|object|embed)\b|\bgetContext\s*\(/i, 'no embedded media, frames or canvas: build with HTML, CSS and SVG'],
  [/@import\b|@font-face\b|url\s*\(\s*['"]?\s*(https?:|\/\/)/i, 'no external styles, fonts or images'],
];

/** Boundary and purity check for one piece's source. Empty = fine. */
export function lintLookSource(source: string, path = 'source'): LookIssue[] {
  const issues: LookIssue[] = [];
  if (!source.trim()) return [{ path, message: 'empty piece source' }];
  if (source.length > LOOK_LIMITS.sourceChars) issues.push({ path, message: `piece source over ${LOOK_LIMITS.sourceChars} characters` });
  if (!/^\s*(function\b|\(|[A-Za-z_$][\w$]*\s*=>)/.test(source)) {
    issues.push({ path, message: 'the source must be a function expression: function (props, ctx) { return { html, animate(tl, el, ctx) {…} }; }' });
  }
  for (const [pattern, message] of FORBIDDEN) if (pattern.test(source)) issues.push({ path, message });
  return issues;
}

/** Validate a look value (from a tool or a stored document). Returns the normalized look or issues. */
export function normalizeLook(value: unknown): { look: DocumentLook; issues: [] } | { look: null; issues: LookIssue[] } {
  const issues: LookIssue[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { look: null, issues: [{ path: 'look', message: 'look must be an object' }] };
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 64) : '';
  if (!id) issues.push({ path: 'look.id', message: 'look.id is required' });
  const css = typeof raw.css === 'string' ? raw.css : '';
  if (css.length > LOOK_LIMITS.cssChars) issues.push({ path: 'look.css', message: `css over ${LOOK_LIMITS.cssChars} characters` });
  for (const [pattern, message] of FORBIDDEN.slice(-1)) if (pattern.test(css)) issues.push({ path: 'look.css', message });
  if (/<\s*\/?\s*style\b/i.test(css)) issues.push({ path: 'look.css', message: 'css is plain stylesheet text, without <style> tags' });
  const piecesRaw = raw.pieces && typeof raw.pieces === 'object' && !Array.isArray(raw.pieces) ? (raw.pieces as Record<string, unknown>) : null;
  const pieces: Record<string, LookPiece> = {};
  if (!piecesRaw || !Object.keys(piecesRaw).length) issues.push({ path: 'look.pieces', message: 'at least one piece is required' });
  else {
    const entries = Object.entries(piecesRaw);
    if (entries.length > LOOK_LIMITS.pieces) issues.push({ path: 'look.pieces', message: `at most ${LOOK_LIMITS.pieces} pieces` });
    for (const [pieceId, pieceRaw] of entries.slice(0, LOOK_LIMITS.pieces)) {
      const path = `look.pieces.${pieceId}`;
      if (!PIECE_ID.test(pieceId)) { issues.push({ path, message: 'piece ids are lowercase words joined by hyphens (e.g. item-card)' }); continue; }
      const piece = pieceRaw && typeof pieceRaw === 'object' ? (pieceRaw as Record<string, unknown>) : {};
      const source = typeof piece.source === 'string' ? piece.source : '';
      issues.push(...lintLookSource(source, `${path}.source`));
      const schema = piece.propsSchema && typeof piece.propsSchema === 'object' && !Array.isArray(piece.propsSchema) ? (piece.propsSchema as Record<string, unknown>) : undefined;
      pieces[pieceId] = {
        label: typeof piece.label === 'string' && piece.label.trim() ? piece.label.trim().slice(0, 40) : pieceId,
        source,
        ...(schema ? { propsSchema: schema } : {}),
      };
    }
  }
  if (issues.length) return { look: null, issues };
  const notes = typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim().slice(0, LOOK_LIMITS.notesChars) : undefined;
  return { look: { id, css, pieces, ...(notes ? { notes } : {}) }, issues: [] };
}

/** `:root` in the authored stylesheet means "the whole look": inside the scope that is the host. */
function scopedCss(css: string): string {
  return `@scope (.look-piece) {\n${css.replace(/:root\b/g, ':scope')}\n}`;
}

/** The look's part of the document head: its stylesheet (scoped to piece hosts) and the piece registry. */
export function lookHeadHtml(look: DocumentLook | undefined): string {
  if (!look) return '';
  const register = Object.entries(look.pieces)
    .map(([pieceId, piece]) =>
      // Each piece compiles on its own: one broken piece leaves the others working.
      `try { P[${JSON.stringify(pieceId)}] = new Function('window', 'document', 'return (' + ${JSON.stringify(piece.source)} + ')')(window, document); } catch (e) { console.warn('[look] piece failed to compile', ${JSON.stringify(pieceId)}, e); }`)
    .join('\n');
  const script = `window.__look = { id: ${JSON.stringify(look.id)}, pieces: {} };
(function (P) {
${register}
})(window.__look.pieces);
window.__look.run = function (pieceId, props, el, tl, ctx) {
  var make = window.__look.pieces[pieceId];
  if (!make || !el) return;
  try {
    var built = make(props || {}, ctx) || {};
    el.innerHTML = built.html || '';
    if (built.animate) built.animate(tl, el, ctx);
  } catch (e) { console.warn('[look] piece failed', pieceId, e); }
};`.replace(/<\/script/gi, '<\\/script');
  return `<style data-look="${look.id.replace(/[^\w-]/g, '')}">\n${scopedCss(look.css).replace(/<\/style/gi, '<\\/style')}\n</style>\n<script>\n${script}\n</script>\n`;
}

const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback);

/** One instance: an empty host, built by the document's piece registry on the block's timeline. */
function renderLookInstance(slots: Slots, blockId: string, durationSec = 3): { innerHtml: string; timelineBody: string } {
  const pieceId = typeof slots.piece === 'string' ? slots.piece : '';
  const props = slots.props && typeof slots.props === 'object' ? slots.props : {};
  const words = Array.isArray(slots.words) ? slots.words : [];
  const ctx = { width: num(slots.boxW, 1080), height: num(slots.boxH, 1920), duration: durationSec, words };
  return {
    innerHtml: `<div class="look-piece" data-look-piece="${pieceId.replace(/[^a-z0-9-]/g, '')}" style="position:absolute;inset:0"></div>`,
    timelineBody:
      `if (window.__look && window.__look.run) window.__look.run(${JSON.stringify(pieceId)}, ${JSON.stringify(props)}, ` +
      `document.querySelector('#${blockId} .look-piece'), tl, ${JSON.stringify(ctx)});`,
  };
}

registerTemplate({
  id: 'look',
  name: 'engine.template.look',
  kind: 'custom',
  defaultTrackIndex: 2,
  slots: {},
  render: (slots, blockId, _startSec, durationSec) => renderLookInstance(slots, blockId, durationSec),
});

export function isLookTemplate(templateId: string): boolean {
  return templateId.startsWith(LOOK_TEMPLATE_PREFIX);
}

/** The piece an instance names, from its template id (`look:<pieceId>`). */
export function lookPieceOf(templateId: string): string | null {
  return isLookTemplate(templateId) ? templateId.slice(LOOK_TEMPLATE_PREFIX.length) : null;
}
