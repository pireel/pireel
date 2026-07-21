'use client';

/**
 * 取景面板(选中分镜自动打开):每种取景类型一张 SVG 效果卡(9:16 小画框里摆人像
 * 剪影 + 图文占位条,与真实效果同构),点卡即应用——对齐人像面板的样式卡交互。
 * 腾出的空区放什么不在这里管(「另一半放什么」入口已砍,用户定的):上传/生图面板插入即可。
 * 分割/删除也不在这里:归时间轴上方工具栏(不重复入口)。
 */

import { useEffect, useState } from 'react';
import type { ShotFilter, ShotTreatment, VideoShot } from '@pireel/studio-engine/composition';
import { SHOT_TREATMENTS, TREAT_SIZE_DEFAULT } from '@pireel/studio-engine/composition';
import { t } from './i18n';

/** 单张取景效果卡:1:1 画框铺满卡面,人像剪影 + 图文占位条按类型摆位(标题在卡外下方)。 */
function TreatmentPreview({ t }: { t: ShotTreatment }) {
  const bust = (x: number, y: number, s: number) => (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="currentColor">
      <circle cx="0" cy="-8.5" r="6" />
      <path d="M-10 13 C-10 2 -5 -1 0 -1 C5 -1 10 2 10 13 Z" />
    </g>
  );
  const bars = (x: number, y: number, w: number) => (
    <g fill="var(--color-accent, #3f4be8)" opacity="0.5">
      <rect x={x} y={y} width={w} height="5" rx="2.5" />
      <rect x={x} y={y + 10} width={w * 0.68} height="5" rx="2.5" />
      <rect x={x} y={y + 20} width={w * 0.84} height="5" rx="2.5" />
    </g>
  );
  // 视频区(浅底圆角矩形)
  const vid = (x: number, y: number, w: number, h: number, r = 3) => <rect x={x} y={y} width={w} height={h} rx={r} className="fill-ink-4/25" />;
  let inner: React.ReactNode;
  switch (t) {
    case 'punch-in':
      // 放大:人像顶格撑出画框(裁切感)
      inner = (
        <>
          {vid(2, 2, 92, 92)}
          {bust(48, 74, 5.2)}
        </>
      );
      break;
    case 'corner-br':
      inner = (
        <>
          {bars(10, 16, 44)}
          {vid(52, 52, 41, 41)}
          {bust(72.5, 80, 2.4)}
        </>
      );
      break;
    case 'corner-tl':
      inner = (
        <>
          {vid(3, 3, 41, 41)}
          {bust(23.5, 31, 2.4)}
          {bars(42, 62, 44)}
        </>
      );
      break;
    case 'split-l':
      inner = (
        <>
          {vid(2, 2, 45, 92)}
          {bust(24.5, 56, 3.2)}
          {bars(56, 38, 32)}
        </>
      );
      break;
    case 'split-r':
      inner = (
        <>
          {bars(8, 38, 32)}
          {vid(49, 2, 45, 92)}
          {bust(71.5, 56, 3.2)}
        </>
      );
      break;
    default:
      // 无(不取景):空画框 + 斜杠标识
      inner = <line x1="14" y1="82" x2="82" y2="14" stroke="currentColor" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" />;
  }
  return (
    <svg viewBox="0 0 96 96" className="text-ink-3 w-full" aria-hidden>
      <rect x="0.75" y="0.75" width="94.5" height="94.5" rx="5" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <clipPath id={`tp-${t}`}>
        <rect x="1.5" y="1.5" width="93" height="93" rx="4.5" />
      </clipPath>
      <g clipPath={`url(#tp-${t})`}>{inner}</g>
    </svg>
  );
}

const FILTER_FIELDS: { key: keyof ShotFilter; name: string }[] = [
  { key: 'brightness', name: '亮度' },
  { key: 'contrast', name: '对比' },
  { key: 'saturate', name: '饱和' },
];

export function ShotTreatmentPanel({
  shot,
  onSetTreatment,
  onSetTreatSize,
  onPreviewTreatSize,
  onSetFilter,
  onPreviewFilter,
}: {
  shot: VideoShot;
  onSetTreatment: (shotId: string, t: ShotTreatment) => void;
  onSetTreatSize: (shotId: string, size: number) => void;
  /** 拖动中的实时预览(iframe 直改,零 setState);松手才走 onSetTreatSize 提交。 */
  onPreviewTreatSize: (shotId: string, size: number) => void;
  /** 镜级调色提交(null=全部还原);拖动中走 onPreviewFilter 实时预览。 */
  onSetFilter: (shotId: string, f: ShotFilter | null) => void;
  onPreviewFilter: (shotId: string, f: ShotFilter) => void;
}) {
  // 大小滑杆:拖动中本地值 + iframe 实时预览(零 setState),松手/键盘调完才提交 comp
  const committedSize = shot.treatSize ?? TREAT_SIZE_DEFAULT[shot.treatment];
  const [dragSize, setDragSize] = useState<number | null>(null);
  useEffect(() => setDragSize(null), [shot.id, shot.treatment]);
  const sizeValue = dragSize ?? committedSize;
  const commitSize = () => {
    if (dragSize != null && dragSize !== committedSize) onSetTreatSize(shot.id, dragSize);
    setDragSize(null);
  };
  // 调色滑杆(百分比显示,100=中性):拖动中本地值 + 实时预览,松手才提交
  const [dragFilter, setDragFilter] = useState<ShotFilter | null>(null);
  useEffect(() => setDragFilter(null), [shot.id]);
  const filterValue = dragFilter ?? shot.filter ?? {};
  const filterNeutral = FILTER_FIELDS.every(({ key }) => (filterValue[key] ?? 1) === 1);
  const commitFilter = () => {
    if (dragFilter) onSetFilter(shot.id, filterNeutral ? null : dragFilter);
    setDragFilter(null);
  };
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* 标题(镜头取景 · 场景 N)/关闭归浮窗头部,这里只剩一行说明 */}
      <div className="border-line text-ink-4 border-b px-3 py-1.5 text-[10.5px]">{t('取景作用整段分镜;想只放大前几秒,先用工具栏分割剪开')}</div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-3 text-[11.5px]">
        <div className="grid grid-cols-3 gap-2">
          {SHOT_TREATMENTS.map((tr) => {
            const active = shot.treatment === tr.id;
            return (
              <button
                key={tr.id}
                type="button"
                onClick={() => onSetTreatment(shot.id, tr.id)}
                aria-label={t('取景:{name}', { name: t(tr.name) })}
                className="group flex flex-col items-center gap-1"
              >
                <div className={`w-full rounded-lg border-2 transition ${active ? 'border-accent' : 'border-transparent group-hover:border-line-2'}`}>
                  <TreatmentPreview t={tr.id} />
                </div>
                <span className={`text-[10.5px] ${active ? 'text-ink font-medium' : 'text-ink-3 group-hover:text-ink'}`}>{t(tr.name)}</span>
              </button>
            );
          })}
        </div>

        {/* 大小(非「无」类型):放大=变焦幅度,缩角=小窗大小,半切=视频占宽 */}
        {shot.treatment !== 'full' && (
          <section className="flex flex-col gap-1.5">
            <div className="text-ink flex items-center justify-between font-medium">
              <span>{t('大小')}</span>
              <span className="text-ink-4 tabular-nums">{Math.round(sizeValue)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={sizeValue}
              onChange={(e) => {
                const v = Number(e.target.value);
                setDragSize(v);
                onPreviewTreatSize(shot.id, v); // 跟手:iframe 直改,不走防抖重建
              }}
              onPointerUp={commitSize}
              onKeyUp={commitSize}
              onBlur={commitSize}
              className="zoom-range w-full"
              aria-label={t('取景大小')}
            />
          </section>
        )}

        {/* 画面调色(整镜生效,切点即换):百分比口径,100=原片 */}
        <section className="flex flex-col gap-1.5">
          <div className="text-ink flex items-center justify-between font-medium">
            <span>{t('画面调色')}</span>
            {!filterNeutral && (
              <button type="button" className="text-ink-4 hover:text-ink text-[10.5px]" onClick={() => { setDragFilter(null); onSetFilter(shot.id, null); }}>
                {t('还原')}
              </button>
            )}
          </div>
          {FILTER_FIELDS.map(({ key, name }) => {
            const v = Math.round((filterValue[key] ?? 1) * 100);
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-ink-3 w-7 shrink-0">{t(name)}</span>
                <input
                  type="range"
                  min={50}
                  max={150}
                  step={1}
                  value={v}
                  onChange={(e) => {
                    const next = { ...filterValue, [key]: Number(e.target.value) / 100 };
                    setDragFilter(next);
                    onPreviewFilter(shot.id, next); // 跟手:iframe 直改,不走防抖重建
                  }}
                  onPointerUp={commitFilter}
                  onKeyUp={commitFilter}
                  onBlur={commitFilter}
                  className="zoom-range w-full"
                  aria-label={t('{name}(100=原片)', { name: t(name) })}
                />
                <span className="text-ink-4 w-8 shrink-0 text-right tabular-nums">{v}</span>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
