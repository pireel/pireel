import { describe, expect, it } from 'vitest';
import type { BrandObservationSummary } from './brand-analysis';
import { assemblePlaybook, type PlaybookParts } from './brand-assembly';
import type { BrandEditSpec } from './brand-edit-spec';
import { METHOD_VERSION } from './brand-method';
import { validatePlaybook } from './brand-playbook';
import { parseStyleFacets, type Synthesis, type VideoReading } from './brand-reading';

const field = <T>(value: T, confidence = 0.8, source = 'measured') => ({ value, provenance: { source, confidence, videos: 4 } });
const spec = {
  usedVideos: ['v1', 'v2', 'v3', 'v4'],
  captions: { presence: field('always'), wordsPerPage: field(8), case: field('sentence') },
  audio: { targetLufs: field(-14.8) },
  cutting: { silence: field({ mode: 'aggressive', maxGapMs: 200 }), targetCpm: field([15.4, 25.6], 0.6) },
  textOverlays: { header: field({ enabled: false, box: null, examples: ['月薪三千怎么存钱'] }) },
} as unknown as BrandEditSpec;
const evidence = { videos: ['v1', 'v2', 'v3'], confidence: 'high' as const, note: '' };
const summary = { captions: { bottomPct: 22, lineHeightPct: 3.5, widthPct: 70, xCenterPct: 50, evidence }, logo: null, intro: null, outro: null } as unknown as BrandObservationSummary;
const reading = (video: string, punch: 'two_sizes' | 'three_plus'): VideoReading => ({
  video, portrait: 'Quick talk.', moves: [], look: { captionFill: '#ffffff', palette: [] },
  facets: { ...parseStyleFacets({ captionTreatment: 'stroke', accentRule: 'keywords', fontClass: 'heavy_sans', punchIn: punch }) },
});
const synthesis: Synthesis = {
  portrait: { text: '快节奏测评', en: 'Fast reviews.' },
  moves: [
    { kind: 'punch_in', variants: ['punch'], frequency: 'frequent', trigger: { text: '笑点', en: 'Punchlines.' }, videos: ['v1', 'v2', 'v3'], evidence: [{ video: 'v1', sec: 3 }] },
    { kind: 'transition', variants: ['whip'], frequency: 'rare', trigger: { text: '换话题', en: 'New topic.' }, videos: ['v2', 'v3'], evidence: [] },
  ],
  opening: { text: '直接开讲', en: 'Straight in.', videos: ['v1', 'v2', 'v3', 'v4'] }, closing: null,
  structure: [], palette: { accent: '#ffd600' }, cover: null, headlines: { text: '数字开头', en: 'Lead with a number.' }, elements: [],
};
const parts = (): PlaybookParts => ({
  id: 'pending', name: 'Mine', platform: 'douyin',
  videos: ['v1', 'v2', 'v3', 'v4'].map(id => ({ id, durationSec: 60 })),
  spec, summary, synthesis, heightPerWidth: 16 / 9,
  readings: [reading('v1', 'three_plus'), reading('v2', 'three_plus'), reading('v3', 'two_sizes')],
  assets: { coverReferences: [], stills: [{ video: 'v1', sec: 3, key: 'uploads/u/e.jpg' }] },
});

describe('assemblePlaybook', () => {
  it('builds a valid playbook: measurement owns values, the synthesis owns judgement', () => {
    const playbook = assemblePlaybook(parts());
    expect(() => validatePlaybook(playbook)).not.toThrow();
    expect(playbook.method).toBe(METHOD_VERSION);
    expect(playbook.fixed.loudness?.lufs).toBe(-15);
    expect(playbook.fixed.pauses?.mode).toBe('tight');
    expect(playbook.fixed.captions).toMatchObject({ on: true, perScreen: 8, accent: 'keywords', style: { color: '#ffffff', strokeColor: '#000000', yPct: 22 } });
    expect(playbook.fixed.palette).toEqual({ accent: '#ffd600' });
    expect(playbook.structure.pace?.cutsPerMin).toEqual([15, 26]);
    expect(playbook.generation.headlines?.examples).toEqual(['月薪三千怎么存钱']);
  });

  it('turns frequency into a cap, reads punch depth from the facets, and links evidence stills', () => {
    const [punch, transition] = assemblePlaybook(parts()).moves;
    expect(punch).toMatchObject({ kind: 'punch_in', maxPerMin: 6, settings: { scale: 1.35 }, evidence: { videos: ['v1', 'v2', 'v3'], confidence: 'high', frames: [{ video: 'v1', sec: 3, key: 'uploads/u/e.jpg' }] } });
    expect(transition).toMatchObject({ kind: 'transition', maxPerMin: 1, evidence: { confidence: 'medium' } });
  });

  it('leaves out habits measurement did not find', () => {
    const input = parts();
    input.spec = { ...spec, audio: { targetLufs: field(-14, 0.2, 'platform_default') } } as unknown as BrandEditSpec;
    input.summary = { ...summary, captions: null } as unknown as BrandObservationSummary;
    const playbook = assemblePlaybook(input);
    expect(playbook.fixed.loudness).toBeUndefined();
    expect(playbook.fixed.captions).toBeUndefined();
  });
});
