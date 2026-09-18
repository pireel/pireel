import { describe, expect, it } from 'vitest';
import { describeGenerationIntentLine, generationIntentLine, generationTemplatePrompts, GENERATION_INTENTS } from './chat-generation-intent';

describe('chat generation intent', () => {
  it('appends one compact instruction line carrying kind and only the parameters that apply', () => {
    expect(generationIntentLine('image', { modelId: 'gpt-image-2', ratio: '9:16', count: 2, quality: 'high', durationSec: 10 })).toBe(
      '(Generate an image — model gpt-image-2, aspect 9:16, count 2, quality high; register the result in the project media and place it only if I asked.)',
    );
    expect(generationIntentLine('video', { ratio: '16:9', durationSec: 10, resolution: '1080p', count: 4 })).toContain('aspect 16:9, resolution 1080p, duration 10s');
    // Audio kind is the explicit choice, not inferred from duration or a leftover voiceId.
    expect(generationIntentLine('audio', { audioKind: 'music', durationSec: 60 })).toBe(
      '(Generate a music track (kind music) — duration 60s; register the result in the project media and place it only if I asked.)',
    );
    expect(generationIntentLine('audio', { audioKind: 'sfx', durationSec: 3 })).toContain('a sound effect (kind sfx) — duration 3s');
    // Default kind is sfx: a plain audio prompt (even with a stale voiceId) is a sound effect, never narration.
    expect(generationIntentLine('audio', { voiceId: 'v_1' })).toContain('a sound effect (kind sfx)');
    expect(generationIntentLine('audio', { audioKind: 'speech', durationSec: 60, voiceId: 'v_1' })).toBe(
      '(Generate narration speech from my text as the exact script — voice v_1; register the result in the project media and place it only if I asked.)',
    );
    expect(generationIntentLine('element', {})).toBe(
      '(Generate an on-screen graphic element (compose_component); register the result in the project media and place it only if I asked.)',
    );
    expect(generationIntentLine('video', { durationSec: 5, generateAudio: true })).toContain('duration 5s, with sound');
  });

  it('recognizes its own line so the chat can render it as a chip', () => {
    expect(describeGenerationIntentLine(generationIntentLine('image', { ratio: '9:16', count: 2 }))).toEqual({ intent: 'image', facts: 'aspect 9:16, count 2' });
    expect(describeGenerationIntentLine(generationIntentLine('audio', { audioKind: 'sfx', durationSec: 3 }))).toEqual({ intent: 'audio', facts: 'duration 3s' });
    expect(describeGenerationIntentLine(generationIntentLine('audio', { audioKind: 'speech', voiceId: 'v1' }))).toEqual({ intent: 'speech', facts: 'voice v1' });
    expect(describeGenerationIntentLine(generationIntentLine('element', {}))).toEqual({ intent: 'element', facts: '' });
    expect(describeGenerationIntentLine('make me a poster')).toBeNull();
  });

  it('offers a few localized template prompts per intent, built-in ideas for audio', () => {
    expect(GENERATION_INTENTS.map((intent) => intent.id)).toEqual(['image', 'video', 'audio', 'element']);
    const image = generationTemplatePrompts('image', 'zh-CN', 3);
    expect(image).toHaveLength(3);
    expect(image.every((template) => template.prompt.length > 0 && template.title.length > 0)).toBe(true);
    expect(generationTemplatePrompts('video', 'en').length).toBeGreaterThan(0);
    expect(generationTemplatePrompts('audio', 'en')).toHaveLength(6);
  });
});
