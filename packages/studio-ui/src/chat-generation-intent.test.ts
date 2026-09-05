import { describe, expect, it } from 'vitest';
import { generationIntentLine, generationTemplatePrompts, GENERATION_INTENTS } from './chat-generation-intent';

describe('chat generation intent', () => {
  it('appends one compact instruction line carrying kind and only the parameters that apply', () => {
    expect(generationIntentLine('image', { modelId: 'gpt-image-2', ratio: '9:16', count: 2, quality: 'high', durationSec: 10 })).toBe(
      '(Generate an image — model gpt-image-2, aspect 9:16, count 2, quality high; register the result in the project media and place it only if I asked.)',
    );
    expect(generationIntentLine('video', { ratio: '16:9', durationSec: 10, resolution: '1080p', count: 4 })).toContain('aspect 16:9, resolution 1080p, duration 10s');
    expect(generationIntentLine('music', { ratio: '1:1', durationSec: 60 })).toBe(
      '(Generate a music track (kind music) — duration 60s; register the result in the project media and place it only if I asked.)',
    );
    expect(generationIntentLine('sfx', { durationSec: 3 })).toContain('a sound effect (kind sfx) — duration 3s');
    expect(generationIntentLine('element', {})).toBe(
      '(Generate an on-screen graphic element; register the result in the project media and place it only if I asked.)',
    );
  });

  it('offers a few localized template prompts per intent, built-in ideas for audio', () => {
    expect(GENERATION_INTENTS.map((intent) => intent.id)).toEqual(['image', 'video', 'music', 'sfx', 'element']);
    const image = generationTemplatePrompts('image', 'zh-CN', 3);
    expect(image).toHaveLength(3);
    expect(image.every((template) => template.prompt.length > 0 && template.title.length > 0)).toBe(true);
    expect(generationTemplatePrompts('video', 'en').length).toBeGreaterThan(0);
    expect(generationTemplatePrompts('music', 'en')).toHaveLength(3);
    expect(generationTemplatePrompts('sfx', 'en')).toHaveLength(3);
  });
});
