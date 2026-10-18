import { editorRequest } from '@pireel/studio-ui/host-request';
import { pickImageModel, imageGenerationParams } from '@pireel/studio-engine/image-generation-settings';
import { useEffect, useState } from 'react';
import { audioKindFor, type GenerationIntent, type GenerationParams } from '@pireel/studio-ui/chat-generation-intent';

/**
 * Generation settings shared by every surface that starts a generation (chat composer, the
 * transcript "add" popover): remembered preferences, the hosted model catalog, and the one mapping
 * from settings to the generation request (used for the credit quote and for the real call alike).
 */

/** Generation config is a user preference, not per-project state — the last choices reopen next time. */
const GEN_PARAMS_KEY = 'pireel:studio:gen-params';

export function loadGenerationParams(): GenerationParams {
  try {
    const raw = localStorage.getItem(GEN_PARAMS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as GenerationParams) : {};
  } catch {
    return {};
  }
}

export function saveGenerationParams(params: GenerationParams): void {
  try { localStorage.setItem(GEN_PARAMS_KEY, JSON.stringify(params)); } catch { /* private mode / blocked */ }
}

export type GenerationModel = { id: string; name: string };

/** Hosted model catalog for image/video (other kinds have none). onLoaded lets the caller drop a
 *  remembered model that does not belong to this kind. */
export function useGenerationModels(intent: GenerationIntent | null, onLoaded?: (models: GenerationModel[]) => void): GenerationModel[] {
  const [models, setModels] = useState<GenerationModel[]>([]);
  useEffect(() => {
    if (intent !== 'image' && intent !== 'video') {
      setModels([]);
      return;
    }
    let cancelled = false;
    void editorRequest(`/api/models?kind=${intent}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { models?: Array<{ id?: string; name?: string }> } | null) => {
        if (cancelled || !Array.isArray(j?.models)) return;
        const next = j.models.filter((m): m is { id: string; name?: string } => typeof m?.id === 'string').map((m) => ({ id: m.id, name: m.name ?? m.id }));
        setModels(next);
        onLoaded?.(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch per kind only
  }, [intent]);
  return models;
}

/** A remembered model only applies to its own kind. */
export function withKnownModel(params: GenerationParams, models: GenerationModel[]): GenerationParams {
  return params.modelId && !models.some((model) => model.id === params.modelId) ? { ...params, modelId: undefined } : params;
}

/** Five-second ceiling tiers of the SFX billing row (same as the server's sfxDurationTier). */
function sfxDurationTier(durationSec: number): 's5' | 's10' | 's15' | 's22' {
  if (durationSec <= 5) return 's5';
  if (durationSec <= 10) return 's10';
  if (durationSec <= 15) return 's15';
  return 's22';
}

export type GenerationToolId = 'image-gen' | 'video-gen' | 'sfx-gen' | 'music-gen' | 'speech-gen-unquoted';

export interface GenerationRequest {
  toolId: GenerationToolId;
  /** '' for kinds without a model catalog. */
  modelId: string;
  /** Tool params (image/video go to /api/create; sfx/music map onto their own routes). */
  params: Record<string, unknown>;
}

/** Settings → the generation request. The credit quote and the real call both read this. */
export function generationRequest(intent: GenerationIntent, params: GenerationParams, models: GenerationModel[]): GenerationRequest {
  const modelId = intent === 'image' ? pickImageModel(models, params.modelId) : intent === 'video' ? (params.modelId ?? models[0]?.id ?? '') : '';
  const ratio = params.ratio ?? '9:16';
  if (intent === 'image') {
    return { toolId: 'image-gen', modelId, params: { n: Math.min(4, Math.max(1, params.count ?? 1)), ...imageGenerationParams({ modelId, size: params.imageSize || ratio, quality: params.quality }) } };
  }
  if (intent === 'video') {
    return { toolId: 'video-gen', modelId, params: { duration_sec: String(params.durationSec ?? 5), count: 1, resolution: params.resolution ?? '720p', aspect_ratio: ratio, generate_audio: params.generateAudio ?? false } };
  }
  if (intent === 'audio') {
    const kind = audioKindFor(params);
    if (kind === 'sfx') return { toolId: 'sfx-gen', modelId, params: { duration_tier: sfxDurationTier(params.durationSec ?? 5), duration_sec: params.durationSec ?? 5 } };
    if (kind === 'music') return { toolId: 'music-gen', modelId, params: { tier: 'song', duration_sec: params.durationSec ?? 60 } };
    return { toolId: 'speech-gen-unquoted', modelId, params: {} };
  }
  return { toolId: 'image-gen', modelId, params: {} };
}
