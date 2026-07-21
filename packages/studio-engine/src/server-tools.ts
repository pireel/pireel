/**
 * 离线 MCP 执行器 —— 标签页关着时,纯数据类工具在服务端直接操作
 * studio_projects 里的 comp + context(asr/clipAsr/plan),桥的 studio_not_open
 * 不再是死路。与浏览器 runStudioTool **共用同一批纯函数**(trim/captions-relay/
 * build-blocks/composition),语义同源不二写。
 *
 * 覆盖面 = 「已成片项目的编辑」:块增删改移/剪辑/字幕/BYO(compose_context/
 * apply_block/plan_context/submit_plan)/读稿/快照。**不覆盖**要浏览器的:
 * extract_asr、analyze_visual(视频字节不在云端)、capture_frame、add_block/
 * edit_block/add_graphics(自家 LLM 生成,浏览器打 compose)、lay_out(要
 * restoreDraftContext 的媒体恢复)、focus_element/undo(纯 UI 态)。
 *
 * 纯模块纪律:零 react/浏览器/DB 依赖——载入/落库归路由;这里只吃数据吐数据,
 * vitest 可直接钉。
 */

import {
  type Block,
  type Composition,
  type CutTransitionEffect,
  type ShotFilter,
  type TransitionDirection,
  type VideoShot,
  CAPTION_PRESETS,
  DIRECTIONAL_TRANSITIONS,
  MAX_TRANSITION_SEC,
  blockId,
  blockKind,
  freeTrack,
  getCaptionPreset,
  isSentenceCaption,
  renderBlock,
  resolveCaptionStyle,
  shotFilterCss,
  shotId,
  splitBlockedByTransition,
  totalDuration,
} from './composition';
import { parseBlockResponse } from './compose';
import { HARD_LINT_CODES, lintBlock } from './block-lint';
import { type DraftPlan, parsePlan, unifiedPlanRows } from './plan';
import { buildSituation } from './prompts';
import type { StudioProjectContext, TranscriptSegment } from './project-dto';
import { deleteClipById, removeEditedInterval, removeEditedRange, spans as clipSpans, splitAtEdited, srcToEditedLoose, trimLeftAtEdited, trimRightAtEdited } from './trim';
import { type AsrSegment, captionBlocksFromAsr } from './build-blocks';
import { beatsForWindow, inNarrationSource, insertPlanContexts, mappedCaptionSegs, relayCaptionLayer } from './captions-relay';
import { isPlaceholder, placeholderSpec } from './build-draft';

export interface ServerToolProject {
  id: string;
  title: string;
  comp: Composition;
  context: StudioProjectContext;
  videoDurationSec: number | null;
}

/** 执行结果:result 回给 MCP;comp/context 有值 = 发生变更,路由负责落库(version+1)。 */
export interface ServerToolOutcome {
  result: { ok: boolean; summary?: string; error?: string; data?: unknown; state?: string };
  comp?: Composition;
  context?: StudioProjectContext;
}

/** 离线可执行的工具集(路由据此决定 fallback 还是原样回 studio_not_open)。 */
export const SERVER_EXECUTABLE_TOOLS: ReadonlySet<string> = new Set([
  'get_state',
  'read_script',
  'get_block',
  'move_block',
  'resize_block',
  'delete_block',
  'delete_blocks',
  'duplicate_block',
  'set_shot_treatment',
  'set_video_filter',
  'split_shot',
  'trim_shot',
  'delete_shot',
  'cut_range',
  'cut_narration',
  'add_transition',
  'set_captions',
  'remove_captions',
  'set_caption_translations',
  'apply_block',
  'submit_plan',
  'plan_context',
  'compose_context',
]);

const TREATMENTS = new Set(['full', 'punch-in', 'corner-br', 'corner-tl', 'split-l', 'split-r']);
const r1 = (x: number) => Math.round(x * 10) / 10;

const asAsr = (segs: TranscriptSegment[] | undefined): AsrSegment[] => (segs ?? []) as AsrSegment[];
const clipAsrOf = (ctx: StudioProjectContext): Record<string, AsrSegment[]> => (ctx.clipAsr ?? {}) as Record<string, AsrSegment[]>;

/** shots 兜底(workbench ensureShots 同口径):没切过镜 = 整条一镜(时长取行里的 videoDurationSec)。 */
function shotsOf(p: ServerToolProject): VideoShot[] {
  if (p.comp.shots?.length) return p.comp.shots;
  const dur = p.comp.video?.durationSec ?? p.videoDurationSec ?? 0;
  return dur > 0 ? [{ id: shotId(), srcStart: 0, srcEnd: dur, treatment: 'full' }] : [];
}

/** 离线局势快照:与浏览器 getChatBody 同一形状(buildSituation 同源),前缀离线声明。 */
function offlineState(p: ServerToolProject): string {
  const c = p.comp;
  const tag = new Map<string, string>();
  for (const s of c.shots ?? []) if (s.src && !tag.has(s.src)) tag.set(s.src, String.fromCharCode(65 + tag.size));
  const cs = c.blocks.some(isSentenceCaption) ? resolveCaptionStyle(c) : null;
  const situation = buildSituation({
    composition: {
      durationSec: totalDuration(c),
      theme: c.theme,
      ...(cs ? { captions: { preset: cs.preset, yPct: Math.round(cs.yPct) } } : {}),
      blocks: c.blocks.map((b) => ({
        id: b.id,
        label: b.label,
        kind: blockKind(b),
        startSec: b.startSec,
        durationSec: b.durationSec,
        ...(isPlaceholder(b) ? { placeholder: true } : {}),
      })),
      shots: clipSpans(c.shots ?? []).map((sp, i) => ({
        id: sp.clip.id,
        index: i + 1,
        editedStart: sp.editedStart,
        editedEnd: sp.editedEnd,
        srcStart: sp.clip.srcStart,
        srcEnd: sp.clip.srcEnd,
        treatment: sp.clip.treatment,
        ...(sp.clip.src ? { source: tag.get(sp.clip.src) } : {}),
      })),
    },
    pipeline: { asr: !!p.context.asr?.length, plan: !!p.context.plan, visual: false },
  });
  return `<composition_state>\nOFFLINE MODE — the studio tab is NOT open. Operating directly on cloud project "${p.title}" (${p.id}). Video-dependent tools (extract_asr, analyze_visual, capture_frame, lay_out, visual_brief, export_video, Pireel-LLM generation) need the tab: open one yourself via create_browser_handoff {project_id:"${p.id}"} in your built-in browser (never the OS default browser), or ask the user to open the project.\n${situation}\n</composition_state>`;
}

/** 离线口播稿(浏览器 transcriptForAgent 同格式)。 */
function offlineTranscript(p: ServerToolProject): string {
  const rd = (x: number) => Math.round(x * 10) / 10;
  const row = (s: TranscriptSegment, i: number) => `  ${i}. [${rd(s.start)}–${rd(s.end)}s] ${s.text}`;
  const parts: string[] = [];
  parts.push(
    `MAIN NARRATION (source-video seconds — never shift when the video is cut; shot src in→out uses the same clock):\n${(p.context.asr ?? []).map(row).join('\n')}`,
  );
  const bySrc = new Map<string, string[]>();
  for (const s of p.comp.shots ?? []) {
    if (!s.src) continue;
    bySrc.set(s.src, [...(bySrc.get(s.src) ?? []), s.id]);
  }
  for (const [src, ids] of bySrc) {
    const segs = p.context.clipAsr?.[src];
    const head = `INSERTED CLIP for shot(s) ${ids.map((x) => `@${x}`).join(', ')} (its OWN source seconds)`;
    parts.push(segs?.length ? `${head}:\n${segs.map(row).join('\n')}` : `${head}: (no transcript stored)`);
  }
  const out = parts.join('\n');
  return out.length > 4000 ? `${out.slice(0, 4000)}\n…(truncated)` : out;
}

/** 执行一个离线工具。调用前先用 SERVER_EXECUTABLE_TOOLS 过滤。 */
export function runServerTool(tool: string, input: Record<string, unknown>, p: ServerToolProject): ServerToolOutcome {
  const c = p.comp;
  const findBlock = (id: unknown) => c.blocks.find((b) => b.id === id);
  const bname = (b: Block) => b.label?.slice(0, 10) || blockKind(b);

  switch (tool) {
    case 'get_state':
      return { result: { ok: true, state: offlineState(p) } };
    case 'read_script': {
      if (!p.context.asr?.length) return { result: { ok: false, error: '云端没有口播稿——open the studio tab and run extract_asr first' } };
      return { result: { ok: true, summary: '已读取口播稿(云端)', data: { transcript: offlineTranscript(p) } } };
    }
    case 'get_block': {
      const b = findBlock(input.blockId);
      if (!b) return { result: { ok: false, error: '找不到这个组件' } };
      const r = renderBlock(b);
      return {
        result: {
          ok: true,
          summary: `「${bname(b)}」`,
          data: {
            id: b.id,
            kind: blockKind(b),
            label: b.label,
            startSec: b.startSec,
            durationSec: b.durationSec,
            trackIndex: b.trackIndex,
            box: b.box ?? null,
            innerHtml: r.innerHtml.slice(0, 4000),
            timelineBody: r.timelineBody.slice(0, 2000),
          },
        },
      };
    }
    case 'move_block': {
      const b = findBlock(input.blockId);
      if (!b) return { result: { ok: false, error: '找不到这个组件' } };
      const s = Number(input.startSec);
      if (!Number.isFinite(s)) return { result: { ok: false, error: 'startSec 不合法' } };
      const start = Math.max(0, Math.round(s * 100) / 100);
      return {
        result: { ok: true, summary: `已把「${bname(b)}」移到 ${r1(start)}s` },
        comp: { ...c, blocks: c.blocks.map((x) => (x.id === b.id ? { ...x, startSec: start } : x)) },
      };
    }
    case 'resize_block': {
      const b = findBlock(input.blockId);
      if (!b) return { result: { ok: false, error: '找不到这个组件' } };
      const s = Number(input.startSec);
      const d = Number(input.durationSec);
      if (!Number.isFinite(s) || !Number.isFinite(d)) return { result: { ok: false, error: 'startSec/durationSec 不合法' } };
      const start = Math.max(0, Math.round(s * 100) / 100);
      const dur = Math.max(0.3, Math.round(d * 100) / 100);
      return {
        result: { ok: true, summary: `已把「${bname(b)}」改到 ${r1(start)}–${r1(start + dur)}s` },
        comp: { ...c, blocks: c.blocks.map((x) => (x.id === b.id ? { ...x, startSec: start, durationSec: dur } : x)) },
      };
    }
    case 'delete_block': {
      const b = findBlock(input.blockId);
      if (!b) return { result: { ok: false, error: '找不到这个组件' } };
      return { result: { ok: true, summary: `已删除「${bname(b)}」` }, comp: { ...c, blocks: c.blocks.filter((x) => x.id !== b.id) } };
    }
    case 'delete_blocks': {
      const ids = Array.isArray(input.blockIds) ? new Set((input.blockIds as unknown[]).map(String)) : null;
      if (!ids?.size) return { result: { ok: false, error: '缺少 blockIds' } };
      const hit = c.blocks.filter((b) => ids.has(b.id));
      if (!hit.length) return { result: { ok: false, error: '找不到这些组件' } };
      return { result: { ok: true, summary: `已删除 ${hit.length} 个组件` }, comp: { ...c, blocks: c.blocks.filter((b) => !ids.has(b.id)) } };
    }
    case 'duplicate_block': {
      const b = findBlock(input.blockId);
      if (!b) return { result: { ok: false, error: '找不到这个组件' } };
      const at = typeof input.atSec === 'number' ? Math.max(0, input.atSec) : b.startSec + b.durationSec;
      const nb: Block = { ...b, id: blockId('ai'), startSec: at, trackIndex: freeTrack(c.blocks, at, b.durationSec) };
      return { result: { ok: true, summary: `已复制「${bname(b)}」`, data: { newBlockId: nb.id } }, comp: { ...c, blocks: [...c.blocks, nb] } };
    }
    case 'set_shot_treatment': {
      const shots = shotsOf(p);
      const s = shots.find((x) => x.id === input.shotId);
      if (!s) return { result: { ok: false, error: '找不到这个分镜' } };
      const t = String(input.treatment);
      if (!TREATMENTS.has(t)) return { result: { ok: false, error: `treatment 不合法:${t}` } };
      return {
        result: { ok: true, summary: `已把分镜取景改为 ${t}` },
        comp: { ...c, shots: shots.map((x) => (x.id === s.id ? { ...x, treatment: t as VideoShot['treatment'] } : x)) },
      };
    }
    case 'set_video_filter': {
      const shots = shotsOf(p);
      const s = shots.find((x) => x.id === input.shotId);
      if (!s) return { result: { ok: false, error: '找不到这个分镜' } };
      const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
      const f: ShotFilter = {
        ...(num(input.brightness) != null ? { brightness: num(input.brightness) } : {}),
        ...(num(input.contrast) != null ? { contrast: num(input.contrast) } : {}),
        ...(num(input.saturate) != null ? { saturate: num(input.saturate) } : {}),
      };
      const css = shotFilterCss(f);
      const next = shots.map((x) => {
        if (x.id !== s.id) return x;
        const { filter: _drop, ...rest } = x;
        return css === 'none' ? rest : { ...rest, filter: f };
      });
      return {
        result: { ok: true, summary: css === 'none' ? '已还原这个分镜的调色' : `已调色:${css}` },
        comp: { ...c, shots: next },
      };
    }
    case 'split_shot': {
      const shots = shotsOf(p);
      if (!shots.length) return { result: { ok: false, error: '还没有视频轨' } };
      const at = Number(input.atSec);
      if (!Number.isFinite(at)) return { result: { ok: false, error: '离线模式必须给 atSec(没有播放头)' } };
      if (splitBlockedByTransition(shots, at)) {
        return { result: { ok: false, error: '这个点在转场覆盖区内,不能分割——先 add_transition {atSec, effect:"none"} 移除转场' } };
      }
      const r = splitAtEdited(shots, at, (base, srcStart, srcEnd) => ({ ...base, id: shotId(), srcStart, srcEnd }));
      if (!r.removed && r.clips === shots) return { result: { ok: false, error: '这个时间点剪不开(太靠边或落在边界上)' } };
      return { result: { ok: true, summary: `已在 ${r1(at)}s 剪开`, data: { shotIds: r.clips.map((s) => s.id) } }, comp: { ...c, shots: r.clips } };
    }
    case 'trim_shot': {
      const shots = shotsOf(p);
      if (!shots.length) return { result: { ok: false, error: '还没有视频轨' } };
      const at = Number(input.atSec);
      if (!Number.isFinite(at)) return { result: { ok: false, error: '离线模式必须给 atSec(没有播放头)' } };
      const side = input.side === 'left' ? 'left' : 'right';
      const r = side === 'left' ? trimLeftAtEdited(shots, at) : trimRightAtEdited(shots, at);
      if (!r.removed) return { result: { ok: false, error: '这个位置裁不了(不在镜内)' } };
      const blocks = removeEditedInterval(c.blocks, r.removed[0], r.removed[1]);
      return {
        result: { ok: true, summary: `已裁掉 ${r1(at)}s ${side === 'left' ? '左' : '右'}侧的画面` },
        comp: { ...c, shots: r.clips, blocks: relayCaptionLayer(blocks, r.clips, asAsr(p.context.asr), clipAsrOf(p.context)) },
      };
    }
    case 'delete_shot': {
      const shots = shotsOf(p);
      const r = deleteClipById(shots, String(input.shotId));
      if (!r.removed) return { result: { ok: false, error: shots.length <= 1 ? '只剩一段,删不了' : '找不到这个分镜' } };
      const blocks = removeEditedInterval(c.blocks, r.removed[0], r.removed[1]);
      return {
        result: { ok: true, summary: '已删除这个场景' },
        comp: { ...c, shots: r.clips, blocks: relayCaptionLayer(blocks, r.clips, asAsr(p.context.asr), clipAsrOf(p.context)) },
      };
    }
    case 'cut_range':
    case 'cut_narration': {
      const shots = shotsOf(p);
      if (!shots.length) return { result: { ok: false, error: '还没有视频轨' } };
      // cut_narration 收源秒(ranges),先换成成片秒;cut_range 直接成片秒
      let ranges: { from: number; to: number }[];
      if (tool === 'cut_narration') {
        const raw = Array.isArray(input.ranges) ? input.ranges : [];
        ranges = raw
          .map((r) => {
            const o = (r ?? {}) as Record<string, unknown>;
            return { from: Number(o.fromSec), to: Number(o.toSec) };
          })
          .filter((r) => Number.isFinite(r.from) && Number.isFinite(r.to) && r.to - r.from > 0.05)
          .map((r) => ({ from: srcToEditedLoose(shots, r.from, inNarrationSource), to: srcToEditedLoose(shots, r.to, inNarrationSource) }))
          .filter((r) => r.to - r.from > 0.05)
          .sort((a, b) => b.from - a.from);
      } else {
        const from = Number(input.fromSec);
        const to = Number(input.toSec);
        if (!Number.isFinite(from) || !Number.isFinite(to) || to - from < 0.1) return { result: { ok: false, error: 'fromSec/toSec 不合法' } };
        ranges = [{ from, to }];
      }
      if (!ranges.length) return { result: { ok: false, error: 'ranges 为空/不合法,或这些区间在成片里已不存在' } };
      let curShots = shots;
      let blocks = c.blocks;
      let removedCount = 0;
      for (const e of ranges) {
        const rr = removeEditedRange(curShots, e.from, e.to, (base, srcStart, srcEnd) => ({ ...base, id: shotId(), srcStart, srcEnd }));
        if (!rr.removed) continue;
        curShots = rr.clips;
        blocks = removeEditedInterval(blocks, rr.removed[0], rr.removed[1]);
        removedCount++;
      }
      if (!removedCount) return { result: { ok: false, error: '这些区间删不了(可能覆盖了整条视频)' } };
      const relaid = relayCaptionLayer(blocks, curShots, asAsr(p.context.asr), clipAsrOf(p.context));
      return {
        result: { ok: true, summary: tool === 'cut_narration' ? `已按口播稿删了 ${removedCount} 段` : '已删除指定区间的画面' },
        comp: { ...c, shots: curShots, blocks: relaid },
      };
    }
    case 'add_transition': {
      const at = Number(input.atSec);
      if (!Number.isFinite(at) || at < 0) return { result: { ok: false, error: 'atSec 不合法' } };
      const sp = clipSpans(shotsOf(p));
      const bi = sp.findIndex((s, idx) => idx >= 1 && Math.abs(s.editedStart - at) < 0.3);
      if (bi < 1) return { result: { ok: false, error: `atSec 必须是分镜切点(边界:${sp.slice(1).map((s) => r1(s.editedStart)).join(', ')}s)——转场是两镜内容的交接` } };
      const cut = sp[bi]!.editedStart;
      const selfId = sp[bi]!.clip.id;
      const prevId = sp[bi - 1]!.clip.id;
      const remove = input.effect === 'none' || input.remove === true;
      const effect: CutTransitionEffect = typeof input.effect === 'string' && ['fade', 'fadeblack', 'directional', 'directionalwipe', 'circleopen', 'windowslice', 'crosszoom', 'rotatescale', 'glitch', 'dreamy'].includes(input.effect) ? (input.effect as CutTransitionEffect) : 'fade';
      const dir = typeof input.direction === 'string' && ['up', 'down', 'left', 'right'].includes(input.direction) ? (input.direction as TransitionDirection) : undefined;
      const durIn = Number(input.durationSec);
      const shots = shotsOf(p).map((s) => {
        if (s.id !== selfId) return s;
        const { transIn: _drop, ...rest } = s;
        if (remove) return rest;
        const durationSec = Math.min(MAX_TRANSITION_SEC, Math.max(0.2, Number.isFinite(durIn) && durIn > 0 ? durIn : (s.transIn?.durationSec ?? 1)));
        const direction = dir ?? s.transIn?.direction;
        return { ...rest, transIn: { prevId, effect, durationSec, ...(DIRECTIONAL_TRANSITIONS.has(effect) && direction ? { direction } : {}) } };
      });
      return {
        result: { ok: true, summary: remove ? `已移除 ${r1(cut)}s 处的转场` : `已在 ${r1(cut)}s 的切点设转场(${effect})` },
        comp: { ...c, shots },
      };
    }
    case 'set_captions': {
      const preset = typeof input.preset === 'string' ? input.preset : undefined;
      if (preset && !CAPTION_PRESETS.some((x) => x.id === preset)) return { result: { ok: false, error: `没有这个字幕预设:${preset}` } };
      const yPct = Number(input.yPct);
      const scale = Number(input.scale);
      const patch: Record<string, number> = {};
      if (Number.isFinite(yPct)) patch.yPct = yPct;
      if (Number.isFinite(scale)) patch.scale = scale;
      if (!preset && !Object.keys(patch).length) return { result: { ok: false, error: '没说要设什么:preset / yPct / scale 至少给一个' } };
      let blocks = c.blocks;
      if (preset) {
        if (!p.context.asr?.length) return { result: { ok: false, error: '云端没有口播稿,铺不了字幕——open the studio tab and run extract_asr first' } };
        const caps = captionBlocksFromAsr(mappedCaptionSegs(shotsOf(p), asAsr(p.context.asr), clipAsrOf(p.context)));
        if (!caps.length) return { result: { ok: false, error: '口播稿是空的,生成不了字幕' } };
        blocks = [...c.blocks.filter((b) => !isSentenceCaption(b)), ...caps];
      }
      const style = { ...resolveCaptionStyle({ ...c, blocks }), ...(preset ? { preset } : {}), ...patch };
      return {
        result: { ok: true, summary: `已${preset ? '设' : '调'}字幕:${getCaptionPreset(style.preset).name}` },
        comp: { ...c, blocks, captionStyle: style },
      };
    }
    case 'remove_captions': {
      if (!c.blocks.some(isSentenceCaption)) return { result: { ok: false, error: '现在没有字幕' } };
      const { captionStyle: _drop, ...rest } = c;
      return { result: { ok: true, summary: '已移除字幕' }, comp: { ...rest, blocks: c.blocks.filter((b) => !isSentenceCaption(b)) } };
    }
    case 'set_caption_translations': {
      // 译文写在转写句上(context.asr/clipAsr 的 sub 字段)——剪辑/换预设的重铺自动带出
      const clear = input.clear === true;
      const items = (Array.isArray(input.items) ? input.items : [])
        .map((it) => {
          const o = (it ?? {}) as Record<string, unknown>;
          return { index: Number(o.index), text: typeof o.text === 'string' ? o.text.trim() : null };
        })
        .filter((it): it is { index: number; text: string } => Number.isInteger(it.index) && it.index >= 0 && it.text !== null);
      if (!clear && !items.length) return { result: { ok: false, error: 'items 为空/不合法(要 {index, text}[],index 是 read_script 的行号)' } };
      const stripSub = (segs: TranscriptSegment[] | undefined) => segs?.map(({ sub: _s, ...rest }) => rest);
      let ctx: StudioProjectContext;
      let summary: string;
      if (clear) {
        ctx = {
          ...p.context,
          ...(p.context.asr ? { asr: stripSub(p.context.asr) } : {}),
          ...(p.context.clipAsr ? { clipAsr: Object.fromEntries(Object.entries(p.context.clipAsr).map(([k, v]) => [k, stripSub(v)!])) } : {}),
        };
        summary = '已清除全部字幕译文';
      } else {
        const shotIdIn = typeof input.shotId === 'string' ? input.shotId : undefined;
        const src = shotIdIn ? shotsOf(p).find((s) => s.id === shotIdIn)?.src : undefined;
        if (shotIdIn && !src) return { result: { ok: false, error: '这个 shotId 不是插入片段(主口播不要传 shotId)' } };
        const segs = src ? p.context.clipAsr?.[src] : p.context.asr;
        if (!segs?.length) return { result: { ok: false, error: src ? '这个插入片段没有转写' : '云端没有口播稿——open the studio tab and run extract_asr first' } };
        const bad = items.filter((it) => it.index >= segs.length);
        if (bad.length) return { result: { ok: false, error: `index 越界:${bad.map((b) => b.index).join(', ')}(该转写共 ${segs.length} 句,行号见 read_script)` } };
        const next = segs.map((s, i) => {
          const hit = items.find((it) => it.index === i);
          if (!hit) return s;
          const { sub: _s, ...rest } = s;
          return hit.text ? { ...rest, sub: hit.text } : rest;
        });
        ctx = src ? { ...p.context, clipAsr: { ...p.context.clipAsr, [src]: next } } : { ...p.context, asr: next };
        summary = `已配 ${items.filter((it) => it.text).length} 句译文`;
      }
      const captionsOn = c.blocks.some(isSentenceCaption);
      const blocks = captionsOn ? relayCaptionLayer(c.blocks, shotsOf(p), asAsr(ctx.asr), clipAsrOf(ctx)) : c.blocks;
      return {
        result: { ok: true, summary: captionsOn ? summary : `${summary}(字幕未开启,set_captions 后显示)` },
        comp: { ...c, blocks },
        context: ctx,
      };
    }
    case 'apply_block': {
      const raw = typeof input.raw === 'string' ? input.raw : '';
      if (!raw.trim()) return { result: { ok: false, error: 'raw required(compose_block_brief 简报生成的原文)' } };
      const bid = typeof input.blockId === 'string' ? input.blockId : undefined;
      const target = bid ? findBlock(bid) : undefined;
      if (bid && !target) return { result: { ok: false, error: '找不到这个组件' } };
      const fb = target && !isPlaceholder(target) ? renderBlock(target) : { innerHtml: '<div></div>', timelineBody: '' };
      const applyId = target?.id ?? blockId('ai');
      const parsed = parseBlockResponse(raw, fb);
      const issues = lintBlock({ blockId: applyId, innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody });
      const hard = issues.filter((i) => HARD_LINT_CODES.has(i.code));
      if (hard.length) {
        return { result: { ok: false, error: '没通过静态检查——只修列出的问题,其余保持原样,再 apply_block 一次', data: { issues: issues.map((i) => i.message) } } };
      }
      const warnings = issues.length ? { warnings: issues.map((i) => i.message) } : {};
      if (target) {
        return {
          result: { ok: true, summary: isPlaceholder(target) ? `已填充「${target.label ?? '图形'}」` : `已更新「${bname(target)}」`, data: { blockId: target.id, ...warnings } },
          comp: {
            ...c,
            blocks: c.blocks.map((x) => (x.id === target.id ? { ...x, templateId: 'custom', slots: { innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody } } : x)),
          },
        };
      }
      const at = typeof input.atSec === 'number' ? Math.min(Math.max(0, input.atSec), totalDuration(c)) : 0;
      const dur = typeof input.durationSec === 'number' && input.durationSec >= 0.3 ? input.durationSec : 3;
      const nb: Block = {
        id: applyId,
        templateId: 'custom',
        slots: { innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody },
        startSec: at,
        durationSec: dur,
        trackIndex: freeTrack(c.blocks, at, dur),
        label: (typeof input.label === 'string' && input.label ? input.label : '新组件').slice(0, 12),
      };
      return { result: { ok: true, summary: '已添加组件', data: { newBlockId: nb.id, ...warnings } }, comp: { ...c, blocks: [...c.blocks, nb] } };
    }
    case 'submit_plan': {
      if (!p.context.asr?.length) return { result: { ok: false, error: '云端没有口播稿(规划挂在句子索引上)' } };
      const text = typeof input.plan === 'string' ? input.plan : JSON.stringify(input.plan ?? {});
      // 统一叙事流(与浏览器 plan_context 同一交织纯函数):全局行号场景在装配层分解回主/插入段
      const insCtx = insertPlanContexts(p.comp.shots ?? [], clipAsrOf(p.context));
      const planRows = unifiedPlanRows(
        (p.context.asr ?? []).map((x, i) => ({ index: i, text: x.text, start: x.start, end: x.end })),
        insCtx,
      );
      let plan: DraftPlan;
      try {
        plan = parsePlan(text, planRows);
      } catch (e) {
        return { result: { ok: false, error: `规划解析失败:${e instanceof Error ? e.message : String(e)}` } };
      }
      if (!plan.scenes.length) return { result: { ok: false, error: '没有有效场景——重新生成再提交' } };
      return {
        result: { ok: true, summary: `已接收规划 · ${plan.scenes.length} 个场景(lay_out 需要打开 studio 标签页跑)`, data: { scenes: plan.scenes.length } },
        context: { ...p.context, plan },
      };
    }
    case 'plan_context': {
      if (!p.context.asr?.length) return { result: { ok: false, error: '云端没有口播稿——open the studio tab and run extract_asr first' } };
      return {
        result: {
          ok: true,
          summary: '已取规划上下文(云端;无画面提示)',
          data: {
            sentences: p.context.asr.map((s, i) => ({ index: i, text: s.text, start: s.start, end: s.end })),
            videoDurationSec: p.comp.video?.durationSec ?? p.videoDurationSec ?? 0,
            theme: c.theme,
          },
        },
      };
    }
    case 'compose_context': {
      const script = (p.context.asr ?? []).map((s) => s.text).join('');
      const base = { theme: c.theme, ...(c.palette ? { palette: c.palette } : {}), ...(c.frameId ? { frameId: c.frameId } : {}) };
      const bid = typeof input.blockId === 'string' ? input.blockId : undefined;
      if (bid) {
        const b = findBlock(bid);
        if (!b) return { result: { ok: false, error: '找不到这个组件' } };
        if (isPlaceholder(b)) {
          const boxPx = b.box ? { w: Math.round(b.box.w * c.width), h: Math.round(b.box.h * c.height) } : undefined;
          const beats = beatsForWindow(shotsOf(p), asAsr(p.context.asr), clipAsrOf(p.context), b.startSec, b.durationSec);
          return {
            result: {
              ok: true,
              summary: '已取占位上下文(云端)',
              data: {
                ...base,
                block: { id: b.id, kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: b.label ?? '图形', durationSec: b.durationSec, ...(boxPx ? { boxPx } : {}) },
                context: { ...(script ? { script } : {}), ...(beats.length ? { beats } : {}) },
                suggested_instruction: placeholderSpec(b),
              },
            },
          };
        }
        return {
          result: {
            ok: true,
            summary: '已取块上下文(云端)',
            data: { ...base, block: { id: b.id, kind: blockKind(b), ...renderBlock(b), label: b.label }, ...(script ? { context: { script } } : {}) },
          },
        };
      }
      const at = typeof input.atSec === 'number' ? Math.min(Math.max(0, input.atSec), totalDuration(c)) : 0;
      return {
        result: {
          ok: true,
          summary: '已取新组件上下文(云端)',
          data: { ...base, atSec: at, block: { id: blockId('ai'), kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: '新组件' }, ...(script ? { context: { script } } : {}) },
        },
      };
    }
    default:
      return { result: { ok: false, error: `offline executor does not support ${tool}` } };
  }
}
