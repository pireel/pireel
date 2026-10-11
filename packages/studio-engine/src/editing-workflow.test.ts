import { expect, it } from 'vitest';
import { EDITING_CAPABILITIES, defaultEditingRecipe } from './editing-capabilities';
import { compileEditingWorkflow } from './editing-workflow';
import { validateWorkflow } from './workflow';
import { WORKFLOW_NODE_CATALOG, workflowToTarget } from './workflow-editor';
import { buildCaptionBaseDocument } from './caption-task';
import { editingSpeechCues, editingDuration, musicBedPcm, soundEffectPcm } from './editing-operations';
const task = { id: 'test', name: 'source.mp4', options: { broll: { assets: [{ id: 'a', sig: 'asset', name: 'asset.mp4', kind: 'video', width: 640, height: 360, durationSec: 10 }], captions: true } } } as never;
const media = { kind: 'media', id: 'source', version: 'a'.repeat(64) };
const transcript = { kind: 'transcript', id: 'source', version: 'b'.repeat(64) };
it('covers all ten requested editing effects, without scene restyle or low-level picker entries', () => {
  expect(EDITING_CAPABILITIES.slice(0, 10).map(item => item.en)).toEqual(['Motion graphics', 'Sound effects', 'Captions', 'Voice cleanup', 'Camera movement', 'Floating overlay', 'Rough cut', 'Auto layout', 'Auto B-roll', 'Background music']);
  expect(EDITING_CAPABILITIES.some(item => /restyle|规划|装配|transcribe/.test(item.id + item.name))).toBe(false);
});
it('compiles every editing effect to one validated graph with explicit dependencies', () => {
  const recipe = defaultEditingRecipe(); recipe.enabled = EDITING_CAPABILITIES.map(item => item.id); recipe.voiceId = 'voice'; recipe.rewrite = '口语化'; recipe.reviewTranslation = true;
  const compiled = compileEditingWorkflow(recipe, task, media, transcript);
  expect(() => validateWorkflow(compiled.definition, WORKFLOW_NODE_CATALOG)).not.toThrow();
  expect(compiled.definition.steps.length).toBeLessThan(64);
  expect(compiled.definition.steps.find(step => step.id === 'broll-match')?.arguments.transcript).toEqual({ kind: 'step', stepId: 'broll-time', key: 'transcript' });
  const partial = workflowToTarget(compiled.definition, compiled.targets['rough-cut']);
  expect(partial.steps.some(step => step.capability === 'graphics.generate')).toBe(false);
});
it('does not require paid ASR for layout-only or voice cleanup', () => {
  const recipe = defaultEditingRecipe(); recipe.enabled = ['auto-layout', 'voice-cleanup'];
  const compiled = compileEditingWorkflow(recipe, task, media, null);
  expect(compiled.definition.steps.some(step => step.capability === 'speech.transcribe')).toBe(false);
  expect(() => validateWorkflow(compiled.definition, WORKFLOW_NODE_CATALOG)).not.toThrow();
});
it('maps speech into the edited clock so later effects do not drift after cuts', () => {
  const doc = buildCaptionBaseDocument({ projectId: 'test', sourceSig: 'source', sourceUrl: '', width: 640, height: 360, durationSec: 10, transcript: [], options: { caption: {}, aspect: 'original', shortenPauses: true }, cuts: [{ fromSec: 1, toSec: 3 }] });
  const cues = editingSpeechCues(doc, [{ text: 'second', start: 4, end: 6 }]);
  expect(editingDuration(doc)).toBe(8); expect(cues[0]).toMatchObject({ start: 2, end: 4 });
});
it('ducks the music during speech and preserves audible music between phrases', () => {
  const pcm = new Float32Array(48000 * 8).fill(.5);
  const output = musicBedPcm(pcm, 48000, 8, [{ start: 2, end: 4 }], -12, -12);
  expect(output.length).toBe(pcm.length);
  expect(output[3 * 48000]).toBeLessThan(output[6 * 48000] * .3);
  expect(output[0]).toBe(0); expect(output.every(Number.isFinite)).toBe(true);
  for (const style of ['soft', 'pop', 'whoosh'] as const) expect(soundEffectPcm(style).some(sample => Math.abs(sample) > .01)).toBe(true);
});

it('uses the workbench font scale for every workflow aspect and preserves custom sizes', async () => {
  const { editingCaptionOptions } = await import('./editing-capabilities');
  const { captionTaskStyle } = await import('./caption-task');
  const { resolveCaptionStyle } = await import('./composition');
  const workbench = resolveCaptionStyle({ blocks: [] });
  for (const source of [{ width: 1080, height: 1920 }, { width: 1920, height: 1080 }, { width: 1080, height: 1080 }]) {
    const recipe = defaultEditingRecipe();
    expect(captionTaskStyle(editingCaptionOptions(recipe), source).scale).toBe(workbench.scale);
    recipe.captions.caption = { scale: .75, wPct: 80 };
    expect(captionTaskStyle(editingCaptionOptions(recipe), source)).toMatchObject({ scale: .75, wPct: 80 });
    const compiled = compileEditingWorkflow(recipe, task, media, transcript);
    expect(compiled.definition.steps.find(step => step.id === 'captions-plan')!.arguments.layout).toMatchObject({ value: { caption: { scale: .75 } } });
    expect(compiled.definition.steps.find(step => step.id === 'captions-apply')!.arguments.style).toMatchObject({ value: { caption: { scale: .75 } } });
  }
});

it('uses the workbench default look and keeps deliberate style choices', async () => {
  const { editingCaptionOptions } = await import('./editing-capabilities');
  const { captionTaskStyle } = await import('./caption-task');
  const { resolveCaptionStyle } = await import('./composition');
  const recipe = defaultEditingRecipe();
  const style = captionTaskStyle(editingCaptionOptions(recipe));
  expect(style.preset ?? resolveCaptionStyle({ blocks: [] }).preset).toBe(resolveCaptionStyle({ blocks: [] }).preset);
  recipe.captions.caption = { preset: 'art-beast', font: 'web:smiley-sans', bold: true, scale: 1.5 };
  expect(captionTaskStyle(editingCaptionOptions(recipe))).toMatchObject(recipe.captions.caption);
});

it('shares one validated content and framing plan across the visual effects and keeps review before generation', () => {
  const recipe = defaultEditingRecipe(); recipe.enabled = ['motion-graphics', 'camera-movement', 'auto-layout', 'broll', 'captions']; recipe.captions.highlights = true; recipe.reviewPlan = true;
  const compiled = compileEditingWorkflow(recipe, task, media, transcript);
  expect(() => validateWorkflow(compiled.definition, WORKFLOW_NODE_CATALOG)).not.toThrow();
  for (const cap of ['graphics.generate', 'camera.motion', 'layout.auto']) {
    const step = compiled.definition.steps.find(step => step.capability === cap)!;
    expect(step.arguments.plan).toEqual({ kind: 'step', stepId: 'framing-plan', key: 'plan' });
    expect(step.dependsOn).toContain('content-review');
  }
  const preview = workflowToTarget(compiled.definition, compiled.targets.plan);
  expect(preview.steps.some(step => step.capability === 'graphics.generate' || step.capability === 'video.render' || step.capability === 'human.approval')).toBe(false);
  expect(compiled.definition.steps.find(step => step.id === 'caption-highlight')!.arguments.transcript).toEqual({ kind: 'step', stepId: 'transcript', key: 'transcript' });
  expect(compiled.definition.steps.find(step => step.id === 'captions-plan')!.arguments.transcript).toEqual({ kind: 'step', stepId: 'caption-highlight', key: 'transcript' });
});
