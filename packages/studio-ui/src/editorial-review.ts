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
import {
  editorialFaceGateIssues,
  mouthSampleTimes,
  refineEditorialRangeLocally,
} from '@pireel/studio-engine/mouth-state';
import { extractThumbnails } from '@pireel/studio-engine/video-edit/thumbnails';
import { analyzeMouthAtTimes } from './geometry';
import {
  deleteEditorialReviewProxy,
  renderEditorialReviewProxy,
  uploadEditorialReviewProxy,
} from './editorial-review-proxy';

async function blobToBase64(blob: Blob): Promise<{ base64: string; mime: string }> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]!);
  return { base64: btoa(binary), mime: blob.type || 'image/jpeg' };
}

export interface EditorialCandidateReviewResult {
  brief: string;
  comparisonSummary: string;
  candidates: EditorialCandidateReview[];
}

export function editorialBriefFaceRequirements(brief: string): {
  requiresClosedMouth: boolean;
  requiresSoloSubject: boolean;
} {
  return {
    requiresClosedMouth: /closed[ -]?(?:mouth|lips)|mouth (?:stays?|must remain) closed|闭口|闭唇|张嘴|说话口型/i.test(brief),
    // "大女主" and "人物明确" describe visual hierarchy, not a literal empty background.
    // Only explicit one-person requirements activate the deterministic competing-face gate.
    requiresSoloSubject: /solo(?: subject)?|single (?:woman|person|subject)|only one (?:woman|person)|no (?:other )?people|单人(?:主体|画面)?|只有(?:一个|一位)人|仅(?:一个|一位)人|无其他人物|不得出现其他人物/i.test(brief),
  };
}

/** Face-only requirements do not apply to an interval whose visible editorial role is not a face performance. */
export function editorialContentRoleUsesFaceGates(role: EditorialCandidateReview['contentRole']): boolean {
  return role !== 'environment' && role !== 'detail' && role !== 'transition';
}

/**
 * Review a local technical shortlist as moving editorial moments. The primary path sends one
 * silent low-resolution proxy reel so the model sees continuous setup/performance/exit motion.
 * Five still observations remain a compatibility fallback when proxy rendering/upload is unavailable.
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
  if (!specs.length) return { brief: normalizedBrief, comparisonSummary: '', candidates: [] };

  const { requiresClosedMouth, requiresSoloSubject } = editorialBriefFaceRequirements(normalizedBrief);
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
  let thumbnails: Awaited<ReturnType<typeof extractThumbnails>> = [];
  try {
    const postReview = async (payload: Record<string, unknown>): Promise<{
      comparisonSummary: string;
      candidates: EditorialCandidateReview[];
    }> => {
      const response = await fetch('/api/studio/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'source-candidates', brief: normalizedBrief, candidates: specs, ...payload }),
        ...(options.signal ? { signal: options.signal } : {}),
      });
      const body = (await response.json().catch(() => ({}))) as {
        candidates?: EditorialCandidateReview[];
        comparisonSummary?: unknown;
        error?: string;
        detail?: string;
      };
      if (!response.ok || !Array.isArray(body.candidates)) {
        throw new Error(body.detail || body.error || `candidate review failed: HTTP ${response.status}`);
      }
      return {
        comparisonSummary: typeof body.comparisonSummary === 'string' ? body.comparisonSummary.slice(0, 500) : '',
        candidates: body.candidates,
      };
    };

    let providerCandidates: EditorialCandidateReview[];
    let comparisonSummary = '';
    try {
      const proxy = await renderEditorialReviewProxy(file, specs);
      const uploaded = await uploadEditorialReviewProxy(proxy.blob, options.signal);
      try {
        const reviewed = await postReview({
          video_key: uploaded.key,
          proxy_segments: proxy.segments,
        });
        comparisonSummary = reviewed.comparisonSummary;
        providerCandidates = reviewed.candidates;
      } finally {
        // Server review also deletes after the provider returns. This idempotent client cleanup
        // covers cancellation between upload completion and request delivery.
        await deleteEditorialReviewProxy(uploaded.key).catch(() => {});
      }
    } catch (error) {
      if (options.signal?.aborted) throw error;
      console.warn('[studio/editorial-review] video proxy unavailable; using ordered still fallback', error);
      thumbnails = await extractThumbnails(file, requestedFrames.map((frame) => frame.atSec), {
        width: 480,
        quality: 0.8,
      });
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
        if (!thumbnail || Math.abs(thumbnail.timestamp - requested.atSec) > 0.35) continue;
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
      const reviewed = await postReview({ frames });
      comparisonSummary = reviewed.comparisonSummary;
      providerCandidates = reviewed.candidates;
    }

    const faceObservations = await faceObservationsPromise;
    const normalized = selectPrimarySourceCandidate(normalizeEditorialCandidateReviews(specs, providerCandidates)
      .map((candidate) => {
        const usesFaceGates = editorialContentRoleUsesFaceGates(candidate.contentRole);
        const refined = refineEditorialRangeLocally(candidate, faceObservations, {
          requiresClosedMouth: usesFaceGates && requiresClosedMouth,
          requiresSoloSubject: usesFaceGates && requiresSoloSubject,
        });
        const locallyBounded = { ...candidate, ...refined };
        const localIssues = editorialFaceGateIssues(faceObservations, locallyBounded, {
          requiresClosedMouth: usesFaceGates && requiresClosedMouth,
          requiresSoloSubject: usesFaceGates && requiresSoloSubject,
          paddingSec: 0.03,
        });
        const blockingIssues = localIssues.filter((issue) => issue !== 'technical-risk');
        const rangeTrimmed = locallyBounded.startSec > candidate.startSec + 0.01
          || locallyBounded.endSec < candidate.endSec - 0.01;
        const evidence = {
          aestheticVerdict: candidate.verdict,
          aestheticScore: candidate.score,
          localCompliance: blockingIssues.length
            ? 'rejected' as const
            : localIssues.includes('technical-risk')
              ? 'unverified' as const
              : rangeTrimmed
                ? 'trimmed' as const
                : 'passed' as const,
          issues: [...new Set([...candidate.issues, ...localIssues])],
          cutOptions: candidate.cutOptions.filter((option) => (
            option.startSec >= locallyBounded.startSec - 0.01
            && option.endSec <= locallyBounded.endSec + 0.01
          )),
        };
        if (!blockingIssues.length) return { ...locallyBounded, ...evidence };
        const rationale = blockingIssues.includes('open-mouth')
          ? 'Visible open-mouth frame detected inside the candidate range.'
          : blockingIssues.includes('multiple-people')
            ? 'Multiple prominent people compete with the intended solo subject.'
            : 'The visible face could not be inspected reliably enough for the required expression gate.';
        return {
          ...locallyBounded,
          ...evidence,
          verdict: 'reject' as const,
          rationale,
        };
      })
      .sort((a, b) => Number(a.verdict === 'reject') - Number(b.verdict === 'reject') || a.rank - b.rank), {
        allowMultiple: explicitlyRequestsMultipleFromSource,
      });
    return {
      brief: normalizedBrief,
      comparisonSummary,
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
