'use client';

import { useEffect, useState } from 'react';

/**
 * useQuote — powers the "estimated credits" shown next to the generate button in the /image and
 * /video studios.
 *
 * Debounce-fetches /api/billing/quote on param changes to get the current credit estimate.
 * Returns null when model_id is missing (button then shows just "generate" with no estimate).
 *
 * Deep-compares args via JSON.stringify — only supports serializable objects, which is enough for the current schema.
 */

export interface UseQuoteArgs {
  toolId: string;
  /** Required for image-gen / video-gen; optional for other tools. */
  modelId?: string;
  params: Record<string, unknown>;
  /** Debounce delay (ms). Default 250. */
  debounceMs?: number;
}

export function useQuote(args: UseQuoteArgs): number | null {
  const { toolId, modelId, params, debounceMs = 250 } = args;
  const [credits, setCredits] = useState<number | null>(null);
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    if (toolId === 'image-gen' || toolId === 'video-gen') {
      if (!modelId) {
        setCredits(null);
        return;
      }
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/billing/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool_id: toolId, model_id: modelId, params }),
        });
        if (!res.ok) return;
        const j = (await res.json()) as { credits?: number };
        if (!cancelled && typeof j.credits === 'number') setCredits(j.credits);
      } catch {
        // Silent — a failed estimate shouldn't block the user from submitting
      }
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolId, modelId, paramsKey, debounceMs]);

  return credits;
}
