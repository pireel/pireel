'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Pause, Play, X } from 'lucide-react';
import { imageThumb } from '@pireel/ui/image-url';
import type { Composition } from '@pireel/studio-engine/composition';
import { framePack, type SupportedLocale as Locale } from '@pireel/studio-frames/locales';
import { showcaseBlock } from '@pireel/studio-frames/showcase-blocks';
import { InlineBlockPreview, type PreviewPerson } from './block-preview-card';
import { t } from './i18n';
import type { FrameCatalogItem } from './use-frame-catalog';

const SCENE_MS = 3200;

function personOf(frame: FrameCatalogItem): PreviewPerson | null {
  if (!frame.personFx) return null;
  return {
    front: true,
    strokeColor: frame.personFx['stroke-color'] ?? null,
  };
}

function useStageWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(240, Math.round(el.getBoundingClientRect().width)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

export function FramePreviewDialog({
  frame,
  locale,
  comp,
  selected = false,
  onClose,
  onUse,
}: {
  frame: FrameCatalogItem | null;
  locale: Locale;
  comp?: Composition;
  selected?: boolean;
  onClose: () => void;
  onUse: (frame: FrameCatalogItem) => void;
}) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const { ref: stageRef, width: stageWidth } = useStageWidth();
  const previewComp = useMemo<Composition>(
    () => ({
      width: 1920,
      height: 1080,
      theme: comp?.theme ?? 'general',
      video: null,
      blocks: [],
      ...(frame?.palette ? { palette: frame.palette } : comp?.palette ? { palette: comp.palette } : {}),
    }),
    [comp?.palette, comp?.theme, frame?.palette],
  );
  const scenes = useMemo(
    () => frame
      ? frame.showcase
          .map((kind) => showcaseBlock(frame.id, kind, locale))
          .filter((block): block is NonNullable<typeof block> => block != null)
          .slice(0, 6)
      : [],
    [frame, locale],
  );

  useEffect(() => {
    setSceneIndex(0);
    setPlaying(true);
  }, [frame?.id]);

  useEffect(() => {
    if (!frame || !playing || scenes.length < 2) return;
    const timer = window.setInterval(() => {
      setSceneIndex((index) => (index + 1) % scenes.length);
    }, SCENE_MS);
    return () => window.clearInterval(timer);
  }, [frame, playing, scenes.length]);

  useEffect(() => {
    if (!frame) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === ' ') {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [frame, onClose]);

  if (!frame || typeof document === 'undefined') return null;
  const title = framePack(locale, frame.id)?.title ?? frame.title;
  const activeScene = scenes[sceneIndex] ?? null;
  const coverSrc = frame.coverKey ? imageThumb(frame.coverKey, 'preview') : null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('panels.frameExampleVideo', { title })}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="border-line bg-panel w-full max-w-[820px] overflow-hidden rounded-xl border shadow-2xl">
        <div className="flex h-12 items-center gap-3 px-4">
          <div className="text-ink min-w-0 flex-1 truncate text-[13px] font-medium">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:bg-panel-2 hover:text-ink inline-flex h-8 w-8 items-center justify-center rounded-md"
            title={t('common.closePreview')}
          >
            <X size={16} />
          </button>
        </div>

        <div ref={stageRef} className="relative aspect-video w-full overflow-hidden bg-black">
          {activeScene ? (
            <InlineBlockPreview
              key={`${frame.id}-${sceneIndex}-${playing ? 'play' : 'pause'}`}
              comp={previewComp}
              block={activeScene}
              width={stageWidth}
              animate={playing}
              person={personOf(frame)}
              ground="stage"
            />
          ) : coverSrc ? (
            <img src={coverSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="text-ink-4 flex h-full items-center justify-center text-[12px]">
              {t('panels.framePreviewUnavailable')}
            </div>
          )}
          {scenes.length > 0 && (
            <button
              type="button"
              onClick={() => setPlaying((value) => !value)}
              className="absolute bottom-3 left-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur transition hover:bg-black/90"
              title={playing ? t('panels.pauseFramePreview') : t('panels.playFramePreview')}
            >
              {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {scenes.map((scene, index) => (
              <button
                key={scene.id}
                type="button"
                aria-label={t('panels.framePreviewSceneN', { n: index + 1 })}
                onClick={() => {
                  setSceneIndex(index);
                  setPlaying(true);
                }}
                className={`h-1.5 min-w-4 flex-1 rounded-full transition-colors ${index === sceneIndex ? 'bg-ink' : 'bg-line hover:bg-ink-4'}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => onUse(frame)}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-4 text-[12px] font-medium transition ${
              selected ? 'bg-panel-2 text-ink' : 'bg-accent text-white hover:brightness-110'
            }`}
          >
            {selected && <Check size={13} strokeWidth={2.5} />}
            {selected ? t('panels.removeFrame') : t('panels.useFrame')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
