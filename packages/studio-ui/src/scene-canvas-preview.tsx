import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { assembleHtml } from '@pireel/studio-engine/assemble';
import { videoTrackShots, shotGain, type Composition } from '@pireel/studio-engine/composition';
import type { SupplementalVisualMediaClip } from '@pireel/studio-engine/visual-layer-plan';
import { injectPreviewRuntime } from './sample-composition';
import { VideoTrackEngine } from './video-track-engine';

export interface SceneCanvasHandle {
  seek(time: number): void;
  play(): void;
  pause(): void;
}

interface Props {
  composition: Composition;
  visuals: SupplementalVisualMediaClip[];
  files: ReadonlyMap<string, File>;
  duration: number;
  volume: number;
  onTime: (time: number) => void;
  onPlaying: (playing: boolean) => void;
}

/** The independent scenes use the workbench's resident decoder and assembled canvas runtime.
 * The iframe owns only presentation; rebuilding captions/footage never replaces the audio clock.
 * Keep the previous document visible until the replacement has received its first canvas frame. */
export const SceneCanvasPreview = forwardRef<SceneCanvasHandle, Props>(function SceneCanvasPreview(props, ref) {
  const current = useRef(props);
  current.current = props;
  const engine = useRef<VideoTrackEngine | null>(null);
  const frames = useRef<(HTMLIFrameElement | null)[]>([null, null]);
  const host = useRef<HTMLDivElement>(null);
  const time = useRef(0);
  const active = useRef(0);
  const priming = useRef<number | null>(null);
  const [visible, setVisible] = useState(0);
  const [width, setWidth] = useState(0);
  const [docs, setDocs] = useState<[string, string]>(['', '']);
  const documents = useRef(docs);
  documents.current = docs;
  const bindings = useRef<[Props | null, Props | null]>([null, null]);
  const ready = useRef([false, false]);
  const sourceKeys = useRef(new Set<string>());

  const post = (message: Record<string, unknown>) => {
    for (let index = 0; index < 2; index++) {
      if (ready.current[index]) frames.current[index]?.contentWindow?.postMessage(message, '*');
    }
  };
  const pause = () => {
    engine.current?.pause();
    post({ type: 'hf:pause' });
    current.current.onPlaying(false);
  };
  useImperativeHandle(ref, () => ({
    seek(value) {
      time.current = Math.max(0, Math.min(current.current.duration, value));
      post({ type: 'hf:seek', t: time.current });
      engine.current?.seek(time.current);
      current.current.onTime(time.current);
    },
    play() {
      if (time.current >= current.current.duration) time.current = 0;
      post({ type: 'hf:play', t: time.current });
      engine.current?.play(time.current);
      current.current.onPlaying(true);
    },
    pause,
  }), []);

  useEffect(() => {
    const eng = new VideoTrackEngine();
    engine.current = eng;
    let lastUpdate = 0;
    eng.onTick = value => {
      time.current = value;
      post({ type: 'hf:seekTimelines', t: value });
      if (performance.now() - lastUpdate > 60) {
        lastUpdate = performance.now();
        current.current.onTime(value);
      }
    };
    eng.onEnded = () => {
      time.current = current.current.duration;
      current.current.onTime(time.current);
      pause();
    };
    eng.onFrame = (frame, info, frame2) => {
      const index = priming.current ?? active.current;
      const win = ready.current[index] && frames.current[index]?.contentWindow;
      if (!win) { frame.close(); frame2?.close(); return; }
      win.postMessage({ type: 'hf:frame', frame, ...info, ...(frame2 ? { frame2 } : {}) }, '*', frame2 ? [frame, frame2] : [frame]);
      if (priming.current === index) {
        const previous = active.current;
        priming.current = null;
        active.current = index;
        setVisible(index);
        if (previous !== index) {
          frames.current[previous]?.contentWindow?.postMessage({ type: 'hf:pause' }, '*');
          ready.current[previous] = false;
        }
      }
    };
    eng.onBlank = value => post({ type: 'hf:clearFrame', t: value });
    const boot = (event: MessageEvent) => {
      if (event.data?.type !== 'pong' || event.data?.nonce !== 'boot') return;
      const index = frames.current.findIndex(frame => frame?.contentWindow === event.source);
      if (index < 0 || !documents.current[index]) return;
      const model = bindings.current[index];
      if (!model) return;
      const win = frames.current[index]!.contentWindow!;
      // Like the workbench, clone local media into the opaque sandbox. Parent blob URLs cannot
      // be fetched there. The existing clip-file protocol works for both video and image nodes.
      for (const visual of model.visuals) {
        const file = model.files.get(visual.source);
        if (file) win.postMessage({ type: 'hf:clipFile', id: `hf-visual-${visual.clipId}`, file }, '*');
      }
      ready.current[index] = true;
      win.postMessage({ type: 'hf:seek', t: time.current }, '*');
      if (eng.isPlaying) win.postMessage({ type: 'hf:play', t: time.current }, '*');
      priming.current = index;
      eng.refresh();
    };
    window.addEventListener('message', boot);
    return () => {
      window.removeEventListener('message', boot);
      eng.dispose();
      engine.current = null;
      ready.current = [false, false];
      sourceKeys.current.clear();
    };
  }, []);

  useEffect(() => {
    const eng = engine.current;
    if (!eng) return;
    const keys = new Set<string>();
    let cursor = 0;
    const segments = videoTrackShots(props.composition).flatMap(shot => {
      const key = shot.src || props.composition.video?.url;
      if (!key) return [];
      keys.add(key);
      eng.setSource(key, props.files.get(key) ?? key);
      const start = cursor;
      cursor += shot.srcEnd - shot.srcStart;
      return [{ key, elKey: `clip_${shot.id}`, srcStart: shot.srcStart, srcEnd: shot.srcEnd,
        timelineStart: start, timelineEnd: cursor, gain: shotGain(shot) * props.volume,
        ...(shot.preciseFraming ? { framing: shot.preciseFraming } : {}) }];
    });
    for (const key of sourceKeys.current) if (!keys.has(key)) eng.setSource(key, null);
    sourceKeys.current = keys;
    eng.setTimelineDuration(props.duration);
    if (eng.setSegments(segments)) eng.seek(time.current);
  }, [props.composition, props.files, props.duration, props.volume]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const html = injectPreviewRuntime(assembleHtml(props.composition, undefined, undefined, props.visuals));
      if (html === documents.current[active.current]) return;
      const index = documents.current[active.current] ? 1 - active.current : active.current;
      ready.current[index] = false;
      priming.current = null;
      bindings.current[index] = props;
      setDocs(previous => { const next: [string, string] = [...previous]; next[index] = html; return next; });
    }, 100);
    return () => clearTimeout(timer);
  }, [props.composition, props.visuals, props.files]);

  useEffect(() => {
    if (!host.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);

  return <div ref={host} data-scene-canvas className="absolute inset-0 overflow-hidden">
    {docs.map((doc, index) => doc && <iframe key={index} ref={element => { frames.current[index] = element; }}
      title="Canvas preview" sandbox="allow-scripts" allow="autoplay" srcDoc={doc}
      aria-hidden={index !== visible} tabIndex={-1}
      className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
      style={{ width: props.composition.width, height: props.composition.height,
        transform: `scale(${width / props.composition.width})`, opacity: index === visible ? 1 : 0 }} />)}
  </div>;
});
