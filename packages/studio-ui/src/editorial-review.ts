'use client';

import {
  buildEditorialCandidateSpecs,
  normalizeEditorialCandidateReviews,
  rankEditorialWindows,
  selectPrimarySourceCandidate,
  type EditorialCandidateReview,
  type EditorialCandidateSpec,
} from '@pireel/studio-engine/editorial-candidates';
import type { VisualQualityWindow } from '@pireel/studio-engine/visual-quality';
import { editorialFaceGateIssues, mouthSampleTimes } from '@pireel/studio-engine/mouth-state';
import { extractThumbnails } from '@pireel/studio-engine/video-edit/thumbnails';
import { analyzeMouthAtTimes } from './geometry';

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
 * request, so ranking is comparative and every candidate is seen across five ordered observations.
 */
export async function reviewEditorialCandidates(
  file: File,
  qualityWindows: readonly VisualQualityWindow[],
  brief: string,
  options: { maxCandidates?: number; signal?: AbortSignal } = {},
): Promise<EditorialCandidateReviewResult> {
  const normalizedBrief = brief.trim().slice(0, 2_000);
  if (!normalizedBrief) throw new Error('editorial review brief is required');
  const explicitlyRequestsMultipleFromSource = /(?:multiple|several|two|three)\s+(?:distinct\s+)?(?:moments|ranges|clips)\s+from\s+(?:the\s+)?same source|同一(?:原始)?素材.{0,12}(?:多段|多个片段|两个片段|两段)/i.test(normalizedBrief);
  const prefersCenteredSubject = /centered|centred|center composition|subject in (?:the )?center|居中|中心构图|主体在中间|主角在中间/i.test(normalizedBrief);
  const specs = buildEditorialCandidateSpecs(rankEditorialWindows(qualityWindows, {
    preferCenteredSubject: prefersCenteredSubject,
  }), options.maxCandidates ?? 6);
  if (!specs.length) return { brief: normalizedBrief, candidates: [] };

  const requiresClosedMouth = /closed[ -]?(?:mouth|lips)|mouth (?:stays?|must remain) closed|闭口|闭唇|张嘴|说话口型/i.test(normalizedBrief);
  const requiresSoloSubject = /solo|single (?:woman|person|subject)|one (?:woman|person)|单人|一个人|大女主|主体明确|人物明确|多人|人群/i.test(normalizedBrief);
  const faceScanRanges = specs.map((candidate) => ({
    startSec: Math.max(0, candidate.startSec - 0.15),
    endSec: candidate.endSec + 0.15,
  }));
  const faceObservationsPromise = requiresClosedMouth || requiresSoloSubject
    ? analyzeMouthAtTimes(file, mouthSampleTimes(faceScanRanges)).catch(() => [])
    : Promise.resolve([]);

  const requestedFrames = specs
    .flatMap((candidate) => candidate.frames.map((frame) => ({
      candidateId: candidate.id,
      ...frame,
    })))
    .sort((left, right) => left.atSec - right.atSec || left.candidateId.localeCompare(right.candidateId));
  const [thumbnails, faceObservations] = await Promise.all([
    extractThumbnails(file, requestedFrames.map((frame) => frame.atSec), {
      width: 480,
      quality: 0.8,
    }),
    faceObservationsPromise,
  ]);
  const faceGateIssues = new Map(specs.map((candidate) => [
    candidate.id,
    editorialFaceGateIssues(faceObservations, candidate, {
      requiresClosedMouth,
      requiresSoloSubject,
      paddingSec: 0.15,
    }),
  ]));
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
      // ordered observation; an incomplete storyboard must remain unreviewed.
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
    const normalized = selectPrimarySourceCandidate(normalizeEditorialCandidateReviews(specs, body.candidates)
      .map((candidate) => {
        const hardIssues = faceGateIssues.get(candidate.candidateId) ?? [];
        if (!hardIssues.length) return candidate;
        const rationale = hardIssues.includes('open-mouth')
          ? 'Visible open-mouth frame detected inside the candidate range.'
          : hardIssues.includes('multiple-people')
            ? 'Multiple prominent people compete with the intended solo subject.'
            : 'The visible face could not be inspected reliably enough for the required expression gate.';
        return {
          ...candidate,
          verdict: 'reject' as const,
          score: Math.min(candidate.score, 20),
          rationale,
          issues: [...new Set([...candidate.issues, ...hardIssues])],
        };
      })
      .sort((a, b) => Number(a.verdict === 'reject') - Number(b.verdict === 'reject') || a.rank - b.rank), {
        allowMultiple: explicitlyRequestsMultipleFromSource,
      });
    return {
      brief: normalizedBrief,
      candidates: normalized,
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
