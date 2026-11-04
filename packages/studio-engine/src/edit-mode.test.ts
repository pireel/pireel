import { describe, expect, it } from 'vitest';
import { classifyEditMode, type EditModeCandidate, type EditModeSource } from './edit-mode';

const shot = (length: number, contentRole: EditModeCandidate['contentRole'], facing?: EditModeCandidate['facing'], wardrobe = ''): EditModeCandidate => ({
  startSec: 0, endSec: length, verdict: 'usable', contentRole, ...(facing ? { facing } : {}),
  log: { subject: '', wardrobe, setting: '', props: '', shotSize: 'medium', camera: 'static', lighting: '' },
});
const source = (assetId: string, candidates: EditModeCandidate[], speaksToCamera = false): EditModeSource => ({ assetId, candidates, speaksToCamera });

// A travel portrait pool: one person, several outfits, mostly facing or turning to the camera.
const portraitPool = [
  source('boat', [shot(18, 'person-primary', 'frontal', 'Lime green ruffled maxi dress'), shot(6, 'person-primary', 'back', 'Lime green dress')]),
  source('beach', [shot(12, 'person-primary', 'profile', 'Yellow crochet tube top and long skirt'), shot(10, 'mixed', 'back'), shot(8, 'person-primary', 'frontal', 'Yellow tube top, white headband')]),
  source('resort', [shot(9, 'person-primary', 'frontal', 'lavender floral strapless gown'), shot(5, 'person-primary', 'near_frontal', 'light purple ruched gown')]),
  source('bow', [shot(3, 'environment', 'no_person')]),
  source('spa', [shot(15, 'transition', undefined, 'teal wrap, black uniform')]),
];

describe('classifyEditMode', () => {
  it('reads a one-person, several-outfit pool as a showcase in travel order', () => {
    const result = classifyEditMode({ sources: portraitPool, scriptMatch: 0.1 });
    expect(result).toMatchObject({ mode: 'showcase', secondary: 'timeline', confidence: 'high' });
    expect(result.stats.looks).toBe(3);
  });

  it('keeps the mode the user named', () => {
    expect(classifyEditMode({ userMode: 'mood', sources: portraitPool })).toMatchObject({ mode: 'mood', confidence: 'user' });
  });

  it('lets speech, a matching script or scenery lead when they dominate', () => {
    expect(classifyEditMode({ sources: [source('a', [shot(30, 'person-primary', 'frontal')], true), source('b', [shot(10, 'environment')])] }).mode).toBe('talking');
    expect(classifyEditMode({ sources: portraitPool, scriptMatch: 0.7 }).mode).toBe('content');
    expect(classifyEditMode({ sources: [source('a', [shot(20, 'environment'), shot(10, 'detail'), shot(5, 'person-primary', 'back')])] })).toMatchObject({ mode: 'mood', confidence: 'high' });
  });

  it('says so when nothing leads', () => {
    expect(classifyEditMode({ sources: [source('a', [shot(10, 'transition'), shot(10, 'other')])] }).confidence).toBe('low');
  });
});
