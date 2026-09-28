import { useEffect, useRef, useState, type Ref } from 'react';
import { sourceDrawRect } from '@pireel/studio-engine/source-framing';
import type { PipBox } from '@pireel/studio-engine/pip-layout';

/** CSS uses the same fit/crop rectangle as the canvas exporter, including source-space anchors. */
export function PipVisual({ box, canvas, dimensions, src, fit, anchorY = .5, videoRef, moving = false, layer = 0, cutout = false }: {
  box: PipBox; canvas: { width: number; height: number }; dimensions: { width: number; height: number };
  src: string; fit: 'contain' | 'cover'; anchorY?: number; videoRef?: Ref<HTMLVideoElement>; moving?: boolean; layer?: number; cutout?: boolean;
}) {
  const media = useRef<HTMLVideoElement | HTMLImageElement | null>(null);
  const maskCanvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (!cutout) { setStatus(''); return; }
    let stopped = false; let timer = 0; let lastTime = -1;
    setStatus('正在准备人像…');
    const render = async () => {
      if (stopped) return;
      const input = media.current;
      const video = input instanceof HTMLVideoElement;
      if (!input || (video ? input.readyState < 2 : !(input as HTMLImageElement).complete) || (video && input.currentTime === lastTime)) {
        timer = window.setTimeout(render, 100); return;
      }
      try {
        const time = video ? input.currentTime : 0;
        const { personCutoutFrame } = await import('./person-cutout-frame');
        if (stopped) return;
        const frame = await personCutoutFrame(await createImageBitmap(input));
        try {
          const canvas = maskCanvas.current;
          if (stopped || !canvas) return;
          canvas.width = frame.width; canvas.height = frame.height;
          canvas.getContext('2d')?.drawImage(frame, 0, 0);
          lastTime = time; setStatus('');
        } finally { frame.close(); }
        if (video && !stopped) timer = window.setTimeout(render, 67);
      } catch { if (!stopped) setStatus('人像抠图暂不可用'); }
    };
    void render();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [cutout, src]);
  const width = box.w * canvas.width; const height = box.h * canvas.height;
  const draw = sourceDrawRect(dimensions.width, dimensions.height, width, height, fit === 'cover' ? { scale: 1, anchorX: .5, anchorY, coordinateSpace: 'source-normalized' } : undefined);
  const style = { left: `${draw.x / width * 100}%`, top: `${draw.y / height * 100}%`, width: `${draw.width / width * 100}%`, height: `${draw.height / height * 100}%`, maxWidth: 'none' };
  return <div data-pip-visual={videoRef ? 'presenter' : 'footage'} className={'absolute overflow-hidden ' + (moving ? 'transition-[left,top,width,height] duration-500 motion-reduce:transition-none' : '')} style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%`, zIndex: layer }}>
    {videoRef ? <video ref={element => { media.current = element; if (typeof videoRef === 'function') videoRef(element); else if (videoRef) videoRef.current = element; }} src={src} muted loop playsInline preload="metadata" aria-hidden="true" className="absolute" style={{ ...style, visibility: cutout ? 'hidden' : 'visible' }} /> : <img ref={element => { media.current = element; }} src={src} alt="" className="absolute" style={{ ...style, visibility: cutout ? 'hidden' : 'visible' }} />}
    {cutout && <canvas ref={maskCanvas} className="absolute" style={style} aria-hidden="true" />}
    {cutout && status && <span role="status" className="absolute inset-x-0 bottom-2 text-center text-[10px] text-white">{status}</span>}
  </div>;
}
