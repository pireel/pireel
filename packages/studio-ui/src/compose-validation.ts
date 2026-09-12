import { parseBlockResponse } from '@pireel/studio-engine/compose';
import { HARD_LINT_CODES, lintBlock, type BlockLintIssue } from '@pireel/studio-engine/block-lint';
import { GeneratedBlockValidationError, type ComposedBlock } from './compose-result';

export interface ComponentValidationSeed {
  id: string;
  innerHtml: string;
  timelineBody: string;
  propsSchema?: string;
  boxPx?: { w: number; h: number };
}

/** All hosted component creation/editing shares one bounded admission policy. Quality advice
 * cannot initiate paid generation. A broken executable contract gets at most one targeted repair. */
export async function acceptGeneratedComponent(options: {
  seed: ComponentValidationSeed;
  raw: string;
  repair: (current: ComposedBlock, instruction: string) => Promise<string>;
  onWarnings?: (issues: BlockLintIssue[]) => void;
  failureMessage: (reason: string) => string;
}): Promise<ComposedBlock> {
  let parsed = parseBlockResponse(options.raw, options.seed);
  const inspect = () => lintBlock({ ...parsed, blockId: options.seed.id, boxPx: options.seed.boxPx, requireProps: true });
  let issues = inspect();
  const blocking = issues.filter((issue) => HARD_LINT_CODES.has(issue.code));
  if (blocking.length) {
    const instruction = `Repair only these executable-contract errors; preserve content, design and all other code. Do not rewrite for style or editable-property warnings:\n${blocking.map((issue) => `- ${issue.message}`).join('\n')}`;
    parsed = parseBlockResponse(await options.repair(parsed, instruction), parsed);
    issues = inspect();
    const remaining = issues.filter((issue) => HARD_LINT_CODES.has(issue.code));
    if (remaining.length) throw new GeneratedBlockValidationError(options.failureMessage(remaining[0]!.message), remaining.map((issue) => issue.message));
  }
  if (issues.length) options.onWarnings?.(issues);
  return parsed;
}
