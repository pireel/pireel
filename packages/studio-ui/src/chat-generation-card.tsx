'use client';

/**
 * Generation receipts in the chat: the result itself (thumbnails, a looping video, an audio player),
 * live progress while a hosted job is pending, and the actions the retired panel offered — insert
 * into the timeline, use as a reference for the next generation, another take. Outputs are already
 * in the project media directory (registered by the tool runner); the card only shows them.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { imageThumb } from '@pireel/ui/image-url';
import { useStudioShell } from './shell-context';
import { t } from './i18n';
import { generatedAssetIndexEntry, generatedRecordsFromJobs, pollCreation, type GeneratedAssetRecord, type GenJob } from './gen-api';
import { localAssetMentionRef, type StudioElementRef } from './chat-local-asset-mention';
import type { GenerationIntent } from './chat-generation-intent';

export interface GenerationCardActions {
  onInsertMedia?: (asset: { type: 'image' | 'video'; url: string; label?: string }) => void;
  onUseAudio?: (url: string, label?: string) => void;
  /** Arms the image mode with this asset mentioned as a reference. */
  onUseAsReference?: (ref: StudioElementRef) => void;
  /** Arms the same mode with the same prompt for another take. */
  onRegenerate?: (intent: GenerationIntent, prompt: string) => void;
}

const ACTION = 'text-ink-3 hover:bg-line hover:text-ink inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[10.5px]';

function recordRef(record: GeneratedAssetRecord): StudioElementRef {
  const entry = generatedAssetIndexEntry(record, record.kind);
  return localAssetMentionRef(entry);
}

function OutputTile({ record, url, actions }: { record: GeneratedAssetRecord; url: string; actions: GenerationCardActions }) {
  const label = record.prompt.trim().slice(0, 60);
  return (
    <div className="border-line group relative overflow-hidden rounded-md border">
      {record.kind === 'video' ? (
        <video src={url} muted loop playsInline controls preload="metadata" className="aspect-[4/5] w-full bg-black object-contain" />
      ) : record.kind === 'audio' ? (
        <div className="bg-panel-2 px-2 py-2">
          <audio src={url} controls preload="metadata" className="h-8 w-full" />
        </div>
      ) : (
        <img src={imageThumb(record.key, 'list')} alt="" loading="lazy" className="aspect-[4/5] w-full bg-[#f3f3f0] object-contain" />
      )}
      <div className="flex flex-wrap items-center gap-0.5 px-1 py-1">
        {record.kind === 'audio'
          ? actions.onUseAudio && (
            <button type="button" className={ACTION} onClick={() => actions.onUseAudio?.(url, label)}>
              <Plus className="h-3 w-3" /> {t('chatGen.insertToTimeline')}
            </button>
          )
          : actions.onInsertMedia && (
            <button type="button" className={ACTION} onClick={() => actions.onInsertMedia?.({ type: record.kind === 'video' ? 'video' : 'image', url, label })}>
              <Plus className="h-3 w-3" /> {t('chatGen.insertToTimeline')}
            </button>
          )}
        {record.kind !== 'audio' && actions.onUseAsReference ? (
          <button type="button" className={ACTION} onClick={() => actions.onUseAsReference?.(recordRef(record))}>
            <Sparkles className="h-3 w-3" /> {t('chatGen.useAsReference')}
          </button>
        ) : null}
        {actions.onRegenerate && record.prompt ? (
          <button type="button" className={ACTION} onClick={() => actions.onRegenerate?.(record.kind, record.prompt)}>
            <RefreshCw className="h-3 w-3" /> {t('chatGen.regenerate')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Hosted image/video jobs: poll while pending (4 s), then show every output. */
export function GenerationJobsBody({ ids, kind, prompt, actions }: { ids: string[]; kind: 'image' | 'video'; prompt: string; actions: GenerationCardActions }) {
  const [jobs, setJobs] = useState<GenJob[]>([]);
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const tick = async () => {
      const fresh = (await Promise.all(ids.map((id) => pollCreation(id).catch(() => null)))).filter((job): job is GenJob => !!job);
      if (cancelled) return;
      setJobs(fresh);
      if (fresh.length < ids.length || fresh.some((job) => job.status === 'pending')) timer = window.setTimeout(() => void tick(), 4000);
    };
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [ids.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const records = useMemo(() => generatedRecordsFromJobs(jobs.map((job) => ({ ...job, kind, prompt: job.prompt || prompt }))), [jobs, kind, prompt]);
  const pending = jobs.length < ids.length || jobs.some((job) => job.status === 'pending');
  const failed = jobs.filter((job) => job.status === 'failed');
  return (
    <div className="border-line/70 border-t px-2.5 py-2">
      {records.length ? (
        <div className={`grid gap-1.5 ${records.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} max-w-[360px]`}>
          {records.map((record) => {
            const job = jobs.find((candidate) => candidate.id === record.jobId);
            const url = job?.assets[record.index]?.url ?? imageThumb(record.key, 'original');
            return <OutputTile key={`${record.jobId}:${record.index}`} record={record} url={url} actions={actions} />;
          })}
        </div>
      ) : null}
      {pending ? (
        <div className="text-ink-4 mt-1 flex items-center gap-1.5 text-[11px]">
          <Loader2 className="h-3 w-3 animate-spin" /> {kind === 'video' ? t('panels.generatingVideo') : t('panels.generatingImage')}
        </div>
      ) : null}
      {failed.map((job) => (
        <div key={job.id} className="text-destructive mt-1 text-[11px]">{job.error || t('common.generationFailed')}</div>
      ))}
    </div>
  );
}

/** Synchronous audio tools (music / sfx): the asset is in the receipt already. */
export function GeneratedAudioBody({ output, prompt, actions }: { output: unknown; prompt: string; actions: GenerationCardActions }) {
  const data = output && typeof output === 'object' ? (output as { data?: { asset?: { id?: string; key?: string; url?: string; mime?: string; durationSec?: number } } }).data : null;
  const asset = data?.asset;
  if (!asset || typeof asset.url !== 'string' || !/^https?:\/\//i.test(asset.url)) return null;
  const record: GeneratedAssetRecord = { jobId: asset.id ?? asset.url, index: 0, kind: 'audio', key: asset.key ?? asset.url, mime: asset.mime ?? 'audio/mpeg', prompt, createdAt: Date.now(), ...(asset.durationSec ? { durationSec: asset.durationSec } : {}) };
  return (
    <div className="border-line/70 border-t px-2.5 py-2">
      <div className="max-w-[360px]">
        <OutputTile record={record} url={asset.url} actions={actions} />
      </div>
    </div>
  );
}

/** A generation refused for credits: the host's top-up card, right in the receipt. */
export function CreditsShortfallBody({ error }: { error: string }) {
  const shell = useStudioShell();
  const match = /insufficient_tokens(?::\s*need\s+(\d+)[^\d]+(\d+))?/i.exec(error);
  if (!match || !shell.CreditsCard) return null;
  const Card = shell.CreditsCard;
  return (
    <div className="border-line/70 border-t px-2.5 py-2">
      <Card need={Number(match[1] ?? 0)} balance={Number(match[2] ?? 0)} />
    </div>
  );
}
