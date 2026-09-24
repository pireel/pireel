import { describe, expect, it } from 'vitest';
import { generationRequest, withKnownModel } from './generation-settings';

const models = [{ id: 'seedream', name: 'Seedream' }, { id: 'gpt-image', name: 'GPT Image' }];

describe('generationRequest', () => {
  it('maps image settings to the create call the quote also prices', () => {
    expect(generationRequest('image', { ratio: '1:1', count: 2, quality: 'high' }, models)).toEqual({ toolId: 'image-gen', modelId: 'seedream', params: { n: 2, size: '1:1', quality: 'high' } });
    expect(generationRequest('image', { modelId: 'gpt-image', ratio: '16:9' }, models).params.size).toBe('2560x1440');
  });
  it('maps video and audio settings', () => {
    expect(generationRequest('video', { durationSec: 10, resolution: '1080p', ratio: '16:9' }, [{ id: 'kling', name: 'Kling' }])).toEqual({ toolId: 'video-gen', modelId: 'kling', params: { duration_sec: '10', count: 1, resolution: '1080p', aspect_ratio: '16:9', generate_audio: false } });
    expect(generationRequest('audio', { audioKind: 'sfx', durationSec: 3 }, [])).toEqual({ toolId: 'sfx-gen', modelId: '', params: { duration_tier: 's5', duration_sec: 3 } });
    expect(generationRequest('audio', { audioKind: 'music', durationSec: 90 }, []).toolId).toBe('music-gen');
  });
  it('drops a remembered model of another kind', () => {
    expect(withKnownModel({ modelId: 'kling' }, models).modelId).toBeUndefined();
    expect(withKnownModel({ modelId: 'gpt-image' }, models).modelId).toBe('gpt-image');
  });
});
