/**
 * One-shot draft — planning stage (narration script + picture → scene-based storyboard).
 *
 * 2026-06 rewrite: from "per-sentence acting" to "LLM segments into scenes". The agent reads
 * the full script (+ picture hints) and merges sentences into N scenes; each scene = a sentence
 * range (= semantics-driven cut point) + framing + one design-graphic brief with real data pulled
 * from the script. Design graphics are primary (most scenes have one); captions/effects default
 * off, purely optional. build-draft cuts shots per scene + drops picture placeholders.
 *
 * A scene does NOT name a component. This stage is the only one that sees the whole script, so it
 * owns what a beat IS and how much weight it carries; which component renders it depends on the
 * box, the surviving on-screen duration and the theme's stagings — none of which exist yet here.
 * Naming a component from this side was two models deciding the same thing, the second with less
 * to go on.
 */

import { PLAN_SYSTEM, PLAN_SYSTEM_TOOLS, planWithActiveTheme } from './prompts';

interface ChatCapable {
  chat: (i: {
    system?: string;
    prompt: string;
    hint?: { quality?: 'high' | 'standard' | 'cheap'; provider?: string; provider_model_id?: string };
  }) => Promise<{ text: string }>;
}

/** Framing: how the shot is composed (making room for the design graphic). build-draft resolves it into a concrete ShotTreatment using the picture. */
export type Framing = 'full' | 'punch-in' | 'corner' | 'split';
export const FRAMINGS: Framing[] = ['full', 'punch-in', 'corner', 'split'];

/** Graphic size tiers (LLM picks by narrative weight): badge=small transition tag · card=normal (default) · banner=full-width strip · poster=hero moment.
 *  build-draft sizes the actual box within the geometry safe zone per tier — cures "every graphic the same size". */
export type GraphicSize = 'badge' | 'card' | 'banner' | 'poster';
export const GRAPHIC_SIZES: GraphicSize[] = ['badge', 'card', 'banner', 'poster'];

/** The design graphic a scene produces: chosen component + design brief + real data pulled from the narration. */
export interface SceneGraphic {
  /** ANCHOR move: last sentence row (inclusive) the graphic stays on screen through — beyond its
   *  own scene, across framing changes (blocks live on their own tracks, so duration is free).
   *  The layout forces an anchored graphic down to badge scale: anything larger held across a
   *  framing change would bury the speaker. */
  holdTo?: number;
  /** What this beat shows and how it reads. NOT which component renders it — the graphics layer
   *  picks that, because only it knows the box, the on-screen duration and the theme's stagings. */
  brief: string;
  /** Real numbers / points / keywords (pulled verbatim from these sentences, comma- or newline-separated). */
  data?: string;
  /** Size tier (default card). */
  size?: GraphicSize;
}

/** Scene = one storyboard unit merged from a run of consecutive sentences. */
export interface Scene {
  /** Covered sentence index range (inclusive both ends). */
  from: number;
  to: number;
  framing: Framing;
  /** The scene's design graphic (primary; most scenes have one; pure transition/screen-recording can be empty). */
  graphic?: SceneGraphic;
  /** Optional: narration keywords overlaid on this scene (build-draft lays them only when the theme has captions on). */
  emphasis?: string[];
}

export interface DraftPlan {
  title?: { text: string; sub?: string; durationSec: number };
  scenes: Scene[];
  outro?: { text: string; sub?: string; durationSec: number };
  /** Insert clips' own scenes (equal-footing storyboard: layout cuts/frames/places placeholders by it). Default = whole insert as one beat. */
  inserts?: InsertPlan[];
}

export interface PlanSentence {
  index: number;
  text: string;
  start: number;
  end: number;
}

/** Per-sentence picture hint (from visual analysis): content type + which side is safe. */
export interface PlanVisual {
  index: number;
  content: string; // talkinghead | screen | broll | slide | other
  safe: string; // left | right | top | bottom | full | none
}

/** An insert clip on the multi-source main track (planning context): atSec=anchor on the main-source
 *  timeline (which main cut point it splices at), text=that clip's narration (empty if none). With
 *  sentences (the clip's OWN source clock), the sentences interleave into the unified narrative flow
 *  via unifiedPlanRows and plan on equal footing; without sentences (no narration/transcript) it stays
 *  a single beat (marker line in the prompt, scenes skip it). */
export interface PlanInsert {
  atSec: number;
  durationSec: number;
  text: string;
  /** This insert's own sentences (index from 0, start/end are seconds on THIS clip's source file). */
  sentences?: { index: number; start: number; end: number; text: string }[];
}

/** An insert's own scene plan (clip = 1-based index in the insert enumeration, matching insertPlanContexts order).
 *  Note: this is the ASSEMBLY layer's decomposition product — the LLM faces the unified narrative flow
 *  (unifiedPlanRows) and never sees this structure; the split happens in assemblePlan by row source. */
export interface InsertPlan {
  clip: number;
  scenes: Scene[];
}

/** One row of the unified narrative flow: a main sentence or an insert sentence, in final narrative order.
 *  The planning index space IS this row number (0-based, contiguous) — the LLM reads and segments the whole;
 *  local records each source's own sentence index, which the assembly layer uses to decompose global scenes
 *  back into main/each insert. */
export interface PlanRow {
  /** 'main' | insert index (1-based). */
  src: 'main' | number;
  /** This source's own sentence index. */
  local: number;
  /** Seconds on this source's OWN clock (discontinuous across sources; compare pacing only within one source). */
  start: number;
  end: number;
  text: string;
}

/** Main sentences + insert sentences → unified narrative flow (interleaved by anchor). An insert's meaning
 *  is "a beat in the middle of the narrative", which the director must read as a whole — this is the single
 *  interleave point, shared by all producers/assemblers to prevent drift. Sentence-less inserts take no row
 *  (shown as a marker line in the prompt, scenes skip it). */
export function unifiedPlanRows(sentences: PlanSentence[], inserts?: PlanInsert[]): PlanRow[] {
  const rows: PlanRow[] = [];
  const main = [...sentences].sort((a, b) => a.start - b.start);
  const pending = (inserts ?? []).map((c, k) => ({ c, k })).filter((x) => !!x.c.sentences?.length);
  const flushBefore = (t: number) => {
    while (pending.length && pending[0]!.c.atSec <= t + 0.05) {
      const { c, k } = pending.shift()!;
      for (const r of c.sentences!) rows.push({ src: k + 1, local: r.index, start: r.start, end: r.end, text: r.text });
    }
  };
  for (const m of main) {
    flushBefore(m.start); // anchor = end of nearest preceding main segment: flush insert rows before the main sentence's start crosses the anchor
    rows.push({ src: 'main', local: m.index, start: m.start, end: m.end, text: m.text });
  }
  flushBefore(Infinity);
  return rows;
}

/** Planning prompt (core constraints + output contract) is assembled in prompts/index.ts; body in prompts/plan-*.md. */
export { PLAN_SYSTEM, PLAN_SYSTEM_TOOLS };

/**
 * Scene-count band, DERIVED from the pacing rule rather than restated beside it: graphics hold
 * 3–8s (PLAN_CORE), so a d-second video healthily carries between d/8 and d/4 scenes. Stated as
 * numbers in the request because a model follows "about 9 scenes (7–14)" far more reliably than
 * it integrates "3–8s each" over a duration it never multiplies out — under-segmenting was the
 * common failure: six sentences of distinct beats merged into two scenes.
 */
export function planSceneBand(videoDurationSec: number): { min: number; max: number; target: number } {
  const d = Math.max(0, videoDurationSec);
  const min = Math.max(2, Math.floor(d / 8));
  const max = Math.max(3, Math.ceil(d / 4));
  const target = Math.min(max, Math.max(min, Math.round(d / 6)));
  return { min, max, target };
}

export function buildPlanPrompt(args: {
  sentences: PlanSentence[];
  videoDurationSec: number;
  canvas?: { width: number; height: number };
  topic?: string;
  visuals?: PlanVisual[];
  inserts?: PlanInsert[];
}): string {
  const vmap = new Map((args.visuals ?? []).map((v) => [v.index, v]));
  // Unified narrative flow: main + insert sentences interleave by anchor into ONE script — an insert's
  // meaning is a beat mid-narrative, so the LLM must read and segment the whole (splitting into separate
  // index spaces loses narrative context; been there).
  const rows = unifiedPlanRows(args.sentences, args.inserts);
  const hasClips = rows.some((r) => r.src !== 'main');
  // Sentence-less inserts: take no row number, shown as a marker line at the anchor (scenes skip it; it's its own silent beat)
  const silent = (args.inserts ?? []).map((c, k) => ({ c, k })).filter((x) => !x.c.sentences?.length);
  const lineFor = (r: PlanRow, g: number) => {
    const v = r.src === 'main' ? vmap.get(r.local) : undefined;
    const hint = v ? `  [frame:${v.content} · safe:${v.safe}]` : '';
    const tag = r.src === 'main' ? '' : `[clip #${r.src}] `;
    return `${g}. ${tag}[${r.start.toFixed(1)}-${r.end.toFixed(1)}] ${r.text}${hint}`;
  };
  const printed: string[] = [];
  {
    const pendingSilent = [...silent];
    let lastMainEnd = 0;
    rows.forEach((r, g) => {
      if (r.src === 'main') {
        while (pendingSilent.length && pendingSilent[0]!.c.atSec <= r.start + 0.05) {
          const { c, k } = pendingSilent.shift()!;
          printed.push(`--- [clip #${k + 1}] ${c.durationSec.toFixed(1)}s inserted footage, no speech — its own silent beat; no scene or graphic covers it ---`);
        }
        lastMainEnd = r.end;
      }
      printed.push(lineFor(r, g));
    });
    for (const { c, k } of pendingSilent) {
      void lastMainEnd;
      printed.push(`--- [clip #${k + 1}] ${c.durationSec.toFixed(1)}s inserted footage, no speech — its own silent beat; no scene or graphic covers it ---`);
    }
  }
  return [
    args.topic ? `Topic hint: ${args.topic}` : '',
    args.canvas
      ? `Canvas: ${Math.round(args.canvas.width)}×${Math.round(args.canvas.height)} (${args.canvas.width >= args.canvas.height ? 'LANDSCAPE — for big-area moments prefer corner first, split second' : 'PORTRAIT — for big-area moments prefer split (top/bottom) first, corner second'}; the split axis follows the canvas automatically).`
      : '',
    (() => {
      const band = planSceneBand(args.videoDurationSec);
      return `Video duration: ${args.videoDurationSec.toFixed(1)}s → plan ABOUT ${band.target} scenes (healthy band ${band.min}–${band.max}). Under ${band.min} means distinct beats are being merged away; over ${band.max} means graphics will flash by unread. The band is a pacing constraint, not a style choice.`;
    })(),
    `The FULL script in narrative order (row. [start-end] text, with picture hints where available):`,
    printed.join('\n'),
    hasClips || silent.length
      ? `INSERTED CLIPS: rows tagged [clip #k] are spliced-in footage — part of the SAME narrative, planned together with everything around them (their graphics/framing come from their own words, with full context of the surrounding story). Their timestamps are the clip's OWN clock (they restart; compare times only within one source). HARD RULE: a scene must never mix [clip #k] rows with narration rows, or rows of two different clips — the footage changes at the boundary, so end the scene there and start a new one. Untagged "---" marker lines are silent clips: their footage stays untouched; no scene or graphic covers them.`
      : '',
    `Segment these row indices into scenes and produce the scene plan (cover every row exactly once, in order).`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function coerceGraphic(g: unknown): SceneGraphic | undefined {
  if (!g || typeof g !== 'object') return undefined;
  const o = g as Record<string, unknown>;
  const brief = typeof o.brief === 'string' ? o.brief.trim() : '';
  if (!brief) return undefined; // a graphic with no brief is meaningless
  const data = typeof o.data === 'string' && o.data.trim() ? o.data.trim() : undefined;
  const size = GRAPHIC_SIZES.includes(o.size as GraphicSize) ? (o.size as GraphicSize) : undefined;
  const holdTo = typeof o.holdTo === 'number' && Number.isFinite(o.holdTo) ? Math.round(o.holdTo) : undefined;
  return { brief, ...(data ? { data } : {}), ...(size ? { size } : {}), ...(holdTo !== undefined ? { holdTo } : {}) };
}

function coerceScene(s: unknown, sentenceCount: number): Scene | null {
  if (!s || typeof s !== 'object') return null;
  const o = s as Record<string, unknown>;
  let from = Number(o.from);
  if (!Number.isInteger(from)) return null;
  let to = Number(o.to);
  if (!Number.isInteger(to)) to = from;
  from = Math.max(0, Math.min(sentenceCount - 1, from));
  to = Math.max(from, Math.min(sentenceCount - 1, to));
  const framing = FRAMINGS.includes(o.framing as Framing) ? (o.framing as Framing) : 'full';
  const emphasis = Array.isArray(o.emphasis) ? (o.emphasis as unknown[]).map(String).filter(Boolean).slice(0, 2) : [];
  const graphic = coerceGraphic(o.graphic);
  return { from, to, framing, ...(graphic ? { graphic } : {}), ...(emphasis.length ? { emphasis } : {}) };
}

/* ============================ Fault-tolerant JSON (truncation / trailing-comma rescue) ============================ */

/** Scan and balance brackets: return the closing sequence to append; return null if structure is broken (mismatch / cut inside a string). */
function bracketBalance(s: string): string | null {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\') {
      if (inStr) esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}') {
      if (stack.pop() !== '{') return null;
    } else if (ch === ']') {
      if (stack.pop() !== '[') return null;
    }
  }
  if (inStr) return null;
  return stack
    .reverse()
    .map((c) => (c === '{' ? '}' : ']'))
    .join('');
}

/** Truncation repair: step back from the tail to the nearest }/], balance the remaining brackets, retry parse —
 *  when a long output is cut by max_tokens, drop the incomplete tail and keep the complete leading scenes. */
function repairTruncatedJson(raw: string): string | null {
  for (let end = raw.length; end > 0; ) {
    const cut = Math.max(raw.lastIndexOf('}', end - 1), raw.lastIndexOf(']', end - 1));
    if (cut < 0) return null;
    const head = raw.slice(0, cut + 1);
    const closers = bracketBalance(head);
    if (closers != null) {
      const candidate = head + closers;
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        /* fall back to an earlier closing point */
      }
    }
    end = cut;
  }
  return null;
}

/** Fault-tolerant plan JSON extraction: fence (unclosed allowed) → direct parse → strip trailing comma → truncation repair. Returns {} on failure. */
export function extractPlanJson(text: string): Record<string, unknown> {
  const fenced = /```json\s*([\s\S]*?)(?:```|$)/i.exec(text);
  let raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf('{');
  if (start < 0) return {};
  raw = raw.slice(start);
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* continue */
  }
  // common minor issue: trailing comma
  const noTrailing = raw.replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(noTrailing) as Record<string, unknown>;
  } catch {
    /* continue */
  }
  const repaired = repairTruncatedJson(noTrailing);
  if (repaired) {
    try {
      return JSON.parse(repaired) as Record<string, unknown>;
    } catch {
      /* give up */
    }
  }
  return {};
}

/** rowsOrCount: unified-flow rows (production path, decomposes back into main/inserts) or plain sentence count
 *  (legacy/reload: a stored plan is already in decomposed shape, scenes ARE main local indices, inserts taken as-is). */
export function parsePlan(text: string, rowsOrCount: PlanRow[] | number): DraftPlan {
  const o = extractPlanJson(text);
  return assemblePlan(
    {
      scenes: Array.isArray(o.scenes) ? (o.scenes as unknown[]) : [],
      title: o.title,
      outro: o.outro,
      inserts: Array.isArray(o.inserts) ? (o.inserts as unknown[]) : [],
    },
    rowsOrCount,
  );
}

/** Take a stored plan's inserts as-is (cloud reload re-parse: the assembly layer already decomposed them, only shape validation needed). */
function coerceInsertPlans(raw: unknown[]): InsertPlan[] {
  const out: InsertPlan[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const clip = Number(o.clip);
    if (!Number.isInteger(clip) || clip < 1) continue;
    const scenes = (Array.isArray(o.scenes) ? o.scenes : [])
      .map((s) => coerceScene(s, 10_000))
      .filter((s): s is Scene => !!s)
      .sort((a, b) => a.from - b.from);
    if (scenes.length && !out.some((x) => x.clip === clip)) out.push({ clip, scenes });
  }
  return out;
}

/** Assemble a DraftPlan from loose pieces (JSON parse product / scenes emitted one by one by the tool loop):
 *  coerce each + sort + coverage normalize (drop swallowed scenes, merge gaps forward, extend tail) + title/outro defaults. */
export function assemblePlan(
  pieces: { scenes: unknown[]; title?: unknown; outro?: unknown; inserts?: unknown[] },
  rowsOrCount: PlanRow[] | number,
): DraftPlan {
  const rows = typeof rowsOrCount === 'number' ? null : rowsOrCount;
  const sentenceCount = rows ? rows.length : (rowsOrCount as number);
  const parsed = pieces.scenes
    .map((s) => coerceScene(s, sentenceCount))
    .filter((s): s is Scene => !!s)
    .sort((a, b) => a.from - b.from);

  // Normalize: sequential coverage, each index belongs to exactly one scene (cover every sentence exactly once).
  //  · fully swallowed by a preceding scene (s.to < cursor) → drop the whole scene: graphic.data is pulled from the original sentence range, so shifting would attach it to the wrong sentences
  //  · partial overlap → only clamp the start
  //  · mid gap → merge into the previous scene (extend prev.to); leading gap → merge into the first scene (from=0)
  //  · uncovered tail → extend the last scene to the end
  const scenes: Scene[] = [];
  let cursor = 0;
  for (const s of parsed) {
    if (cursor > sentenceCount - 1) break;
    if (s.to < cursor) continue; // fully swallowed → drop
    let from = Math.max(cursor, s.from);
    const to = Math.max(from, Math.min(sentenceCount - 1, s.to));
    if (from > cursor) {
      if (scenes.length) scenes[scenes.length - 1]!.to = from - 1;
      else from = 0;
    }
    scenes.push({ ...s, from, to });
    cursor = to + 1;
  }
  if (scenes.length && cursor <= sentenceCount - 1) scenes[scenes.length - 1]!.to = sentenceCount - 1;

  // Decompose: unified flow (global row numbers) → main scenes (main local indices) + each insert's scenes (in-clip indices).
  // Coverage normalization was done globally; here we only split at SOURCE boundaries (crossings from LLM
  // rule-breaking or gap-merging: the first piece keeps graphic/framing, later pieces revert to full with no
  // graphic — the graphic brief is the original scene's main content) + index remapping. No rows (legacy/reload)
  // = scenes ARE the main narration, inserts taken as-is.
  let mainScenes: Scene[] = scenes;
  let insertPlans: InsertPlan[] = coerceInsertPlans(pieces.inserts ?? []);
  if (rows) {
    mainScenes = [];
    const byClip = new Map<number, Scene[]>();
    for (const sc of scenes) {
      let a = sc.from;
      let first = true;
      while (a <= sc.to) {
        const src = rows[a]!.src;
        let b = a;
        while (b + 1 <= sc.to && rows[b + 1]!.src === src) b += 1;
        let piece: Scene = first
          ? { ...sc, from: rows[a]!.local, to: rows[b]!.local }
          : { from: rows[a]!.local, to: rows[b]!.local, framing: 'full' };
        if (piece.graphic?.holdTo !== undefined) {
          // holdTo arrived in GLOBAL row numbers; clamp it into this piece's source segment and
          // remap to local — an anchor never outlives its own source (the footage changes there).
          const hLimit = (() => { let e = b; while (e + 1 < rows.length && rows[e + 1]!.src === src) e += 1; return e; })();
          const h = Math.min(Math.max(piece.graphic.holdTo, sc.to), hLimit);
          const { holdTo: _h, ...g } = piece.graphic;
          piece = { ...piece, graphic: { ...g, ...(rows[h]!.local > piece.to ? { holdTo: rows[h]!.local } : {}) } };
        }
        if (src === 'main') mainScenes.push(piece);
        else byClip.set(src, [...(byClip.get(src) ?? []), piece]);
        first = false;
        a = b + 1;
      }
    }
    insertPlans = [...byClip.entries()].map(([clip, sc]) => ({ clip, scenes: sc })).sort((x, y) => x.clip - y.clip);
  }
  const plan: DraftPlan = { scenes: mainScenes, ...(insertPlans.length ? { inserts: insertPlans } : {}) };
  const tt = pieces.title as Record<string, unknown> | undefined;
  if (tt && typeof tt === 'object' && typeof tt.text === 'string' && tt.text.trim()) {
    plan.title = {
      text: String(tt.text),
      ...(typeof tt.sub === 'string' && tt.sub ? { sub: String(tt.sub) } : {}),
      durationSec: Number(tt.durationSec) > 0 ? Number(tt.durationSec) : 2.5,
    };
  }
  const oo = pieces.outro as Record<string, unknown> | undefined;
  if (oo && typeof oo === 'object' && typeof oo.text === 'string' && oo.text.trim()) {
    plan.outro = {
      text: String(oo.text),
      ...(typeof oo.sub === 'string' && oo.sub ? { sub: String(oo.sub) } : {}),
      durationSec: Number(oo.durationSec) > 0 ? Number(oo.durationSec) : 2,
    };
  }
  return plan;
}

export async function planDraft(
  models: ChatCapable,
  args: {
    sentences: PlanSentence[];
    videoDurationSec: number;
    topic?: string;
    visuals?: PlanVisual[];
    /** Current theme brief (themeForLlm output) → keeps the plan's tone/palette within the preset. */
    theme?: string;
    hint?: { quality?: 'high' | 'standard' | 'cheap'; provider?: string; provider_model_id?: string };
  },
): Promise<DraftPlan> {
  const system = planWithActiveTheme(PLAN_SYSTEM, args.theme);
  const r = await models.chat({ system, prompt: buildPlanPrompt(args), hint: args.hint ?? { quality: 'high' } });
  return parsePlan(r.text, args.sentences.length);
}
