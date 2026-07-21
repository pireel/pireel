'use client';

/**
 * 右侧 rail 的口播稿面板(Descript 式转写驱动剪辑):整篇稿子是**词级纯文本流**——
 * 点一个词弹出「删除 / 替换」;划词选中多个词 = 批量删除;句间空白内联成 (…9.4s) 标记,
 * 点它可删。删词/删空白 = 删掉对应视频区间(源时间 → 当前剪辑映射在 workbench cutSrcRanges)。
 * 顶部批量动作:一键删空白、删语气词(嗯/呃…,需真词级时间戳)。
 * 面板只算不剪——剪切/替换走回调(workbench 统一做 undo 快照/块压缩/花字同步)。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Scissors, ScrollText } from 'lucide-react';
import { wordsFromText } from '@pireel/studio-engine/caption-fx';
import type { VideoShot } from '@pireel/studio-engine/composition';
import { srcToEditedLoose } from '@pireel/studio-engine/trim';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { t } from './i18n';

/** 句间空白判定阈值(秒):短于这个的停顿是正常呼吸,不算"空白"。 */
const MIN_SILENCE_SEC = 0.8;
/** 删空白时两侧各留的缓冲(秒):贴边剪会吃掉尾音。 */
const CUT_PAD_SEC = 0.12;
/** 语气词(整词匹配,保守清单——"那个/就是"常有实义,不碰)。 */
const FILLER_RE = /^(嗯+|呃+|唔+|诶+|额+|um+|uh+|emm+|hmm+)[,。,.!?!?…]?$/i;

export type SrcRange = [number, number];
/** 带源的剪切/恢复单元:src=null 为口播源,否则为插入源的 src 键——各源时间轴独立。 */
export type ScriptCut = { src: string | null; range: SrcRange };
type Word = { text: string; start: number; end: number };

/** 稿子是多源的:每句属于一个源(口播源 src=null / 插入源 src=该段的 src 键),
 *  源时间运算(在场判定/删/恢复/seek)只和**同源**片段求交——不同文件的秒数会数值撞车。 */
const inSrcOf = (src: string | null) => (c: VideoShot) => (c.src ?? null) === src;

/** 某源的 src 区间在当前剪辑下是否还有残留(被剪光的词/句=已删)。 */
function srcRangeAlive(shots: VideoShot[], src: string | null, s: number, e: number): boolean {
  return shots.some((c) => (c.src ?? null) === src && Math.min(c.srcEnd, e) - Math.max(c.srcStart, s) > 0.04);
}

/** 稿子里的一句:seg 属于哪个源 + 源内句序 + 成片落点(排序键,句子按成片顺序插排)。 */
type SentItem = { src: string | null; si: number; seg: AsrSegment; words: Word[]; at: number };

type Popover =
  | { kind: 'word'; src: string | null; si: number; word: Word; x: number; y: number }
  | { kind: 'deadword'; src: string | null; word: Word; x: number; y: number }
  | { kind: 'gap'; range: SrcRange; x: number; y: number }
  | { kind: 'deadgap'; range: SrcRange; x: number; y: number }
  | { kind: 'sel'; cut: { items: ScriptCut[]; count: number } | null; restore: { items: ScriptCut[]; count: number } | null; x: number; y: number };

export function ScriptPanel({
  sentences,
  clipSentences,
  shots,
  videoDurationSec,
  extracting,
  onExtract,
  onSeek,
  onCut,
  onRestore,
  onReplaceWord,
}: {
  sentences: AsrSegment[] | null;
  /** 插入源的转写(键=shot.src):句子时间是**该源文件**自己的时间轴。 */
  clipSentences: Record<string, AsrSegment[]>;
  shots: VideoShot[];
  videoDurationSec: number;
  /** ASR 提取进行中(按钮转圈防连点)。 */
  extracting: boolean;
  onExtract: () => void;
  /** 跳到某处(成片时间)。 */
  onSeek: (editedSec: number) => void;
  /** 剪掉一批(源,源时间区间);msg = 成功 toast 文案。 */
  onCut: (cuts: ScriptCut[], msg: string) => void;
  /** 恢复一批已删的(源,源时间区间)(点已删的词)。 */
  onRestore: (cuts: ScriptCut[], msg: string) => void;
  /** 替换某源某句里的一个词(按词时间戳定位;同步已铺花字)。 */
  onReplaceWord: (src: string | null, si: number, word: Word, text: string) => void;
}) {
  const sents = useMemo(() => sentences ?? [], [sentences]);
  // 全源句流:口播句 + 各插入源的句(词流真词级优先,没有按字符占比估算),
  // 按各自源→成片的落点插排——插入片段的稿子出现在它在片子里的位置
  const items = useMemo(() => {
    const out: SentItem[] = [];
    sents.forEach((seg, si) =>
      out.push({ src: null, si, seg, words: seg.words?.length ? seg.words : wordsFromText(seg.text, seg.start, seg.end), at: srcToEditedLoose(shots, seg.start, inSrcOf(null)) }),
    );
    for (const [src, list] of Object.entries(clipSentences)) {
      if (!shots.some((c) => c.src === src)) continue; // 该源已整个不在片子里
      list.forEach((seg, si) =>
        out.push({ src, si, seg, words: seg.words?.length ? seg.words : wordsFromText(seg.text, seg.start, seg.end), at: srcToEditedLoose(shots, seg.start, inSrcOf(src)) }),
      );
    }
    return out.sort((a, b) => a.at - b.at || a.si - b.si);
  }, [sents, clipSentences, shots]);
  const hasTrueWords = items.some((it) => it.seg.words?.length);

  // 空白 = 句间(含片头/片尾)无语音区,留缓冲后仍 ≥ 阈值。已删的**留在流里划横线**(同删词口径),
  // 不消失。只算口播源(插入源的静音段是画面本体,不当"空白"批量剪)
  const gaps = useMemo(() => {
    if (!sents.length || videoDurationSec <= 0) return [] as { after: number; range: SrcRange; alive: boolean }[];
    const out: { after: number; range: SrcRange; alive: boolean }[] = [];
    const bounds: { after: number; a: number; b: number }[] = [{ after: -1, a: 0, b: sents[0]!.start }];
    for (let i = 0; i < sents.length - 1; i++) bounds.push({ after: i, a: sents[i]!.end, b: sents[i + 1]!.start });
    bounds.push({ after: sents.length - 1, a: sents[sents.length - 1]!.end, b: videoDurationSec });
    for (const { after, a, b } of bounds) {
      const from = a + CUT_PAD_SEC;
      const to = b - CUT_PAD_SEC;
      if (to - from >= MIN_SILENCE_SEC) out.push({ after, range: [from, to], alive: srcRangeAlive(shots, null, from, to) });
    }
    return out;
  }, [sents, videoDurationSec, shots]);
  const silences = useMemo(() => gaps.filter((g) => g.alive), [gaps]);
  const silenceTotal = silences.reduce((a, { range: [s, e] }) => a + (e - s), 0);
  const gapAfter = useMemo(() => new Map(gaps.map((g) => [g.after, g])), [gaps]);

  // 语气词:必须有真词级时间戳(估算时间不敢自动批量下剪刀;手动点删由用户自己判断)。全源参与
  const fillers = useMemo(() => {
    if (!hasTrueWords) return [] as { src: string | null; range: SrcRange; text: string }[];
    const out: { src: string | null; range: SrcRange; text: string }[] = [];
    for (const it of items) {
      for (const w of it.seg.words ?? []) {
        if (FILLER_RE.test(w.text.trim()) && w.end - w.start > 0.05 && srcRangeAlive(shots, it.src, w.start, w.end)) {
          out.push({ src: it.src, range: [Math.max(0, w.start - 0.02), w.end + 0.02], text: w.text.trim() });
        }
      }
    }
    return out;
  }, [items, hasTrueWords, shots]);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const [pop, setPop] = useState<Popover | null>(null);
  const [replacing, setReplacing] = useState(''); // 替换输入(pop.kind==='word' 时)
  const [replaceMode, setReplaceMode] = useState(false);
  useEffect(() => {
    if (!pop) return;
    const close = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-script-pop]')) return;
      setPop(null);
      setReplaceMode(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [pop]);

  /** 面板内坐标(popover 绝对定位口径)。 */
  const localXY = (clientX: number, clientY: number) => {
    const r = rootRef.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  };

  const openWordPop = (e: React.MouseEvent, it: SentItem, word: Word) => {
    e.stopPropagation();
    const { x, y } = localXY(e.clientX, e.clientY);
    setPop({ kind: 'word', src: it.src, si: it.si, word, x, y: y + 14 });
    setReplaceMode(false);
    setReplacing(word.text);
    onSeek(srcToEditedLoose(shots, word.start, inSrcOf(it.src)));
  };

  /** 划词多选:mouseup 收拢选区覆盖到的词——在场的可批量删,已删的可批量恢复(混选两个动作都给)。
   *  按源分组:各源时间轴独立,删除区间不能跨源合并。 */
  const onMouseUp = (e: React.MouseEvent) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !rootRef.current) return;
    const nodes = [...rootRef.current.querySelectorAll<HTMLElement>('[data-w]')].filter((el) => sel.containsNode(el, true));
    if (nodes.length < 2) return; // 单词走点击弹层
    const aliveBySrc = new Map<string | null, { lo: number; hi: number; n: number }>();
    const deadBySrc = new Map<string | null, SrcRange[]>();
    let deadN = 0;
    for (const el of nodes) {
      const ws = Number(el.dataset.ws);
      const we = Number(el.dataset.we);
      const src = el.dataset.src || null;
      if (!Number.isFinite(ws) || we <= ws) continue;
      if (srcRangeAlive(shots, src, ws, we)) {
        const g = aliveBySrc.get(src) ?? { lo: Infinity, hi: -Infinity, n: 0 };
        g.lo = Math.min(g.lo, ws);
        g.hi = Math.max(g.hi, we);
        g.n++;
        aliveBySrc.set(src, g);
      } else {
        // 相邻已删词的 pad 互相重叠 → 合并成连续区间(restoreSrcRange 对重复恢复本就免疫)
        const a = Math.max(0, ws - 0.02);
        const b = we + 0.02;
        const rs = deadBySrc.get(src) ?? [];
        const last = rs[rs.length - 1];
        if (last && a <= last[1] + 0.05) last[1] = Math.max(last[1], b);
        else rs.push([a, b]);
        deadBySrc.set(src, rs);
        deadN++;
      }
    }
    const aliveN = [...aliveBySrc.values()].reduce((a, g) => a + g.n, 0);
    const cut = aliveN > 0 ? { items: [...aliveBySrc.entries()].map(([src, g]) => ({ src, range: [Math.max(0, g.lo - 0.02), g.hi + 0.02] as SrcRange })), count: aliveN } : null;
    const restore = deadN > 0 ? { items: [...deadBySrc.entries()].flatMap(([src, rs]) => rs.map((range) => ({ src, range }))), count: deadN } : null;
    if (!cut && !restore) return;
    const { x, y } = localXY(e.clientX, e.clientY);
    setPop({ kind: 'sel', cut, restore, x, y: y + 14 });
  };

  if (!items.length) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <PanelHeader hint={t('删词 = 删对应画面')} />
        <div className="text-ink-4 flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-[11.5px]">
          <ScrollText size={22} />
          {t('还没有口播稿——提取后就能用稿子剪视频:点词删词、划词批量删、一键清空白')}
          <button
            type="button"
            onClick={onExtract}
            disabled={extracting}
            className="bg-ink text-bg inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium disabled:opacity-50"
          >
            {extracting ? <Loader2 size={12} className="animate-spin" /> : <ScrollText size={12} />}
            {extracting ? t('提取中…') : t('提取口播稿')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col" ref={rootRef}>
      <PanelHeader hint={hasTrueWords ? t('点词删/换 · 划词批量删 · (…s)=空白') : t('点词删/换(词级时间为句内估算)· 划词批量删')} />
      {/* 批量动作 */}
      <div className="border-line flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
        <button
          type="button"
          disabled={!silences.length}
          onClick={() => onCut(silences.map((g) => ({ src: null, range: g.range })), t('已删除 {n} 处空白(共 {sec}s)', { n: silences.length, sec: silenceTotal.toFixed(1) }))}
          title={silences.length ? t('删除句间 ≥{sec}s 的无语音段', { sec: MIN_SILENCE_SEC }) : t('没有可删的空白段')}
          className="border-line text-ink-2 hover:text-ink inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] disabled:opacity-40"
        >
          <Scissors size={11} /> {silences.length ? t('删空白({n} 处 · {sec}s)', { n: silences.length, sec: silenceTotal.toFixed(1) }) : t('删空白')}
        </button>
        <button
          type="button"
          disabled={!fillers.length}
          onClick={() => onCut(fillers.map((f) => ({ src: f.src, range: f.range })), t('已删除 {n} 个语气词', { n: fillers.length }))}
          title={hasTrueWords ? (fillers.length ? fillers.map((f) => f.text).join(' ') : t('没检测到语气词')) : t('转写缺少词级时间戳,无法批量删')}
          className="border-line text-ink-2 hover:text-ink inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] disabled:opacity-40"
        >
          <Scissors size={11} /> {fillers.length ? t('删语气词({n})', { n: fillers.length }) : t('删语气词')}
        </button>
      </div>
      {/* 词级纯文本流:点词弹删/换,划词多选,空白内联 (…9.4s);已删的词/空白留在流里划横线。
          横向永不滚:西文词间补空格给断行机会,break-words 兜底超长 token(URL/长数字) */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden break-words px-3 py-2.5 text-[13px] leading-[1.9]" onMouseUp={onMouseUp}>
        {gapAfter.has(-1) && (
          <GapToken
            gap={gapAfter.get(-1)!}
            onClick={(e) => {
              const g = gapAfter.get(-1)!;
              setPop({ kind: g.alive ? 'gap' : 'deadgap', range: g.range, ...localXY(e.clientX, e.clientY + 14) });
            }}
          />
        )}
        {items.map((it) => (
          <span key={`${it.src ?? 'n'}:${it.si}`}>
            {it.words.map((w, wi) => {
              const alive = srcRangeAlive(shots, it.src, w.start, w.end);
              const picked = pop?.kind === 'word' && pop.src === it.src && pop.si === it.si && Math.abs(pop.word.start - w.start) < 1e-3 && Math.abs(pop.word.end - w.end) < 1e-3;
              const pickedDead = pop?.kind === 'deadword' && pop.src === it.src && Math.abs(pop.word.start - w.start) < 1e-3 && Math.abs(pop.word.end - w.end) < 1e-3;
              return (
                <span
                  key={wi}
                  data-w
                  data-ws={w.start}
                  data-we={w.end}
                  data-src={it.src ?? ''}
                  onClick={(e) => {
                    if (alive) {
                      openWordPop(e, it, w);
                    } else {
                      e.stopPropagation();
                      setPop({ kind: 'deadword', src: it.src, word: w, ...localXY(e.clientX, e.clientY + 14) });
                    }
                  }}
                  title={alive ? undefined : t('已删,点击可恢复')}
                  className={
                    alive
                      ? `text-ink cursor-pointer rounded-sm px-[1px] ${picked ? 'bg-accent/25 ring-accent/60 ring-1' : 'hover:bg-accent/15'}`
                      : `text-ink-4 cursor-pointer rounded-sm px-[1px] line-through opacity-60 ${pickedDead ? 'bg-accent/20 ring-accent/50 ring-1' : 'hover:opacity-90'}`
                  }
                >
                  {w.text}
                </span>
              );
            })
              // 西文词界补空格:相邻 span 间没有空白 = 英文句连成一个不可断长串(既丑又撑出横向滚动)
              .flatMap((node, wi, arr) => (wi < arr.length - 1 && needsSpace(it.words[wi]!.text, it.words[wi + 1]!.text) ? [node, ' '] : [node]))}
            {it.src === null && gapAfter.has(it.si) && (
              <GapToken
                gap={gapAfter.get(it.si)!}
                onClick={(e) => {
                  const g = gapAfter.get(it.si)!;
                  setPop({ kind: g.alive ? 'gap' : 'deadgap', range: g.range, ...localXY(e.clientX, e.clientY + 14) });
                }}
              />
            )}{' '}
          </span>
        ))}
      </div>

      {/* 弹层:词(删/换)· 空白(删)· 多选(批量删) */}
      {pop && (
        <div
          data-script-pop
          className="border-line bg-panel absolute z-50 flex items-center gap-1 rounded-lg border px-1.5 py-1 shadow-xl"
          style={{ left: Math.max(8, Math.min(pop.x - 40, 240)), top: pop.y }}
        >
          {pop.kind === 'word' && !replaceMode && (
            <>
              <button
                type="button"
                onClick={() => {
                  onCut([{ src: pop.src, range: [Math.max(0, pop.word.start - 0.02), pop.word.end + 0.02] }], t('已删「{word}」', { word: pop.word.text }));
                  setPop(null);
                }}
                className="text-ink-2 hover:text-destructive px-1.5 py-0.5 text-[11.5px]"
              >
                {t('删除')}
              </button>
              <div className="bg-line h-3.5 w-px" />
              <button type="button" onClick={() => setReplaceMode(true)} className="text-ink-2 hover:text-ink px-1.5 py-0.5 text-[11.5px]">
                {t('替换')}
              </button>
            </>
          )}
          {pop.kind === 'word' && replaceMode && (
            <>
              <input
                autoFocus
                value={replacing}
                onChange={(e) => setReplacing(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && replacing.trim()) {
                    onReplaceWord(pop.src, pop.si, pop.word, replacing.trim());
                    setPop(null);
                    setReplaceMode(false);
                  }
                  if (e.key === 'Escape') {
                    setPop(null);
                    setReplaceMode(false);
                  }
                }}
                className="border-line bg-panel-2 text-ink w-24 rounded border px-1.5 py-0.5 text-[11.5px] outline-none"
                aria-label={t('替换词')}
              />
              <button
                type="button"
                disabled={!replacing.trim()}
                onClick={() => {
                  onReplaceWord(pop.src, pop.si, pop.word, replacing.trim());
                  setPop(null);
                  setReplaceMode(false);
                }}
                className="text-accent px-1 py-0.5 text-[11.5px] font-medium disabled:opacity-40"
              >
                {t('确定')}
              </button>
            </>
          )}
          {pop.kind === 'deadword' && (
            <button
              type="button"
              onClick={() => {
                onRestore([{ src: pop.src, range: [Math.max(0, pop.word.start - 0.02), pop.word.end + 0.02] }], t('已恢复「{word}」', { word: pop.word.text }));
                setPop(null);
              }}
              className="text-ink-2 hover:text-ink px-1.5 py-0.5 text-[11.5px]"
            >
              {t('恢复「{word}」', { word: pop.word.text })}
            </button>
          )}
          {pop.kind === 'gap' && (
            <button
              type="button"
              onClick={() => {
                onCut([{ src: null, range: pop.range }], t('已删除 {sec}s 空白', { sec: (pop.range[1] - pop.range[0]).toFixed(1) }));
                setPop(null);
              }}
              className="text-ink-2 hover:text-destructive px-1.5 py-0.5 text-[11.5px]"
            >
              {t('删除这段空白({sec}s)', { sec: (pop.range[1] - pop.range[0]).toFixed(1) })}
            </button>
          )}
          {pop.kind === 'deadgap' && (
            <button
              type="button"
              onClick={() => {
                onRestore([{ src: null, range: pop.range }], t('已恢复 {sec}s 空白', { sec: (pop.range[1] - pop.range[0]).toFixed(1) }));
                setPop(null);
              }}
              className="text-ink-2 hover:text-ink px-1.5 py-0.5 text-[11.5px]"
            >
              {t('恢复这段空白({sec}s)', { sec: (pop.range[1] - pop.range[0]).toFixed(1) })}
            </button>
          )}
          {pop.kind === 'sel' && (
            <>
              {pop.cut && (
                <button
                  type="button"
                  onClick={() => {
                    onCut(pop.cut!.items, t('已删除所选 {n} 个词', { n: pop.cut!.count }));
                    setPop(null);
                    window.getSelection()?.removeAllRanges();
                  }}
                  className="text-ink-2 hover:text-destructive px-1.5 py-0.5 text-[11.5px]"
                >
                  {t('删除所选({n} 词)', { n: pop.cut.count })}
                </button>
              )}
              {pop.cut && pop.restore && <div className="bg-line h-3.5 w-px" />}
              {pop.restore && (
                <button
                  type="button"
                  onClick={() => {
                    onRestore(pop.restore!.items, t('已恢复所选 {n} 个词', { n: pop.restore!.count }));
                    setPop(null);
                    window.getSelection()?.removeAllRanges();
                  }}
                  className="text-ink-2 hover:text-ink px-1.5 py-0.5 text-[11.5px]"
                >
                  {t('恢复所选({n} 词)', { n: pop.restore.count })}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** 西文词界要不要补空格:前词以 ASCII 词字符/句点类结尾 且 后词以 ASCII 词字符开头。
 *  中文词界不补(字间本就可断行,补了会撑开视觉);ASR 的英文词通常不自带空格。 */
function needsSpace(cur: string, next: string): boolean {
  return /[A-Za-z0-9.,!?;:'")\]%]$/.test(cur) && /^[A-Za-z0-9('"[$]/.test(next);
}

/** 空白标记:(…9.4s)。在场=点删;已删=划横线留在流里,点它可恢复(与词的删/恢复同口径)。 */
function GapToken({ gap, onClick }: { gap: { range: SrcRange; alive: boolean }; onClick: (e: React.MouseEvent) => void }) {
  const label = `(…${(gap.range[1] - gap.range[0]).toFixed(1)}s)`;
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      title={gap.alive ? t('无语音空白,点击可删') : t('已删的空白,点击可恢复')}
      className={
        gap.alive
          ? 'text-ink-4 hover:text-ink hover:bg-panel-2 mx-0.5 cursor-pointer rounded px-1 font-mono text-[11px]'
          : 'text-ink-4 hover:bg-panel-2 mx-0.5 cursor-pointer rounded px-1 font-mono text-[11px] line-through opacity-60 hover:opacity-90'
      }
    >
      {label}
    </span>
  );
}

/** 标题归浮窗头部,这里只剩一行说明。 */
function PanelHeader({ hint }: { hint: string }) {
  return <div className="border-line text-ink-4 border-b px-3 py-1.5 text-[10.5px]">{hint}</div>;
}
