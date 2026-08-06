'use client';

import { FileVideo2, Plus } from 'lucide-react';

export interface ProjectOutputTab {
  id: string;
  title: string;
  coverThumb: string | null;
  durationSec: number | null;
}

export function ProjectOutputSwitcher({
  outputs,
  activeId,
  label,
  duplicateLabel,
  outputName,
  switching,
  onSwitch,
  onDuplicate,
}: {
  outputs: ProjectOutputTab[];
  activeId: string;
  label: string;
  duplicateLabel: string;
  outputName: (index: number) => string;
  switching?: boolean;
  onSwitch: (id: string) => void;
  onDuplicate: () => void;
}) {
  return (
    <div
      data-cap-keep
      role="tablist"
      aria-label={label}
      className="border-line bg-panel/90 absolute left-1/2 top-2 z-30 flex max-w-[min(72%,760px)] -translate-x-1/2 items-center gap-1 rounded-lg border p-1 shadow-lg backdrop-blur-md"
    >
      <div className="scrollbar-none flex min-w-0 items-center gap-1 overflow-x-auto">
        {outputs.map((output, index) => {
          const active = output.id === activeId;
          const title = output.title || outputName(index + 1);
          return (
            <button
              key={output.id}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={switching}
              onClick={() => onSwitch(output.id)}
              className={`group flex h-8 shrink-0 items-center gap-1.5 rounded-md py-1 pl-1 pr-2 text-left transition-colors disabled:cursor-wait ${
                active ? 'bg-ink text-bg shadow-sm' : 'text-ink-3 hover:bg-panel-2 hover:text-ink'
              }`}
            >
              <span className={`relative flex h-6 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm ${active ? 'bg-bg/15' : 'bg-panel-2'}`}>
                {output.coverThumb ? (
                  <img src={output.coverThumb} alt="" className="h-full w-full object-cover" />
                ) : (
                  <FileVideo2 size={12} className={active ? 'text-bg/70' : 'text-ink-4'} />
                )}
                <span className={`absolute bottom-0 left-0 px-1 font-mono text-[7px] leading-3 ${active ? 'bg-ink/75 text-bg' : 'bg-black/65 text-white'}`}>
                  {String(index + 1).padStart(2, '0')}
                </span>
              </span>
              <span className="max-w-28 truncate text-[11px] font-medium">{title}</span>
            </button>
          );
        })}
      </div>
      <span className="bg-line mx-0.5 h-4 w-px shrink-0" />
      <button
        type="button"
        aria-label={duplicateLabel}
        title={duplicateLabel}
        disabled={switching}
        onClick={onDuplicate}
        className="text-ink-3 hover:bg-panel-2 hover:text-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors disabled:cursor-wait disabled:opacity-50"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
