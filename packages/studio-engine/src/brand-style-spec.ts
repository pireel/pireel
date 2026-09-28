/**
 * A creator's style, abstracted: the rules that hold across their videos, organised by system
 * (captions, typography, graphics, colour, framing, editing, motion, bookends, sound, cover).
 * This is not a pick from existing presets — it describes the creator's own visual grammar so
 * generators can make new material in that grammar. Content that changes per video is not style.
 *
 * Built in two model passes: a per-video reading (what each system does in that video, with times),
 * then a synthesis across videos that keeps only what recurs. Both outputs are validated here;
 * anything off-contract fails with the offending field instead of being patched.
 */

export const STYLE_SYSTEM_IDS = ['captions', 'typography', 'graphics', 'color', 'framing', 'editing', 'motion', 'bookends', 'sound', 'cover'] as const;
export type StyleSystemId = typeof STYLE_SYSTEM_IDS[number];
export type StyleConfidence = 'high' | 'medium' | 'low';

export interface StyleEvidenceRef { video: string; sec: number }

export interface StyleRule {
  /** In the creator's language, shown and edited on the brand page. */
  text: string;
  /** English, imperative, written for a designer or a generator. */
  en: string;
  /** Videos in which the rule is visible — its support. */
  videos: string[];
  evidence: StyleEvidenceRef[];
}

export interface StyleSystem {
  present: boolean;
  summary: string;
  rules: StyleRule[];
  /** Measurable values: colours (#RRGGBB), sizes (% of frame), durations (s), counts. */
  tokens: Record<string, string | number>;
  /** What is allowed to change between videos. */
  variations: string;
  confidence: StyleConfidence;
}

export interface BrandStyleSpec {
  version: 1;
  summary: string;
  summaryEn: string;
  systems: Record<StyleSystemId, StyleSystem>;
  /** Evidence stills saved with the brand, addressed by video + time. */
  frames: (StyleEvidenceRef & { key: string })[];
}

/** One video's reading: what each system does in it, at which times. */
export interface VideoStyleReading {
  video: string;
  summary: string;
  systems: Partial<Record<StyleSystemId, { present: boolean; observations: { text: string; times: number[] }[] }>>;
}

const MAX_RULES = 8;
const MAX_TEXT = 400;
const HEX = /^#[0-9a-f]{6}$/i;

function fail(path: string, value: unknown): never {
  throw new Error(`风格说明书输出不符合约定：${path} = ${JSON.stringify(value)?.slice(0, 160)}`);
}
function json(raw: string): Record<string, unknown> {
  try { return JSON.parse(/\{[\s\S]*\}/.exec(raw)?.[0] ?? raw) as Record<string, unknown>; } catch { return fail('json', raw.slice(0, 200)); }
}
const str = (value: unknown, path: string, max = MAX_TEXT, allowEmpty = false) =>
  typeof value === 'string' && value.length <= max && (allowEmpty || value.trim()) ? value.trim() : fail(path, value);
const obj = (value: unknown, path: string) => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail(path, value));
const arr = (value: unknown, path: string) => (Array.isArray(value) ? value : fail(path, value));

export function parseVideoStyleReading(raw: string, video: string, durationSec: number): VideoStyleReading {
  const value = json(raw);
  const systems = obj(value.systems, 'systems');
  const out: VideoStyleReading['systems'] = {};
  for (const [id, system] of Object.entries(systems)) {
    if (!(STYLE_SYSTEM_IDS as readonly string[]).includes(id)) fail(`systems.${id}`, 'unknown system');
    const item = obj(system, `systems.${id}`);
    if (typeof item.present !== 'boolean') fail(`systems.${id}.present`, item.present);
    const observations = arr(item.observations ?? [], `systems.${id}.observations`).slice(0, 12).map((entry, index) => {
      const observation = obj(entry, `systems.${id}.observations.${index}`);
      const times = arr(observation.times ?? [], `systems.${id}.observations.${index}.times`).map((t, at) =>
        typeof t === 'number' && t >= 0 && t <= durationSec + 0.5 ? Math.round(t * 10) / 10 : fail(`systems.${id}.observations.${index}.times.${at}`, t));
      return { text: str(observation.text, `systems.${id}.observations.${index}.text`), times };
    });
    out[id as StyleSystemId] = { present: item.present, observations };
  }
  return { video, summary: str(value.summary, 'summary', 600), systems: out };
}

/**
 * The synthesis keeps only recurring rules: with 3+ videos, a rule must be visible in at least two;
 * every evidence reference must point at a real video and time.
 */
export function parseBrandStyleSpec(raw: string, videos: { id: string; durationSec: number }[]): Omit<BrandStyleSpec, 'frames'> {
  const value = json(raw);
  const ids = new Set(videos.map(video => video.id));
  const duration = new Map(videos.map(video => [video.id, video.durationSec]));
  const minSupport = videos.length >= 3 ? 2 : 1;
  const systems = obj(value.systems, 'systems');
  const out = {} as Record<StyleSystemId, StyleSystem>;
  for (const id of STYLE_SYSTEM_IDS) {
    const item = obj(systems[id], `systems.${id}`);
    if (typeof item.present !== 'boolean') fail(`systems.${id}.present`, item.present);
    const rules = arr(item.rules ?? [], `systems.${id}.rules`);
    if (rules.length > MAX_RULES) fail(`systems.${id}.rules`, `${rules.length} rules`);
    if (item.present && !rules.length) fail(`systems.${id}.rules`, 'present without rules');
    const tokens = obj(item.tokens ?? {}, `systems.${id}.tokens`);
    for (const [key, token] of Object.entries(tokens)) {
      const ok = typeof token === 'number' ? Number.isFinite(token) : typeof token === 'string' && token.length <= 60 && (!/color|colour/i.test(key) || HEX.test(token));
      if (!ok) fail(`systems.${id}.tokens.${key}`, token);
    }
    if (!['high', 'medium', 'low'].includes(item.confidence as string)) fail(`systems.${id}.confidence`, item.confidence);
    out[id] = {
      present: item.present,
      summary: str(item.summary, `systems.${id}.summary`, MAX_TEXT, !item.present),
      variations: typeof item.variations === 'string' ? item.variations.slice(0, MAX_TEXT) : '',
      confidence: item.confidence as StyleConfidence,
      tokens: tokens as Record<string, string | number>,
      rules: rules.map((entry, index) => {
        const path = `systems.${id}.rules.${index}`;
        const rule = obj(entry, path);
        const support = arr(rule.videos, `${path}.videos`).map(video => (typeof video === 'string' && ids.has(video) ? video : fail(`${path}.videos`, video)));
        if (new Set(support).size < minSupport) fail(`${path}.videos`, `support ${new Set(support).size} < ${minSupport}`);
        const evidence = arr(rule.evidence ?? [], `${path}.evidence`).slice(0, 6).map((ref, at) => {
          const item = obj(ref, `${path}.evidence.${at}`);
          const video = typeof item.video === 'string' && ids.has(item.video) ? item.video : fail(`${path}.evidence.${at}.video`, item.video);
          const sec = typeof item.sec === 'number' && item.sec >= 0 && item.sec <= duration.get(video)! + 0.5 ? Math.round(item.sec * 10) / 10 : fail(`${path}.evidence.${at}.sec`, item.sec);
          return { video, sec };
        });
        return { text: str(rule.text, `${path}.text`), en: str(rule.en, `${path}.en`), videos: [...new Set(support)], evidence };
      }),
    };
  }
  return { version: 1, summary: str(value.summary, 'summary', 600), summaryEn: str(value.summaryEn, 'summaryEn', 600), systems: out };
}

/** The spec as a generator reads it: English rules and tokens per present system. */
export function styleSpecForGeneration(spec: BrandStyleSpec, systems: readonly StyleSystemId[] = STYLE_SYSTEM_IDS): string {
  const lines = [`Creator style: ${spec.summaryEn}`];
  for (const id of systems) {
    const system = spec.systems[id];
    if (!system?.present) continue;
    lines.push(`\n## ${id}`);
    for (const rule of system.rules) lines.push(`- ${rule.en}`);
    const tokens = Object.entries(system.tokens);
    if (tokens.length) lines.push(`Tokens: ${tokens.map(([key, value]) => `${key}=${value}`).join(', ')}`);
  }
  return lines.join('\n');
}

/** Storage check for a saved spec: structure and bounds only. Rules the creator added by hand may
 * have no source videos; model output is held to the stricter synthesis contract above. */
export function validateStoredStyleSpec(value: unknown): BrandStyleSpec {
  const spec = obj(value, 'style');
  if (spec.version !== 1) fail('style.version', spec.version);
  str(spec.summary, 'style.summary', 600, true); str(spec.summaryEn, 'style.summaryEn', 600, true);
  const systems = obj(spec.systems, 'style.systems');
  for (const id of STYLE_SYSTEM_IDS) {
    const system = obj(systems[id], `style.systems.${id}`);
    if (typeof system.present !== 'boolean') fail(`style.systems.${id}.present`, system.present);
    const rules = arr(system.rules, `style.systems.${id}.rules`);
    if (rules.length > 20) fail(`style.systems.${id}.rules`, `${rules.length} rules`);
    rules.forEach((rule, index) => { const item = obj(rule, `style.systems.${id}.rules.${index}`); str(item.text, `style.systems.${id}.rules.${index}.text`); if (typeof item.en !== 'string') fail(`style.systems.${id}.rules.${index}.en`, item.en); arr(item.videos, `style.systems.${id}.rules.${index}.videos`); arr(item.evidence, `style.systems.${id}.rules.${index}.evidence`); });
    obj(system.tokens, `style.systems.${id}.tokens`);
  }
  const frames = arr(spec.frames, 'style.frames');
  if (frames.length > 60) fail('style.frames', `${frames.length} frames`);
  frames.forEach((frame, index) => { const item = obj(frame, `style.frames.${index}`); if (typeof item.key !== 'string' || !item.key || /^(blob|data):/.test(item.key)) fail(`style.frames.${index}.key`, item.key); });
  return spec as unknown as BrandStyleSpec;
}
