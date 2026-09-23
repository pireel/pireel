'use client';

import { AlignLeft, MessageSquareText } from 'lucide-react';
import { t } from './i18n';
import type { EditingMode } from './workbench-dock';

/** The shared footer stays in place while the editor body switches modes. */
export function EditorModeSwitch({ mode, onChange }: {
  mode: EditingMode;
  onChange: (mode: EditingMode) => void;
}) {
  return <div data-editor-mode-switch data-block-selection-keep data-cap-keep className="shrink-0 px-2.5 pb-2.5 pt-1">
    <div role="tablist" aria-label={t('workbench.editingMode')}
      className="border-line bg-bg relative grid grid-cols-2 rounded-lg border p-1">
      <span aria-hidden className="border-line bg-panel-2 pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-8px)/2)] rounded-md border shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{ transform: mode === 'captions' ? 'translateX(100%)' : 'translateX(0)' }} />
      {([
        { id: 'chat', label: 'workbench.chat', icon: MessageSquareText },
        { id: 'captions', label: 'captions.transcriptEditor', icon: AlignLeft },
      ] as const).map((item) => <button key={item.id} type="button" role="tab"
        id={`editor-tab-${item.id}`} data-mode={item.id} aria-controls={`editor-panel-${item.id}`}
        aria-selected={mode === item.id} tabIndex={mode === item.id ? 0 : -1}
        onClick={() => onChange(item.id)}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          const next = event.key === 'Home' ? 'chat' : event.key === 'End' ? 'captions' : item.id === 'chat' ? 'captions' : 'chat';
          onChange(next);
          event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)?.focus();
        }}
        className={`focus-visible:ring-accent relative flex h-8 min-w-0 items-center justify-center gap-2 rounded-md text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset ${mode === item.id ? 'text-ink font-medium' : 'text-ink-4 hover:text-ink-2'}`}>
        <item.icon size={14} strokeWidth={1.7} aria-hidden />
        <span>{t(item.label)}</span>
      </button>)}
    </div>
  </div>;
}
