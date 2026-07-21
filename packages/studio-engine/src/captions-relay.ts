/**
 * 字幕重铺 / 口播卡点 —— 参数化纯函数(从 workbench 组件里抽出:原版闭包在
 * clipAsrRef/compRef 上,双端要用就得把数据当参数)。
 *
 * 消费方:workbench(薄包一层喂 ref)+ server-executor(离线 MCP:标签页关着时
 * cut_narration/set_captions 在服务端跑,数据来自 studio_projects.context)。
 * 纯模块纪律:零 react/浏览器依赖(与 build-draft/build-blocks 同一档)。
 */

import { wordsFromText } from './caption-fx';
import { type Block, type VideoShot, isSentenceCaption } from './composition';
import { spans as clipSpans, srcToEditedLoose } from './trim';
import { type AsrSegment, captionBlocksFromAsr } from './build-blocks';
import { joinWords } from './caption-fx';

/** 源域匹配谓词:口播稿/转写的时间轴属于**口播源**(无 src 字段的段)。 */
export const inNarrationSource = (c: VideoShot): boolean => !c.src;

/** 把某源的转写词时间(该源坐标)映射到指定剪辑(成片坐标)并丢掉已被剪光的词——
 *  铺/重铺字幕时用:字幕块活在成片时间轴上,剪过之后不能拿源时间直接铺。 */
export function mapSegsToEdited(segs: AsrSegment[], shots: VideoShot[], inSrc: (c: VideoShot) => boolean = inNarrationSource): AsrSegment[] {
  const out: AsrSegment[] = [];
  for (const s of segs) {
    const words = (s.words?.length ? s.words : wordsFromText(s.text, s.start, s.end))
      .map((w) => {
        const start = srcToEditedLoose(shots, w.start, inSrc);
        const end = srcToEditedLoose(shots, w.end, inSrc);
        // 词宽只收不涨:词的中间被切进了插入段/剪切点时,松映射会把整段插入时长吞进词内
        // (词间反而无缝,拆条判不到)——按源域词宽封顶,让跳变落到词与词之间
        return { ...w, start, end: Math.min(end, start + (w.end - w.start) + 0.05) };
      })
      .filter((w) => w.end - w.start > 0.03);
    if (!words.length) continue;
    // 句子被剪辑打断(词与词之间被插进了其它源的片段):成片时间出现大跳变——按跳变拆成
    // 多条字幕,各自窗口贴自己的词。不拆的话一条字幕横跨整个插入段,和插入段自己的字幕
    // 叠在同一锚点上(实录:两行字幕摞在一起)。删词剪辑不产生跳变(时间被压缩),不受影响
    const groups: (typeof words)[] = [[words[0]!]];
    for (let i = 1; i < words.length; i++) {
      if (words[i]!.start - words[i - 1]!.end > 0.8) groups.push([words[i]!]);
      else groups[groups.length - 1]!.push(words[i]!);
    }
    // 译文(sub)只跟第一段:句子被插入段拆成多条时,整句译文重复铺会上下摞两份
    groups.forEach((g, gi) => out.push({ start: g[0]!.start, end: g[g.length - 1]!.end, text: joinWords(g.map((w) => w.text)), words: g, ...(gi === 0 && s.sub ? { sub: s.sub } : {}) }));
  }
  return out;
}

/** 全源转写 → 成片时间轴的字幕数据:口播源 + 各插入源各按自己的谓词映射,按成片时间排序。 */
export function mappedCaptionSegs(shots: VideoShot[], narr: AsrSegment[] | null, clipAsr: Record<string, AsrSegment[]>): AsrSegment[] {
  return [
    ...(narr?.length ? mapSegsToEdited(narr, shots) : []),
    ...Object.entries(clipAsr).flatMap(([src, segs]) => (shots.some((c) => c.src === src) ? mapSegsToEdited(segs, shots, (c) => c.src === src) : [])),
  ].sort((a, b) => a.start - b.start);
}

/** 字幕=转写的纯计算产物:转写变了(删句/删词/恢复/改词/插入段转写到位)就整层重算。
 *  没铺过字幕 → 原样返回(不主动加层);全源都没转写 → 保留现有层不清空。 */
export function relayCaptionLayer(blocks: Block[], shots: VideoShot[], narr: AsrSegment[] | null, clipAsr: Record<string, AsrSegment[]>): Block[] {
  if (!blocks.some(isSentenceCaption)) return blocks;
  const mapped = mappedCaptionSegs(shots, narr, clipAsr);
  if (!mapped.length) return blocks;
  return [...blocks.filter((b) => !isSentenceCaption(b)), ...captionBlocksFromAsr(mapped)];
}

/** 时间窗内的口播句 → 本地时间 beats(0=窗起点),给 compose 精确卡点。
 *  按镜逐段映射:窗是**成片**时间,句子是各源的**源**时间——窗盖住哪段镜,就取那段镜
 *  的源在对应源域窗口内的句子再换回成片。直接拿源秒对成片窗过滤会漂。 */
export function beatsForWindow(
  shots: VideoShot[],
  narr: AsrSegment[] | null,
  clipAsr: Record<string, AsrSegment[]>,
  startSec: number,
  durationSec: number,
): { text: string; start: number; end: number }[] {
  const winEnd = startSec + durationSec;
  const spansAll = clipSpans(shots);
  const beats: { text: string; start: number; end: number }[] = [];
  if (spansAll.length) {
    for (const sp of spansAll) {
      const ovS = Math.max(sp.editedStart, startSec);
      const ovE = Math.min(sp.editedEnd, winEnd);
      if (ovE - ovS < 0.05) continue;
      const segs = sp.clip.src ? (clipAsr[sp.clip.src] ?? []) : (narr ?? []);
      const srcFrom = sp.clip.srcStart + (ovS - sp.editedStart);
      const srcTo = sp.clip.srcStart + (ovE - sp.editedStart);
      for (const s of segs) {
        if (!s.text?.trim() || s.end <= srcFrom + 0.05 || s.start >= srcTo - 0.05) continue;
        beats.push({
          text: s.text.trim(),
          start: Math.max(0, sp.editedStart + (s.start - sp.clip.srcStart) - startSec),
          end: Math.max(0, Math.min(sp.editedStart + (s.end - sp.clip.srcStart), winEnd) - startSec),
        });
      }
    }
    beats.sort((a, b) => a.start - b.start);
  } else {
    // 无分镜(理论上占位必伴随 shots,防御):退回旧口径,成片=源
    for (const s of narr ?? []) {
      if (!s.text?.trim() || s.end <= startSec + 0.05 || s.start >= winEnd - 0.05) continue;
      beats.push({ text: s.text.trim(), start: Math.max(0, s.start - startSec), end: Math.max(0, Math.min(s.end, winEnd) - startSec) });
    }
  }
  return beats;
}

/** 插入片段 → 规划上下文(纯函数,双端同源:workbench 组规划输入 / server-executor
 *  离线 submit_plan 校验句数)。锚点 = 前最近主源段的 srcEnd(主源时间域,plan 口径);
 *  sentences = 该插入窗内的转写句(**该片段自己的源时钟**,index 按窗内重排从 0 起)
 *  ——平权分镜的输入面,顺序即 plan 契约里的 clip 序号(1 起)。 */
export function insertPlanContexts(
  shots: VideoShot[],
  clipAsr: Record<string, AsrSegment[]>,
): { atSec: number; durationSec: number; text: string; sentences?: { index: number; start: number; end: number; text: string }[] }[] {
  const out: { atSec: number; durationSec: number; text: string; sentences?: { index: number; start: number; end: number; text: string }[] }[] = [];
  let prevMainEnd = 0;
  for (const s of shots) {
    if (!s.src) {
      prevMainEnd = s.srcEnd;
      continue;
    }
    const rows = (clipAsr[s.src] ?? [])
      .filter((x) => x.text?.trim() && x.end > s.srcStart + 0.05 && x.start < s.srcEnd - 0.05)
      .slice(0, 60)
      .map((x, i) => ({ index: i, start: Math.round(x.start * 10) / 10, end: Math.round(x.end * 10) / 10, text: x.text.trim().slice(0, 160) }));
    out.push({
      atSec: Math.round(prevMainEnd * 10) / 10,
      durationSec: Math.round((s.srcEnd - s.srcStart) * 10) / 10,
      text: joinWords(rows.map((r) => r.text)).slice(0, 300),
      ...(rows.length ? { sentences: rows } : {}),
    });
  }
  return out;
}
