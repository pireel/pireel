'use client';

import { useMemo, useState } from 'react';
import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { t } from './i18n';

export const DIRECTOR_SCENE_STRIP_H = 52;

export interface TimelineDirectorScene {
  id: string;
  label: string;
  startSec: number;
  endSec: number;
  purpose: string;
  visualTreatment?: string;
  assetStrategy?: string;
  clipCount: number;
}

export interface DirectorSceneGeometry extends TimelineDirectorScene {
  left: number;
  width: number;
}

export function timelineDirectorScenesFromDocument(document: EditorDocumentV2): TimelineDirectorScene[] {
  const plan = document.semantics.directorPlan;
  if (!plan) return [];
  const semanticScenes = new Map(document.semantics.scenes.map((scene) => [scene.id, scene] as const));
  return plan.scenes.map((scene) => ({
    id: scene.id,
    label: scene.label,
    startSec: scene.startFrame / document.canvas.fps,
    endSec: (scene.startFrame + scene.durationFrames) / document.canvas.fps,
    purpose: scene.purpose,
    ...(scene.visualTreatment ? { visualTreatment: scene.visualTreatment } : {}),
    ...(scene.assetStrategy ? { assetStrategy: scene.assetStrategy } : {}),
    clipCount: semanticScenes.get(scene.id)?.clipIds.length ?? 0,
  }));
}

/** Pure geometry shared by the strip and its regression tests. */
export function directorSceneGeometry(
  scenes: readonly TimelineDirectorScene[],
  pps: number,
): DirectorSceneGeometry[] {
  return scenes
    .filter((scene) => Number.isFinite(scene.startSec) && Number.isFinite(scene.endSec) && scene.endSec > scene.startSec)
    .map((scene) => ({
      ...scene,
      left: Math.max(0, scene.startSec) * pps,
      width: Math.max(10, (scene.endSec - Math.max(0, scene.startSec)) * pps - 2),
    }));
}

const colors = [
  'bg-accent/12 ring-accent/30 hover:bg-accent/20',
  'bg-sky-500/12 ring-sky-400/30 hover:bg-sky-500/20',
  'bg-slate-400/12 ring-slate-300/25 hover:bg-slate-400/20',
];

export function DirectorSceneStrip({
  scenes,
  pps,
  onSeek,
}: {
  scenes: readonly TimelineDirectorScene[];
  pps: number;
  onSeek: (second: number) => void;
}) {
  const geometry = useMemo(() => directorSceneGeometry(scenes, pps), [scenes, pps]);
  const [selectedId, setSelectedId] = useState<string | null>(geometry[0]?.id ?? null);
  const selected = geometry.find((scene) => scene.id === selectedId) ?? geometry[0];
  if (!selected) return null;
  const detail = [
    `${t('panels.directorScenePurpose')}: ${selected.purpose}`,
    selected.visualTreatment ? `${t('panels.directorSceneVisual')}: ${selected.visualTreatment}` : '',
    selected.assetStrategy ? `${t('panels.directorSceneAssets')}: ${selected.assetStrategy}` : '',
    t('panels.directorSceneLinkedClips', { n: selected.clipCount }),
  ].filter(Boolean).join(' · ');

  return (
    <div
      data-director-scene-strip
      className="border-line bg-panel-2/55 relative border-b"
      style={{ height: DIRECTOR_SCENE_STRIP_H }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onMouseMove={(event) => event.stopPropagation()}
    >
      <div className="text-ink-3 sticky left-0 z-20 flex h-7 w-fit max-w-[min(680px,calc(100vw-160px))] items-center gap-1.5 bg-panel/95 px-2 text-[9px] shadow-[8px_0_12px_rgba(0,0,0,0.08)]" title={detail}>
        <span className="text-ink shrink-0 font-semibold">{selected.label}</span>
        <span className="shrink-0 font-mono tabular-nums">{selected.startSec.toFixed(1)}–{selected.endSec.toFixed(1)}s</span>
        <span className="truncate">{detail}</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-6">
        {geometry.map((scene, index) => {
          const active = scene.id === selected.id;
          const title = `${scene.label} · ${scene.startSec.toFixed(1)}–${scene.endSec.toFixed(1)}s\n${scene.purpose}\n${scene.visualTreatment ?? ''}\n${scene.assetStrategy ?? ''}`.trim();
          return (
            <button
              key={scene.id}
              type="button"
              data-director-scene-id={scene.id}
              aria-pressed={active}
              aria-label={title}
              title={title}
              className={`absolute inset-y-0 overflow-hidden rounded-sm px-1.5 text-left text-[9px] ring-1 transition ${colors[index % colors.length]} ${active ? 'z-10 ring-2 ring-accent' : ''}`}
              style={{ left: scene.left, width: scene.width }}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedId(scene.id);
                onSeek(scene.startSec + Math.min(0.01, (scene.endSec - scene.startSec) / 2));
              }}
            >
              <span className="text-ink block truncate font-medium">{scene.label} · {scene.clipCount}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
