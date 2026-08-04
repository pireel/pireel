import { describe, expect, it } from 'vitest';
import type { Composition } from './composition';
import { emptyPersistedProjectDocument } from './project-document';
import { ackedFromDto, buildSaveWire, canonicalJson, diffOps, hashSection, mergeSaveIntoRow, rowToDto, rowToMeta, sanitizeSavePayload, type ProjectSavePayload } from './project-dto';

/**
 * 增量保存线格式的契约钉(两级差分):
 *  - 分段:冷启动全发/没变的段缺席/全没变返回 null(跳过请求)
 *  - 段内 JSON Patch:小改动发 ops+目标哈希;服务端应用+校验,不合回 need_full(null)
 *  - 服务端合并:缺席段保留现值、context 按 key 合并且补丁不动未知 key、null 不覆盖非空
 * 这套语义破了,轻则退回全量上报(老病复发),重则段被抹/补丁应用错(云端脏数据)。
 */

const comp = { width: 1080, height: 1920, video: null, blocks: [{ id: 'b1', box: { x: 10, y: 20 } }], shots: [] } as unknown as Composition;

const payload = (over: Partial<ProjectSavePayload> = {}): ProjectSavePayload => ({
  comp,
  chat: [{ id: 't1' }],
  context: { asr: [{ start: 0, end: 1, text: 'hi' }] },
  videoSig: 'sig1',
  videoDurationSec: 12.5,
  coverThumb: 'data:image/jpeg;base64,xxx',
  ...over,
});

describe('canonicalJson', () => {
  it('键序无关(jsonb 会重排键序,哈希必须两端一致)', () => {
    expect(canonicalJson({ b: 1, a: [{ y: 2, x: 1 }] })).toBe(canonicalJson({ a: [{ x: 1, y: 2 }], b: 1 }));
  });
  it('undefined 按 JSON 语义(对象键剔除/数组元素 null)', () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalJson([undefined, 1])).toBe('[null,1]');
  });
});

describe('persisted project DTO dual-read', () => {
  const row = {
    id: 'project-1',
    title: 'legacy',
    comp,
    chat: [],
    context: {},
    videoSig: 'sig1',
    videoDurationSec: '12.5',
    coverThumb: null,
    version: 7,
    updatedAt: new Date(1000),
  };

  it('returns canonical V2 and a temporary V1 projection for an old row', () => {
    const dto = rowToDto(row);
    expect(dto.document.version).toBe(2);
    expect(dto.comp).not.toHaveProperty('version');
    expect(dto.version).toBe(7);
  });

  it('computes list counts from V2 without relying on V1 fields in storage', () => {
    const dto = rowToDto(row);
    expect(rowToMeta({ ...row, comp: dto.document })).toMatchObject({ blocks: 1, shots: 0 });
  });
});

describe('buildSaveWire(分段)', () => {
  it('冷启动(无基准)全段都发全量', () => {
    const r = buildSaveWire(payload(), 3, null);
    expect(r).not.toBeNull();
    const w = r!.wire;
    expect(w.baseVersion).toBe(3);
    expect(w.comp).toBeDefined();
    expect(w.compPatch).toBeUndefined();
    expect(w.chat).toBeDefined();
    expect(w.context).toBeDefined();
    expect(w.coverThumb).toBe('data:image/jpeg;base64,xxx');
    expect(w.videoSig).toBe('sig1');
  });

  it('全没变返回 null(整个保存跳过)', () => {
    const first = buildSaveWire(payload(), 3, null)!;
    expect(buildSaveWire(payload(), 4, first.acked)).toBeNull();
  });

  it('只发变了的段:改 chat 不带 comp/coverThumb/context/meta', () => {
    const first = buildSaveWire(payload(), 3, null)!;
    const r = buildSaveWire(payload({ chat: [{ id: 't1' }, { id: 't2' }] }), 4, first.acked)!;
    expect(r.wire.chat ?? r.wire.chatPatch).toBeDefined();
    expect(r.wire.comp).toBeUndefined();
    expect(r.wire.compPatch).toBeUndefined();
    expect(r.wire.coverThumb).toBeUndefined();
    expect(r.wire.context).toBeUndefined();
    expect(r.wire.videoSig).toBeUndefined();
  });

  it('chat-only 载荷(纯咨询会话):comp 段完全缺席——空画布永远不可能冲掉云端 comp', () => {
    const { comp: _omit, ...rest } = payload();
    const chatOnly: ProjectSavePayload = { ...rest, chat: [{ id: 't1', messages: [1] }] };
    const r = buildSaveWire(chatOnly, null, null);
    expect(r).not.toBeNull();
    expect(r!.wire.comp).toBeUndefined();
    expect(r!.wire.compPatch).toBeUndefined();
    expect(r!.wire.chat).toBeDefined();
    // 之后带 comp 的保存对着携带下来的空基线正常出段(不因缺基线崩)
    const next = buildSaveWire(payload({ chat: chatOnly.chat }), 1, r!.acked);
    expect(next).not.toBeNull();
    expect(next!.wire.comp ?? next!.wire.compPatch).toBeDefined();
  });

  it('context-only 载荷(只导入本地素材):不伪造 comp,索引仍可单独上云', () => {
    const localAssets = [{ sig: 'a.png:10:1', label: 'a.png', kind: 'image' as const, createdAt: 1 }];
    const r = buildSaveWire({ chat: [], context: { localAssets }, videoSig: null, videoDurationSec: null, coverThumb: null }, null, null);
    expect(r).not.toBeNull();
    expect(r!.wire.comp).toBeUndefined();
    expect(r!.wire.compPatch).toBeUndefined();
    expect(r!.wire.context).toEqual({ localAssets });
  });

  it('meta 段(videoSig/时长/title)独立于 comp', () => {
    const first = buildSaveWire(payload(), 3, null)!;
    // V2-native callers already carry the manifest. Changing row metadata alone must not remigrate
    // a legacy Composition and accidentally churn the document section.
    const r = buildSaveWire(payload({ comp: undefined, document: first.acked.values.comp, videoSig: 'sig2' }), 4, first.acked)!;
    expect(r.wire.videoSig).toBe('sig2');
    expect(r.wire.comp).toBeUndefined();
    expect(r.wire.compPatch).toBeUndefined();
  });
});

describe('buildSaveWire(段内 JSON Patch)', () => {
  const bigComp = {
    width: 1080,
    height: 1920,
    video: null,
    blocks: Array.from({ length: 40 }, (_, i) => ({ id: `b${i}`, html: `<div class="card">block content ${i} with some longer text body</div>`, box: { x: i, y: i * 2, w: 30, h: 10 } })),
    shots: [],
  } as unknown as Composition;

  it('挪一个块 = compPatch 几条 ops + 目标哈希,体积远小于整段', () => {
    const first = buildSaveWire(payload({ comp: bigComp }), 1, null)!;
    const moved = JSON.parse(JSON.stringify(bigComp)) as typeof bigComp;
    (moved.blocks as { box: { x: number } }[])[3].box.x = 999;
    const r = buildSaveWire(payload({ comp: moved as Composition }), 2, first.acked)!;
    expect(r.wire.comp).toBeUndefined();
    expect(r.wire.compPatch).toBeDefined();
    expect(r.wire.compHash).toBeDefined();
    expect(JSON.stringify(r.wire.compPatch).length).toBeLessThan(200);
    // 服务端应用补丁 == 客户端目标值(哈希闭环)
    const merged = mergeSaveIntoRow(
      { title: 't', comp: first.acked.values.comp, chat: [], context: {}, videoSig: null, videoDurationSec: null, coverThumb: null },
      sanitizeSavePayload({ baseVersion: 2, compPatch: r.wire.compPatch, compHash: r.wire.compHash })!,
    );
    expect(merged).not.toBeNull();
    expect(hashSection(canonicalJson(merged!.comp))).toBe(r.wire.compHash);
  });

  it('改动过大(补丁不比整段小)自动退回整段', () => {
    const first = buildSaveWire(payload({ comp: bigComp }), 1, null)!;
    const rewritten = {
      ...bigComp,
      blocks: (bigComp.blocks as { id: string }[]).map((b, i) => ({
        ...b,
        id: `replacement-${i}`,
        html: `<section>totally rewritten ${i} ${'x'.repeat(120)}</section>`,
      })),
    } as unknown as Composition;
    const r = buildSaveWire(payload({ comp: rewritten }), 2, first.acked)!;
    expect(r.wire.comp).toBeDefined();
    expect(r.wire.compPatch).toBeUndefined();
  });

  it('分割分镜(120 段中间插入+后续重编号)= 补丁远小于整段,不是整数组重传', () => {
    // 用户实测踩的坑:fast-json-patch compare 按索引比数组,中间插入让后面全体
    // 移位,每个都发整条 replace = 全量。generate-json-patch 按 objectHash(shot.id)
    // 身份对齐:插入 = 一条 add,重编号 = 每段一条小 no replace,O(真实改动)。
    const shots = Array.from({ length: 120 }, (_, i) => ({ id: `s${i}`, no: i + 1, srcStart: i * 3, srcEnd: i * 3 + 3, framing: { treatment: 'full' }, note: 'scene note text ' + i }));
    const compA = { width: 1080, height: 1920, video: null, blocks: [], shots } as unknown as Composition;
    const first = buildSaveWire(payload({ comp: compA }), 1, null)!;
    // 在第 50 段处分割:该段 end 缩短、插入新段、后续全部重编号
    const split = JSON.parse(JSON.stringify(shots)) as typeof shots;
    split[50] = { ...split[50], srcEnd: split[50].srcStart + 1.2 };
    split.splice(51, 0, { id: 's-new', no: 52, srcStart: split[50].srcStart + 1.2, srcEnd: 153, framing: { treatment: 'full' }, note: 'new half' });
    for (let i = 52; i < split.length; i++) split[i] = { ...split[i], no: i + 1 };
    const compB = { ...compA, shots: split } as unknown as Composition;
    const r = buildSaveWire(payload({ comp: compB }), 2, first.acked)!;
    expect(r.wire.compPatch).toBeDefined();
    expect(r.wire.comp).toBeUndefined();
    const patchBytes = JSON.stringify(r.wire.compPatch).length;
    const fullBytes = canonicalJson(r.acked.values.comp).length;
    expect(patchBytes).toBeLessThan(fullBytes * 0.35); // 真实改动(1 add + ~70 条 no replace)远小于整段
    // 应用闭环
    const merged = mergeSaveIntoRow(
      { title: 't', comp: first.acked.values.comp, chat: [], context: {}, videoSig: null, videoDurationSec: null, coverThumb: null },
      sanitizeSavePayload({ baseVersion: 2, compPatch: r.wire.compPatch, compHash: r.wire.compHash })!,
    );
    expect(merged).not.toBeNull();
    expect(hashSection(canonicalJson(merged!.comp))).toBe(r.wire.compHash);
  });

  it('不重编号的纯中间插入 = O(1) 条 ops', () => {
    const shots = Array.from({ length: 100 }, (_, i) => ({ id: `s${i}`, srcStart: i * 3, srcEnd: i * 3 + 3 }));
    const ins = JSON.parse(JSON.stringify(shots)) as typeof shots;
    ins.splice(30, 0, { id: 's-x', srcStart: 0, srcEnd: 5 });
    const ops = diffOps({ shots }, { shots: ins });
    expect(ops.length).toBeLessThanOrEqual(2);
    expect(JSON.stringify(ops).length).toBeLessThan(300);
  });

  it('diffOps 数组语义:删/插/改应用后等价,ops O(改动);无 id 数组走内容哈希', () => {
    const roundtrip = (a: unknown, b: unknown, maxOps: number) => {
      const shell = emptyPersistedProjectDocument();
      const base = { ...shell, semantics: { ...shell.semantics, plan: a } };
      const target = { ...shell, semantics: { ...shell.semantics, plan: b } };
      const ops = diffOps(base, target);
      expect(ops.length).toBeLessThanOrEqual(maxOps);
      const merged = mergeSaveIntoRow(
        { title: 't', comp: base, chat: [], context: {}, videoSig: null, videoDurationSec: null, coverThumb: null },
        sanitizeSavePayload({ baseVersion: 1, compPatch: ops, compHash: hashSection(canonicalJson(target)) })!,
      );
      expect(merged).not.toBeNull();
      expect(canonicalJson(merged!.comp)).toBe(canonicalJson(target));
    };
    roundtrip({ w: [1, 2, 3, 4], video: null }, { w: [1, 2, 4], video: null }, 2);
    roundtrip({ w: [1, 2, 3, 4], video: null }, { w: [1, 9, 2, 3, 4], video: null }, 2);
    // 无 id 元素改值 = 身份(内容哈希)变了:remove+add+move 三条,仍是 O(改动)
    roundtrip({ w: [1, 2, 3, 4], video: null }, { w: [1, 8, 3, 4], video: null }, 3);
    roundtrip({ 'a/b~c': 1, video: null }, { 'a/b~c': 2, video: null }, 1); // RFC 6901 指针转义
  });

  it('chat 追加一条 = 补丁(尾部 add)', () => {
    const first = buildSaveWire(payload({ chat: Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, text: 'msg content here'.repeat(4) })) }), 1, null)!;
    const r = buildSaveWire(payload({ chat: [...(first.acked.values.chat as unknown[]), { id: 'm20', text: 'new' }] }), 2, first.acked)!;
    expect(r.wire.chatPatch).toBeDefined();
    expect(r.wire.chat).toBeUndefined();
  });
});

describe('sanitizeSavePayload(差分语义)', () => {
  it('缺席字段 = undefined(不再默认「未命名项目」/空数组)', () => {
    const p = sanitizeSavePayload({ baseVersion: 5, chat: [1] })!;
    expect(p.title).toBeUndefined();
    expect(p.comp).toBeUndefined();
    expect(p.chat).toEqual([1]);
    expect(p.context).toBeUndefined();
    expect(p.baseVersion).toBe(5);
  });

  it('带 V1 comp 时迁移成 V2 单写;补丁形状校验', () => {
    const p = sanitizeSavePayload({ comp: { blocks: [], video: { x: 1 } }, compPatch: [{ op: 'replace', path: '/a', value: 1 }], chatPatch: 'garbage' })!;
    expect(p.comp?.version).toBe(2);
    expect(p.comp).not.toHaveProperty('video');
    expect(p.compPatch).toHaveLength(1);
    expect(p.chatPatch).toBeUndefined();
  });

  it('非对象体非法', () => {
    expect(sanitizeSavePayload('x')).toBeNull();
    expect(sanitizeSavePayload(null)).toBeNull();
  });

  it('拒绝结构存在但引用不合法的 V2 全量文档', () => {
    const document = emptyPersistedProjectDocument();
    expect(sanitizeSavePayload({ comp: { ...document, timeline: { tracks: [] } } })).toBeNull();
  });
});

describe('mergeSaveIntoRow', () => {
  const existing = {
    title: '我的片子',
    comp: { blocks: ['old'] },
    chat: [{ id: 'old' }],
    context: { asr: ['a'], media: { video: { sig: 's', key: 'k' } } },
    videoSig: 'sig-old',
    videoDurationSec: '30' as string | number | null,
    coverThumb: 'thumb-old',
  };

  it('缺席段保留现值(chat-only 差分不动 comp/title/封面)', () => {
    const p = sanitizeSavePayload({ baseVersion: 5, chat: [{ id: 'new' }] })!;
    const m = mergeSaveIntoRow(existing, p)!;
    expect(m.chat).toEqual([{ id: 'new' }]);
    expect(m.comp).toBe(existing.comp);
    expect(m.title).toBe('我的片子');
    expect(m.coverThumb).toBe('thumb-old');
    expect(m.videoSig).toBe('sig-old');
    expect(m.videoDurationSec).toBe('30');
  });

  it('context 全量按 key 合并:带 asr 不抹 media', () => {
    const p = sanitizeSavePayload({ baseVersion: 5, context: { asr: ['b'] } })!;
    const m = mergeSaveIntoRow(existing, p)!;
    expect(m.context.asr).toEqual(['b']);
    expect(m.context.media).toEqual({ video: { sig: 's', key: 'k' } });
  });

  it('本地素材只同步元数据索引,可整段替换且不抹云媒体索引', () => {
    const localAssets = [
      {
        sig: 'photo.jpg:42:7',
        label: 'photo.jpg',
        kind: 'image',
        w: 1080,
        h: 1920,
        folder: { id: 'folder-1', name: 'B-roll', path: 'day-1/photo.jpg' },
        createdAt: 7,
      },
    ];
    const p = sanitizeSavePayload({ baseVersion: 5, context: { localAssets } })!;
    const m = mergeSaveIntoRow(existing, p)!;
    expect(m.context.localAssets).toEqual(localAssets);
    expect(m.context.media).toEqual({ video: { sig: 's', key: 'k' } });

    const cleared = mergeSaveIntoRow({ ...existing, context: m.context }, sanitizeSavePayload({ baseVersion: 6, context: { localAssets: [] } })!)!;
    expect(cleared.context.localAssets).toEqual([]);
  });

  it('context 补丁应用在服务端现值上,不动客户端不知道的 key', () => {
    const p = sanitizeSavePayload({ baseVersion: 5, contextPatch: [{ op: 'replace', path: '/asr/0', value: 'b' }] })!;
    const m = mergeSaveIntoRow(existing, p)!;
    expect(m.context.asr).toEqual(['b']);
    expect(m.context.media).toEqual({ video: { sig: 's', key: 'k' } });
  });

  it('comp 补丁哈希不合(基漂了)→ null = need_full;缺哈希同样拒', () => {
    const p = sanitizeSavePayload({ baseVersion: 5, compPatch: [{ op: 'replace', path: '/blocks/0', value: 'new' }], compHash: 'wrong.hash.1' })!;
    expect(mergeSaveIntoRow(existing, p)).toBeNull();
    const p2 = sanitizeSavePayload({ baseVersion: 5, compPatch: [{ op: 'replace', path: '/blocks/0', value: 'new' }] })!;
    expect(mergeSaveIntoRow(existing, p2)).toBeNull();
  });

  it('comp 补丁不能向 V2 顶层塞 legacy/runtime 字段', () => {
    const base = emptyPersistedProjectDocument();
    const p = sanitizeSavePayload({
      baseVersion: 5,
      compPatch: [{ op: 'add', path: '/video', value: { evil: 1 } }],
      compHash: hashSection(canonicalJson({ ...base, video: { evil: 1 } })),
    })!;
    expect(mergeSaveIntoRow({ ...existing, comp: base }, p)).toBeNull();
  });

  it('坏补丁(路径不存在)→ null = need_full', () => {
    const p = sanitizeSavePayload({ baseVersion: 5, compPatch: [{ op: 'replace', path: '/nope/xx/yy', value: 1 }], compHash: 'x.y.1' })!;
    expect(mergeSaveIntoRow(existing, p)).toBeNull();
  });

  it('补丁哈希正确但破坏 V2 语义引用也拒绝', () => {
    const base = emptyPersistedProjectDocument();
    const target = { ...base, timeline: { tracks: [] } };
    const p = sanitizeSavePayload({
      baseVersion: 5,
      compPatch: [{ op: 'replace', path: '/timeline/tracks', value: [] }],
      compHash: hashSection(canonicalJson(target)),
    })!;
    expect(mergeSaveIntoRow({ ...existing, comp: base }, p)).toBeNull();
  });

  it('videoSig/coverThumb null 不覆盖非空;时长带值转 string', () => {
    const p = sanitizeSavePayload({ baseVersion: 5, videoSig: null, coverThumb: null, videoDurationSec: 42 })!;
    const m = mergeSaveIntoRow(existing, p)!;
    expect(m.videoSig).toBe('sig-old');
    expect(m.coverThumb).toBe('thumb-old');
    expect(m.videoDurationSec).toBe('42');
  });

  it('全量体(老客户端形状)整段覆盖仍成立', () => {
    const p = sanitizeSavePayload({ baseVersion: 5, title: '新名', comp: { blocks: [] }, chat: [], context: {}, videoSig: 'sig2', videoDurationSec: 1, coverThumb: 'c2' })!;
    const m = mergeSaveIntoRow(existing, p)!;
    expect(m.title).toBe('新名');
    expect(m.chat).toEqual([]);
    expect(m.videoSig).toBe('sig2');
    expect(m.coverThumb).toBe('c2');
  });
});

describe('409 重播种(ackedFromDto)', () => {
  it('服务端全量 → 基准,与 buildSaveWire 同口径:大段全部判没变缺席', () => {
    const p = payload();
    const acked = ackedFromDto({
      comp: p.comp!,
      chat: p.chat,
      context: p.context!,
      coverThumb: p.coverThumb,
      title: '未命名项目',
      videoSig: p.videoSig,
      videoDurationSec: p.videoDurationSec,
    });
    // 大段(comp/chat/context/coverThumb)全部判没变缺席;meta 段因服务端 title
    // (「未命名项目」)≠ 客户端 payload(不带 title)允许多发一次——~100B 无害
    const r = buildSaveWire(p, 9, acked);
    if (r) {
      expect(r.wire.comp).toBeUndefined();
      expect(r.wire.compPatch).toBeUndefined();
      expect(r.wire.chat).toBeUndefined();
      expect(r.wire.chatPatch).toBeUndefined();
      expect(r.wire.context).toBeUndefined();
      expect(r.wire.contextPatch).toBeUndefined();
      expect(r.wire.coverThumb).toBeUndefined();
      expect(r.wire.title).toBeUndefined();
    }
  });
});
