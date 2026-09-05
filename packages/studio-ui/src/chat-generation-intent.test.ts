import { describe, expect, it } from 'vitest';
import { generationIntentLine, generationTemplatePrompts, GENERATION_INTENTS } from './chat-generation-intent';

describe('chat generation intent', () => {
  it('appends one compact instruction line carrying kind and only the parameters that apply', () => {
    expect(generationIntentLine('image', { ratio: '9:16', count: 2, durationSec: 10 })).toBe(
      '(Generate an image — aspect 9:16, count 2; register the result in the project media and place it only if I asked.)',
    );
    expect(generationIntentLine('video', { ratio: '16:9', durationSec: 10, count: 4 })).toContain('aspect 16:9, duration 10s');
    expect(generationIntentLine('audio', { ratio: '1:1', durationSec: 60 })).toBe(
      '(Generate an audio track — duration 60s; register the result in the project media and place it only if I asked.)',
    );
    expect(generationIntentLine('element', {})).toBe(
      '(Generate an on-screen graphic element; register the result in the project media and place it only if I asked.)',
    );
  });

  it('offers a few localized template prompts per intent and none for audio', () => {
    expect(GENERATION_INTENTS.map((intent) => intent.id)).toEqual(['image', 'video', 'audio', 'element']);
    const image = generationTemplatePrompts('image', 'zh-CN', 3);
    expect(image).toHaveLength(3);
    expect(image.every((template) => template.prompt.length > 0 && template.title.length > 0)).toBe(true);
    expect(generationTemplatePrompts('video', 'en').length).toBeGreaterThan(0);
    expect(generationTemplatePrompts('audio', 'en')).toEqual([]);
  });
});
