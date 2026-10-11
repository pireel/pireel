import type { GenerationRequest } from './generation-settings';
import { getStudioSpaceId, pollCreation, startGeneration } from './gen-api';
import { t } from './i18n';

/** A finished generation, ready to insert and to register in the project library. */
export interface RangeGenerationResult {
  jobId: string;
  key: string;
  url: string;
  mime: string;
  durationSec?: number;
}

export class RangeGenerationError extends Error {
  constructor(message: string, readonly credits?: { need: number; balance: number }) {
    super(message);
  }
}

const POLL_MS = 4000;
const POLL_CAP_MS = 15 * 60_000;

/**
 * Image or video generation for a transcript selection, with the user's settings already mapped by
 * generationRequest (the same mapping the chat's credit quote uses). The job runs on the account's
 * generation queue; this waits for it (4 s cadence, 15 min cap) and returns the first output.
 * Nothing is inserted here — the caller places the result over the selection.
 */
export async function generateVisualForRange(projectId: string, prompt: string, request: GenerationRequest): Promise<RangeGenerationResult> {
  if (request.toolId !== 'image-gen' && request.toolId !== 'video-gen') throw new RangeGenerationError(t('captions.generateFailed'));
  const params: Record<string, unknown> = {
    ...request.params,
    prompt,
    user_prompt: prompt,
    ...(request.modelId ? { model_id: request.modelId } : {}),
    // One output lands on one selection.
    ...(request.toolId === 'image-gen' ? { n: 1 } : { count: 1 }),
  };
  const started = await startGeneration(projectId, request.toolId, params);
  if (!started.ok) {
    if (started.kind === 'credits') throw new RangeGenerationError(t('captions.generateNoCredits'), { need: started.need, balance: started.balance });
    throw new RangeGenerationError(started.message);
  }
  const id = started.ids[0]!;
  const startedAt = Date.now();
  for (;;) {
    await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
    const job = await pollCreation(id).catch(() => null);
    if (job?.status === 'succeeded') {
      const asset = job.assets[0];
      if (!asset) throw new RangeGenerationError(t('captions.generateEmpty'));
      return { jobId: id, key: asset.key, url: asset.url, mime: asset.mime };
    }
    if (job?.status === 'failed') throw new RangeGenerationError(job.error || t('captions.generateFailed'));
    if (Date.now() - startedAt > POLL_CAP_MS) throw new RangeGenerationError(t('captions.generateTimedOut'));
  }
}

/** Sound effect or music for a transcript selection (both generate synchronously). */
export async function generateAudioForRange(projectId: string, prompt: string, request: GenerationRequest): Promise<RangeGenerationResult> {
  if (request.toolId !== 'sfx-gen' && request.toolId !== 'music-gen') throw new RangeGenerationError(t('captions.generateFailed'));
  const spaceId = await getStudioSpaceId(projectId);
  const res = await fetch(request.toolId === 'sfx-gen' ? '/api/studio/sfx' : '/api/studio/music', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, duration_sec: request.params.duration_sec, space_id: spaceId }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    asset?: { id: string; key: string; url: string; mime: string; durationSec: number };
    error?: string; detail?: string; need?: number; balance?: number;
  };
  if (res.status === 402) throw new RangeGenerationError(t('captions.generateNoCredits'), { need: body.need ?? 0, balance: body.balance ?? 0 });
  if (!res.ok || !body.asset) throw new RangeGenerationError(body.detail || body.error || t('captions.generateFailed'));
  return { jobId: body.asset.id, key: body.asset.key, url: body.asset.url, mime: body.asset.mime, durationSec: body.asset.durationSec };
}
