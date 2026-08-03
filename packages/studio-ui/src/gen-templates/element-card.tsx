'use client';

import { Blocks } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { studioLocale, t } from '../i18n';
import { localizedTemplatePrompt, type GenTemplate } from './types';

/**
 * The canonical card for a generated-component template. Both the generation panel and
 * Official Assets render this component so the preview and Remix behavior cannot drift.
 */
export function ElementTemplateCard({ template, onUse }: { template: GenTemplate; onUse: (prompt: string) => void }) {
  const prompt = localizedTemplatePrompt(template, studioLocale());
  return (
    <button
      type="button"
      title={prompt}
      aria-label={`${template.title ? t(template.title) : ''} · ${t('chatGen.remix')}`}
      onClick={() => onUse(prompt)}
      className="border-line group relative block w-full overflow-hidden rounded-lg border text-left"
    >
      <ElementTemplatePreview id={template.id} />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100 group-focus-within:bg-black/35 group-focus-within:opacity-100">
        <span className="text-ink rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium">
          {template.title ? `${t(template.title)} · ` : ''}{t('chatGen.remix')}
        </span>
      </span>
    </button>
  );
}

/** Compact art-directed previews for component Remix templates.
 * Some are transparent video overlays (checkerboard), while others are complete
 * slide-like compositions. Templates are briefs rather than canvas-bound presets,
 * so these previews intentionally show the range of possible visual direction. */
export function ElementTemplatePreview({ id }: { id: string }) {
  const checkerboard = {
    backgroundColor: '#f7f7f4',
    backgroundImage:
      'linear-gradient(45deg,#d9dde2 25%,transparent 25%,transparent 75%,#d9dde2 75%),linear-gradient(45deg,#d9dde2 25%,transparent 25%,transparent 75%,#d9dde2 75%)',
    backgroundSize: '14px 14px',
    backgroundPosition: '0 0,7px 7px',
  };

  const frame = (content: ReactNode, className: string, style?: CSSProperties) => (
    <div aria-hidden className={`relative aspect-video w-full overflow-hidden ${className}`} style={style}>
      {content}
    </div>
  );

  switch (id) {
    case 'el-big-number':
      return frame(
        <>
          <span className="absolute left-2 top-2 text-[7px] font-black uppercase tracking-[0.16em]">Weekly pulse</span>
          <span className="absolute -right-3 -top-6 size-16 rounded-full border-[10px] border-[#ff7a59]/55" />
          <div className="absolute bottom-2 left-2">
            <div className="text-[26px] font-black leading-none tracking-[-0.08em]">+38%</div>
            <div className="mt-1 flex items-center gap-1 text-[7px] font-bold"><span className="h-1.5 w-5 rounded-full bg-[#1d1d1b]" /> MOM GROWTH</div>
          </div>
        </>,
        'bg-[#ffd64a] text-[#1d1d1b]',
      );
    case 'el-comparison':
      return frame(
        <div className="absolute inset-2 flex items-stretch gap-1.5">
          <div className="flex flex-1 flex-col justify-between rounded-md bg-[#ff6b57] p-2 text-white"><b className="text-[8px]">PLAN A</b><strong className="text-[21px] leading-none">42</strong><span className="text-[6px] opacity-80">QUICK START</span></div>
          <span className="absolute left-1/2 top-1/2 z-10 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#171717] text-[6px] font-black text-white">VS</span>
          <div className="flex flex-1 flex-col justify-between rounded-md bg-[#2f5eff] p-2 text-white"><b className="text-[8px]">PLAN B</b><strong className="text-[21px] leading-none">68</strong><span className="text-[6px] opacity-80">BEST VALUE</span></div>
        </div>,
        'bg-[#f5efe6]',
      );
    case 'el-progress-ring':
      return frame(
        <>
          <div className="absolute left-3 top-3 text-[7px] font-bold uppercase tracking-[0.18em] text-[#aebbd3]">Completion</div>
          <div className="absolute right-3 top-1/2 size-12 -translate-y-1/2 rounded-full p-1" style={{ background: 'conic-gradient(#c9ff55 0 73%,#34435f 73% 100%)' }}>
            <div className="flex size-full items-center justify-center rounded-full bg-[#17243d] text-[12px] font-black text-white">73</div>
          </div>
          <div className="absolute bottom-3 left-3 text-[15px] font-black leading-[0.92] text-white">ON<br />TRACK</div>
        </>,
        'bg-[#17243d]',
      );
    case 'el-bar-chart':
      return frame(
        <>
          <div className="absolute left-2.5 top-2 text-[8px] font-black text-[#25231f]">Audience mix</div>
          <div className="absolute inset-x-2.5 bottom-2 top-6 flex items-end gap-1.5 rounded-md bg-white/75 px-2 pb-1.5 pt-2 shadow-sm">
            {[38, 68, 50, 85, 58].map((h, i) => <span key={h} className={`flex-1 rounded-t-sm ${i === 3 ? 'bg-[#ff5c4d]' : i === 1 ? 'bg-[#7057ff]' : 'bg-[#ffd44d]'}`} style={{ height: `${h}%` }} />)}
          </div>
        </>,
        'bg-[#f2eadf]',
      );
    case 'el-bullet-list':
      return frame(
        <>
          <span className="absolute left-2 top-2 rounded-sm bg-[#d8ff51] px-1.5 py-0.5 text-[6px] font-black text-[#15203c]">3 THINGS</span>
          <div className="absolute inset-x-2 bottom-2 top-6 flex flex-col justify-end gap-1 text-[8px] font-black text-white">
            <div className="rounded-sm bg-white/14 px-2 py-1"><i className="mr-2 not-italic text-[#ffca44]">01</i>Make it clear</div>
            <div className="rounded-sm bg-white/14 px-2 py-1"><i className="mr-2 not-italic text-[#ff7d63]">02</i>Keep it moving</div>
            <div className="rounded-sm bg-white/14 px-2 py-1"><i className="mr-2 not-italic text-[#d8ff51]">03</i>Land the point</div>
          </div>
        </>,
        'bg-[#3254d7]',
      );
    case 'el-three-steps':
      return frame(
        <>
          <div className="absolute left-2 top-2 text-[7px] font-black uppercase tracking-[0.16em] text-white/75">How it works</div>
          <div className="absolute inset-x-2 bottom-2 top-6 grid grid-cols-3 gap-1">
            {['IDEA', 'BUILD', 'SHIP'].map((label, i) => <div key={label} className="flex flex-col justify-between rounded-sm bg-[#fff8ed] p-1.5 text-[#2a1a17]"><b className="text-[13px] leading-none">0{i + 1}</b><span className="text-[6px] font-black">{label}</span></div>)}
          </div>
        </>,
        'bg-[#f25f4b]',
      );
    case 'el-timeline':
      return frame(
        <>
          <div className="absolute left-2 top-2 text-[8px] font-black text-white">ROAD TO LAUNCH</div>
          <div className="absolute inset-x-3 top-[42px] h-px bg-white/35" />
          <div className="absolute inset-x-3 top-[37px] flex justify-between">
            {['MAY', 'JUN', 'JUL'].map((month, i) => <div key={month} className="flex flex-col items-center"><span className={`size-2.5 rounded-full border-2 border-[#171717] ${i === 1 ? 'bg-[#ff6e58]' : 'bg-[#d9ff54]'}`} /><b className="mt-1 text-[6px] text-white">{month}</b></div>)}
          </div>
        </>,
        'bg-[#171717]',
      );
    case 'el-quote':
      return frame(
        <>
          <span className="absolute -left-1 -top-5 text-[70px] font-black leading-none text-[#ffdc5e]">“</span>
          <div className="absolute inset-x-4 top-5 text-[12px] font-black leading-tight text-[#20201e]">Good design makes the point feel inevitable.</div>
          <div className="absolute bottom-2 right-3 text-[6px] font-bold uppercase tracking-[0.16em] text-[#20201e]/65">Studio notes · 04</div>
        </>,
        'bg-[#ff8a73]',
      );
    case 'el-callout':
      return frame(
        <div className="absolute inset-x-3 top-1/2 flex -translate-y-1/2 items-center gap-2 rounded-md border-2 border-[#171717] bg-[#ffe34f] p-2 shadow-[3px_3px_0_#171717]">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#171717] text-[11px] font-black text-white">!</span>
          <span><b className="block text-[8px] text-[#171717]">WATCH THIS</b><i className="block text-[6px] not-italic text-[#171717]/65">One decisive insight</i></span>
        </div>,
        '',
        checkerboard,
      );
    case 'el-keyword':
      return frame(
        <>
          <div className="absolute left-2 top-3 -rotate-2 bg-[#ff4f95] px-2 py-1 text-[17px] font-black leading-none text-white shadow-[3px_3px_0_#1b1b1b]">FOCUS</div>
          <div className="absolute bottom-3 right-2 rotate-2 bg-[#cfff52] px-2 py-1 text-[7px] font-black text-[#1b1b1b] shadow-[2px_2px_0_#1b1b1b]">CUT THE NOISE</div>
        </>,
        '',
        checkerboard,
      );
    case 'el-chapter':
      return frame(
        <>
          <span className="absolute -bottom-3 -left-1 text-[59px] font-black leading-none tracking-[-0.1em] text-[#18233a]">02</span>
          <div className="absolute left-[58px] top-5 border-l-2 border-[#18233a] pl-2 text-[#18233a]"><b className="block text-[11px] leading-none">THE NEXT<br />CHAPTER</b><span className="mt-1 block text-[6px] font-bold opacity-60">A NEW DIRECTION</span></div>
        </>,
        'bg-[#d8ff54]',
      );
    case 'el-comment':
      return frame(
        <>
          <div className="absolute left-2 top-2 flex max-w-[92px] items-center gap-1.5 rounded-lg rounded-bl-sm bg-white p-1.5 shadow-[0_3px_10px_rgba(27,44,89,.16)]"><span className="size-4 rounded-full bg-[#ff765d]" /><span className="text-[6px] font-bold text-[#213150]">This makes it click.</span></div>
          <div className="absolute bottom-2 right-2 flex max-w-[100px] items-center gap-1.5 rounded-lg rounded-br-sm bg-[#3157da] p-1.5 text-white shadow-[0_3px_10px_rgba(27,44,89,.2)]"><span className="size-4 rounded-full bg-[#d8ff54]" /><span className="text-[6px] font-bold">Exactly what I needed.</span></div>
        </>,
        'bg-[#cfe9ff]',
      );
    default:
      return frame(<Blocks size={24} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[#31312d]" />, 'bg-[#f4efe6]');
  }
}
