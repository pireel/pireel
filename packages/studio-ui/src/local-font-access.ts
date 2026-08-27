'use client';

/** Runtime-only handle returned by Chromium's Local Font Access API. Font bytes stay in memory;
 * they are never uploaded or persisted by this module. */
export interface LocalFontFaceHandle {
  readonly family: string;
  readonly fullName: string;
  readonly postscriptName: string;
  readonly style: string;
  blob(): Promise<Blob>;
}

export interface LocalFontFamilyOption {
  family: string;
  faceCount: number;
}

type LocalFontWindow = Window & {
  queryLocalFonts?: () => Promise<LocalFontFaceHandle[]>;
};

const facesByFamily = new Map<string, LocalFontFaceHandle[]>();
let familyOptions: LocalFontFamilyOption[] = [];

export function supportsLocalFontAccess(): boolean {
  return typeof window !== 'undefined'
    && typeof (window as LocalFontWindow).queryLocalFonts === 'function';
}

export function cachedLocalFontFamilies(): LocalFontFamilyOption[] {
  return familyOptions;
}

/** Must be called directly from a user gesture. The browser owns the permission prompt and may
 * return all fonts or only the subset the user allows. */
export async function loadLocalFontFamilies(): Promise<LocalFontFamilyOption[]> {
  const query = typeof window !== 'undefined'
    ? (window as LocalFontWindow).queryLocalFonts
    : undefined;
  if (!query) throw new Error('local-fonts-unsupported');
  const faces = await query.call(window);
  facesByFamily.clear();
  for (const face of faces) {
    const family = face.family.trim();
    if (!family) continue;
    const known = facesByFamily.get(family) ?? [];
    known.push(face);
    facesByFamily.set(family, known);
  }
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  familyOptions = [...facesByFamily.entries()]
    .map(([family, familyFaces]) => ({ family, faceCount: familyFaces.length }))
    .sort((a, b) => collator.compare(a.family, b.family));
  return familyOptions;
}

/** One upright face is enough for SVG export; CSS synthetic weight remains available for the
 * display-text weight control without embedding every installed face into every exported frame. */
export function registeredLocalFontFace(family: string): LocalFontFaceHandle | null {
  const faces = facesByFamily.get(family);
  if (!faces?.length) return null;
  const score = (face: LocalFontFaceHandle) => {
    const style = face.style.toLowerCase();
    if (style === 'regular' || style === 'normal') return 0;
    if (style.includes('book') || style.includes('roman')) return 1;
    if (!style.includes('italic') && !style.includes('oblique')) return 2;
    return 3;
  };
  return [...faces].sort((a, b) => score(a) - score(b))[0] ?? null;
}
