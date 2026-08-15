'use client';

/**
 * Assets library shell — the 素材 slot of the rail's primary nav:
 *  - My assets (the current project's LOCAL media, never uploaded)  → my-assets-panel
 *  - Cloud assets (uploads + generated media + saved elements)      → cloud-assets-panel
 * A host may inject a curated-assets panel through StudioShell. The scope is a segmented switch.
 * Every Studio session starts from the project's local media and visited panels stay mounted.
 */

import { useState } from 'react';
import type { Composition, MediaRef } from '@pireel/studio-engine/composition';
import type { LocalAssetIndexEntry } from '@pireel/studio-engine/project-dto';
import type { GenElementResult } from './element-history';
import type { PanelDragAsset, PanelMediaAsset } from './asset-card';
import { MyAssetsPanel } from './my-assets-panel';
import { CloudAssetsPanel } from './cloud-assets-panel';
import { t } from './i18n';
import { useStudioShell } from './shell-context';

export type { PanelDragAsset } from './asset-card';
export type GenType = 'image' | 'video' | 'element' | 'audio';

type Scope = 'mine' | 'official' | 'cloud';

export function AssetsPanel({
  comp,
  projectId,
  localAssetIndex,
  localAssetIndexSyncReady,
  onLocalAssetIndexChange,
  videoSig,
  mainSourceUrl,
  hasMainSource,
  onDeleteAsset,
  isSrcLive,
  onReconnectSource,
  onInsert,
  onInsertClip,
  onInsertElement,
  onInsertKit,
  onDragAsset,
  onOpenGeneration,
  onUseAudio,
  genRefreshTick = 0,
}: {
  /** Element live preview needs theme/canvas (BlockPreviewFrame). */
  comp: Composition;
  /** Scopes "My"'s local-import registry (imports persist per project across refreshes). */
  projectId: string;
  /** Cloud-synced metadata only; MyAssetsPanel merges it with this browser's local registry. */
  localAssetIndex?: LocalAssetIndexEntry[];
  /** Wait until cloud/local project hydration finishes before publishing this browser's merged index. */
  localAssetIndexSyncReady?: boolean;
  onLocalAssetIndexChange?: (entries: LocalAssetIndexEntry[]) => void;
  /** First-loaded source's fileSig (workbench-held, not in comp) — "My" labels it by filename. */
  videoSig?: string | null;
  /** Native primary asset runtime URL and existence; Composition.video is not source identity. */
  mainSourceUrl?: string | null;
  hasMainSource?: boolean;
  /** Delete a local source from the TRACK too (every shot cut from it) — workbench-side comp surgery. null = main. */
  onDeleteAsset?: (src: string | null) => void;
  /** Per-asset liveness of a track source's bytes (workbench-held Files) — drives "My"'s restore cards. */
  isSrcLive?: (url: string) => boolean;
  /** Per-asset reconnect for a missing track source (null = main). */
  onReconnectSource?: (src: string | null, sig?: string | null) => void;
  onInsert: (asset: MediaRef, label?: string, dims?: { w: number; h: number }) => void;
  /** Click-insert for image/video = MAIN TRACK by default (video = whole segment, image = still-frame
   *  clip, at the playhead); the stage/overlay placement stays a DRAG gesture. */
  onInsertClip?: (asset: PanelMediaAsset) => void;
  /** Insert an element (seedId re-scoping and empty-slot backfill happen on the insert side). */
  onInsertElement: (el: GenElementResult, prompt: string) => void;
  /** Insert a kit component as a props-driven block; props override the sample defaults
   *  (the preview lightbox lets you tune them before inserting). */
  onInsertKit?: (component: string, props?: Record<string, unknown>) => void;
  /** Drag out an asset (asset on dragstart, null on dragend) — workbench uses this to overlay a drop layer on stage/timeline. */
  onDragAsset?: (asset: PanelDragAsset | null) => void;
  /** Open generation, optionally seeding a Remix template into its composer. */
  onOpenGeneration?: (type?: GenType, prompt?: string) => void;
  /** Audio asset's primary action: mount as the background-music bed (workbench → use-bgm). sig = local byte identity. */
  onUseAudio?: (url: string, label?: string, sig?: string | null) => void;
  /** Bumped when the generate popover closes → refetch gen history/elements. */
  genRefreshTick?: number;
}) {
  const shell = useStudioShell();
  const CuratedAssetsPanel = shell.curatedAssets?.Panel;
  const [scope, setScope] = useState<Scope>('mine');
  const [officialMounted, setOfficialMounted] = useState(scope === 'official');
  const [cloudMounted, setCloudMounted] = useState(scope === 'cloud');
  const pick = (s: Scope) => {
    setScope(s);
    if (s === 'official') setOfficialMounted(true);
    if (s === 'cloud') setCloudMounted(true);
  };

  return (
    <div className="bg-canvas flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="bg-panel flex h-8 shrink-0 items-center px-2.5">
        <div className="flex w-full rounded-md p-0.5">
          {([
            { v: 'mine' as const, label: t('panels.myAssets') },
            ...(CuratedAssetsPanel ? [{ v: 'official' as const, label: shell.curatedAssets?.label ?? t('panels.officialAssets') }] : []),
            { v: 'cloud' as const, label: t('panels.cloudAssets') },
          ]).map((s) => (
            <button
              key={s.v}
              type="button"
              onClick={() => pick(s.v)}
              className={`h-6 flex-1 rounded px-2 text-[11.5px] transition ${
                scope === s.v ? 'bg-panel-2 text-ink font-medium' : 'text-ink-4 hover:text-ink-2'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className={scope === 'mine' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
        <MyAssetsPanel
          comp={comp}
          projectId={projectId}
          cloudRegistry={localAssetIndex}
          registrySyncReady={localAssetIndexSyncReady}
          onRegistryChange={onLocalAssetIndexChange}
          videoSig={videoSig}
          mainSourceUrl={mainSourceUrl}
          hasMainSource={hasMainSource}
          onDeleteAsset={onDeleteAsset}
          isSrcLive={isSrcLive}
          onReconnectSource={onReconnectSource}
          onInsert={onInsert}
          onInsertClip={onInsertClip}
          onUseAudio={onUseAudio}
          onDragAsset={onDragAsset}
        />
      </div>
      {officialMounted && CuratedAssetsPanel && (
        <div className={scope === 'official' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
          <CuratedAssetsPanel
            comp={comp}
            onInsert={onInsert}
            onInsertClip={onInsertClip}
            onInsertKit={onInsertKit}
            onInsertElement={onInsertElement}
            onDragAsset={onDragAsset}
            onOpenGeneration={onOpenGeneration}
            onUseAudio={onUseAudio}
          />
        </div>
      )}
      {cloudMounted && (
        <div className={scope === 'cloud' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
          <CloudAssetsPanel
            comp={comp}
            projectId={projectId}
            onInsert={onInsert}
            onInsertClip={onInsertClip}
            onInsertElement={onInsertElement}
            onDragAsset={onDragAsset}
            onUseAudio={onUseAudio}
            genRefreshTick={genRefreshTick}
          />
        </div>
      )}
    </div>
  );
}
