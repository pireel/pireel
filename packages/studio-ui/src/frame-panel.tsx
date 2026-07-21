'use client';

/**
 * 右侧 rail 的 frame 面板 = studio 的主题模板库(Hyperframes 官方命名:frame.md)。
 * 一个 frame = 一个大主题内容包(知识口播/美食博主/…,开放主题),是"内容感知的模板"——
 * 挂进对话后 agent 把你的口播内容套进这套打法。与 /create 线的 skill 体系无关。
 * - 列表 = 一行一张主题**封面**大卡(主题名当主角,只透风格不列详情,PPT 主题封面的定位);
 * - 点开 = 主题详情:简介 + 该主题产出的多类型**真实预览**卡(showcase 词 → 真实块,
 *   BlockPreviewFrame 同源 Hyperframes 渲染,跟项目主题色走,见 showcase-blocks);
 * - 「使用」= 把 frame 挂进右侧 chat(不是复制提示词文字!),请求带 frameId、
 *   服务端注入 playbook;对话输入框的主题按钮也能唤起同一目录。
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useLocale } from 'use-intl';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { SkillIcon } from '@pireel/ui/skill-icon';
import { t } from './i18n';
import type { Composition } from '@pireel/studio-engine/composition';
import type { SupportedLocale as Locale } from '@pireel/studio-frames/locales';
import { framePack, kindLabel } from '@pireel/studio-frames/locales';
import { InlineBlockPreview, type PreviewPerson } from './block-preview-card';
import { coverBlock, showcaseBlock } from '@pireel/studio-frames/showcase-blocks';
import { type FrameCatalogItem, useFrameCatalog } from './use-frame-catalog';

const CARD_W = 300; // 16:9 单列大卡(面板内容宽约 302)

/** 预览占位人像:只给声明了 personFx 的主题画(人像是它设计系统的一部分,方言按
 *  「给人留位」写);其他主题不画——方言根都是整幅不透明底,垫底人像不可见,
 *  而前置会糊到既有设计上。剪影带该主题的人像描边(贴纸白边),必须前置才可见。 */
const personOf = (f: FrameCatalogItem): PreviewPerson | null =>
  f.personFx
    ? {
        front: true,
        strokeColor: f.personFx['stroke-color'] ?? null,
      }
    : null;

export function FramePanel({ comp, onUse }: { comp: Composition; onUse: (frame: FrameCatalogItem) => void }) {
  const locale = useLocale() as Locale; // frame 内容有单独的 locale 适配包(标题/简介/预览文案)
  const frames = useFrameCatalog();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? frames.find((f) => f.id === openId) : null;
  // 返回列表时恢复滚动位置:点开前存 scrollTop,列表容器重挂时(useCallback 稳定 ref,只在挂载时跑)写回
  const listRef = useRef<HTMLDivElement | null>(null);
  const savedListScroll = useRef(0);
  const attachList = useCallback((el: HTMLDivElement | null) => {
    listRef.current = el;
    if (el) el.scrollTop = savedListScroll.current;
  }, []);
  const openFrame = useCallback((id: string) => {
    savedListScroll.current = listRef.current?.scrollTop ?? 0;
    setOpenId(id);
  }, []);

  if (open) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <div className="border-line flex items-center gap-2 border-b px-3 py-2">
          <button
            type="button"
            onClick={() => setOpenId(null)}
            className="text-ink-3 hover:bg-panel-2 hover:text-ink -ml-1 inline-flex h-6 w-6 items-center justify-center rounded"
            title={t('返回列表')}
          >
            <ArrowLeft size={13} />
          </button>
          <SkillIcon iconKey={open.iconKey} emoji={open.icon} size={22} rounded="rounded-md" />
          <span className="text-ink truncate text-[12px] font-medium">{framePack(locale, open.id)?.title ?? open.title}</span>
        </div>
        {/* key 按 frame 切:换主题强制重挂滚动容器,滚动位置归零 */}
        <div key={open.id} className="min-h-0 flex-1 overflow-auto p-2.5">
          <div className="text-ink-2 text-[11.5px] leading-relaxed">{open.summary}</div>
          {open.showcase.length > 0 ? (
            <>
              <div className="text-ink mb-1.5 mt-3 text-[11px] font-medium">{t('这个主题会产出')}</div>
              <div className="flex flex-col gap-2">
                {open.showcase.map((kind) => (
                  <ShowcaseCard key={kind} comp={comp} frame={open} kind={kind} locale={locale} />
                ))}
              </div>
            </>
          ) : (
            <div className="text-ink-4 mt-3 text-[10.5px]">{t('这个主题没有产出预览——使用后直接对话即可。')}</div>
          )}
        </div>
        <div className="border-line border-t p-2.5">
          <button
            type="button"
            onClick={() => onUse(open)}
            className="bg-accent w-full rounded-md py-2 text-[12px] font-medium text-white transition hover:brightness-110"
          >
            {t('使用')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* 标题单层:「主题」归素材栏 tabs 头,这里只留说明行(与字幕面板同一惯例) */}
      <div className="border-line border-b px-3 py-2">
        <div className="text-ink-4 text-[10.5px]">{t('点开看产出，「使用」后生成的内容都走这套设计；对话里的主题按钮也能换')}</div>
      </div>
      <div ref={attachList} className="min-h-0 flex-1 overflow-auto p-2.5">
        {frames.length === 0 ? (
          <div className="text-ink-4 pt-10 text-center text-[11px]">{t('目录加载中…')}</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {frames.map((f) => (
              <CoverCard key={f.id} comp={comp} frame={f} locale={locale} onOpen={() => openFrame(f.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** 列表封面卡:主题名当主角的风格封面(真实渲染,只透风格不列详情);
 *  没有封面的 frame(用户上传等)落回图标行式。 */
function CoverCard({ comp, frame, locale, onOpen }: { comp: Composition; frame: FrameCatalogItem; locale: Locale; onOpen: () => void }) {
  const block = useMemo(() => coverBlock(frame.id, locale), [frame.id, locale]);
  const previewComp = useMemo<Composition>(
    () => ({ ...comp, width: 1920, height: 1080, ...(frame.palette ? { palette: frame.palette } : {}) }),
    [comp, frame.palette],
  );
  if (!block) {
    return (
      <button
        type="button"
        title={frame.summary}
        onClick={onOpen}
        className="border-line hover:border-accent group flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition"
      >
        <SkillIcon iconKey={frame.iconKey} emoji={frame.icon} size={34} rounded="rounded-lg" />
        <span className="min-w-0 flex-1">
          <span className="text-ink block truncate text-[11.5px] font-medium">{framePack(locale, frame.id)?.title ?? frame.title}</span>
          <span className="text-ink-4 block truncate text-[10px]">{frame.summary}</span>
        </span>
        <ChevronRight size={13} className="text-ink-4 group-hover:text-accent shrink-0" />
      </button>
    );
  }
  return (
    <button
      type="button"
      title={framePack(locale, frame.id)?.title ?? frame.title}
      onClick={onOpen}
      className="border-line hover:border-accent group w-full overflow-hidden rounded-lg border text-left transition"
    >
      <InlineBlockPreview comp={previewComp} block={block} width={CARD_W} animate="hover" person={personOf(frame)} ground="stage" />
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <span className="text-ink-4 min-w-0 flex-1 truncate text-[10px]">{frame.summary}</span>
        <PaletteDots palette={frame.palette} />
        <ChevronRight size={12} className="text-ink-4 group-hover:text-accent shrink-0" />
      </div>
    </button>
  );
}

/** showcase 词的真实预览卡:构一个真的块,BlockPreviewFrame 渲(同预览/导出栈,定格稳定帧)。
 *  frame 带 palette(设计 token)时预览 comp 换上它 —— 卡片就是该主题的真实色调;
 *  不认识的词回落词面卡。 */
function ShowcaseCard({ comp, frame, kind, locale }: { comp: Composition; frame: FrameCatalogItem; kind: string; locale: Locale }) {
  const block = useMemo(() => showcaseBlock(frame.id, kind, locale), [frame.id, kind, locale]);
  // 预览一律 16:9 画布 + frame 自己的设计 token(palette 连字体/圆角/阴影一起换)
  const previewComp = useMemo<Composition>(
    () => ({ ...comp, width: 1920, height: 1080, ...(frame.palette ? { palette: frame.palette } : {}) }),
    [comp, frame.palette],
  );
  if (!block) {
    return (
      <div className="border-line flex h-[54px] items-center justify-center rounded-lg border">
        <span className="bg-panel-2 text-ink-2 rounded px-2 py-1 text-[10px]">{kindLabel(locale, kind)}</span>
      </div>
    );
  }
  return (
    <div className="border-line overflow-hidden rounded-lg border">
      {/* 产出卡人像 = 角落小像:前置才可见(方言底不透明),缩小塞角降遮挡 */}
      <InlineBlockPreview
        comp={previewComp}
        block={block}
        width={CARD_W}
        ground="checker"
        animate
        person={(() => {
          const p = personOf(frame);
          return p ? { ...p, size: 'corner' as const } : null;
        })()}
      />
      <div className="text-ink-3 px-1.5 py-1 text-[10px]">{kindLabel(locale, kind)}</div>
    </div>
  );
}

/** 主题设计 token 的小色条(accent / panel / paper 三粒),列表行里一眼认主题。 */
function PaletteDots({ palette }: { palette?: Record<string, string> | null }) {
  if (!palette) return null;
  const dots = ['accent', 'panel', 'paper'].map((k) => palette[k]).filter(Boolean) as string[];
  if (!dots.length) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      {dots.map((c, i) => (
        <span key={i} className="border-line h-2.5 w-2.5 rounded-full border" style={{ background: c }} />
      ))}
    </span>
  );
}
