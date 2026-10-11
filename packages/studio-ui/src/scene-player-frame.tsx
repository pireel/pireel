import type { ReactNode } from 'react';

/** The visible player shell is shared by native-canvas and ordinary video scenes. */
export function ScenePlayerFrame({ width, height, disabled, onToggle, children, status }: {
  width: number; height: number; disabled: boolean;
  onToggle: () => void; children: ReactNode; status?: ReactNode;
}) {
  const ratio = width > 0 && height > 0 ? width / height : 9 / 16;
  return <div className="relative flex min-h-0 flex-1 items-center justify-center" style={{ containerType: 'size' }}>
    <div data-scene-player-frame className="relative overflow-hidden rounded-lg bg-black" style={{ aspectRatio: ratio, width: `min(100cqw, calc(100cqh * ${ratio}))` }} onClick={event => {
      if (disabled || (event.target as HTMLElement).closest('button,input,select,a,[role="slider"],[role="button"]')) return;
      onToggle();
    }}>
      {children}

    </div>
    {status}
  </div>;
}
