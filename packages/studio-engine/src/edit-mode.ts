import type { EditorialCandidateReview } from '@pireel/studio-engine/editorial-candidates';

/**
 * How a pool of footage should be cut to a voice-over, decided before anything is placed. The mode
 * changes what a beat is matched on (meaning, chronology, mood, the person, the product, the beat
 * of the music, the speaker, the steps), so the wrong one makes every later choice wrong.
 *
 * A mode the user named always wins. Otherwise this reads the neutral shot logs of the review (what
 * is in frame, facing, wardrobe, setting) and says how sure it is; an unsure call is put to the user.
 */
export const EDIT_MODES = ['content', 'timeline', 'mood', 'showcase', 'product', 'beat', 'talking', 'process'] as const;
export type EditMode = (typeof EDIT_MODES)[number];

export type EditModeCandidate = Pick<EditorialCandidateReview, 'startSec' | 'endSec' | 'verdict' | 'contentRole' | 'facing' | 'log'>;

export interface EditModeSource {
  assetId: string;
  candidates: readonly EditModeCandidate[];
  /** Someone speaks to the camera in this source (local voice activity plus a visible talking face). */
  speaksToCamera?: boolean;
}

export interface EditModeInput {
  /** The mode the user asked for, if any: it is returned as is. */
  userMode?: EditMode;
  sources: readonly EditModeSource[];
  /** Share of the script's beats the footage literally shows (0–1), when it has been judged. */
  scriptMatch?: number;
}

export interface EditModeStats {
  /** Shares of reviewed footage time. */
  person: number;
  environment: number;
  /** Among footage with a person: how much shows a face (frontal, near-frontal or profile). */
  faceAmongPerson: number;
  frontalAmongPerson: number;
  /** Distinct looks (wardrobe by main colour) the person appears in. */
  looks: number;
  speakers: number;
}

export interface EditModeResult {
  mode: EditMode;
  secondary?: EditMode;
  confidence: 'user' | 'high' | 'low';
  /** Why, in a sentence each (English: read by the model, and shown translated by the UI). */
  reasons: string[];
  stats: EditModeStats;
}

/** Colour words, folded so one outfit described two ways ("lavender gown", "light purple gown") is one look. */
const COLOURS: readonly [RegExp, string][] = [
  [/\b(lavender|lilac|purple|violet|light blue|periwinkle)\b/, 'purple'],
  [/\b(yellow|mustard|golden|gold)\b/, 'yellow'],
  [/\b(lime|green|olive|mint)\b/, 'green'],
  [/\b(white|ivory|cream)\b/, 'white'],
  [/\b(black)\b/, 'black'],
  [/\b(red|crimson|burgundy)\b/, 'red'],
  [/\b(pink|rose)\b/, 'pink'],
  [/\b(blue|navy|teal|turquoise)\b/, 'blue'],
  [/\b(brown|beige|tan|khaki)\b/, 'brown'],
];

function lookOf(wardrobe: string | undefined): string | null {
  const text = (wardrobe ?? '').toLowerCase();
  if (!text.trim() || /^(none|n\/a)\b|none visible|not visible/.test(text)) return null;
  for (const [pattern, colour] of COLOURS) if (pattern.test(text)) return colour;
  return null;
}

export function editModeStats(sources: readonly EditModeSource[]): EditModeStats {
  let total = 0;
  let person = 0;
  let environment = 0;
  let face = 0;
  let frontal = 0;
  const looks = new Set<string>();
  for (const source of sources) {
    for (const candidate of source.candidates) {
      const length = Math.max(0, candidate.endSec - candidate.startSec);
      total += length;
      const personish = candidate.contentRole === 'person-primary' || candidate.contentRole === 'mixed';
      if (personish) {
        person += length;
        if (candidate.facing === 'frontal' || candidate.facing === 'near_frontal' || candidate.facing === 'profile') face += length;
        if (candidate.facing === 'frontal' || candidate.facing === 'near_frontal') frontal += length;
      }
      if (candidate.contentRole === 'environment' || candidate.contentRole === 'detail') environment += length;
      if (candidate.contentRole === 'person-primary') {
        const look = lookOf(candidate.log?.wardrobe);
        if (look) looks.add(look);
      }
    }
  }
  const share = (value: number, of: number) => (of > 0 ? Math.round((value / of) * 100) / 100 : 0);
  return {
    person: share(person, total),
    environment: share(environment, total),
    faceAmongPerson: share(face, person),
    frontalAmongPerson: share(frontal, person),
    looks: looks.size,
    speakers: sources.filter((source) => source.speaksToCamera).length,
  };
}

export function classifyEditMode(input: EditModeInput): EditModeResult {
  const stats = editModeStats(input.sources);
  if (input.userMode) return { mode: input.userMode, confidence: 'user', reasons: ['The user chose this mode.'], stats };
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  const sources = Math.max(1, input.sources.length);
  if (stats.speakers / sources >= 0.5) {
    return { mode: 'talking', confidence: 'high', reasons: [`${stats.speakers} of ${input.sources.length} sources have someone speaking to the camera: their speech leads and the rest supports it.`], stats };
  }
  if ((input.scriptMatch ?? 0) >= 0.5) {
    return {
      mode: 'content',
      ...(stats.looks >= 2 ? { secondary: 'timeline' as const } : {}),
      confidence: 'high',
      reasons: [`The footage shows ${pct(input.scriptMatch!)} of what the script says: each line gets the picture of what it names.`],
      stats,
    };
  }
  const scriptApart = input.scriptMatch != null && input.scriptMatch < 0.25;
  if (stats.person >= 0.6 && stats.faceAmongPerson >= 0.4 && (stats.looks >= 2 || stats.frontalAmongPerson >= 0.3)) {
    const sure = stats.person >= 0.65 && stats.looks >= 2;
    return {
      mode: 'showcase',
      ...(stats.looks >= 2 ? { secondary: 'timeline' as const } : {}),
      confidence: sure ? 'high' : 'low',
      reasons: [
        `One person carries ${pct(stats.person)} of the footage, showing a face in ${pct(stats.faceAmongPerson)} of it${stats.looks >= 2 ? ` across ${stats.looks} looks` : ''}: show the person at their best, grouped by look.`,
        ...(scriptApart ? ['The script does not describe the footage, so it sets the rhythm and the text carries its meaning.'] : []),
      ],
      stats,
    };
  }
  if (stats.environment >= 0.5) {
    return { mode: 'mood', confidence: stats.environment >= 0.65 ? 'high' : 'low', reasons: [`Scenery and detail make up ${pct(stats.environment)} of the footage: match the narration's mood and energy, not its words.`], stats };
  }
  return {
    mode: stats.looks >= 2 ? 'timeline' : 'mood',
    confidence: 'low',
    reasons: ['The footage has no clear lead (no dominant person, scenery or speaker): confirm the mode with the user.'],
    stats,
  };
}
