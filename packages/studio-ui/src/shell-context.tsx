/**
 * StudioShell — the UI injection surface between the editor package and the host shell (SaaS/OSS).
 * The hosted shell injects SaaS knowledge like the credits card and generation-params table; the OSS
 * shell can omit everything and the panels degrade gracefully.
 * Capability injection goes through the engine's StudioProviders (data/services); this context handles
 * browser-safe host extensions such as presentation slots, catalog metadata, and host-payload migrations.
 */

import { createContext, useContext, type ComponentType } from 'react';
import type { Composition, EditorDocumentV2, MediaRef } from '@pireel/studio-engine/composition';
import type { PanelDragAsset, PanelMediaAsset } from './asset-card';
import type { GenElementResult } from './element-history';

export interface ShellQualityOpt {
  value: string;
  label: string;
  credits?: number;
}
export interface ShellQualityConfig {
  options: ShellQualityOpt[];
  default: string;
}

/** Browser-safe catalog metadata. Full Skill Markdown stays in the host's server bundle. */
export interface StudioScenarioSkillOption {
  id: string;
  title: string;
  summary: string;
  /** Compact picker mark; presentation only, never included in the model prompt. */
  icon?: string;
}

export type StudioGenerationType = 'image' | 'video' | 'element' | 'audio';

export interface StudioCuratedAssetsPanelProps {
  comp: Composition;
  onInsert: (asset: MediaRef, label?: string, dims?: { w: number; h: number }) => void;
  onInsertClip?: (asset: PanelMediaAsset) => void;
  onInsertKit?: (component: string, props?: Record<string, unknown>) => void;
  onInsertElement: (element: GenElementResult, prompt: string) => void;
  onDragAsset?: (asset: PanelDragAsset | null) => void;
  onOpenGeneration?: (type?: StudioGenerationType, prompt?: string) => void;
  onUseAudio?: (url: string, label?: string, sig?: string | null) => void;
}

export interface StudioAudioTemplateGalleryProps {
  onUseTemplate: (prompt: string, durationSec?: number) => void;
}

export interface StudioShell {
  /** Insufficient-credits card (SaaS billing piece; omitted = not rendered). */
  CreditsCard?: ComponentType<{ need: number; balance: number }>;
  /** Generation model params table (quality/duration/resolution; omitted = panel hides the matching selectors). */
  modelParams?: {
    qualityConfigFor(modelId: string): ShellQualityConfig | null;
    videoDurationOptions(modelId: string): string[];
    videoResolutionOptions(modelId: string): string[];
  };
  /** Host-owned expert catalog. Omitted means the OSS editor runs with generic automatic routing only. */
  scenarioSkills?: readonly StudioScenarioSkillOption[];
  /** Initial Skill for a fresh hosted conversation; ignored unless present in scenarioSkills. */
  defaultScenarioSkillId?: string;
  /** Host-owned curated media surface. Omitted means OSS renders only project-local and cloud assets. */
  curatedAssets?: {
    label?: string;
    Panel: ComponentType<StudioCuratedAssetsPanelProps>;
    AudioTemplateGallery?: ComponentType<StudioAudioTemplateGalleryProps>;
  };
  /** Optional one-way migration for payloads created by host-owned templates or catalogs. */
  migrateProjectPayload?: (document: EditorDocumentV2, composition: Composition) => {
    document: EditorDocumentV2;
    composition: Composition;
  };
}

const Ctx = createContext<StudioShell>({});

export const StudioShellProvider = Ctx.Provider;
export const useStudioShell = (): StudioShell => useContext(Ctx);
