import { useEffect, useRef, useState } from 'react';
import { PipVisual } from './pip-visual';
import { PIP_PICKER_TEMPLATES, pipGeometry } from '@pireel/studio-engine/pip-layout';
import { ERASER_SHOWCASE, UGC_SHOWCASE } from './workflow-art';

export function UgcAdShowcase({ locale }: { locale: 'zh' | 'en' }) {
  const zh = locale === 'zh';
  return <div className="my-4 space-y-3" aria-label={zh ? 'UGC 广告效果示例' : 'UGC ad example'}>
    <div className="bg-panel-2 aspect-[3/2] overflow-hidden rounded-lg">
      <img src={UGC_SHOWCASE} alt={zh ? '创作者介绍商品、展示使用动作与商品镜头' : 'A creator introduces a product, demonstrates it and shows the product'} width={1536} height={1024} className="h-full w-full object-cover" decoding="async" />
    </div>
    <div className="text-ink-3 grid grid-cols-3 gap-2 text-center text-[11px]">
      <span>{zh ? '创作者口播' : 'Creator'}</span><span>{zh ? '商品动作' : 'Product action'}</span><span>{zh ? '商品镜头' : 'Product shot'}</span>
    </div>
    <p className="text-ink-3 text-xs leading-relaxed">{zh ? '上传自己的口播或演示片，添加真实商品镜头；开场、字幕和行动引导会进入同一条广告。' : 'Upload your own creator or demo video and product footage. Opening copy, captions and call to action join one ad.'}</p>
  </div>;
}

export function EraserShowcase({ locale }: { locale: 'zh' | 'en' }) {
  const zh = locale === 'zh';
  const image = <img src={ERASER_SHOWCASE} alt="" width={1672} height={941} className="h-full w-full object-cover" decoding="async" />;
  return <div className="my-4 space-y-3" role="group" aria-label={zh ? '擦除前后对比示例' : 'Before and after removal example'}>
    <div className="grid grid-cols-2 gap-2">
      <div className="bg-panel-2 relative aspect-video overflow-hidden rounded-lg">{image}
        <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{zh ? '擦除前' : 'Before'}</span>
        <span className="absolute right-2 top-2 text-[10px] font-semibold tracking-[.12em] text-white/80">DEMO</span>
        <span className="absolute inset-x-2 bottom-3 bg-black/60 px-1 py-0.5 text-center text-[10px] font-semibold text-white">{zh ? '视频上的旧字幕' : 'Existing subtitles'}</span>
      </div>
      <div className="bg-panel-2 relative aspect-video overflow-hidden rounded-lg">{image}
        <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{zh ? '擦除后' : 'After'}</span>
      </div>
    </div>
    <p className="text-ink-3 text-xs leading-relaxed">{zh ? '清理已烧录的字幕、水印或 Logo，并尽量还原原画面；这里用同一画面示意前后差别。' : 'Remove burned-in subtitles, watermarks or logos and restore the picture. This example uses the same frame on both sides.'}</p>
  </div>;
}

export function PipShowcase({ locale, suspended = false }: { locale: 'zh' | 'en'; suspended?: boolean }) {
  const zh = locale === 'zh';
  const [selected, setSelected] = useState(0);
  const [cycling, setCycling] = useState(true);
  const speakerVideo = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!preference) return;
    const update = () => setReduced(preference.matches);
    update(); preference.addEventListener?.('change', update);
    return () => preference.removeEventListener?.('change', update);
  }, []);
  useEffect(() => {
    if (suspended || reduced || !cycling) return;
    const timer = window.setInterval(() => { if (!document.hidden) setSelected(index => (index + 1) % PIP_PICKER_TEMPLATES.length); }, 2800);
    return () => window.clearInterval(timer);
  }, [suspended, reduced, selected, cycling]);
  useEffect(() => {
    const video = speakerVideo.current; if (!video) return;
    if (suspended || reduced) video.pause();
    else { try { void Promise.resolve(video.play()).catch(() => {}); } catch {} }
    return () => video.pause();
  }, [suspended, reduced]);
  const template = PIP_PICKER_TEMPLATES[selected];
  const canvas = { width: 1080, height: 1920 };
  const source = { width: 432, height: 768 };
  const footage = { width: 1672, height: 941 };
  const geometry = pipGeometry(template.id, canvas, footage, {}, source);
  const footageUrl = new URL('./workflow-art/pip-footage-v1.png', import.meta.url).href;
  const sourceUrl = new URL('./workflow-art/caption-demo.mp4', import.meta.url).href;
  return <div className="my-4 space-y-3" aria-label={zh ? '画中画动效示例' : 'Animated picture in picture example'}>
    <div className="grid grid-cols-[minmax(120px,168px)_minmax(0,1fr)] items-center gap-4">
      <div data-pip-demo-template={template.id} className="bg-panel-2 relative mx-auto aspect-[9/16] w-full overflow-hidden rounded-lg">
        <PipVisual videoRef={speakerVideo} src={sourceUrl} dimensions={source} canvas={canvas} box={geometry.speaker ?? { x: 0, y: 0, w: 1, h: 1 }} fit={geometry.speaker ? geometry.speakerFit : 'contain'} anchorY={geometry.speakerAnchorY} cutout={geometry.speakerCutout} layer={geometry.speaker ? 3 : 0} moving />
        <div className="absolute inset-0 transition-colors duration-500 motion-reduce:transition-none" style={{ background: geometry.background ?? 'transparent', zIndex: 1 }} />
        <PipVisual src={footageUrl} dimensions={footage} canvas={canvas} box={geometry.media} fit={geometry.mediaFit} layer={2} moving />
        <div className="pointer-events-none absolute inset-x-1 bottom-[7%] z-10 text-center text-[9px] font-semibold text-white [text-shadow:0_1px_3px_black]">{zh ? '一边讲解，一边展示' : 'Explain and show'}</div>
      </div>
      <div role="group" aria-label={zh ? '画中画效果' : 'Picture in picture effects'} className="space-y-1.5">
        {PIP_PICKER_TEMPLATES.map((item, index) => <button key={item.id} type="button" onClick={() => { setSelected(index); setCycling(false); }} aria-pressed={selected === index} className={'border-line text-ink-3 hover:text-ink flex min-h-9 w-full items-center gap-2 rounded-md border px-2 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-accent ' + (selected === index ? 'bg-panel-2 text-ink' : 'bg-bg')}>
          <span className={'size-1.5 shrink-0 rounded-full ' + (selected === index ? 'bg-ink' : 'bg-ink-4')} />{item[locale]}
        </button>)}
        {reduced ? <p className="text-ink-4 pt-1 text-[10px]">{zh ? '点击切换效果' : 'Choose an effect'}</p> : <button type="button" className="text-ink-3 pt-1 text-[10px] underline underline-offset-2" onClick={() => setCycling(value => !value)}>{cycling ? (zh ? '暂停轮播' : 'Pause slideshow') : (zh ? '自动演示' : 'Play slideshow')}</button>}
      </div>
    </div>
    <p className="text-ink-3 text-xs leading-relaxed">{zh ? '用同一段口播和独立商品素材展示实际布局，保留画面比例。小窗位置、大小和裁切方式均可调整。' : 'The same presenter and separate footage show the actual layouts without stretching. Adjust the inset position, size and framing after uploading.'}</p>
  </div>;
}
