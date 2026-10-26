import { audioClipGainAt, audioClipSrcTimeAt, audioClipDefaults } from '@pireel/studio-engine/audio-tracks';
import { supplementalVisualLayers } from './visual-render-plan';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { assembleHtml } from '@pireel/studio-engine/assemble';
import { videoTrackShots, videoShotTimelineSpans, transitionWindows, shotGain, type VideoShotTimelinePlacement, type Composition } from '@pireel/studio-engine/composition';
import type { SupplementalVisualMediaClip } from '@pireel/studio-engine/visual-layer-plan';
import { injectPreviewRuntime } from './sample-composition';
import { VideoTrackEngine } from './video-track-engine';
import { PreviewStageHost, type PreviewMessageEvent } from './preview-stage-host';
import { t } from './i18n';

export interface SceneCanvasHandle {
  seek(time: number): void;
  play(): void;
  pause(): void;
}

interface Props {
  composition: Composition;
  placements?: readonly VideoShotTimelinePlacement[];
  visuals: SupplementalVisualMediaClip[];
  files: ReadonlyMap<string, File>;
  duration: number;
  volume: number;
  sourceVolume?: number;
  onTime: (time: number) => void;
  onPlaying: (playing: boolean) => void;
}

/** The independent scenes use the workbench's resident decoder and assembled canvas runtime, mounted
 * in two in-page Shadow DOM stages (double buffer) like the workbench, not iframes. The stage owns only
 * presentation; rebuilding captions/footage never replaces the audio clock. Keep the previous document
 * visible until the replacement has received its first canvas frame. */
export const SceneCanvasPreview = forwardRef<SceneCanvasHandle, Props>(function SceneCanvasPreview(props, ref) {
  const current = useRef(props);
  current.current = props;
  const engine = useRef<VideoTrackEngine | null>(null);
  const frames = useRef<(PreviewStageHost | null)[]>([null, null]);
  const bootRef = useRef<((index: number, event: PreviewMessageEvent) => void) | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const time = useRef(0);
  const active = useRef(0);
  const priming = useRef<number | null>(null);
  const [matteError, setMatteError] = useState('');
  const [visible, setVisible] = useState(0);
  const [width, setWidth] = useState(0);
  const [docs, setDocs] = useState<[string, string]>(['', '']);
  const documents = useRef(docs);
  documents.current = docs;
  const bindings = useRef<[Props | null, Props | null]>([null, null]);
  const ready = useRef([false, false]);
  const sourceKeys = useRef(new Set<string>());

  /** Bind a stage to its slot once, then (re)assign the slot's document when it changes. */
  const attachStage = (index: number, element: HTMLDivElement | null, doc: string) => {
    if (!element) return;
    let stage = frames.current[index];
    if (stage?.element !== element) {
      stage?.dispose();
      stage = new PreviewStageHost(element);
      stage.onMessage = event => bootRef.current?.(index, event);
      frames.current[index] = stage;
    }
    if (stage.srcdoc !== doc) stage.srcdoc = doc;
  };
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
    eng.onLayerFrame = (layer, frame) => {
      const index = priming.current ?? active.current;
      const win = ready.current[index] && frames.current[index]?.contentWindow;
      if (!win) { frame.close(); return; }
      win.postMessage({ type: 'hf:layerFrame', id: layer.elKey, frame }, '*', [frame]);
    };
    eng.onLayerError = (_layer, error) => { pause(); setMatteError(error instanceof Error ? error.message : t('ui.personCutout.failed')); };
    eng.onLayerBlank = layer => post({ type: 'hf:layerClear', id: layer.elKey });
    eng.onBlank = value => post({ type: 'hf:clearFrame', t: value });
    const boot = (index: number, event: PreviewMessageEvent) => {
      const data = event.data as { type?: string; nonce?: string } | null;
      if (data?.type !== 'pong' || data?.nonce !== 'boot') return;
      if (!documents.current[index]) return;
      const model = bindings.current[index];
      if (!model) return;
      const win = frames.current[index]!.contentWindow!;
      // Images enter the stage as Files; video layers use the resident parent decoder.
      for (const visual of model.visuals) {
        const file = model.files.get(visual.source);
        if (file && visual.kind === 'image') win.postMessage({ type: 'hf:imageFile', sig: visual.clipId, file }, '*');
      }
      ready.current[index] = true;
      win.postMessage({ type: 'hf:seek', t: time.current }, '*');
      if (eng.isPlaying) win.postMessage({ type: 'hf:play', t: time.current }, '*');
      priming.current = index;
      if (!videoTrackShots(model.composition).length) {
        active.current = index;
        setVisible(index);
        priming.current = null;
      }
      eng.refresh();
    };
    bootRef.current = boot;
    return () => {
      bootRef.current = null;
      for (const stage of frames.current) stage?.dispose();
      frames.current = [null, null];
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
    const segments = videoShotTimelineSpans(videoTrackShots(props.composition), props.placements).flatMap(({ clip: shot, editedStart: start, editedEnd: end }) => {
      const key = shot.src || props.composition.video?.url;
      if (!key) return [];
      keys.add(key);
      eng.setSource(key, props.files.get(key) ?? key);
      return [{ key, elKey: `clip_${shot.id}`, srcStart: shot.srcStart, srcEnd: shot.srcEnd,
        timelineStart: start, timelineEnd: end, gain: shotGain(shot) * props.volume * (props.sourceVolume ?? 1),
        ...(shot.preciseFraming ? { framing: shot.preciseFraming } : {}) }];
    });
    setMatteError('');
    const layers = supplementalVisualLayers(props.visuals);
    for (const layer of layers) {
      keys.add(layer.key);
      eng.setSource(layer.key, props.files.get(layer.key) ?? layer.key, 'layer');
    }
    eng.setLayers(layers);
    for (const key of sourceKeys.current) if (!keys.has(key)) eng.setSource(key, null);
    sourceKeys.current = keys;
    eng.setTimelineDuration(props.duration);
    eng.setTransitions(transitionWindows(props.composition.transitions, videoTrackShots(props.composition), props.placements).flatMap(tr => tr.cut === null ? [] : [{ start: tr.start, cut: tr.cut, end: tr.end }]));
    if (eng.setSegments(segments)) eng.seek(time.current);
  }, [props.composition, props.placements, props.visuals, props.files, props.duration, props.volume, props.sourceVolume]);

  useEffect(() => {
    const loudness = props.composition.audioLoudness;
    engine.current?.setMasterGain(loudness ? 10 ** (loudness.gainDb / 20) : null);
  }, [props.composition.audioLoudness]);

  useEffect(() => {
    engine.current?.setAudioClips((props.composition.audioTracks ?? []).map(clip => ({
      id: clip.id, url: clip.src, speed: audioClipDefaults(clip).speed,
      gainAt: (value: number) => audioClipGainAt(clip, value, props.duration) * props.volume,
      srcTimeAt: (value: number) => audioClipSrcTimeAt(clip, value),
    })));
  }, [props.composition.audioTracks, props.duration, props.volume]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const visuals = props.visuals.map(visual => visual.kind === 'image' && props.files.has(visual.source) ? { ...visual, source: 'pireel-local-image:' + encodeURIComponent(visual.clipId).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase()) } : visual);
      const html = injectPreviewRuntime(assembleHtml(props.composition, undefined, props.placements, visuals));
      if (html === documents.current[active.current]) return;
      const index = documents.current[active.current] ? 1 - active.current : active.current;
      ready.current[index] = false;
      priming.current = null;
      bindings.current[index] = props;
      setDocs(previous => { const next: [string, string] = [...previous]; next[index] = html; return next; });
    }, 100);
    return () => clearTimeout(timer);
  }, [props.composition, props.placements, props.visuals, props.files]);

  useEffect(() => {
    if (!host.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);

  return <div ref={host} data-scene-canvas className="absolute inset-0 overflow-hidden">
    {matteError && <p role="alert" className="absolute inset-x-3 bottom-3 z-10 rounded bg-black/80 p-3 text-xs text-white">{matteError}</p>}
    {docs.map((doc, index) => doc && <div key={index} ref={element => attachStage(index, element, doc)}
      aria-hidden={index !== visible}
      className="pointer-events-none absolute left-0 top-0 origin-top-left"
      style={{ width: props.composition.width, height: props.composition.height,
        transform: `scale(${width / props.composition.width})`, opacity: index === visible ? 1 : 0 }} />)}
  </div>;
});
