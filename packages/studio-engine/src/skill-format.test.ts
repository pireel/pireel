import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2 } from './editor-document';
import { resolveEditingRunConfig } from './editing-run-config';
import { composeSkillMarkdown, detectSkillSettings, lookToolInput, parseSkillMarkdown, skillStarterPrompt } from './skill-format';

describe('SKILL.md', () => {
  it('round-trips frontmatter, targets and the look block', () => {
    const look = { id: 'look-1', css: '.x{}', pieces: { card: { label: 'Card', source: 'function(){return {html:"a"}}', propsSchema: { type: 'object', properties: { title: { type: 'string' } } } } } };
    const markdown = composeSkillMarkdown({
      name: 'Unboxing giveaway',
      description: 'Unboxing with prize cards: use for giveaway videos.',
      inputs: ['Giveaway rules'],
      settings: { pauses: 'tight', voice: 'Ava' },
      body: '# Targets\n\nA prize card at every prize.',
      look,
    });
    expect(markdown).toContain('description: "Unboxing with prize cards: use for giveaway videos."');
    expect(parseSkillMarkdown(markdown)).toEqual({
      name: 'Unboxing giveaway',
      description: 'Unboxing with prize cards: use for giveaway videos.',
      inputs: ['Giveaway rules'],
      settings: { pauses: 'tight', voice: 'Ava' },
      body: '# Targets\n\nA prize card at every prize.',
      look,
    });
    expect(lookToolInput(look)).toEqual({ css: '.x{}', pieces: [{ id: 'card', label: 'Card', source: 'function(){return {html:"a"}}', propsSchema: '{"title":{"type":"string"}}' }] });
  });

  it('titles a conventional SKILL.md by its heading and falls back to stored fields without frontmatter', () => {
    expect(parseSkillMarkdown('---\nname: product-story\ndescription: Story\n---\n# Product story\n\nBody').name).toBe('Product story');
    expect(parseSkillMarkdown('Just the body', { name: 'Old', description: 'Old skill' })).toMatchObject({ name: 'Old', description: 'Old skill', body: 'Just the body' });
  });
});

describe('Skill style from a finished edit', () => {
  it('reads the settings an edit shows, leaving a brand-supplied caption look out', () => {
    const document = emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 });
    document.appearance.captionStyle = { on: true, preset: 'karaoke', yPct: 72, scale: 1.7, font: 'web:lxgw-wenkai', sub: { lang: 'en' } };
    expect(detectSkillSettings(document, { switches: ['captions', 'rough-cut', 'unknown'], pauses: 'tight' })).toEqual({
      switches: ['captions', 'rough-cut'],
      pauses: 'tight',
      captions: { style: { preset: 'karaoke', yPct: 72, scale: 1.7, font: 'web:lxgw-wenkai' } },
    });
    expect(detectSkillSettings(document, { brandCaptions: true }).captions).toBeUndefined();
  });

  it('applies under the brand: its pacing and captions fill only what the brand leaves open', () => {
    const skill = { pauses: 'tight' as const, captions: { style: { preset: 'karaoke' } } };
    expect(resolveEditingRunConfig({ skills: ['rough-cut', 'captions'], skill })).toMatchObject({ pauses: 'tight', captions: skill.captions });
    expect(resolveEditingRunConfig({ skills: ['rough-cut'], pauses: 'natural', skill }).pauses).toBe('natural');
  });

  it('measures the finished edit as rounded numbers', async () => {
    const { measureSkillStyle } = await import('./skill-format');
    const document = emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 });
    expect(measureSkillStyle(document)).toMatchObject({ durationSec: 0, broll: null, graphics: null, transitions: 0, music: false, soundEffects: 0 });
  });

  it('starts the composer with one line per input', () => {
    expect(skillStarterPrompt(['Script', 'Product name'])).toBe('Script: \nProduct name: ');
    expect(skillStarterPrompt([])).toBeNull();
  });
});
