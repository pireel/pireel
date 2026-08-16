/**
 * Query-time retrieval for Studio Kit schemas.
 *
 * Component definitions may grow without growing every generation prompt: the registry provides
 * compact bilingual index metadata, this module ranks it against the current editing moment, and
 * the prompt assembler receives only the small candidate set. Full script/neighbour context is
 * deliberately excluded from retrieval because it describes the whole video, not this graphic.
 */

import {
  components,
  isComponentId,
  type ComponentDef,
  type ComponentId,
} from "@pireel/studio-kit";
import type { BlockEdit, ComposeContext, KitChoice } from "../compose";
import { getPreset } from "./presets";

export const MAX_COMPONENT_CANDIDATES = 3;

export interface ComponentRetrievalInput {
  instruction: string;
  block?: Pick<BlockEdit, "label">;
  context?: Pick<ComposeContext, "beats">;
  current?: KitChoice | null;
  presetId?: string;
  limit?: number;
}

const SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "card",
  "component",
  "for",
  "graphic",
  "in",
  "it",
  "of",
  "on",
  "one",
  "or",
  "show",
  "the",
  "this",
  "to",
  "with",
]);

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}%％]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function englishWords(value: string): Set<string> {
  return new Set(
    normalized(value)
      .split(" ")
      .filter(
        (word) =>
          /^[a-z0-9]+$/.test(word) &&
          word.length > 1 &&
          !SEARCH_STOP_WORDS.has(word),
      ),
  );
}

function retrievalScore(
  id: ComponentId,
  definition: ComponentDef,
  query: string,
): number {
  const queryNormalized = normalized(query);
  const queryCompact = queryNormalized.replace(/\s+/g, "");
  const queryWords = englishWords(query);
  let score = 0;
  if (
    new RegExp(
      `(?:^|[^a-z0-9])${id.toLocaleLowerCase()}(?:$|[^a-z0-9])`,
      "i",
    ).test(queryNormalized)
  )
    score += 100;
  for (const term of definition.searchTerms) {
    const termNormalized = normalized(term);
    if (!termNormalized) continue;
    const termCompact = termNormalized.replace(/\s+/g, "");
    const containsCjk =
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(
        termNormalized,
      );
    if (
      containsCjk
        ? queryCompact.includes(termCompact)
        : queryNormalized.includes(termNormalized)
    ) {
      score += 20 + Math.min(12, [...termCompact].length);
    }
  }
  // Summary terms are a low-weight automatic backstop for new English requests. The required
  // searchTerms remain the high-confidence bilingual contract and prevent single CJK characters
  // from producing arbitrary candidates.
  const summaryWords = englishWords(definition.summary);
  for (const word of queryWords) if (summaryWords.has(word)) score += 2;
  return score;
}

function retrievalQuery(input: ComponentRetrievalInput): string {
  return [
    input.instruction.trim(),
    input.block?.label?.trim() ?? "",
    ...(input.context?.beats?.slice(0, 8).map((beat) => beat.text.trim()) ??
      []),
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 800);
}

/** High-confidence structural signals cover short prompts whose nouns are mostly content rather
 * than component names (for example "47%" still strongly implies a metric card). */
function structuralCandidates(query: string): ComponentId[] {
  const normalized = query.normalize("NFKC").toLocaleLowerCase();
  const out: ComponentId[] = [];
  const add = (id: ComponentId, pattern: RegExp) => {
    if (pattern.test(normalized) && !out.includes(id)) out.push(id);
  };
  add(
    "code",
    /(?:source\s*code|code\s*(?:diff|typing|highlight|scroll)|pull\s*request|snippet|源码|代码片段|代码高亮|代码改动|代码差异|编程)/i,
  );
  add(
    "comparison",
    /(?:\bvs\.?\b|versus|compare|comparison|before\s*(?:and|&|\/)?\s*after|对比|比较|优劣|前后)/i,
  );
  add(
    "chart",
    /(?:chart|graph|bar|column|donut|ranking|trend|图表|柱状|条形|环形|排名|趋势)/i,
  );
  add(
    "steps",
    /(?:steps?|process|workflow|timeline|roadmap|sequence|步骤|流程|时间轴|路线图|顺序)/i,
  );
  add(
    "lowerThird",
    /(?:lower\s*third|speaker|byline|job\s*title|姓名|人名|人物|身份|职位|署名)/i,
  );
  add(
    "title",
    /(?:opener|chapter|section|closer|outro|headline|\bcta\b|开场|章节|标题页|结尾|片尾|行动号召)/i,
  );
  add(
    "callout",
    /(?:quote|keyword|verdict|insight|warning|punchline|金句|关键词|结论|洞察|警告|强调)/i,
  );
  add(
    "kpi",
    /(?:\bkpi\b|dashboard|multiple\s+(?:metrics|numbers)|指标组|多指标|多个数字|数据组|仪表盘)/i,
  );
  add(
    "metric",
    /(?:\d+(?:\.\d+)?\s*(?:%|％|x|倍|万|亿)|percentage|rate|score|百分比|比率|增长率|转化率|完成率|指标|大数字)/i,
  );
  return out;
}

/** Return at most three component ids. An existing kit block is always retained as the first
 * candidate so a small content edit cannot accidentally lose its current schema. */
export function retrieveComponentCandidates(
  input: ComponentRetrievalInput,
): ComponentId[] {
  const limit = Math.min(
    Math.max(Math.round(input.limit ?? MAX_COMPONENT_CANDIDATES), 1),
    MAX_COMPONENT_CANDIDATES,
  );
  const allowed = getPreset(input.presetId).components.filter(isComponentId);
  const allowedSet = new Set<ComponentId>(allowed);
  const query = retrievalQuery(input);
  const candidates: ComponentId[] = [];
  const add = (id: string | undefined) => {
    if (!id || !isComponentId(id) || candidates.includes(id)) return;
    // Keep an existing component editable even if a future preset stops recommending it.
    if (!allowedSet.has(id) && id !== input.current?.component) return;
    candidates.push(id);
  };

  add(input.current?.component);
  for (const id of allowed) {
    if (
      new RegExp(
        `(?:^|[^a-z0-9])${id.toLocaleLowerCase()}(?:$|[^a-z0-9])`,
        "i",
      ).test(query)
    )
      add(id);
  }
  for (const id of structuralCandidates(query)) add(id);

  const ranked = allowed
    .map((id) => ({ id, score: retrievalScore(id, components[id], query) }))
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  for (const result of ranked) {
    add(result.id);
    if (candidates.length >= limit) break;
  }
  return candidates.slice(0, limit);
}
