/**
 * The brand's cover prompt at editing time: picking a new video's base picture or subject reference, and
 * writing that cover's headline, the way the creator's covers do (the brand's cover block).
 */

function fail(path: string, value: unknown): never { throw new Error(`封面输出不符合约定：${path} = ${JSON.stringify(value)?.slice(0, 160)}`); }
function json(raw: string): Record<string, unknown> {
  try { return JSON.parse(/\{[\s\S]*\}/.exec(raw)?.[0] ?? raw) as Record<string, unknown>; } catch { return fail('json', raw.slice(0, 200)); }
}

/** Pick the base picture or subject reference specified by the brand's cover prompt. */
export function coverFrameSystemPrompt(): string {
  return `You pick a still from a new video for its cover, following the given rule. The rule says whether it will be the base picture for styled text or a subject reference for an image model. For a base picture, consider the whole composition and room for the headline. For a subject reference, prioritise a clear face and useful pose; the original background and layout need not suit the final cover. Prefer a sharp face, open eyes and a mouth not caught mid-word, unless the rule asks otherwise.
Return only JSON: {"pick":<index of the still>}`;
}

export function parseCoverFrame(raw: string, count: number): number {
  const pick = json(raw).pick;
  return Number.isInteger(pick) && (pick as number) >= 0 && (pick as number) < count ? pick as number : fail('pick', pick);
}

/** Writing the headline of a new video's cover from what it says, the way the creator's covers word theirs. */
export function coverHeadlineSystemPrompt(): string {
  return `You write the headline lettered on the cover of a creator's new video, the way their covers word headlines (their cover prompt is given; it says how headlines are worded, with real examples). Write it from what this video actually says, in the language it is spoken in; follow the prompt's number of lines, length, structure, voice and punctuation; never promise what the video does not deliver and never copy an example's words.
Write one headline, the best one; do not offer alternatives. When the prompt says the covers carry no words, write none.
Return only JSON: {"lines":["<first line>", "<next line, only when the prompt uses more lines>"]} — {"lines":[]} for covers without words.`;
}

/** The headline's lines, in order (none for covers without words, else one to three, each short enough to letter). */
export function parseCoverHeadline(raw: string): string[] {
  const value = json(raw).lines;
  if (!Array.isArray(value)) fail('lines', value);
  const lines = value.flatMap(line => typeof line === 'string' && line.trim() ? [line.trim()] : []);
  if (lines.length > 3 || lines.some(line => line.length > 40)) fail('lines', value);
  return lines;
}
