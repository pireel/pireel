'use client';

/**
 * 成片流水线三步(提取口播稿 / 分析口播稿→规划 / 分析画面),被 agent 工具复用。
 *
 * 读/写走 ref(工具内连跑多步要取最新,setState 是异步的);agent 可以同一步**并行**
 * 调多个工具(分析口播稿 ‖ 分析画面,各自一张卡各自进度)—— step 函数做在飞去重:
 * 同一阶段只跑一份,后来者共享同一个 promise。
 * report = 把友好文案/进度推给正在跑的工具卡片(setToolProgress 由调用方按工具 id 包好)。
 */

import { useRef, type MutableRefObject } from 'react';
import type { Composition } from '@pireel/studio-engine/composition';
import type { DraftPlan, PlanInsert } from '@pireel/studio-engine/plan';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { studioProviders } from '@pireel/studio-engine/providers';
import { type VisualTimeline, analyzeVisual } from './visual';
import { t } from './i18n';

export interface DraftPipelineDeps {
  videoFileRef: MutableRefObject<File | null>;
  compRef: MutableRefObject<Composition>;
  asrRef: MutableRefObject<AsrSegment[] | null>;
  planRef: MutableRefObject<DraftPlan | null>;
  visualRef: MutableRefObject<VisualTimeline | null>;
  setAsrSentences: (v: AsrSegment[]) => void;
  setPlan: (v: DraftPlan) => void;
  setVisual: (v: VisualTimeline | null) => void;
  setComp: (updater: (c: Composition) => Composition) => void;
  /** 当前视频(blob 预览 URL + 画布尺寸),无视频返回 null。 */
  currentVideo: () => { url: string; durationSec: number; width: number; height: number } | null;
  /** 插入片段的规划上下文(多源主轨):按需转写后给出锚点/时长/内容。
   *  没有插入段返回 [];缺省 = 不带(规划当它们不存在,配图会乱——踩过)。 */
  getInsertedClips?: () => Promise<PlanInsert[]>;
}

export function useDraftPipeline(deps: DraftPipelineDeps) {
  const { videoFileRef, compRef, asrRef, planRef, visualRef, setAsrSentences, setPlan, setVisual, setComp, currentVideo } = deps;

  const inflightRef = useRef<{ asr?: Promise<AsrSegment[]>; plan?: Promise<DraftPlan>; visual?: Promise<VisualTimeline | null> }>({});
  function dedup<K extends 'asr' | 'plan' | 'visual', T>(key: K, run: () => Promise<T>): Promise<T> {
    const inflight = inflightRef.current[key] as Promise<T> | undefined;
    if (inflight) return inflight;
    const p = run().finally(() => {
      inflightRef.current[key] = undefined;
    });
    (inflightRef.current as Record<string, unknown>)[key] = p;
    return p;
  }

  /** 提取口播稿:只 ASR(lib 缓存)+ 存句子。**不铺字幕、不切镜**(字幕默认关、设计图形为主;
   *  分镜结构由 lay_out 按场景建)。返回句子。 */
  function stepAsr(report?: (text: string) => void): Promise<AsrSegment[]> {
    if (asrRef.current?.length) return Promise.resolve(asrRef.current);
    return dedup('asr', async () => {
      const vf = videoFileRef.current;
      if (!vf) throw new Error(t('先上传口播视频'));
      report?.(t('提取口播稿…'));
      const segs = await studioProviders().transcriber.transcribe(vf);
      asrRef.current = segs;
      setAsrSentences(segs);
      return segs;
    });
  }

  /** 分析口播稿:规划整片演法。需要句子(没有则先提取)。
   *  画面提示「有则用之」:画面分析已完成就按句带上(录屏别配图/framing 方向),没有不等待。 */
  function stepPlan(report?: (text: string) => void): Promise<DraftPlan> {
    if (planRef.current) return Promise.resolve(planRef.current);
    return dedup('plan', () => stepPlanInner(report));
  }
  async function stepPlanInner(report?: (text: string) => void): Promise<DraftPlan> {
    const segs = asrRef.current?.length ? asrRef.current : await stepAsr(report);
    const v = currentVideo();
    const vis = visualRef.current;
    const visuals = vis?.segments.length
      ? segs.map((s, i) => {
          const mid = (s.start + s.end) / 2;
          const seg = vis.segments.find((x) => mid >= x.start - 0.01 && mid < x.end + 0.01) ?? vis.segments.at(-1)!;
          return { index: i, content: seg.label.content, safe: seg.label.safe };
        })
      : null;
    // 插入片段上下文:先按需转写再拿(失败不挡规划——宁可少上下文也别断链路)
    const inserts = await (deps.getInsertedClips?.().catch(() => [] as PlanInsert[]) ?? Promise.resolve([] as PlanInsert[]));
    report?.(t('分析口播稿…'));
    const planResp = await studioProviders().planner.plan({
      sentences: segs.map((s, i) => ({ index: i, text: s.text, start: s.start, end: s.end })),
      videoDurationSec: v?.durationSec ?? 0,
      theme: compRef.current.theme,
      ...(visuals ? { visuals } : {}),
      ...(inserts.length ? { inserts } : {}),
    });
    // 空规划(模型输出没解析出场景)绝不缓存 —— 缓存了会让分镜永远切不出占位,配图一直报「先分镜」
    if (!planResp.scenes?.length) throw new Error(t('规划没有产出场景,请再说一次「分析口播稿」重试'));
    planRef.current = planResp;
    setPlan(planResp);
    return planResp;
  }

  /** 分析画面:本地逐帧(MediaPipe 安全区 + VLM)。按实测速率外推 ETA 推进度。失败返回 null。 */
  function stepVisual(report?: (text: string, frac?: number) => void): Promise<VisualTimeline | null> {
    if (visualRef.current) return Promise.resolve(visualRef.current);
    return dedup('visual', () => stepVisualInner(report));
  }
  async function stepVisualInner(report?: (text: string, frac?: number) => void): Promise<VisualTimeline | null> {
    const vf = videoFileRef.current;
    const v = currentVideo();
    if (!vf || !v) return null;
    // 总帧数 = min(180, 时长×2fps);先按标定 ~0.13s/帧给初始预估,再用实测速率刷新
    const total = Math.min(180, Math.max(1, Math.floor(v.durationSec * 2)));
    const start = performance.now();
    report?.(t('分析画面… 预计约 {sec}s', { sec: Math.max(2, Math.ceil(total * 0.13)) }), 0);
    // 进度分数只来自 MediaPipe 几何遍;VLM 语义/调色并行且无逐帧进度 → 几何按 85% 折算,
    // 几何跑完切「语义分析」文案定在 90%,别报 100% 却还在跑(收尾由卡片显示「收尾中」)。
    const vis = await analyzeVisual(vf, v.durationSec, (done, tot) => {
      const g = tot > 0 ? done / tot : 0;
      if (g >= 1) {
        report?.(t('画面语义/调色分析…'), 0.9);
        return;
      }
      const frac = g * 0.85;
      const elapsed = (performance.now() - start) / 1000;
      const eta = (g > 0.06 ? elapsed / g - elapsed : total * 0.13 - elapsed) + 2; // +2s 语义遍余量
      report?.(t('分析画面 {pct}% · 约剩 {sec}s', { pct: Math.round(frac * 100), sec: Math.max(1, Math.ceil(eta)) }), frac);
    }).catch(() => null);
    if (vis) {
      visualRef.current = vis;
      setVisual(vis);
      // 底色派生的调色板挂到 composition → assembleHtml 注 #root、compose 透传给 LLM(轻度融入)。
      // 挂了 frame(frameId)时不覆盖:frame 是用户显式选的设计系统,画面派生只是缺省来源
      if (vis.palette) setComp((c) => (c.frameId ? c : { ...c, palette: vis.palette }));
    }
    return vis;
  }

  return { stepAsr, stepPlan, stepVisual };
}
