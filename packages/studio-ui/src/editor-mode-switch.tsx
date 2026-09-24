'use client';

import { t } from './i18n';
import type { EditingMode } from './workbench-dock';

/** AI chat: a speech bubble holding a four-point spark. */
function ChatModeIcon() {
  return <svg viewBox="0 0 16 16" width={14} height={14} fill="none" aria-hidden>
    <path d="M3.2 2.6h9.6a1.6 1.6 0 0 1 1.6 1.6v5.9a1.6 1.6 0 0 1-1.6 1.6H7.4l-2.9 2.1v-2.1H3.2a1.6 1.6 0 0 1-1.6-1.6V4.2a1.6 1.6 0 0 1 1.6-1.6Z"
      stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
    <path d="M8 4.4c.2 1.2.7 1.7 1.9 1.9-1.2.2-1.7.7-1.9 1.9-.2-1.2-.7-1.7-1.9-1.9 1.2-.2 1.7-.7 1.9-1.9Z" fill="currentColor" />
  </svg>;
}

/** Transcript: text lines with one marked word and a spoken-wave tail. */
function TranscriptModeIcon() {
  return <svg viewBox="0 0 16 16" width={14} height={14} fill="none" aria-hidden>
    <path d="M2.2 3.6h11.6M2.2 12.4h6.2" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
    <path d="M2.2 8h2.6M11.2 8h2.6" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
    <rect x="5.8" y="6.2" width="4.4" height="3.6" rx="1" fill="currentColor" />
    <path d="M10.6 12.4v-.6M12.2 13.4v-2.6M13.8 12.4v-.6" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
  </svg>;
}

const MODES = [
  { id: 'chat', label: 'workbench.chat', Icon: ChatModeIcon, chip: 'from-[#5b63f5] to-[#a855f7]' },
  { id: 'captions', label: 'captions.transcriptEditor', Icon: TranscriptModeIcon, chip: 'from-[#f97316] to-[#ec4899]' },
] as const;

/** Header switch between the AI chat and the transcript editor in the left column. */
export function EditorModeSwitch({ mode, onChange }: {
  mode: EditingMode;
  onChange: (mode: EditingMode) => void;
}) {
  return <div role="tablist" aria-label={t('workbench.editingMode')} data-editor-mode-switch data-block-selection-keep data-cap-keep
    className="border-line/60 flex shrink-0 items-center gap-0.5 rounded-full border p-0.5">
    {MODES.map(({ id, label, Icon, chip }) => {
      const active = mode === id;
      return <button key={id} type="button" role="tab"
        id={`editor-tab-${id}`} data-mode={id} aria-controls={`editor-panel-${id}`}
        aria-selected={active} tabIndex={active ? 0 : -1}
        onClick={() => onChange(id)}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          const next = event.key === 'Home' ? 'chat' : event.key === 'End' ? 'captions' : id === 'chat' ? 'captions' : 'chat';
          onChange(next);
          event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)?.focus();
        }}
        className={`focus-visible:ring-accent group flex h-8 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-1 ${active ? 'bg-panel-2/35 text-ink font-medium' : 'text-ink-3 hover:text-ink'}`}>
        <span className={`grid size-6 place-items-center rounded-full transition-all duration-200 motion-reduce:transition-none ${active
          ? `bg-gradient-to-br ${chip} text-white shadow-[0_2px_8px_-2px_rgba(0,0,0,0.35)]`
          : 'text-ink-4 group-hover:text-ink-2 group-hover:bg-panel-2/35'}`}>
          <Icon />
        </span>
        <span>{t(label)}</span>
      </button>;
    })}
  </div>;
}
