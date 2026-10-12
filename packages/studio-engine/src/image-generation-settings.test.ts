import { describe, expect, it } from 'vitest';
import { imageGenerationParams, normalizeImageSettings, pickImageModel } from './image-generation-settings';

describe('shared image settings', () => {
  it('prefers enabled GPT over catalog order and preserves an explicit choice', () => {
    const models = [{ id: 'nano-banana' }, { id: 'gpt-image' }];
    expect(pickImageModel(models)).toBe('gpt-image');
    expect(pickImageModel(models, 'missing')).toBe('gpt-image');
    expect(pickImageModel(models, 'nano-banana')).toBe('nano-banana');
    expect(pickImageModel([{ id: 'seedream-4' }])).toBe('seedream-4');
    expect(pickImageModel([])).toBe('');
  });
  it('keeps resolution independent from quality and preserves 4K dimensions', () => {
    expect(imageGenerationParams({ modelId: 'gpt-image', size: '3840x2160', quality: 'medium' })).toEqual({ size: '3840x2160', quality: 'medium' });
    expect(imageGenerationParams({ modelId: 'gpt-image', size: '3:4' })).toEqual({ size: '768x1024', quality: 'medium' });
    expect(imageGenerationParams({ modelId: 'gpt-image-2', size: '9:16' })).toEqual({ size: '1440x2560', quality: 'medium' });
  });
  it('converts equivalent aspect and resets incompatible quality when changing models', () => {
    expect(normalizeImageSettings({ modelId: 'nano-banana', size: '3840x2160', quality: 'high' })).toEqual({ modelId: 'nano-banana', size: '16:9', quality: '1k' });
    expect(normalizeImageSettings({ modelId: 'gpt-image', size: '3:4', quality: '4k' })).toEqual({ modelId: 'gpt-image', size: '768x1024', quality: 'medium' });
    expect(imageGenerationParams({ modelId: 'nano-banana', size: '16:9', quality: '4k' })).toEqual({ size: '16:9', quality: '4k' });
  });
});
