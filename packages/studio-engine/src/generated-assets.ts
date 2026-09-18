/**
 * Generated media as project media-directory entries. Shared by the browser (tool runner, chat
 * cards, history reconcile) and the server (MCP server-direct tools, offline agents): one mapping,
 * one id scheme, so a generation registered from either side is the same directory entry.
 */

import type { LocalAssetIndexEntry } from './project-context';

export type GeneratedAssetKind = 'image' | 'video' | 'audio';

/** One settled generated media output, as reported to the project media directory. */
export interface GeneratedAssetRecord {
  jobId: string;
  index: number;
  kind: GeneratedAssetKind;
  /** Bare storage key (public CDN object). */
  key: string;
  mime: string;
  prompt: string;
  createdAt: number;
  durationSec?: number;
}

/** The subset of a generation job the mapping needs (browser GenJob and server job rows both fit). */
export interface GeneratedJobLike {
  id: string;
  status: string;
  prompt: string;
  createdAt: number;
  kind?: GeneratedAssetKind | string;
  assets: readonly { key?: string; mime?: string }[];
}

/** Settled outputs of generation jobs as directory records; kind falls back to the asset MIME when
 * the job does not carry it (jobs polled by id). */
export function generatedRecordsFromJobs(jobs: readonly GeneratedJobLike[]): GeneratedAssetRecord[] {
  const records: GeneratedAssetRecord[] = [];
  for (const job of jobs) {
    if (job.status !== 'succeeded') continue;
    job.assets.forEach((asset, index) => {
      if (!asset.key) return;
      const mime = asset.mime ?? '';
      const kind: GeneratedAssetKind = job.kind === 'image' || job.kind === 'video' || job.kind === 'audio'
        ? job.kind
        : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'image';
      records.push({ jobId: job.id, index, kind, key: asset.key, mime, prompt: job.prompt, createdAt: job.createdAt });
    });
  }
  return records;
}

/** Generated media follows the project like any import: one directory entry per output, addressed
 * by its storage key (no upload — the bytes are already in the cloud). Deterministic ids keep
 * history reloads idempotent. */
export function generatedAssetIndexEntry(record: GeneratedAssetRecord, fallbackLabel: string): LocalAssetIndexEntry {
  const jobId = record.jobId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'job';
  const sig = `gen:${record.key}`;
  return {
    assetId: `gen_${jobId}_${record.index}`,
    contentSig: sig,
    sig,
    cloudKey: record.key,
    label: record.prompt.trim().slice(0, 60) || fallbackLabel,
    kind: record.kind,
    w: null,
    h: null,
    ...(record.mime ? { mime: record.mime } : {}),
    ...(record.durationSec ? { durationSec: record.durationSec } : {}),
    createdAt: record.createdAt,
  };
}

/** Merge new directory entries into an existing index: known ids keep their user-facing facts
 * (label, createdAt); unknown ids are prepended. Returns null when nothing changed. */
export function mergeProjectLibraryEntries(
  existing: readonly LocalAssetIndexEntry[],
  incoming: readonly LocalAssetIndexEntry[],
): LocalAssetIndexEntry[] | null {
  const known = new Set(existing.map((entry) => entry.assetId));
  const fresh = incoming.filter((entry) => !known.has(entry.assetId));
  if (!fresh.length) return null;
  const seen = new Set<string>();
  return [...fresh.filter((entry) => !seen.has(entry.assetId) && seen.add(entry.assetId)), ...existing];
}
