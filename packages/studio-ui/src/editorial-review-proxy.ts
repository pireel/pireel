'use client';

import type { EditorialCandidateSpec } from '@pireel/studio-engine/editorial-candidates';
import { probeVideoFile } from './media';

export interface EditorialReviewProxySegment {
  candidateId: string;
  proxyStartSec: number;
  proxyEndSec: number;
  sourceStartSec: number;
  sourceEndSec: number;
  candidateStartSec: number;
  candidateEndSec: number;
}

const round3 = (value: number) => Math.round(value * 1_000) / 1_000;

// Qwen's base video input accepts videos from 2 seconds. Leave a small encoder/container
// margin because a planned 2.000s reel can be reported a frame shorter after muxing.
export const MIN_EDITORIAL_REVIEW_PROXY_SEC = 2.25;

export function editorialReviewProxyMeetsProviderMinimum(
  specs: readonly EditorialCandidateSpec[],
): boolean {
  const plannedDurationSec = specs.reduce((total, candidate) => (
    total + Math.max(0, candidate.endSec - candidate.startSec)
  ), 0);
  return plannedDurationSec >= MIN_EDITORIAL_REVIEW_PROXY_SEC;
}

export function buildEditorialReviewProxyPlan(
  specs: readonly EditorialCandidateSpec[],
  sourceDurationSec: number,
  contextSec = 0,
): EditorialReviewProxySegment[] {
  const sourceDuration = Math.max(0, sourceDurationSec);
  const context = Math.max(0, Math.min(1.5, contextSec));
  let proxyCursor = 0;
  return specs.flatMap((candidate): EditorialReviewProxySegment[] => {
    const sourceStartSec = round3(Math.max(0, candidate.startSec - context));
    const sourceEndSec = round3(Math.min(sourceDuration, candidate.endSec + context));
    if (sourceEndSec - sourceStartSec < 0.1) return [];
    const proxyStartSec = round3(proxyCursor);
    const proxyEndSec = round3(proxyStartSec + sourceEndSec - sourceStartSec);
    proxyCursor = proxyEndSec;
    return [{
      candidateId: candidate.id,
      proxyStartSec,
      proxyEndSec,
      sourceStartSec,
      sourceEndSec,
      candidateStartSec: candidate.startSec,
      candidateEndSec: candidate.endSec,
    }];
  });
}

export async function renderEditorialReviewProxy(
  file: File,
  specs: readonly EditorialCandidateSpec[],
): Promise<{ blob: Blob; segments: EditorialReviewProxySegment[] }> {
  const probe = await probeVideoFile(file);
  // The provider's clock for each segment must begin at the exact maximal usable interval.
  // Extra source context would make its relative timestamps ambiguous at the API boundary.
  const segments = buildEditorialReviewProxyPlan(specs, probe.durationSec, 0);
  if (!segments.length) throw new Error('editorial review proxy has no candidate ranges');
  const totalDuration = segments.at(-1)!.proxyEndSec;
  if (totalDuration > 90) throw new Error('editorial review proxy exceeds 90 seconds');
  const { renderTimeline } = await import('@pireel/studio-engine/video-edit');
  const sourceWidth = probe.width || 1080;
  const sourceHeight = probe.height || 1920;
  const scale = 480 / Math.max(sourceWidth, sourceHeight);
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
  const width = even(sourceWidth * scale);
  const height = even(sourceHeight * scale);
  const blob = await renderTimeline(
    (clipId) => clipId === 'source' ? file : undefined,
    segments.map((segment) => ({
      dur: segment.sourceEndSec - segment.sourceStartSec,
      video: { clipId: 'source', start: segment.sourceStartSec, end: segment.sourceEndSec },
      audio: { clipId: 'silent', start: 0, end: segment.sourceEndSec - segment.sourceStartSec },
    })),
    { width, height, videoBitrate: 600_000 },
  );
  return { blob, segments };
}

export async function uploadEditorialReviewProxy(
  blob: Blob,
  signal?: AbortSignal,
): Promise<{ key: string }> {
  const presign = await fetch('/api/studio/media', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'put-review-proxy', size: blob.size, content_type: 'video/mp4' }),
    ...(signal ? { signal } : {}),
  });
  const body = (await presign.json().catch(() => ({}))) as {
    key?: string;
    url?: string;
    content_type?: string;
    cache_control?: string;
    error?: string;
  };
  if (!presign.ok || !body.key || !body.url) {
    throw new Error(body.error || `review proxy presign failed: HTTP ${presign.status}`);
  }
  const uploaded = await fetch(body.url, {
    method: 'PUT',
    headers: {
      'Content-Type': body.content_type || 'video/mp4',
      ...(body.cache_control ? { 'Cache-Control': body.cache_control } : {}),
    },
    body: blob,
    ...(signal ? { signal } : {}),
  });
  if (!uploaded.ok) throw new Error(`review proxy upload failed: HTTP ${uploaded.status}`);
  return { key: body.key };
}

export async function deleteEditorialReviewProxy(key: string): Promise<void> {
  const response = await fetch('/api/studio/media', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'delete-review-proxy', key }),
  });
  if (!response.ok) throw new Error(`review proxy cleanup failed: HTTP ${response.status}`);
}
