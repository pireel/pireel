'use client';

import {
  buildEditorialCandidateSpecs,
  normalizeEditorialCandidateReviews,
  type EditorialCandidateReview,
  type EditorialCandidateSpec,
} from '@pireel/studio-engine/editorial-candidates';
import type { VisualQualityWindow } from '@pireel/studio-engine/visual-quality';
import { extractThumbnails } from '@pireel/studio-engine/video-edit/thumbnails';

async function blobToBase64(blob: Blob): Promise<{ base64: string; mime: string }> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]!);
  return { base64: btoa(binary), mime: blob.type || 'image/jpeg' };
}

export interface EditorialCandidateReviewResult {
  brief: string;
  candidates: EditorialCandidateReview[];
}

/**
 * Review a local technical shortlist as moving editorial moments. All candidates share one vision
 * request, so ranking is comparative and every candidate is seen at entry, midpoint and exit.
 */
export async function reviewEditorialCandidates(
  file: File,
  qualityWindows: readonly VisualQualityWindow[],
  brief: string,
  options: { maxCandidates?: number; signal?: AbortSignal } = {},
): Promise<EditorialCandidateReviewResult> {
  const normalizedBrief = brief.trim().slice(0, 2_000);
  if (!normalizedBrief) throw new Error('editorial review brief is required');
  const specs = buildEditorialCandidateSpecs(qualityWindows, options.maxCandidates ?? 6);
  if (!specs.length) return { brief: normalizedBrief, candidates: [] };

  const requestedFrames = specs.flatMap((candidate) => candidate.frames.map((frame) => ({
    candidateId: candidate.id,
    ...frame,
  })));
  const thumbnails = await extractThumbnails(file, requestedFrames.map((frame) => frame.atSec), {
    width: 480,
    quality: 0.8,
  });
  try {
    const remaining = [...thumbnails];
    const frames = [] as Array<{
      candidateId: string;
      phase: string;
      atSec: number;
      image_base64: string;
      mime: string;
    }>;
    for (const requested of requestedFrames) {
      if (!remaining.length) break;
      let nearestIndex = 0;
      for (let index = 1; index < remaining.length; index += 1) {
        if (Math.abs(remaining[index]!.timestamp - requested.atSec) < Math.abs(remaining[nearestIndex]!.timestamp - requested.atSec)) {
          nearestIndex = index;
        }
      }
      const [thumbnail] = remaining.splice(nearestIndex, 1);
      if (!thumbnail) continue;
      // A decoder may skip an undecodable request. Do not relabel a distant neighbor as that
      // entry/middle/exit observation; an incomplete storyboard must remain unreviewed.
      if (Math.abs(thumbnail.timestamp - requested.atSec) > 0.35) continue;
      const encoded = await blobToBase64(thumbnail.blob);
      frames.push({
        candidateId: requested.candidateId,
        phase: requested.phase,
        atSec: Math.round(thumbnail.timestamp * 1_000) / 1_000,
        image_base64: encoded.base64,
        mime: encoded.mime,
      });
    }
    if (!frames.length) throw new Error('candidate storyboard extraction returned no readable frames');

    const response = await fetch('/api/studio/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'source-candidates', brief: normalizedBrief, candidates: specs, frames }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    const body = (await response.json().catch(() => ({}))) as {
      candidates?: EditorialCandidateReview[];
      error?: string;
      detail?: string;
    };
    if (!response.ok || !Array.isArray(body.candidates)) {
      throw new Error(body.detail || body.error || `candidate review failed: HTTP ${response.status}`);
    }
    return {
      brief: normalizedBrief,
      candidates: normalizeEditorialCandidateReviews(specs, body.candidates),
    };
  } finally {
    thumbnails.forEach((thumbnail) => URL.revokeObjectURL(thumbnail.url));
  }
}

export function candidateSpecsForReview(
  qualityWindows: readonly VisualQualityWindow[],
  maxCandidates?: number,
): EditorialCandidateSpec[] {
  return buildEditorialCandidateSpecs(qualityWindows, maxCandidates);
}
