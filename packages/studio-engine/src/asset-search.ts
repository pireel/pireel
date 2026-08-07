/**
 * Deterministic metadata search for Studio's three asset-library scopes.
 *
 * The collector is deliberately outside this pure module: the browser gathers device-local
 * records plus cloud/official catalogs, while the MCP route gathers the same cloud-safe records
 * server-side. No model call is required and asset metadata is always returned as untrusted data.
 */

export const ASSET_SEARCH_INDEX_VERSION = 1;

export type AssetSearchScope = 'all' | 'mine' | 'cloud' | 'official';
export type AssetSearchKind = 'all' | 'image' | 'video' | 'audio' | 'element';
export type AssetDocumentScope = Exclude<AssetSearchScope, 'all'>;
export type AssetDocumentKind = Exclude<AssetSearchKind, 'all'>;

export interface AssetSearchDocument {
  assetId: string;
  scope: AssetDocumentScope;
  kind: AssetDocumentKind;
  label: string;
  /** Narrow source within a scope, e.g. upload/generated/sticker/bgm/kit/template. */
  origin: string;
  createdAt?: number;
  dimensions?: { w: number; h: number };
  durationSec?: number;
  availability?: 'ready' | 'device-only' | 'metadata-only';
  fields?: {
    category?: string;
    tags?: string[];
    prompt?: string;
    description?: string;
    artist?: string;
    moods?: string[];
    useCases?: string[];
    source?: string;
    license?: string;
  };
  /** Opaque identifiers needed by a later atomic action. Never included in searchable text. */
  locator?: {
    url?: string;
    thumbUrl?: string;
    sig?: string;
    component?: string;
    elementId?: string;
    templateId?: string;
    prompt?: string;
  };
}

export interface AssetSearchQuery {
  query: string;
  scope?: AssetSearchScope;
  kind?: AssetSearchKind;
  limit?: number;
}

export interface AssetSearchResult extends AssetSearchDocument {
  score: number;
  matchedFields: string[];
}

export interface AssetSearchResponse {
  indexVersion: number;
  query: string;
  scope: AssetSearchScope;
  kind: AssetSearchKind;
  results: AssetSearchResult[];
  coverage: {
    total: number;
    byScope: Record<AssetDocumentScope, number>;
    byKind: Record<AssetDocumentKind, number>;
  };
}

/** Keep Agent receipts action-oriented. Long prompts are useful while ranking documents, but once
 * an element has matched its stable component/template/element id is the only content a later
 * atomic action needs. Returning the authored prompt again wastes context and turns catalog copy
 * into conversation input. Media results keep their prompt metadata because it describes the
 * generated asset itself rather than an insertable component definition. */
export function compactAssetSearchElementResults(results: readonly AssetSearchResult[]): AssetSearchResult[] {
  return results.map((result) => {
    if (result.kind !== 'element') return result;
    const { fields: _allFields, locator: _allLocator, ...base } = result;
    const { prompt: _fieldPrompt, ...fields } = result.fields ?? {};
    const { prompt: _locatorPrompt, ...locator } = result.locator ?? {};
    return {
      ...base,
      ...(Object.keys(fields).length ? { fields } : {}),
      ...(Object.keys(locator).length ? { locator } : {}),
    };
  });
}

const KIND_ALIASES: Record<AssetDocumentKind, string> = {
  image: 'image photo picture still graphic sticker 图片 图像 照片 配图 贴纸',
  video: 'video clip footage b roll b-roll 视频 片段 素材 空镜',
  audio: 'audio music bgm soundtrack song 音频 音乐 配乐 背景音乐',
  element: 'element component overlay template graphic card 组件 元素 模板 图形 卡片',
};

const SCOPE_ALIASES: Record<AssetDocumentScope, string> = {
  mine: 'mine my local device 我的 本地 设备',
  cloud: 'cloud upload generated history 云端 上传 生成 历史',
  official: 'official preset curated 官方 预设 精选',
};

const CATALOG_VALUE_ALIASES: Record<string, string[]> = {
  tutorial: ['教程', '教学'],
  'product-demo': ['产品演示', '产品展示'],
  vlog: ['日常', '旅行记录'],
  corporate: ['企业', '商务'],
  presentation: ['演示', '发布会'],
  technology: ['科技', '数码'],
  advertising: ['广告', '品牌宣传'],
  podcast: ['播客', '访谈'],
  happy: ['快乐', '愉快'],
  bright: ['明亮', '轻快'],
  optimistic: ['积极', '正向'],
  calm: ['平静', '舒缓'],
  relaxed: ['放松', '松弛'],
  emotional: ['情绪', '感性'],
  cinematic: ['电影感', '叙事'],
  epic: ['史诗', '宏大'],
  tension: ['紧张', '悬念'],
  playful: ['活泼', '俏皮'],
};

/** Common visual nouns appearing in the official sticker labels. Keeping these aliases attached
 * to catalog metadata gives short bilingual queries an instant, deterministic path and leaves the
 * embedding model for genuinely descriptive searches. Keys are whole normalized label words. */
const OFFICIAL_STICKER_WORD_ALIASES: Record<string, string[]> = {
  airplane: ['飞机', '客机', '航空'],
  basketball: ['篮球'],
  beach: ['大海', '海洋', '海边', '海滩', '沙滩', '海景'],
  birthday: ['生日', '庆生'],
  book: ['书', '书本', '阅读'],
  camera: ['相机', '摄影', '拍摄'],
  car: ['汽车', '轿车', '车辆'],
  cat: ['猫', '猫咪'],
  cloud: ['云', '云朵', '多云'],
  coffee: ['咖啡'],
  dog: ['狗', '狗狗'],
  fire: ['火', '火焰', '燃烧'],
  flower: ['花', '花朵', '鲜花'],
  football: ['足球'],
  gift: ['礼物', '礼品'],
  heart: ['爱心', '心形', '喜欢'],
  house: ['房子', '住宅', '家'],
  laptop: ['笔记本电脑', '电脑'],
  microphone: ['麦克风', '话筒', '录音'],
  money: ['钱', '金钱', '现金'],
  moon: ['月亮', '月球'],
  music: ['音乐', '音符'],
  ocean: ['大海', '海洋', '海面', '海景'],
  phone: ['手机', '电话'],
  pizza: ['披萨'],
  rain: ['雨', '下雨', '雨天'],
  rocket: ['火箭', '航天', '发射'],
  sea: ['大海', '海洋', '海面', '海景'],
  star: ['星星', '星形'],
  sun: ['太阳', '阳光', '晴天'],
  tree: ['树', '树木'],
  trophy: ['奖杯', '冠军'],
  umbrella: ['雨伞', '遮阳伞'],
};

/** Add audited bilingual terms without replacing license/source tags from the manifest. */
export function officialStickerSearchTags(label: string, existingTags: readonly string[] = []): string[] {
  const tags = new Set(existingTags);
  const words = normalize(label).split(' ');
  for (const word of words) {
    for (const alias of OFFICIAL_STICKER_WORD_ALIASES[word] ?? []) tags.add(alias);
  }
  return [...tags];
}

/** Add small audited bilingual aliases to official music metadata. This is deterministic catalog
 * enrichment, not model-generated semantics. */
export function bgmSearchTags(narrationFit: string, moods: readonly string[], useCases: readonly string[]): string[] {
  const tags = new Set<string>();
  for (const value of [...moods, ...useCases]) {
    for (const alias of CATALOG_VALUE_ALIASES[value.toLocaleLowerCase()] ?? []) tags.add(alias);
  }
  if (narrationFit === 'high') {
    for (const tag of ['口播', '解说', '旁白', '人声', 'voiceover', 'talking-head', 'spoken narration']) tags.add(tag);
  } else if (narrationFit === 'medium') {
    for (const tag of ['轻口播', '轻旁白', 'narration']) tags.add(tag);
  }
  return [...tags];
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function compact(value: string): string {
  return normalize(value).replace(/\s+/g, '');
}

function terms(value: string): Set<string> {
  const normalized = normalize(value);
  const out = new Set<string>();
  for (const word of normalized.split(' ')) {
    if (!word || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(word)) continue;
    out.add(word);
    if (/^[a-z0-9]+$/.test(word)) {
      if (word.length > 5 && word.endsWith('ing')) out.add(word.slice(0, -3));
      else if (word.length > 4 && word.endsWith('ed')) out.add(word.slice(0, -2));
      else if (word.length > 4 && word.endsWith('s')) out.add(word.slice(0, -1));
    }
  }
  for (const run of normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu) ?? []) {
    const chars = [...run];
    for (const char of chars) out.add(char);
    for (let size = 2; size <= Math.min(3, chars.length); size++) {
      for (let i = 0; i + size <= chars.length; i++) out.add(chars.slice(i, i + size).join(''));
    }
  }
  return out;
}

interface SearchField {
  name: string;
  value: string;
  weight: number;
}

function fieldsOf(doc: AssetSearchDocument): SearchField[] {
  const f = doc.fields;
  return [
    { name: 'label', value: doc.label, weight: 8 },
    { name: 'tags', value: f?.tags?.join(' ') ?? '', weight: 6 },
    { name: 'category', value: f?.category ?? '', weight: 5 },
    { name: 'prompt', value: f?.prompt ?? '', weight: 4 },
    { name: 'description', value: f?.description ?? '', weight: 4 },
    { name: 'artist', value: f?.artist ?? '', weight: 4 },
    { name: 'moods', value: f?.moods?.join(' ') ?? '', weight: 4 },
    { name: 'useCases', value: f?.useCases?.join(' ') ?? '', weight: 4 },
    { name: 'source', value: f?.source ?? '', weight: 1 },
    { name: 'license', value: f?.license ?? '', weight: 1 },
    { name: 'kind', value: KIND_ALIASES[doc.kind], weight: 3 },
    { name: 'scope', value: SCOPE_ALIASES[doc.scope], weight: 2 },
  ].filter((field) => field.value.trim());
}

function scoreField(field: SearchField, queryNorm: string, queryCompact: string, queryTerms: Set<string>): number {
  const valueNorm = normalize(field.value);
  const valueCompact = compact(field.value);
  if (!valueNorm) return 0;
  let score = 0;
  if (valueNorm === queryNorm || valueCompact === queryCompact) score += field.weight * 14;
  else if (valueNorm.startsWith(queryNorm) || valueCompact.startsWith(queryCompact)) score += field.weight * 9;
  else if (valueNorm.includes(queryNorm) || valueCompact.includes(queryCompact)) score += field.weight * 7;

  const valueTerms = terms(field.value);
  let hits = 0;
  for (const term of queryTerms) if (valueTerms.has(term)) hits++;
  if (hits) score += field.weight * 5 * (hits / Math.max(1, queryTerms.size));
  return score;
}

/** Search already-collected metadata. Invalid/blank queries return an explicit error. */
export function searchAssetLibrary(
  documents: readonly AssetSearchDocument[],
  input: AssetSearchQuery,
): AssetSearchResponse | { error: string } {
  const query = typeof input.query === 'string' ? input.query.trim().slice(0, 200) : '';
  if (!query) return { error: 'query required' };
  const scope: AssetSearchScope = input.scope === 'mine' || input.scope === 'cloud' || input.scope === 'official' ? input.scope : 'all';
  const kind: AssetSearchKind = input.kind === 'image' || input.kind === 'video' || input.kind === 'audio' || input.kind === 'element' ? input.kind : 'all';
  const limit = Math.min(Math.max(Math.round(Number(input.limit) || 12), 1), 30);
  const queryNorm = normalize(query);
  const queryCompact = compact(query);
  const queryTerms = terms(query);

  const filtered = documents.filter((doc) => (scope === 'all' || doc.scope === scope) && (kind === 'all' || doc.kind === kind));
  const results = filtered
    .map((doc): AssetSearchResult | null => {
      const matchedFields: string[] = [];
      let score = 0;
      for (const field of fieldsOf(doc)) {
        const fieldScore = scoreField(field, queryNorm, queryCompact, queryTerms);
        if (fieldScore > 0) {
          matchedFields.push(field.name);
          score += fieldScore;
        }
      }
      if (score <= 0) return null;
      return { ...doc, score: round3(score), matchedFields };
    })
    .filter((result): result is AssetSearchResult => result !== null)
    .sort((a, b) => b.score - a.score || (b.createdAt ?? 0) - (a.createdAt ?? 0) || a.assetId.localeCompare(b.assetId))
    .slice(0, limit);

  const byScope: Record<AssetDocumentScope, number> = { mine: 0, cloud: 0, official: 0 };
  const byKind: Record<AssetDocumentKind, number> = { image: 0, video: 0, audio: 0, element: 0 };
  for (const doc of filtered) {
    byScope[doc.scope]++;
    byKind[doc.kind]++;
  }
  return {
    indexVersion: ASSET_SEARCH_INDEX_VERSION,
    query,
    scope,
    kind,
    results,
    coverage: { total: filtered.length, byScope, byKind },
  };
}
