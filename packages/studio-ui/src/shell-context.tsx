/**
 * StudioShell — the UI injection surface between the editor package and the host shell (SaaS/OSS).
 * The hosted shell injects SaaS knowledge like the credits card and generation-params table; the OSS
 * shell can omit everything and the panels degrade gracefully.
 * Capability injection goes through the engine's StudioProviders (data/services); this handles only
 * **presentation-layer** slots.
 */

import { createContext, useContext, type ComponentType } from 'react';

export interface ShellQualityOpt {
  value: string;
  label: string;
  credits?: number;
}
export interface ShellQualityConfig {
  options: ShellQualityOpt[];
  default: string;
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
}

const Ctx = createContext<StudioShell>({});

export const StudioShellProvider = Ctx.Provider;
export const useStudioShell = (): StudioShell => useContext(Ctx);
