'use client';

/**
 * Composer mode switch — the leading control of the input toolbar, built like the Skill picker:
 * one icon button, one popover list. Chat is the default; the generation modes (image / video /
 * audio / graphic) reshape the composer (placeholder, parameters, template chips) but every mode
 * still submits to the same agent: a mode is an intent the message carries, not a second UI.
 */

import { useRef, type RefObject } from 'react';
import { Check, Image as ImageIcon, MessageSquare, Music, Shapes, Video } from 'lucide-react';
import { TriggerPopover, type TriggerPopoverHandle } from '@pireel/ui/trigger-popover';
import { t } from './i18n';
import type { ChatMode } from './chat-generation-intent';

interface ModeOption {
  id: ChatMode;
  label: string;
  summary: string;
}

const MODE_ICON = {
  chat: MessageSquare,
  image: ImageIcon,
  video: Video,
  audio: Music,
  element: Shapes,
} as const;

export function chatModeLabel(mode: ChatMode): string {
  return t(
    mode === 'chat' ? 'chatGen.modeChat'
      : mode === 'image' ? 'chatGen.intentImage'
        : mode === 'video' ? 'chatGen.intentVideo'
          : mode === 'audio' ? 'chatGen.intentAudio'
            : 'chatGen.intentElement',
  );
}

export function ChatModePicker({ editorRef, mode, disabled, onChange }: { editorRef: RefObject<HTMLElement | null>; mode: ChatMode; disabled?: boolean; onChange: (mode: ChatMode) => void }) {
  const popoverRef = useRef<TriggerPopoverHandle>(null);
  const options: ModeOption[] = (['chat', 'image', 'video', 'audio', 'element'] as ChatMode[]).map((id) => ({
    id,
    label: chatModeLabel(id),
    summary: t(
      id === 'chat' ? 'chatGen.modeChatSummary'
        : id === 'image' ? 'chatGen.modeImageSummary'
          : id === 'video' ? 'chatGen.modeVideoSummary'
            : id === 'audio' ? 'chatGen.modeAudioSummary'
              : 'chatGen.modeElementSummary',
    ),
  }));
  const Icon = MODE_ICON[mode];
  const generating = mode !== 'chat';

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => popoverRef.current?.open(event.currentTarget)}
        title={t('chatGen.modeCurrent', { title: chatModeLabel(mode) })}
        aria-label={t('chatGen.modeCurrent', { title: chatModeLabel(mode) })}
        className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
          generating ? 'bg-accent/12 text-ink hover:bg-accent/20' : 'text-ink-3 hover:bg-line hover:text-ink'
        }`}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
        {generating ? <span className="truncate">{chatModeLabel(mode)}</span> : null}
      </button>

      <TriggerPopover<ModeOption>
        ref={popoverRef}
        editorRef={editorRef}
        enabled={!disabled}
        items={options}
        itemSearchText={(item) => `${item.label} ${item.summary}`}
        itemKey={(item) => item.id}
        title={t('chatGen.modePickerTitle')}
        initialActiveKey={mode}
        className="w-[300px]"
        onPick={(item) => onChange(item.id)}
        renderItem={(item, { active, pick, setActive }) => {
          const ItemIcon = MODE_ICON[item.id];
          const selected = item.id === mode;
          return (
            <button
              type="button"
              data-active={active || undefined}
              onMouseEnter={setActive}
              onMouseDown={(event) => event.preventDefault()}
              onClick={pick}
              className={`flex w-full items-start gap-2.5 px-2.5 py-2 text-left ${active ? 'bg-panel-2' : ''}`}
            >
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${selected ? 'bg-accent/10 text-accent' : 'text-ink-3'}`}>
                <ItemIcon className="h-4 w-4" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-ink flex items-center gap-1 text-[12.5px] font-medium">
                  {item.label}
                  {selected ? <Check className="h-3 w-3" /> : null}
                </span>
                <span className="text-ink-4 mt-0.5 block text-[11px] leading-snug">{item.summary}</span>
              </span>
            </button>
          );
        }}
      />
    </>
  );
}
