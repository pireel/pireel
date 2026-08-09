/**
 * Deterministic safety budgets for Agent-driven Studio work.
 *
 * These limits do not decide edits or compose a feature workflow. They cap orchestration fan-out
 * around the existing atomic tools so a confused model cannot create hundreds of calls, reviews,
 * or proposal operations in one user turn.
 */

export const STUDIO_AGENT_EXECUTION_LIMITS = {
  toolCallsPerTurn: 24,
  modelRoundsPerTurn: 12,
  proposalOperations: 32,
  proposalSplitCalls: 1,
  splitPointsPerCall: 24,
  proposalFramingCalls: 1,
  framingUpdatesPerCall: 120,
  reviewsPerUnchangedMoment: 2,
} as const;

export interface AgentMessagePartLike {
  type?: unknown;
  toolName?: unknown;
}

export interface AgentMessageLike {
  role?: unknown;
  parts?: unknown;
}

export interface AgentTurnUsage {
  toolCalls: number;
  modelRounds: number;
  remainingToolCalls: number;
  remainingModelRounds: number;
  exhausted: boolean;
}

const isToolPart = (part: AgentMessagePartLike) =>
  (typeof part.type === 'string' && part.type.startsWith('tool-')) ||
  (part.type === 'dynamic-tool' && typeof part.toolName === 'string');

/** Count only work after the latest real user message. SDK `step-start` parts survive persistence and
 * give a more faithful round count when several continuations append to one assistant message. */
export function studioAgentTurnUsage(messages: readonly AgentMessageLike[]): AgentTurnUsage {
  let lastUser = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      lastUser = index;
      break;
    }
  }
  let toolCalls = 0;
  let modelRounds = 0;
  for (const message of messages.slice(lastUser + 1)) {
    if (message.role !== 'assistant' || !Array.isArray(message.parts)) continue;
    const parts = message.parts.filter((part): part is AgentMessagePartLike => !!part && typeof part === 'object');
    toolCalls += parts.filter(isToolPart).length;
    if (parts.length) modelRounds += Math.max(1, parts.filter((part) => part.type === 'step-start').length);
  }
  const remainingToolCalls = Math.max(0, STUDIO_AGENT_EXECUTION_LIMITS.toolCallsPerTurn - toolCalls);
  const remainingModelRounds = Math.max(0, STUDIO_AGENT_EXECUTION_LIMITS.modelRoundsPerTurn - modelRounds);
  return {
    toolCalls,
    modelRounds,
    remainingToolCalls,
    remainingModelRounds,
    exhausted: remainingToolCalls === 0 || remainingModelRounds === 0,
  };
}

export function studioAgentBudgetPrompt(usage: AgentTurnUsage): string {
  return usage.exhausted
    ? `Internal execution capacity is complete (${usage.toolCalls} tool calls, ${usage.modelRounds} model rounds). Do not call another tool. In the visible reply NEVER mention budgets, limits, tool calls, model rounds, tokens, credits, or capacity. Briefly say what has landed, then name the single concrete next action so the user can continue it in a fresh turn.`
    : `Internal execution capacity: ${usage.remainingToolCalls} tool calls and ${usage.remainingModelRounds} model rounds remain in this user turn. This is private orchestration state: NEVER mention it, budgets, limits, tokens, or credits to the user. Batch homogeneous edits into vectorized atomic tools; never spend one call per shot when a batch field exists.`;
}

export const reviewMomentKey = (atSec: number) => Math.round(atSec * 10) / 10;

export function selectReviewMoments(
  atSecs: readonly number[],
  attempts: ReadonlyMap<number, number>,
): { allowedAtSecs: number[]; repeatedAtSecs: number[] } {
  const allowedAtSecs: number[] = [];
  const repeatedAtSecs: number[] = [];
  for (const atSec of atSecs) {
    const target = (attempts.get(reviewMomentKey(atSec)) ?? 0) >= STUDIO_AGENT_EXECUTION_LIMITS.reviewsPerUnchangedMoment
      ? repeatedAtSecs
      : allowedAtSecs;
    target.push(atSec);
  }
  return { allowedAtSecs, repeatedAtSecs };
}

export interface StudioOperationLike {
  tool: string;
  input: Record<string, unknown>;
}

export interface ProposalBudgetResult {
  ok: boolean;
  code?: 'too_many_operations' | 'too_many_split_calls' | 'too_many_split_points' | 'too_many_framing_calls' | 'too_many_framing_updates';
  error?: string;
  data?: Record<string, number>;
}

/** Persisted proposals have a stricter shape than ad-hoc editing: each homogeneous mutation must be
 * vectorized so preview/apply stays compact, auditable, and one undo/history transaction. */
export function validateStudioProposalBudget(operations: readonly StudioOperationLike[]): ProposalBudgetResult {
  if (operations.length > STUDIO_AGENT_EXECUTION_LIMITS.proposalOperations) {
    return {
      ok: false,
      code: 'too_many_operations',
      error: `proposal supports at most ${STUDIO_AGENT_EXECUTION_LIMITS.proposalOperations} operations`,
      data: { operations: operations.length, limit: STUDIO_AGENT_EXECUTION_LIMITS.proposalOperations },
    };
  }
  const splitCalls = operations.filter((operation) => operation.tool === 'split_shot');
  if (splitCalls.length > STUDIO_AGENT_EXECUTION_LIMITS.proposalSplitCalls) {
    return {
      ok: false,
      code: 'too_many_split_calls',
      error: 'batch framing split points into one split_shot {atSecs:[...], purpose:"framing"} operation',
      data: { calls: splitCalls.length, limit: STUDIO_AGENT_EXECUTION_LIMITS.proposalSplitCalls },
    };
  }
  const splitPoints = splitCalls.reduce(
    (total, operation) => total + (Array.isArray(operation.input.atSecs) ? operation.input.atSecs.length : 1),
    0,
  );
  if (splitPoints > STUDIO_AGENT_EXECUTION_LIMITS.splitPointsPerCall) {
    return {
      ok: false,
      code: 'too_many_split_points',
      error: `one proposal supports at most ${STUDIO_AGENT_EXECUTION_LIMITS.splitPointsPerCall} split points`,
      data: { points: splitPoints, limit: STUDIO_AGENT_EXECUTION_LIMITS.splitPointsPerCall },
    };
  }
  const framingCalls = operations.filter((operation) => operation.tool === 'set_shot_framing');
  if (framingCalls.length > STUDIO_AGENT_EXECUTION_LIMITS.proposalFramingCalls) {
    return {
      ok: false,
      code: 'too_many_framing_calls',
      error: 'batch every shot into one set_shot_framing {updates:[...]} operation',
      data: { calls: framingCalls.length, limit: STUDIO_AGENT_EXECUTION_LIMITS.proposalFramingCalls },
    };
  }
  const framingUpdates = framingCalls.reduce(
    (total, operation) => total + (Array.isArray(operation.input.updates) ? operation.input.updates.length : 1),
    0,
  );
  if (framingUpdates > STUDIO_AGENT_EXECUTION_LIMITS.framingUpdatesPerCall) {
    return {
      ok: false,
      code: 'too_many_framing_updates',
      error: `one proposal supports at most ${STUDIO_AGENT_EXECUTION_LIMITS.framingUpdatesPerCall} framing updates`,
      data: { updates: framingUpdates, limit: STUDIO_AGENT_EXECUTION_LIMITS.framingUpdatesPerCall },
    };
  }
  return { ok: true };
}
