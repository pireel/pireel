import { normalizeImageSettings, imageGenerationParams } from '@pireel/studio-engine/image-generation-settings';
import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { primaryNarrativeClips } from '@pireel/studio-engine/composition';
import { parseCoverPlan } from '@pireel/studio-engine/brand-cover';
import { canonicalJson, hashSection } from '@pireel/studio-engine/stable-json';
import { activeBrandCover, brandCoverReferenceKeys } from '@pireel/studio-engine/brand-playbook';
import { retainedCoverFrame, coverFrameIdentity, type CoverSourceFrame } from './cover-frame-selection';
import { projectCoverFromDocument, type ProjectCover } from './project-cover';
import type { GenJob, StartResult } from './gen-api';

export interface CoverScene {
  version: 1; runId: string; inputFingerprint?: string; contextFingerprint?: string; startedAt?: number; phase: 'planning' | 'prepared' | 'starting' | 'generating' | 'ready' | 'failed';
  /** Legacy headline data is retained for saved scenes; production uses prompt verbatim. */
  headline: string[]; prompt: string; promptVersion?: 2; identityGuidanceVersion?: 1 | 2 | 3; sourceSelection?: 'auto' | 'manual'; size: string; modelId: string; quality?: string;
  sourceFrame?: CoverSourceFrame; referenceImage?: ProjectCover; brandReferences?: CoverBrandReference[]; jobId?: string;
  images: ProjectCover[]; history: ProjectCover[]; error?: string;
}
function coverIdentityGuidance(locale?: string): string {
  return locale?.startsWith('en')
    ? 'Generate one complete, cohesive video cover in a single image. Reference image 1 defines the current person’s identity: preserve their recognizable facial proportions, skin tone, age and distinctive features. Do not replace their face or blend it with another person. All remaining references guide cover composition and visual style only; do not copy their people, old wording, logos or claims. Design the person, topic objects, environment, typography, lighting and depth together around this video’s actual content. Expression, pose, head angle, framing and scene may adapt naturally to the concept while the person remains recognizable. Use the actual brand covers as visual evidence when they differ from a generic written style summary. Do not force a cutout-on-background template or require later compositing.'
    : '一次性生成完整、统一设计的视频封面。参考图 1 用于当前人物身份：保持可辨识的五官比例、肤色、年龄和个人特征，不得换脸或混合其他人的面貌。其余参考图只用于封面构图与视觉风格，不照搬其中的人物、旧文案、标志或内容结论。根据本期真实内容，统筹设计人物、主题对象、环境、字体、光影和前后层次；允许自然调整表情、姿态、头部角度和取景，同时保持人物可辨识。真实品牌封面与泛化的文字风格描述冲突时，以封面图片的可见设计为依据。不固定套用抠图贴背景模板，也不依赖后续拼图排版。';
}

function replaceLegacyIdentityGuidance(prompt: string, locale?: string): string {
  const previousHeaders = [
    'Edit the supplied original photo into a cover; do not generate a new lookalike person. Reference image 1 is always the original video frame and the sole identity source. Preserve its exact face, facial proportions, eyes, nose, mouth, skin texture, age, hairline, hairstyle, expression and head angle. Reuse the photographed person; change only layout, background and typography needed for the cover. Do not redraw, beautify, blend or replace the face. If reference image 2 is present, it is a previous generated cover for layout/style only; ignore its facial features. Identity from image 1 takes priority over brand styling.',
    '编辑原图制作封面，不要重新生成一个长相相似的人。参考图 1 始终是原始视频帧，也是人物身份的唯一依据：保留原图真实人物的五官比例、眼鼻嘴、皮肤纹理、年龄、发际线、发型、表情和头部角度。尽量直接保留原人物，只调整封面需要的构图、背景与排版；不得换脸、重画五官、美颜或混合其他人物。若存在参考图 2，它是之前生成的封面，仅参考构图和风格，不采用其中的脸。人物原图优先于品牌风格。',
    '人物一致性：必须保持与参考图中同一人物一致的五官、脸型、肤色、年龄、发型及辨识特征。不得换脸、混合他人面貌或通过美化改变人物身份。品牌参考仅用于视觉风格。',
    'Character consistency: preserve the same person as the reference image, including recognizable facial features, face shape, skin tone, age, hairstyle and distinctive marks. Do not replace the face, blend identities or change identity through beautification. Brand references guide visual style only.',
  ];
  const previous = previousHeaders.find(header => prompt.startsWith(`${header}\n\n`));
  return `${coverIdentityGuidance(locale)}\n\n${previous ? prompt.slice(previous.length + 2) : prompt}`;
}

export interface CoverBrandReference { key: string; url: string }
export interface LoadedCoverBrandReference extends CoverBrandReference { base64: string; mime: string }
/** Keep enough room for eight source candidates in the twelve-image planning request. */
export function coverBrandKeys(document: EditorDocumentV2): string[] {
  return document.semantics.brand && activeBrandCover(document.semantics.brand) ? [...new Set(brandCoverReferenceKeys(document.semantics.brand))].slice(0, 3) : [];
}

export interface CoverDraftPatch { prompt?: string; sourceFrame?: CoverSourceFrame; referenceImage?: ProjectCover | null; modelId?: string; size?: string; quality?: string }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function coverSceneFromDocument(document: EditorDocumentV2): CoverScene | null {
  const artifacts = document.semantics.artifacts;
  const scene = object(artifacts) ? artifacts.coverScene : null;
  const image = (value: unknown) => object(value) && typeof value.url === 'string' && /^https?:\/\//i.test(value.url) && typeof value.key === 'string' && typeof value.label === 'string';
  return object(scene) && scene.version === 1 && ['planning', 'prepared', 'starting', 'generating', 'ready', 'failed'].includes(String(scene.phase)) && ['runId', 'prompt', 'size', 'modelId'].every(key => typeof scene[key] === 'string') && Array.isArray(scene.images) && scene.images.every(image) && Array.isArray(scene.headline) && scene.headline.every(line => typeof line === 'string') && Array.isArray(scene.history) && scene.history.every(image) && (scene.brandReferences === undefined || Array.isArray(scene.brandReferences) && scene.brandReferences.length <= 3 && scene.brandReferences.every(ref => object(ref) && typeof ref.key === 'string' && typeof ref.url === 'string' && /^https?:\/\//i.test(ref.url))) && (scene.referenceImage === undefined || image(scene.referenceImage)) ? scene as unknown as CoverScene : null;
}
export function withCoverScene(document: EditorDocumentV2, scene: CoverScene): EditorDocumentV2 {
  const previous = document.semantics.artifacts;
  const artifacts = object(previous) ? previous : previous === undefined ? {} : { legacyArtifacts: previous };
  return { ...document, semantics: { ...document.semantics, artifacts: { ...artifacts, coverScene: scene } } };
}
export function coverSceneSummary(scene: CoverScene | null) {
  return { status: scene?.phase ?? 'idle', available: !!scene?.images.length };
}

/** Only retained words may inform the production brief; cut-out takes must never return as cover copy. */
/** Default to the actual output canvas, preserving both shape and aspect (not just orientation). */
export function videoCoverAspect(canvas?: { width: number; height: number }): string {
  if (!canvas || !Number.isFinite(canvas.width) || !Number.isFinite(canvas.height) || canvas.width < 1 || canvas.height < 1) return '9:16';
  const width = Math.round(canvas.width); const height = Math.round(canvas.height);
  let a = width; let b = height;
  while (b) { const rest = a % b; a = b; b = rest; }
  return `${width / a}:${height / a}`;
}

export function coverSceneInput(document: EditorDocumentV2) {
  const clips = primaryNarrativeClips(document).filter(clip => clip.enabled && document.assets[clip.assetId]?.kind === 'video').sort((a, b) => a.startFrame - b.startFrame);
  const lines = clips.flatMap(clip => (document.semantics.transcripts[clip.assetId] ?? []).flatMap(segment => {
    if (segment.end <= clip.sourceInSec || segment.start >= clip.sourceOutSec) return [];
    const words = segment.words?.filter(word => word.end > clip.sourceInSec && word.start < clip.sourceOutSec);
    const text = words?.length ? words.map(word => word.text).join(' ').trim() : !segment.words?.length && segment.start >= clip.sourceInSec && segment.end <= clip.sourceOutSec ? segment.text.trim() : '';
    return text ? [{ startSec: Math.max(segment.start, clip.sourceInSec), text }] : [];
  })).slice(0, 600).map((line, index) => ({ ...line, index }));
  const counts = new Map<string, number>();
  for (const clip of clips) counts.set(clip.assetId, (counts.get(clip.assetId) ?? 0) + clip.sourceOutSec - clip.sourceInSec);
  const assetId = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  const ranges = clips.filter(clip => clip.assetId === assetId).map(clip => ({ start: clip.sourceInSec, end: clip.sourceOutSec }));
  const duration = ranges.reduce((sum, range) => sum + range.end - range.start, 0);
  const times = Array.from({ length: 8 }, (_, i) => {
    let offset = duration * (0.05 + 0.9 * i / 7);
    for (const range of ranges) { if (offset < range.end - range.start) return range.start + offset; offset -= range.end - range.start; }
    return Math.max(0, (ranges.at(-1)?.end ?? 0) - 0.05);
  });
  return { fingerprint: hashSection(canonicalJson({ lines, ranges, assetId, cover: document.semantics.brand ? activeBrandCover(document.semantics.brand) : undefined, canvas: { width: document.canvas.width, height: document.canvas.height } })), assetId, lines, times, size: videoCoverAspect(document.canvas) };
}

export interface CoverSceneHost {
  document(): EditorDocumentV2;
  context?(): { request?: string; direction?: string; brandTreatment?: string; locale?: string };
  save(scene: CoverScene): Promise<void>;
  candidates(assetId: string, times: number[], signal?: AbortSignal): Promise<{ sourceSec: number; base64: string }[]>;
  analyze(body: Record<string, unknown>, signal?: AbortSignal): Promise<string>;
  reference(assetId: string, sourceSec: number, signal?: AbortSignal): Promise<string>;
  brandReferences?(keys: string[], signal?: AbortSignal): Promise<LoadedCoverBrandReference[]>;
  start(params: Record<string, unknown>): Promise<StartResult>;
  poll(id: string): Promise<GenJob | null>;
  recover?(runId: string): Promise<GenJob | null>;
  defaultModel(): Promise<string>;
}

export interface CoverGenerateOptions { regenerate?: boolean; prompt?: string; sourceFrame?: CoverSourceFrame; modelId?: string; size?: string; quality?: string }

/** Draft preparation and image production are separate; opening a scene prepares editable inputs. */
export class CoverSceneController {
  private running: Promise<ReturnType<typeof coverSceneSummary>> | null = null;
  private preparing: Promise<ReturnType<typeof coverSceneSummary>> | null = null;
  constructor(private readonly host: CoverSceneHost) {}
  prepare(options: { rewrite?: boolean } = {}, signal?: AbortSignal) {
    if (this.running) return this.running;
    if (this.preparing) return this.preparing;
    this.preparing = this.prepareDraft(options, signal).finally(() => { this.preparing = null; });
    return this.preparing;
  }
  async updateDraft(patch: CoverDraftPatch) {
    const document = this.host.document(); const current = coverSceneFromDocument(document);
    if (!current || ['planning', 'starting', 'generating'].includes(current.phase)) throw new Error('cover_busy');
    if (patch.sourceFrame && !retainedCoverFrame(document, patch.sourceFrame)) throw new Error('cover_frame_not_retained');
    if (patch.prompt !== undefined && (!patch.prompt.trim() || patch.prompt.length > 16000)) throw new Error('cover_invalid_prompt');
    if (patch.referenceImage && ![...current.images, ...current.history, ...([projectCoverFromDocument(document)].filter(Boolean) as ProjectCover[]), ...(current.referenceImage ? [current.referenceImage] : [])].some(image => image.key === patch.referenceImage!.key && image.url === patch.referenceImage!.url)) throw new Error('cover_invalid_reference');
    const settings = patch.modelId !== undefined || patch.size !== undefined || patch.quality !== undefined ? normalizeImageSettings({ modelId: patch.modelId ?? current.modelId, size: patch.size ?? current.size, quality: patch.quality ?? current.quality }) : {};
    if (patch.prompt === current.prompt && !patch.sourceFrame && patch.referenceImage === undefined && !Object.keys(settings).length) return;
    await this.host.save({ ...current, ...settings, phase: 'prepared', ...(patch.referenceImage !== undefined ? { referenceImage: patch.referenceImage ?? undefined } : {}), ...(patch.prompt !== undefined ? { prompt: patch.prompt, promptVersion: 2 as const, identityGuidanceVersion: 3 as const } : {}), ...(patch.sourceFrame ? { sourceFrame: coverFrameIdentity(patch.sourceFrame), sourceSelection: 'manual' as const, referenceImage: undefined } : {}), error: undefined });
  }
  private async loadBrandReferences(keys: string[], signal?: AbortSignal): Promise<LoadedCoverBrandReference[]> {
    if (!keys.length) return [];
    try {
      const refs = await this.host.brandReferences?.(keys, signal);
      if (!refs || refs.length !== keys.length || refs.some((ref, index) => ref.key !== keys[index] || !/^https?:\/\//i.test(ref.url) || !ref.base64)) throw new Error('missing brand reference');
      return refs;
    } catch (cause) { throw new Error('cover_brand_reference_unavailable', { cause }); }
  }
  private async prepareDraft(options: { rewrite?: boolean }, signal?: AbortSignal) {
    const document = this.host.document(); const input = coverSceneInput(document);
    const previous = coverSceneFromDocument(document);
    const context = this.host.context?.() ?? {};
    const contextFingerprint = hashSection(canonicalJson(context));
    if (previous && ['starting', 'generating'].includes(previous.phase)) return coverSceneSummary(previous);
    const reusable = previous?.inputFingerprint === input.fingerprint && previous.contextFingerprint === contextFingerprint && previous.promptVersion === 2 && !!previous.prompt && !!previous.sourceFrame && retainedCoverFrame(document, previous.sourceFrame);
    const keys = coverBrandKeys(document);
    if (reusable && !options.rewrite) {
      try {
        const refs = previous!.brandReferences;
        const sameRefs = refs?.length === keys.length && refs.every((ref, index) => ref.key === keys[index]);
        const brandReferences = sameRefs ? refs : (await this.loadBrandReferences(keys, signal)).map(({ key, url }) => ({ key, url }));
        if (!sameRefs || previous!.identityGuidanceVersion !== 3 || previous!.error === 'cover_brand_reference_unavailable') {
          await this.host.save({ ...previous!, brandReferences, prompt: previous!.identityGuidanceVersion === 3 ? previous!.prompt : replaceLegacyIdentityGuidance(previous!.prompt, context.locale), identityGuidanceVersion: 3, ...(previous!.error === 'cover_brand_reference_unavailable' ? { phase: 'prepared', error: undefined } : {}) });
        }
      } catch (error) { await this.host.save({ ...previous!, phase: 'failed', error: error instanceof Error ? error.message : 'cover_brand_reference_unavailable' }); }
      return coverSceneSummary(coverSceneFromDocument(this.host.document()));
    }
    let scene: CoverScene = { version: 1, runId: crypto.randomUUID(), inputFingerprint: input.fingerprint, contextFingerprint, phase: 'planning', headline: [], prompt: '', size: previous?.size || input.size, modelId: previous?.modelId || '', quality: previous?.quality, referenceImage: previous?.inputFingerprint === input.fingerprint ? previous.referenceImage : undefined, images: previous?.images ?? [], history: previous?.history ?? [] };
    await this.host.save(scene);
    try {
      if (!input.assetId) throw new Error('cover_source_unavailable');
      signal?.throwIfAborted();
      const manual = previous?.sourceSelection === 'manual' && previous.sourceFrame && retainedCoverFrame(document, previous.sourceFrame) ? previous.sourceFrame : undefined;
      const assetId = manual?.assetId ?? input.assetId;
      const [candidates, references] = await Promise.all([this.host.candidates(assetId, manual ? [manual.sourceSec] : input.times, signal), this.loadBrandReferences(keys, signal)]);
      scene = { ...scene, brandReferences: references.map(({ key, url }) => ({ key, url })) };
      if (!candidates.length) throw new Error('cover_source_unavailable');
      const brand = document.semantics.brand;
      const plan = parseCoverPlan(await this.host.analyze({ action: 'cover-plan', locale: context.locale ?? 'zh', context, brand: brand ? { name: brand.name, cover: activeBrandCover(brand) } : null, lines: input.lines, size: scene.size, manualReference: !!manual, candidateCount: candidates.length, images: [...candidates.map((item, index) => ({ role: `${manual ? 'manual source' : 'source candidate'} ${index} at ${item.sourceSec.toFixed(3)}s`, base64: item.base64, mime: 'image/jpeg' })), ...references.map((item, index) => ({ role: `brand cover ${index + 1}: style only`, base64: item.base64, mime: item.mime }))] }, signal), candidates.length);
      signal?.throwIfAborted();
      scene = { ...scene, phase: 'prepared', prompt: `${coverIdentityGuidance(context.locale)}\n\n${plan.prompt}`, promptVersion: 2, identityGuidanceVersion: 3, sourceFrame: manual ?? { assetId, sourceSec: candidates[plan.pick]!.sourceSec }, sourceSelection: manual ? 'manual' : 'auto', modelId: scene.modelId || await this.host.defaultModel() };
      await this.host.save(scene);
      return coverSceneSummary(scene);
    } catch (error) {
      await this.host.save({ ...scene, phase: 'failed', error: error instanceof Error ? error.message : 'cover_generation_failed' });
      return coverSceneSummary(coverSceneFromDocument(this.host.document()));
    }
  }
  generate(options: CoverGenerateOptions = {}, signal?: AbortSignal) {
    if (this.running) return this.running;
    const current = coverSceneFromDocument(this.host.document());
    if (current?.phase === 'generating' || current?.phase === 'starting') return this.refresh();
    if (current?.phase === 'ready' && !options.regenerate && options.prompt === undefined && !options.sourceFrame && current.inputFingerprint === coverSceneInput(this.host.document()).fingerprint && !!current.sourceFrame && retainedCoverFrame(this.host.document(), current.sourceFrame)) return Promise.resolve(coverSceneSummary(current));
    if (current?.phase === 'failed' && !options.regenerate && current.inputFingerprint === coverSceneInput(this.host.document()).fingerprint) return Promise.resolve(coverSceneSummary(current));
    this.running = this.run(options, signal).finally(() => { this.running = null; });
    return this.running;
  }
  /** The agent tool completes the same independent workflow, without a confirmation round. */
  async complete(options: CoverGenerateOptions = {}, signal?: AbortSignal) {
    let result = await this.generate(options, signal);
    const deadline = Date.now() + 300_000;
    while (['generating', 'starting'].includes(result.status) && Date.now() < deadline) {
      signal?.throwIfAborted(); result = await this.refresh();
      if (!['generating', 'starting'].includes(result.status)) break;
      await new Promise<void>(resolve => setTimeout(resolve, 2000));
    }
    signal?.throwIfAborted(); return result;
  }
  private async run(options: CoverGenerateOptions, signal?: AbortSignal) {
    await (this.preparing ?? this.prepareDraft({}, signal));
    const document = this.host.document(); const draft = coverSceneFromDocument(document);
    if (!draft?.prompt || !draft.sourceFrame || !draft.promptVersion || draft.error === 'cover_brand_reference_unavailable') return coverSceneSummary(draft);
    const prompt = options.prompt ?? draft.prompt;
    const sourceFrame = coverFrameIdentity(options.sourceFrame ?? draft.sourceFrame);
    if (!prompt.trim() || prompt.length > 16000) throw new Error('cover_invalid_prompt');
    if (!retainedCoverFrame(document, sourceFrame)) throw new Error('cover_frame_not_retained');
    const settings = normalizeImageSettings({ modelId: options.modelId || draft.modelId || await this.host.defaultModel(), size: options.size || draft.size, quality: options.quality ?? draft.quality });
    let scene: CoverScene = { ...draft, runId: crypto.randomUUID(), phase: 'prepared', prompt, sourceFrame, ...(options.sourceFrame ? { sourceSelection: 'manual' } : {}), ...settings, images: [], history: [...new Map([...draft.images, ...draft.history].map(image => [image.key, image])).values()].slice(0, 12), error: undefined };
    await this.host.save(scene);
    let startSettled = false;
    try {
      signal?.throwIfAborted();
      const reference = await this.host.reference(sourceFrame.assetId, sourceFrame.sourceSec, signal);
      signal?.throwIfAborted();
      scene = { ...scene, phase: 'starting', startedAt: Date.now() }; await this.host.save(scene);
      const started = await this.host.start({ prompt, user_prompt: 'Video cover', model_id: scene.modelId, ...imageGenerationParams(scene), n: 1, reference_images: [reference, ...(scene.brandReferences ?? []).map(ref => ref.url), ...(scene.referenceImage && scene.referenceImage.url !== reference ? [scene.referenceImage.url] : [])], _cover_run_id: scene.runId }); startSettled = true;
      if (!started.ok) throw new Error(started.kind === 'credits' ? 'cover_insufficient_credits' : started.kind === 'plan' ? 'cover_plan_locked' : 'cover_generation_failed');
      await this.host.save({ ...scene, phase: 'generating', jobId: started.ids[0] });
      return coverSceneSummary(coverSceneFromDocument(this.host.document()));
    } catch (error) {
      scene = scene.phase === 'starting' && !startSettled ? { ...scene, error: 'cover_status_unknown' } : { ...scene, phase: 'failed', error: error instanceof Error ? error.message : 'cover_generation_failed' };
      await this.host.save(scene); return coverSceneSummary(scene);
    }
  }
  async refresh() {
    let scene = coverSceneFromDocument(this.host.document());
    if (scene?.phase === 'starting') {
      const recovered = await this.host.recover?.(scene.runId);
      if (!recovered) {
        if (scene.startedAt && Date.now() - scene.startedAt > 120_000) await this.host.save({ ...scene, phase: 'failed', error: 'cover_status_unknown' });
        return coverSceneSummary(coverSceneFromDocument(this.host.document()));
      }
      scene = { ...scene, phase: 'generating', jobId: recovered.id };
      await this.host.save(scene);
    }
    if (scene?.phase !== 'generating' || !scene.jobId) return coverSceneSummary(scene);
    const job = await this.host.poll(scene.jobId);
    if (!job || job.status === 'pending') return coverSceneSummary(scene);
    if (coverSceneFromDocument(this.host.document())?.runId !== scene.runId) return coverSceneSummary(coverSceneFromDocument(this.host.document()));
    const images = job.status === 'succeeded' ? job.assets.filter(asset => /^https?:\/\//i.test(asset.url) && (!asset.mime || asset.mime.startsWith('image/'))).map(asset => ({ key: asset.key, url: asset.url, label: scene.headline.join(' ') || 'Cover' })) : [];
    await this.host.save({ ...scene, phase: images.length ? 'ready' : 'failed', images, ...(images.length ? { error: undefined } : { error: 'cover_generation_failed' }) });
    return coverSceneSummary(coverSceneFromDocument(this.host.document()));
  }
}
