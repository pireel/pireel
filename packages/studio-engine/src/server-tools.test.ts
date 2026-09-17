import { describe, expect, it } from 'vitest';
import { type Composition, applyEditorDocumentPersistenceMetadata, compositionToEditorDocument, firstNarrativeAssetId } from './composition';
import { STUDIO_PROJECT_CONTEXT_SCHEMA_VERSION, type TranscriptSegment } from './project-dto';
import { SERVER_EXECUTABLE_TOOLS, type ServerToolProject, runServerTool } from './server-tools';

function proj(over: Partial<ServerToolProject> & { transcript?: TranscriptSegment[] } = {}): ServerToolProject {
  const comp: Composition = {
    width: 1080,
    height: 1920,
    theme: 'general',
    video: null,
    blocks: [
      { id: 'b1', templateId: 'custom', slots: { innerHtml: '<div>hi</div>', timelineBody: '' }, startSec: 1, durationSec: 3, trackIndex: 1, label: '标题卡' },
    ],
    shots: [
      { id: 's1', srcStart: 0, srcEnd: 10, treatment: 'full' },
      { id: 's2', srcStart: 10, srcEnd: 20, treatment: 'punch-in' },
    ],
  };
  const { transcript = [
      { start: 0, end: 5, text: '第一句话' },
      { start: 5, end: 12, text: '第二句话' },
      { start: 12, end: 20, text: '第三句话' },
    ], ...projectOverrides } = over;
  const project = {
    id: 'p1',
    title: '测试项目',
    comp,
    context: { schemaVersion: STUDIO_PROJECT_CONTEXT_SCHEMA_VERSION } as const,
    videoDurationSec: 20,
    ...projectOverrides,
  };
  const document = over.document ?? compositionToEditorDocument({
    projectId: project.id,
    composition: project.comp,
    videoDurationSec: project.videoDurationSec,
  }).document;
  return {
    ...project,
    document: over.document ?? applyEditorDocumentPersistenceMetadata({
      projectId: project.id,
      document,
      mainTranscript: transcript,
    }),
  };
}

const fpsOf = (p: ServerToolProject) => p.document.canvas.fps;

describe('offline executor (no studio tab)', () => {
  it('rejects unknown transition effects before mutating the project', () => {
    const p = proj();
    const result = runServerTool('add_transition', { atFrame: 300, effect: 'dip-to-black' }, p);
    expect(result.result).toMatchObject({ ok: false, error: 'invalid_value' });
    expect(result.document).toBeUndefined();
  });

  it('get_state returns the v3 state with the offline marker and the account guardrail as a boolean', () => {
    const r = runServerTool('get_state', {}, proj({ canGenerate: false }));
    expect(r.result.ok).toBe(true);
    const data = r.result.data as { canvas: { fps: number }; durationFrames: number; tracks: Array<{ clips?: Array<{ frames: [number, number] }> }>; offline: boolean; project: { id: string; title: string }; canGenerate?: boolean };
    expect(data.offline).toBe(true);
    expect(data.project).toEqual({ id: 'p1', title: '测试项目' });
    expect(data.canGenerate).toBe(false);
    expect(data.canvas.fps).toBeGreaterThan(0);
    expect(data.durationFrames).toBeGreaterThan(0);
    expect(data.tracks.some((track) => track.clips?.some((clip) => Array.isArray(clip.frames) && clip.frames.length === 2))).toBe(true);
    expect(JSON.stringify(data)).not.toMatch(/"shots"|"blocks"|startSec|balance/);
    expect(r.comp).toBeUndefined(); // pure read, nothing to persist
    expect((runServerTool('get_state', {}, proj()).result.data as { canGenerate?: boolean }).canGenerate).toBeUndefined();
  });

  it('mutations report a document delta in frames', () => {
    const p = proj();
    const cut = runServerTool('ripple_delete_ranges', { ranges: [[0, 2 * fpsOf(p)]] }, p);
    expect(cut.result.ok, JSON.stringify(cut.result)).toBe(true);
    const delta = (cut.result.data as { delta: { durationFrames?: [number, number]; clips?: unknown[]; shifted?: unknown[] } }).delta;
    expect(delta.durationFrames).toBeDefined();
    expect(delta.durationFrames![1]).toBeLessThan(delta.durationFrames![0]);
    expect((delta.clips?.length ?? 0) + (delta.shifted?.length ?? 0)).toBeGreaterThan(0);
    expect(JSON.stringify(delta)).not.toMatch(/shotsUpdated|blocksShifted|fromSec/);
  });

  it('manage_project lists outputs in frames without changing the project, and leaves output edits to the tab', () => {
    const shortComp: Composition = { ...proj().comp, video: null, shots: [{ id: 'x', srcStart: 0, srcEnd: 8, treatment: 'full' }] };
    const p = proj({
      context: {
        schemaVersion: STUDIO_PROJECT_CONTEXT_SCHEMA_VERSION,
        outputs: {
          active: { id: 'master', title: '母版', order: 0, createdAt: 1, updatedAt: 2 },
          inactive: [{
            id: 'short-1', title: '短片 1', order: 1, createdAt: 3, updatedAt: 4,
            document: compositionToEditorDocument({ projectId: 'short-1', composition: shortComp, videoDurationSec: 8 }).document,
            videoSig: null, videoDurationSec: 8, coverThumb: null,
          }],
        },
      },
    });
    const fps = fpsOf(p);
    const r = runServerTool('manage_project', { scope: 'output', action: 'list' }, p);
    expect(r.result.ok).toBe(true);
    const outputs = (r.result.data as { outputs: { id: string; position: number; active: boolean; durationFrames: number }[] }).outputs;
    expect(outputs.map((output) => [output.position, output.id, output.active, output.durationFrames])).toEqual([
      [1, 'master', true, 20 * fps],
      [2, 'short-1', false, 8 * fps],
    ]);
    expect(outputs.every((output) => !('order' in output) && !('durationSec' in output))).toBe(true);
    expect(r.comp).toBeUndefined();
    expect(runServerTool('manage_project', { scope: 'output', action: 'duplicate', id: 'master' }, p).result).toMatchObject({ ok: false, error: 'tab_required' });
    expect(runServerTool('manage_project', { scope: 'project', action: 'list' }, p).result).toMatchObject({ ok: false, error: 'server_owned' });
  });

  it('search_media searches stored transcripts by source time without writing', () => {
    const r = runServerTool('search_media', { query: '第二句话', scope: 'narrative' }, proj());
    expect(r.result.ok).toBe(true);
    expect(r.comp).toBeUndefined();
    expect(r.document).toBeUndefined();
    const data = r.result.data as { indexVersion: number; results: { segmentId: string; sourceStartSec: number; sourceEndSec: number; transcript: string }[] };
    expect(data.indexVersion).toBe(1);
    expect(data.results[0]).toMatchObject({ sourceStartSec: 5, sourceEndSec: 12, transcript: '第二句话' });
    expect(data.results[0]!.segmentId).toMatch(/^media_source_/);
    const narrowed = runServerTool('search_media', { query: '第二句话', clipId: 's1' }, proj());
    expect(narrowed.result.ok).toBe(true);
  });

  it('answers tab_required with the way back for tools that need the live tab', () => {
    for (const [tool, input] of [['remove_silence', {}], ['inspect_timeline', { frames: [0] }], ['export', { action: 'start' }], ['apply_component', { generate: true, instruction: 'show 42' }]] as const) {
      const r = runServerTool(tool, input as Record<string, unknown>, proj());
      expect(r.result, tool).toMatchObject({ ok: false, error: 'tab_required', data: { fix: expect.stringContaining('Studio') } });
      expect(r.document).toBeUndefined();
    }
  });

  it('the executable set names the current surface only', () => {
    for (const id of ['get_state', 'get_transcript', 'remove_words', 'set_clip_framing', 'apply_component', 'compose_component', 'manage_project', 'search_media', 'set_captions', 'apply_layout']) {
      expect(SERVER_EXECUTABLE_TOOLS.has(id), id).toBe(true);
    }
    for (const legacy of ['read_script', 'apply_block', 'compose_context', 'list_outputs', 'cut_range', 'set_bgm', 'get_timeline', 'capture_frame']) {
      expect(SERVER_EXECUTABLE_TOOLS.has(legacy), legacy).toBe(false);
    }
  });
});

describe('compose_component / apply_component (offline)', () => {
  it('validates and places generated markup with the shared parse+lint; compose_component supplies the context', () => {
    const p = proj();
    const fps = fpsOf(p);
    const raw = '加一张卡\n```html\n<div id="nb" data-props=\'{"accent":{"type":"string","format":"color","title":"Accent","default":"#ff0000"}}\' style="font-size:36px">OK</div>\n```\n```js\ntl.to("#nb", { opacity: 1, duration: 0.3 });\n```';
    const r = runServerTool('apply_component', {
      raw, atFrame: 2 * fps, durationFrames: 4 * fps,
      placement: { xPct: 60, yPct: 12, widthPct: 32, heightPct: 28 },
    }, p);
    expect(r.result.ok, JSON.stringify(r.result)).toBe(true);
    expect(r.comp!.blocks).toHaveLength(2);
    expect(r.comp!.blocks[1]).toMatchObject({
      durationSec: 4,
      box: { x: 0.6, y: 0.12, w: 0.32, h: 0.28 },
      slots: { authoredDurationSec: 4 },
    });
    expect((r.result.data as { clipId: string }).clipId).toBe(r.comp!.blocks[1]!.id);
    const r2 = runServerTool('compose_component', { instruction: 'refresh it', clipId: 'b1' }, p);
    expect(r2.result.ok).toBe(true);
    expect((r2.result.data as { block: { id: string } }).block.id).toBe('b1');
    expect(runServerTool('compose_component', { instruction: 'x', clipId: 'nope' }, p).result).toMatchObject({ ok: false, error: 'unknown_id', data: { path: 'clipId' } });
  });

  it('reports small text as advice without forcing regeneration', () => {
    const raw = '小字\n```html\n<div data-edit="t">Too small</div><style>#small-type .t{font-size:18px}</style>\n```\n```js\n\n```';
    const result = runServerTool('apply_component', { raw, clipId: 'small-type', atFrame: 30 }, proj());
    expect(result.result.ok).toBe(true);
    expect((result.result.data as { warnings: string[] }).warnings.join(' ')).toContain('24px');
  });

  it('compose_component reads the script at atFrame on a long video instead of the opening', () => {
    const transcript = Array.from({ length: 80 }, (_, index) => ({
      start: index * 10,
      end: index * 10 + 8,
      text: index === 0 ? 'INTRO PREFIX' : index === 60 ? 'LATE MOMENT TARGET' : `line-${index}`,
    }));
    const base = proj();
    const project = proj({
      comp: { ...base.comp, shots: [{ id: 'long', srcStart: 0, srcEnd: 800, treatment: 'full' }] },
      videoDurationSec: 800,
      transcript,
    });
    const result = runServerTool('compose_component', { instruction: 'x', atFrame: 605 * fpsOf(project) }, project);
    const script = (result.result.data as { context: { script: string } }).context.script;
    expect(script).toContain('LATE MOMENT TARGET');
    expect(script).not.toContain('INTRO PREFIX');
  });

  it('compose_component converts spoken beats inside the component window to component-local time', () => {
    const project = proj({
      transcript: [
        { start: 1, end: 2, text: '第一点' },
        { start: 3, end: 4, text: '第二点' },
        { start: 5, end: 6, text: '窗口外' },
      ],
    });
    const fps = fpsOf(project);
    const existing = runServerTool('compose_component', { instruction: 'x', clipId: 'b1' }, project);
    const existingData = existing.result.data as { block: { durationSec: number }; context: { beats: Array<{ text: string; start: number; end: number }> } };
    expect(existingData.block.durationSec).toBe(3);
    expect(existingData.context.beats).toEqual([
      { text: '第一点', start: 0, end: 1 },
      { text: '第二点', start: 2, end: 3 },
    ]);

    const created = runServerTool('compose_component', { instruction: 'x', atFrame: 1 * fps, durationFrames: 5 * fps }, project);
    const createdData = created.result.data as { durationSec: number; block: { durationSec: number }; context: { beats: Array<{ text: string; start: number; end: number }> } };
    expect(createdData.durationSec).toBe(5);
    expect(createdData.block.durationSec).toBe(5);
    expect(createdData.context.beats.map((beat) => [beat.text, beat.start])).toEqual([
      ['第一点', 0],
      ['第二点', 2],
      ['窗口外', 4],
    ]);
  });

  it('preserves editable properties and tuned values when a component edit omits the JSON fence', () => {
    const comp = proj().comp;
    const propsSchema = JSON.stringify({ accent: { type: 'string', format: 'color', default: '#112233' } });
    const p = proj({ comp: { ...comp, blocks: [{ ...comp.blocks[0]!, slots: {
      innerHtml: '<div data-edit="title">Original title</div>', timelineBody: '', propsSchema, props: { accent: '#445566' },
    } }] } });
    const raw = 'Updated title.\n```html\n<div data-edit="title" style="color:var(--p-accent)">Changed title</div>\n```\n```js\n\n```';
    const result = runServerTool('apply_component', { raw, clipId: 'b1' }, p);
    expect(result.result.ok, JSON.stringify(result.result)).toBe(true);
    expect(result.comp?.blocks.find((block) => block.id === 'b1')?.slots).toMatchObject({ propsSchema, props: { accent: '#445566' } });
  });

  it('applies an explicit label when updating an existing component', () => {
    const raw = '更新卡片\n```html\n<div data-props=\'{"accent":{"type":"string","format":"color","title":"Accent","default":"#ff0000"}}\'><style>#b1 .title{color:var(--p-accent);font-size:36px}</style><div class="title">Updated</div></div>\n```\n```js\ntl.to("#b1 .title", {opacity:1,duration:.3});\n```';
    const result = runServerTool('apply_component', { raw, clipId: 'b1', label: '新名称' }, proj());
    expect(result.result.ok, JSON.stringify(result.result)).toBe(true);
    expect(result.comp?.blocks.find((block) => block.id === 'b1')?.label).toBe('新名称');
  });

  it('accepts recoverable CSS on both creation and update', () => {
    const raw = '```html\n<div data-edit="t">Text</div><style>???{color:red}.label{color:blue}</style>\n```';
    for (const clipId of ['new-css', 'b1']) {
      const result = runServerTool('apply_component', { raw, clipId, atFrame: 30 }, proj());
      expect(result.result.ok).toBe(true);
      expect(result.comp?.blocks.find((block) => block.id === clipId)?.slots.innerHtml).toContain('.label{color:blue}');
      expect(result.result.data).toMatchObject({ warnings: expect.arrayContaining([expect.stringContaining('CSS rule omitted')]) });
    }
  });

  it('converges on a stable new-component id: an unknown clipId is adopted as-is and lint failures hand one back', () => {
    const rc = runServerTool('compose_component', { instruction: 'x' }, proj());
    const minted = (rc.result.data as { block: { id: string } }).block.id;
    const rawOk = `note\n\`\`\`html\n<div data-props='{"accent":{"type":"string","format":"color","title":"Accent","default":"#ff0000"}}'><style>#${minted} .t{color:var(--p-accent);font-size:36px}</style><div class="t">x</div></div>\n\`\`\`\n\`\`\`js\ntl.to("#${minted} .t",{opacity:1,duration:.3});\n\`\`\``;
    const r1 = runServerTool('apply_component', { raw: rawOk, clipId: minted, atFrame: 30 }, proj());
    expect(r1.result.ok).toBe(true);
    expect((r1.result.data as { clipId: string }).clipId).toBe(minted);
    const rawBad = 'note\n```html\n<div data-props=\'{"accent":{"type":"string","format":"color","title":"Accent","default":"#ff0000"}}\'><script>alert(1)</script><style>.t{color:var(--p-accent);font-size:36px}</style><div class="t">x</div></div>\n```\n```js\ntl.to("#stale9 .t",{opacity:1,duration:.3});\n```';
    const r2 = runServerTool('apply_component', { raw: rawBad, atFrame: 30 }, proj());
    expect(r2.result.ok).toBe(false);
    expect(r2.result.error).toContain('apply_component using clipId');
    const handed = (r2.result.data as { clipId: string }).clipId;
    expect(handed).toBeTruthy();
    const r3 = runServerTool('apply_component', { raw: rawBad.replace('<script>alert(1)</script>', '').replaceAll('#stale9', `#${handed}`), clipId: handed, atFrame: 30 }, proj());
    expect(r3.result.ok).toBe(true);
    expect((r3.result.data as { clipId: string }).clipId).toBe(handed);
  });

  it('requires raw text', () => {
    expect(runServerTool('apply_component', { clipId: 'b1' }, proj()).result).toMatchObject({ ok: false, error: 'missing_field', data: { path: 'raw' } });
  });
});

describe('apply_component: kit contract answers (offline)', () => {
  const TARGET = { id: 'kit-target', templateId: 'kit:metric', slots: { props: { value: '52%', label: '完播率' } }, startSec: 2, durationSec: 3, trackIndex: 2, label: '完播率' };
  const withTarget = () => {
    const base = proj();
    return proj({ comp: { ...base.comp, blocks: [...base.comp.blocks, { ...TARGET, slots: { props: { ...TARGET.slots.props } } }] } });
  };
  it('updates an existing kit component from component JSON, storing props not markup', () => {
    const raw = '选了数字卡。\n```json\n{"component":"metric","props":{"value":"87%","label":"完播率"}}\n```';
    const r = runServerTool('apply_component', { raw, clipId: 'kit-target' }, withTarget());
    expect(r.result.ok).toBe(true);
    const b = r.comp!.blocks.find((x) => x.id === 'kit-target')!;
    expect(b.templateId).toBe('kit:metric');
    expect((b.slots as { props: { value: string } }).props.value).toBe('87%');
    expect((b.slots as { innerHtml?: string }).innerHtml).toBeUndefined();
  });
  it('places a new kit component from component JSON', () => {
    const r = runServerTool('apply_component', { raw: '```json\n{"component":"callout","props":{"text":"先发布再完美"}}\n```', atFrame: 30 }, proj());
    expect(r.result.ok).toBe(true);
    const nb = r.comp!.blocks.find((x) => x.templateId === 'kit:callout')!;
    expect((nb.slots as { props: { text: string } }).props.text).toBe('先发布再完美');
    expect((r.result.data as { clipId: string }).clipId).toBe(nb.id);
  });
  it('null changes nothing; custom is sent back for the markup contract; unknown components are named', () => {
    const r1 = runServerTool('apply_component', { raw: '```json\nnull\n```', clipId: 'kit-target' }, withTarget());
    expect(r1.result.ok).toBe(false);
    expect(r1.comp).toBeUndefined();
    const r2 = runServerTool('apply_component', { raw: '```json\n{"custom": true}\n```', clipId: 'kit-target' }, withTarget());
    expect(r2.result.ok).toBe(false);
    expect(String(r2.result.error)).toContain('compose_component again with format:"html"');
    const r3 = runServerTool('apply_component', { raw: '```json\n{"component":"sparkline","props":{}}\n```', clipId: 'kit-target' }, withTarget());
    expect(r3.result.ok).toBe(false);
    expect(String(r3.result.error)).toContain('sparkline');
  });
});

describe('remove_words (typed)', () => {
  it('cuts source-second pairs and exact words in one call, with the cuts in the receipt', () => {
    const p = proj();
    const byRange = runServerTool('remove_words', { ranges: [[0, 5]] }, p);
    expect(byRange.result.ok).toBe(true);
    expect(byRange.comp!.shots!.reduce((a, s) => a + (s.srcEnd - s.srcStart), 0)).toBeCloseTo(15, 1);
    const cuts = (byRange.result.data as { cuts: Array<{ atSec: number; removedSec: number }>; removedTotalSec: number }).cuts;
    expect(cuts).toHaveLength(1);
    expect((byRange.result.data as { removedTotalSec: number }).removedTotalSec).toBeCloseTo(5, 1);

    const fresh = proj({ transcript: [{ start: 0, end: 4, text: 'one two three', words: [
      { text: 'one', start: 0.2, end: 0.8 }, { text: 'two', start: 1, end: 1.6 }, { text: 'three', start: 2, end: 2.8 },
    ] }] });
    const words = (runServerTool('get_transcript', { granularity: 'words', segmentIndexes: [0] }, fresh).result.data as { words: Array<{ id: string }> }).words;
    const byWord = runServerTool('remove_words', { wordIds: [words[1]!.id] }, fresh);
    expect(byWord.result.ok).toBe(true);
    expect(byWord.comp!.shots!.reduce((n, s) => n + s.srcEnd - s.srcStart, 0)).toBeCloseTo(19.4, 1);
  });

  it('refuses pairs that no longer map onto the timeline with a fix, and stale word ids by name', () => {
    const p = proj();
    const gone = runServerTool('remove_words', { ranges: [[40, 45]] }, p);
    expect(gone.result.ok).toBe(false);
    expect(gone.result.error).toBe('ranges_not_on_timeline');
    expect((gone.result.data as { fix: string }).fix).toContain('get_transcript');
    const stale = runServerTool('remove_words', { wordIds: ['word_stale'] }, p);
    expect(stale.result.ok).toBe(false);
    expect(stale.result.error).toContain('word_stale');
    expect(runServerTool('remove_words', {}, p).result.ok).toBe(false);
  });
});

describe('set_captions translations (offline: the writer every entry shares)', () => {
  const segs = (r: ReturnType<typeof runServerTool>) => {
    const assetId = firstNarrativeAssetId(r.document!)!;
    return r.document!.semantics.transcripts[assetId]!;
  };

  it('writes sentence translations by row and switches the second line to that language', () => {
    const r = runServerTool('set_captions', { translations: { lang: 'English', items: [{ index: 0, text: 'First sentence.' }, { index: 2, text: 'Third sentence.' }] } }, proj());
    expect(r.result.ok, JSON.stringify(r.result)).toBe(true);
    expect(segs(r).map((seg) => seg.sub)).toEqual(['First sentence.', undefined, 'Third sentence.']);
    expect(segs(r)[0]).toMatchObject({ subLang: 'English' });
    expect(r.document!.appearance.captionStyle?.sub?.lang).toBe('English');
  });

  it('writes a per-cue line with w0/w1 and rejects a half range', () => {
    const ok = runServerTool('set_captions', { translations: { lang: 'English', items: [{ index: 1, w0: 0, w1: 1, text: 'Second' }] } }, proj());
    expect(ok.result.ok).toBe(true);
    expect(segs(ok)[1]!.cueSubs).toEqual({ '0:1': 'Second' });
    const bad = runServerTool('set_captions', { translations: { lang: 'English', items: [{ index: 1, w0: 3, text: 'x' }] } }, proj());
    expect(bad.result).toMatchObject({ ok: false, error: 'invalid_value' });
  });

  it('targets an explicit asset, refuses a row past the transcript, and clear removes the second line', () => {
    const p = proj();
    const assetId = firstNarrativeAssetId(p.document)!;
    const r = runServerTool('set_captions', { translations: { lang: 'English', assetId, items: [{ index: 1, text: 'Second sentence.' }] } }, p);
    expect(r.result.ok).toBe(true);
    const past = runServerTool('set_captions', { translations: { lang: 'English', items: [{ index: 9, text: 'x' }] } }, p);
    expect(past.result.ok).toBe(false);
    expect(String((past.result as { error?: string }).error)).toContain('index out of range');
    const cleared = runServerTool('set_captions', { translations: { clear: true } }, { ...p, document: r.document! });
    expect(cleared.result.ok).toBe(true);
    expect(segs(cleared).some((seg) => seg.sub || seg.subLang)).toBe(false);
    expect(cleared.document!.appearance.captionStyle?.sub?.lang).toBeUndefined();
  });
});
