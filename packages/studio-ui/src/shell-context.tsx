/**
 * StudioShell —— 编辑器包与宿主壳(SaaS/OSS)之间的 UI 注入面。
 * 托管壳注入计费卡、生成参数表等 SaaS 知识;OSS 壳可全部缺省,面板优雅降级。
 * 能力类注入走 engine 的 StudioProviders(数据/服务);这里只管**呈现层**插槽。
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
  /** 积分不足卡(SaaS 计费件;缺省=不渲染)。 */
  CreditsCard?: ComponentType<{ need: number; balance: number }>;
  /** 生成模型参数表(质量档/时长/分辨率;缺省=面板隐藏对应选择器)。 */
  modelParams?: {
    qualityConfigFor(modelId: string): ShellQualityConfig | null;
    videoDurationOptions(modelId: string): string[];
    videoResolutionOptions(modelId: string): string[];
  };
}

const Ctx = createContext<StudioShell>({});

export const StudioShellProvider = Ctx.Provider;
export const useStudioShell = (): StudioShell => useContext(Ctx);
