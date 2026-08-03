'use client';

/**
 * Assets library shell — the 素材 slot of the rail's primary nav, split into three scopes:
 *  - My assets (the current project's LOCAL media, never uploaded)  → my-assets-panel
 *  - Official assets (kit components + stickers + BGM)              → official-assets-panel
 *  - Cloud assets (uploads + generated media + saved elements)      → cloud-assets-panel
 * The scope is a segmented switch (persisted). "My" stays mounted so imported blob URLs and
 * scroll survive scope hops; "Official"/"Cloud" mount on first visit (one manifest/library
 * fetch) and then also stay. Card/tile/lightbox primitives live in asset-card.
 */

import { useState } from 'react';
import type { Composition, MediaRef } from '@pireel/studio-engine/composition';
import type { LocalAssetIndexEntry } from '@pireel/studio-engine/project-dto';
import type { GenElementResult } from './element-history';
import type { PanelDragAsset, PanelMediaAsset } from './asset-card';
import { MyAssetsPanel } from './my-assets-panel';
import { OfficialAssetsPanel } from './official-assets-panel';
import { CloudAssetsPanel } from './cloud-assets-panel';
import { t } from './i18n';

export type { PanelDragAsset } from './asset-card';
export type GenType = 'image' | 'video' | 'element' | 'audio';

const SCOPE_KEY = 'studio.assetsPanel.scope';
type Scope = 'mine' | 'official' | 'cloud';

export function AssetsPanel({
  comp,
  projectId,
  localAssetIndex,
  localAssetIndexSyncReady,
  onLocalAssetIndexChange,
  videoSig,
  onDeleteAsset,
  isSrcLive,
  onReconnectSource,
  onInsert,
  onInsertClip,
  onInsertElement,
  onInsertKit,
  onDragAsset,
  onOpenGen,
  onUseAudio,
  genRefreshTick = 0,
}: {
  /** Element live preview needs theme/canvas (BlockPreviewFrame). */
  comp: Composition;
  /** Scopes "My"'s local-import registry (imports persist per project across refreshes). */
  projectId?: string;
  /** Cloud-synced metadata only; MyAssetsPanel merges it with this browser's local registry. */
  localAssetIndex?: LocalAssetIndexEntry[];
  /** Wait until cloud/local project hydration finishes before publishing this browser's merged index. */
  localAssetIndexSyncReady?: boolean;
  onLocalAssetIndexChange?: (entries: LocalAssetIndexEntry[]) => void;
  /** First-loaded source's fileSig (workbench-held, not in comp) — "My" labels it by filename. */
  videoSig?: string | null;
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
  /** Open the generate popover (owned by workbench; anchor = trigger button rect, popover pops out nearby). */
  onOpenGen: (type: GenType, anchor?: DOMRect) => void;
  /** Audio asset's primary action: mount as the background-music bed (workbench → use-bgm). sig = local byte identity. */
  onUseAudio?: (url: string, label?: string, sig?: string | null) => void;
  /** Bumped when the generate popover closes → refetch gen history/elements. */
  genRefreshTick?: number;
}) {
  const [scope, setScope] = useState<Scope>(() => {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem(SCOPE_KEY) : null;
    return v === 'official' || v === 'cloud' ? v : 'mine';
  });
  const [officialMounted, setOfficialMounted] = useState(scope === 'official');
  const [cloudMounted, setCloudMounted] = useState(scope === 'cloud');
  const pick = (s: Scope) => {
    setScope(s);
    if (s === 'official') setOfficialMounted(true);
    if (s === 'cloud') setCloudMounted(true);
    try {
      window.localStorage.setItem(SCOPE_KEY, s);
    } catch {
      /* private mode can't write; scope just resets next session */
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="px-2.5 pt-2">
        <div className="bg-panel border-line flex rounded-md border p-0.5">
          {(
            [
              { v: 'mine', label: 'panels.myAssets' },
              { v: 'official', label: 'panels.officialAssets' },
              { v: 'cloud', label: 'panels.cloudAssets' },
            ] as { v: Scope; label: string }[]
          ).map((s) => (
            <button
              key={s.v}
              type="button"
              onClick={() => pick(s.v)}
              className={`flex-1 rounded px-2 py-1 text-[11.5px] transition ${
                scope === s.v ? 'bg-panel-2 text-ink font-medium' : 'text-ink-4 hover:text-ink-2'
              }`}
            >
              {t(s.label)}
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
          onDeleteAsset={onDeleteAsset}
          isSrcLive={isSrcLive}
          onReconnectSource={onReconnectSource}
          onInsert={onInsert}
          onInsertClip={onInsertClip}
          onUseAudio={onUseAudio}
          onDragAsset={onDragAsset}
        />
      </div>
      {officialMounted && (
        <div className={scope === 'official' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
          <OfficialAssetsPanel comp={comp} onInsert={onInsert} onInsertKit={onInsertKit} onDragAsset={onDragAsset} onUseAudio={onUseAudio} />
        </div>
      )}
      {cloudMounted && (
        <div className={scope === 'cloud' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
          <CloudAssetsPanel
            comp={comp}
            onInsert={onInsert}
            onInsertClip={onInsertClip}
            onInsertElement={onInsertElement}
            onDragAsset={onDragAsset}
            onOpenGen={onOpenGen}
            onUseAudio={onUseAudio}
            genRefreshTick={genRefreshTick}
          />
        </div>
      )}
    </div>
  );
}
