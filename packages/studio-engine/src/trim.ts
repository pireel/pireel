/**
 * 成片裁主流剪辑器射核心(纯函数,无 DOM)。
 *
 * 模型:视频被切成有序「片段(clip)」,每段是源视频上的一个保留区间 [srcStart, srcEnd)。
 * 成片(edited)时间轴 = 各片段源区间**首尾相接**(被剪掉的源区间在成片里不存在)。
 *   - 片段 i 的成片起点 = 前面所有片段的源长度之和。
 *   - 成片总时长 = Σ 各片段源长度。
 * 字幕/演法等叠加块用**成片时间**;剪掉一段源footage后,该段对应的成片区间被移除,
 * 后面的块整体左移(removeEditedInterval)。
 *
 * 增删改查:
 *   · 改/查 = editedToSrc / spans / editedDuration(成片↔源 映射)
 *   · 增 = splitAtEdited(在播放头把片段一分为二)
 *   · 删/裁 = trimLeftAtEdited / trimRightAtEdited / deleteAtEdited(剪掉源footage,返回被移除的成片区间)
 * 裁剪类操作返回 { clips, removed },removed=[a,b] 是成片时间里被抹掉的区间,交给
 * removeEditedInterval 压缩叠加块。
 */

const EPS = 0.05; // 贴边保护:播放头离片段两端太近不允许切/裁

export interface Clip {
  srcStart: number;
  srcEnd: number;
}

/** 片段源长度(成片时长贡献)。 */
export function clipLen(c: Clip): number {
  return Math.max(0, c.srcEnd - c.srcStart);
}

/** 成片总时长 = Σ 片段源长度。 */
export function editedDuration(clips: Clip[]): number {
  return clips.reduce((a, c) => a + clipLen(c), 0);
}

export interface ClipSpan<T extends Clip> {
  clip: T;
  index: number;
  /** 该片段在成片时间轴的起点 / 终点。 */
  editedStart: number;
  editedEnd: number;
}

/** 每个片段在成片时间轴上的区间(首尾相接)。 */
export function spans<T extends Clip>(clips: T[]): ClipSpan<T>[] {
  let acc = 0;
  return clips.map((clip, index) => {
    const editedStart = acc;
    acc += clipLen(clip);
    return { clip, index, editedStart, editedEnd: acc };
  });
}

/**
 * 成片时间 → 落在哪个片段 + 对应源时间。edited 夹到 [0, 总时长];空片段返回 null。
 * 约定:edited 落在片段边界时归到前一个片段(末端取 srcEnd)。
 */
export function editedToSrc(clips: Clip[], edited: number): { index: number; src: number } | null {
  if (!clips.length) return null;
  const total = editedDuration(clips);
  const te = Math.max(0, Math.min(total, edited));
  let acc = 0;
  for (let i = 0; i < clips.length; i++) {
    const l = clipLen(clips[i]!);
    if (te <= acc + l || i === clips.length - 1) {
      return { index: i, src: clips[i]!.srcStart + (te - acc) };
    }
    acc += l;
  }
  return null;
}

/**
 * 源域匹配谓词:多源主轨下各片段可来自不同源文件,srcStart/srcEnd 是**各自文件**的时间轴。
 * 源时间域运算(词映射/删句/恢复)只许和**同一个源**(通常=被转写的口播源)的片段求交,
 * 其它源的片段跳过匹配、只贡献成片长度 —— 否则两个文件的秒数会数值撞车(实录:删口播
 * 某句会把插入片段误剪一块)。缺省 = 全部参与(单源场景不变)。
 */
export type InSource<T extends Clip = Clip> = (c: T) => boolean;

/** 源时间 → 成片时间(仅当 src 落在某保留片段内)。落在被剪区间/越界返回 null。 */
export function srcToEdited<T extends Clip>(clips: T[], src: number, inSource: InSource<T> = () => true): number | null {
  let acc = 0;
  for (const c of clips) {
    const l = clipLen(c);
    if (inSource(c) && src >= c.srcStart && src <= c.srcEnd) return acc + (src - c.srcStart);
    acc += l;
  }
  return null;
}

/* ============================ 增删改查 ============================ */

export interface ClipEdit<T extends Clip> {
  clips: T[];
  /** 被抹掉的成片区间(裁剪/删除产生);split 无移除 → null。交给 removeEditedInterval 压缩块。 */
  removed: [number, number] | null;
}

/**
 * 剪开:在成片播放头把所在片段一分为二(源区间从切点拆开)。内容不变 → removed=null。
 * makeRight 负责造右半片段(通常 = 复制属性 + 新 id)。
 */
export function splitAtEdited<T extends Clip>(
  clips: T[],
  edited: number,
  makeRight: (base: T, srcStart: number, srcEnd: number) => T,
): ClipEdit<T> {
  const hit = editedToSrc(clips, edited);
  if (!hit) return { clips, removed: null };
  const { index, src } = hit;
  const c = clips[index]!;
  if (!(src > c.srcStart + EPS && src < c.srcEnd - EPS)) return { clips, removed: null };
  const left = { ...c, srcEnd: src };
  const right = makeRight(c, src, c.srcEnd);
  return { clips: [...clips.slice(0, index), left, right, ...clips.slice(index + 1)], removed: null };
}

/** 左剪:剪掉所在片段里播放头**左侧**的源footage(srcStart→切点)。 */
export function trimLeftAtEdited<T extends Clip>(clips: T[], edited: number): ClipEdit<T> {
  const hit = editedToSrc(clips, edited);
  if (!hit) return { clips, removed: null };
  const { index, src } = hit;
  const c = clips[index]!;
  if (!(src > c.srcStart + EPS && src < c.srcEnd - EPS)) return { clips, removed: null };
  const sp = spans(clips)[index]!;
  const out = clips.map((x, i) => (i === index ? { ...x, srcStart: src } : x));
  return { clips: out, removed: [sp.editedStart, edited] };
}

/** 右剪:剪掉所在片段里播放头**右侧**的源footage(切点→srcEnd)。 */
export function trimRightAtEdited<T extends Clip>(clips: T[], edited: number): ClipEdit<T> {
  const hit = editedToSrc(clips, edited);
  if (!hit) return { clips, removed: null };
  const { index, src } = hit;
  const c = clips[index]!;
  if (!(src > c.srcStart + EPS && src < c.srcEnd - EPS)) return { clips, removed: null };
  const sp = spans(clips)[index]!;
  const out = clips.map((x, i) => (i === index ? { ...x, srcEnd: src } : x));
  return { clips: out, removed: [edited, sp.editedEnd] };
}

/** 删段:移除播放头所在片段(至少保留 1 段)。 */
export function deleteAtEdited<T extends Clip>(clips: T[], edited: number): ClipEdit<T> {
  if (clips.length <= 1) return { clips, removed: null };
  const hit = editedToSrc(clips, edited);
  if (!hit) return { clips, removed: null };
  const sp = spans(clips)[hit.index]!;
  return { clips: clips.filter((_, i) => i !== hit.index), removed: [sp.editedStart, sp.editedEnd] };
}

/**
 * 删区间:抹掉成片时间 [a,b)——每个片段保留区间外的部分(跨区间的片段拆成左右两半,
 * 右半经 makeRight 造新片段)。区间可跨多个片段。全删保护:结果为空则不动。
 * removed = 夹取后的 [a,b],交给 removeEditedInterval 压缩叠加块。
 */
export function removeEditedRange<T extends Clip>(
  clips: T[],
  a: number,
  b: number,
  makeRight: (base: T, srcStart: number, srcEnd: number) => T,
): ClipEdit<T> {
  const total = editedDuration(clips);
  const lo = Math.max(0, Math.min(total, Math.min(a, b)));
  const hi = Math.max(0, Math.min(total, Math.max(a, b)));
  if (hi - lo < EPS) return { clips, removed: null };
  const out: T[] = [];
  for (const sp of spans(clips)) {
    const { clip, editedStart, editedEnd } = sp;
    if (editedEnd <= lo + 1e-9 || editedStart >= hi - 1e-9) {
      out.push(clip); // 完全在区间外
      continue;
    }
    // 左侧保留(片段起点在区间前)
    if (editedStart < lo - 1e-9) out.push({ ...clip, srcEnd: clip.srcStart + (lo - editedStart) });
    // 右侧保留(片段终点在区间后)——新片段(新 id 由 makeRight 定)
    if (editedEnd > hi + 1e-9) out.push(makeRight(clip, clip.srcStart + (hi - editedStart), clip.srcEnd));
  }
  if (!out.length) return { clips, removed: null }; // 全删保护:至少留一段
  return { clips: out, removed: [lo, hi] };
}

/**
 * 删一批**源时间**区间(口播稿驱动剪辑:删句/删空白/删语气词)。
 * 每个源区间按当前剪辑映射成成片区间(可能跨多个 clip → 多段),段内**降序**逐段删——
 * 源坐标不受剪切影响所以多区间任意顺序;成片坐标每剪一刀都变,必须段内降序。
 * removed = 实际删掉的成片区间,**按删除发生顺序**排列:叠加块要按同一顺序依次
 * removeEditedInterval(每刀的坐标都是"删这刀之前"的成片口径)。
 */
export function removeSrcRanges<T extends Clip>(
  clips: T[],
  srcRanges: [number, number][],
  makeRight: (base: T, srcStart: number, srcEnd: number) => T,
  inSource: InSource<T> = () => true,
): { clips: T[]; removed: [number, number][] } {
  let cur = clips;
  const removed: [number, number][] = [];
  for (const [s, e] of srcRanges) {
    const segs: [number, number][] = [];
    for (const sp of spans(cur)) {
      if (!inSource(sp.clip)) continue; // 其它源的片段:源时间轴不同域,不参与匹配
      const a = Math.max(sp.clip.srcStart, s);
      const b = Math.min(sp.clip.srcEnd, e);
      if (b - a > 0.04) segs.push([sp.editedStart + (a - sp.clip.srcStart), sp.editedStart + (b - sp.clip.srcStart)]);
    }
    segs.sort((x, y) => y[0] - x[0]);
    for (const [from, to] of segs) {
      const r = removeEditedRange(cur, from, to, makeRight);
      if (!r.removed) continue;
      cur = r.clips;
      removed.push(r.removed);
    }
  }
  return { clips: cur, removed };
}

/** src 时刻 → 成片时刻(宽松口径:落在被剪区间取其后第一个存留点;越界取末端)。 */
export function srcToEditedLoose<T extends Clip>(clips: T[], src: number, inSource: InSource<T> = () => true): number {
  const sp = spans(clips);
  let lastEnd = 0;
  for (const x of sp) {
    if (!inSource(x.clip)) continue; // 其它源:只占成片长度(spans 已计),不参与源时间匹配
    if (src < x.clip.srcStart) return x.editedStart;
    if (src < x.clip.srcEnd) return x.editedStart + (src - x.clip.srcStart);
    lastEnd = x.editedEnd;
  }
  return lastEnd || (sp.length ? sp[sp.length - 1]!.editedEnd : 0);
}

/**
 * 恢复一段**源时间**区间(口播稿:点已删的词恢复)。找出 [s,e) 里当前未被覆盖的缺口,
 * 优先并进源上相邻的片段(srcEnd/srcStart 贴合,canMerge 放行才并——带 partner 的镜别乱扩),
 * 否则按 srcStart 排序插新片段。已全部在片子里 = 原样返回。
 */
export function restoreSrcRange<T extends Clip>(
  clips: T[],
  s: number,
  e: number,
  make: (srcStart: number, srcEnd: number) => T,
  canMerge: (c: T) => boolean = () => true,
  inSource: InSource<T> = () => true,
): T[] {
  // 多源:恢复只在"本源"片段间进行(排序/合并/插位都是本源的 srcStart 语义);
  // 其它源的片段先摘下、记住各自的前驱(按 srcStart 值锚定——前驱的 srcStart 在恢复中
  // 永不改变:合并只延长它的 srcEnd 或压低后继的 srcStart),恢复完挂回原前驱之后。
  const foreign = clips.filter((c) => !inSource(c));
  if (foreign.length) {
    const anchors: { clip: T; afterSrcStart: number | null }[] = [];
    let lastSrc: T | null = null;
    for (const c of clips) {
      if (inSource(c)) {
        lastSrc = c;
        continue;
      }
      anchors.push({ clip: c, afterSrcStart: lastSrc ? lastSrc.srcStart : null });
    }
    const restored = restoreSrcRange(clips.filter(inSource), s, e, make, canMerge);
    const out: T[] = [];
    for (const a of anchors) if (a.afterSrcStart == null) out.push(a.clip);
    for (const c of restored) {
      out.push(c);
      for (const a of anchors) if (a.afterSrcStart != null && Math.abs(a.afterSrcStart - c.srcStart) < 1e-6) out.push(a.clip);
    }
    // 前驱意外消失(理论不可能,恢复不删片段):兜底挂到末尾,不丢内容
    for (const a of anchors) if (!out.includes(a.clip)) out.push(a.clip);
    return out;
  }
  const sorted = [...clips].sort((a, b) => a.srcStart - b.srcStart);
  const pieces: [number, number][] = [];
  let cur = s;
  for (const c of sorted) {
    if (c.srcEnd <= cur + EPS) continue;
    if (c.srcStart >= e - EPS) break;
    if (c.srcStart > cur + EPS) pieces.push([cur, Math.min(c.srcStart, e)]);
    cur = Math.max(cur, c.srcEnd);
    if (cur >= e - EPS) break;
  }
  if (cur < e - EPS) pieces.push([cur, e]);
  const real = pieces.filter(([a, b]) => b - a > 0.02);
  if (!real.length) return clips;
  let out = sorted;
  for (const [a, b] of real) {
    const prevI = out.findIndex((c) => Math.abs(c.srcEnd - a) < 0.03 && canMerge(c));
    if (prevI >= 0) {
      out = out.map((c, i) => (i === prevI ? { ...c, srcEnd: b } : c));
      continue;
    }
    const nextI = out.findIndex((c) => Math.abs(c.srcStart - b) < 0.03 && canMerge(c));
    if (nextI >= 0) {
      out = out.map((c, i) => (i === nextI ? { ...c, srcStart: a } : c));
      continue;
    }
    const idx = out.findIndex((c) => c.srcStart >= b - EPS);
    const nb = make(a, b);
    out = idx < 0 ? [...out, nb] : [...out.slice(0, idx), nb, ...out.slice(idx)];
  }
  return out;
}

/** 删段(按 id)。 */
export function deleteClipById<T extends Clip & { id: string }>(clips: T[], id: string): ClipEdit<T> {
  if (clips.length <= 1) return { clips, removed: null };
  const i = clips.findIndex((c) => c.id === id);
  if (i < 0) return { clips, removed: null };
  const sp = spans(clips)[i]!;
  return { clips: clips.filter((_, j) => j !== i), removed: [sp.editedStart, sp.editedEnd] };
}

/* ============================ 块压缩(成片时间) ============================ */

interface Timed {
  startSec: number;
  durationSec: number;
}

/**
 * 从成片时间轴抹掉区间 [a,b) 并压缩:之前的块不动,之后的块左移 (b-a),
 * 跨区间的块切掉重叠部分,整块落在被删区间内则丢弃。
 */
export function removeEditedInterval<B extends Timed>(blocks: B[], a: number, b: number, minDur = 0.1): B[] {
  if (b - a <= 0) return blocks;
  const gap = b - a;
  const out: B[] = [];
  for (const blk of blocks) {
    const s = blk.startSec;
    const e = blk.startSec + blk.durationSec;
    if (e <= a) {
      out.push(blk); // 完全在前
    } else if (s >= b) {
      out.push({ ...blk, startSec: s - gap }); // 完全在后 → 左移
    } else {
      // 跨/落在被删区间:保留区间外的部分,压缩
      const keptBefore = Math.max(0, a - s);
      const keptAfter = Math.max(0, e - b);
      const newDur = keptBefore + keptAfter;
      if (newDur < minDur) continue; // 基本全在被删区间 → 丢
      out.push({ ...blk, startSec: Math.min(s, a), durationSec: newDur });
    }
  }
  return out;
}
