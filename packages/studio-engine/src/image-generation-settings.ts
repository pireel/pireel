/** Shared catalog image settings. UI, quotes and requests must use the same normalization. */
export interface QualityOpt {
  value: string;
  label: string;
}

export interface QualityConfig {
  /** 切到该模型时 quality 自动 reset 到这一档（不一定是 options[0]）。 */
  default: string;
  options: QualityOpt[];
}

const QUALITY_BY_MODEL: Record<string, QualityConfig> = {
  'gpt-image': {
    default: 'medium',
    options: [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
      { value: 'xhigh', label: 'XHigh' },
      { value: 'max', label: 'Max' },
    ],
  },
  'nano-banana': {
    default: '1k',
    options: [
      { value: '1k', label: '1K' },
      { value: '2k', label: '2K' },
      { value: '4k', label: '4K' },
    ],
  },
  // 2-lite 只有 1k 一档(4 秒级出图)
  'nano-banana-2-lite': {
    default: '1k',
    options: [{ value: '1k', label: '1K' }],
  },
  'seedream-4': {
    default: '2k',
    options: [
      { value: '2k', label: '2K' },
      { value: '3k', label: '3K' },
      { value: '4k', label: '4K' },
    ],
  },
};

export function qualityConfigFor(modelId: string): QualityConfig | null {
  return QUALITY_BY_MODEL[modelId === 'gpt-image-2' ? 'gpt-image' : modelId] ?? null;
}

/* ============ 图片尺寸分组档位 ============
 * gpt-image 支持的 size 不再是单一 aspect——同一比例下有 1K/2K/4K 三档分辨率，且
 * quality（low/medium/high）和 size 是独立维度。其他模型只暴露 5 个 aspect，分辨率
 * 由 quality 决定，沿用旧的 DEFAULT_IMAGE_ASPECTS。
 *
 * imageSizeGroupsFor(modelId)：
 *   - 'gpt-image' → 返回 1K/2K/4K 三组，每组列出该档支持的所有 WxH（label = "aspect WxH"）
 *   - 其他 → null，表示走 ComposerForm 内的默认 5 档 aspect
 */
export interface SizeOption {
  value: string;
  aspect: string;
  resolution: string;
}
export interface SizeGroup {
  label: string;
  options: SizeOption[];
}

const GPT_IMAGE_SIZE_GROUPS: SizeGroup[] = [
  {
    label: '1K',
    options: [
      { value: '1024x768', aspect: '4:3', resolution: '1024×768' },
      { value: '768x1024', aspect: '3:4', resolution: '768×1024' },
      { value: '1024x1024', aspect: '1:1', resolution: '1024×1024' },
      { value: '1024x1536', aspect: '2:3', resolution: '1024×1536' },
      { value: '1536x1024', aspect: '3:2', resolution: '1536×1024' },
    ],
  },
  {
    label: '2K',
    options: [
      { value: '2560x1440', aspect: '16:9', resolution: '2560×1440' },
      { value: '1440x2560', aspect: '9:16', resolution: '1440×2560' },
    ],
  },
  {
    label: '4K',
    options: [
      { value: '3840x2160', aspect: '16:9', resolution: '3840×2160' },
      { value: '2160x3840', aspect: '9:16', resolution: '2160×3840' },
    ],
  },
];

export function imageSizeGroupsFor(modelId: string): SizeGroup[] | null {
  if (modelId === 'gpt-image' || modelId === 'gpt-image-2') {
    return GPT_IMAGE_SIZE_GROUPS;
  }
  return null;
}

/* ============ aspect 等价组 ============
 * 同一个"画面比例"在不同模型下用不同字面量表达。这张表把所有等价字面量分组——
 * 切模型 / 切 mode 时通过它把当前 aspect 平移到目标候选集里的同 group 项，
 * 避免靠 log-ratio 浮点匹配（数值容易踩"9:16 被认成 4:5"这类边界）。
 *
 * 新加 SizeGroup option 或 mode aspectOptions 时，把新字面量补进对应 group。
 */
export const ASPECT_EQUIVALENCE_GROUPS: readonly (readonly string[])[] = [
  ['1:1', '1024x1024', '3072x3072'],
  ['4:5'],
  ['5:4'],
  ['9:16', '1440x2560', '2160x3840'],
  ['16:9', '2560x1440', '3840x2160'],
  ['3:2', '1536x1024'],
  ['2:3', '1024x1536'],
  ['4:3', '1024x768'],
  ['3:4', '768x1024'],
] as const;

/** 在 valid 候选集里找 current 的等价字面量；找不到返 null（caller 走 fallback）。 */
export function findEquivalentAspect(
  current: string,
  valid: readonly string[],
): string | null {
  if (valid.includes(current)) return current;
  const group = ASPECT_EQUIVALENCE_GROUPS.find((g) => g.includes(current));
  if (!group) return null;
  return valid.find((v) => group.includes(v)) ?? null;
}


export const DEFAULT_IMAGE_MODEL = 'gpt-image';
export const DEFAULT_IMAGE_ASPECTS = ['9:16', '1:1', '3:4', '4:3', '16:9'];
export function pickImageModel(models: readonly { id: string }[], requested?: string | null): string {
  return (requested && models.some(model => model.id === requested) ? requested : models.find(model => model.id === DEFAULT_IMAGE_MODEL)?.id ?? models.find(model => model.id === 'gpt-image-2')?.id ?? models[0]?.id) || '';
}
export interface ImageSettings { modelId: string; size: string; quality: string }
export function imageSizeChoices(modelId: string) {
  return imageSizeGroupsFor(modelId)?.flatMap(group => group.options.map(option => ({ ...option, tier: group.label }))) ?? DEFAULT_IMAGE_ASPECTS.map(aspect => ({ value: aspect, aspect, resolution: '', tier: '' }));
}
export function normalizeImageSettings(input: { modelId: string; size?: string; quality?: string }): ImageSettings {
  const choices = imageSizeChoices(input.modelId);
  const quality = qualityConfigFor(input.modelId);
  return { modelId: input.modelId, size: findEquivalentAspect(input.size || '9:16', choices.map(choice => choice.value)) ?? choices[0].value,
    quality: quality?.options.some(option => option.value === input.quality) ? input.quality! : quality?.default ?? '' };
}
/** Both credit quotes and generation consume this exact payload. */
export function imageGenerationParams(input: { modelId: string; size?: string; quality?: string }) {
  const settings = normalizeImageSettings(input);
  return { size: settings.size, ...(settings.quality ? { quality: settings.quality } : {}) };
}
