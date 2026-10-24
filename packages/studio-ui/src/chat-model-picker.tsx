import { useState } from 'react';
import { Popover, RadioGroup } from 'radix-ui';
import { Check, ChevronDown } from 'lucide-react';
import { STUDIO_AGENT_MODELS, type StudioAgentModelId } from '@pireel/studio-engine/agent-models';
import { studioLocale } from '@pireel/studio-ui/i18n';
import { t } from './i18n';

export function ChatModelPicker({ value, disabled, onChange, locale }: {
  locale?: string;
  value: StudioAgentModelId; disabled: boolean; onChange: (id: StudioAgentModelId) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = STUDIO_AGENT_MODELS.find(model => model.id === value)!;
  const zh = (locale ?? studioLocale()).startsWith('zh');
  const label = t('ui.chatModelPicker.agentModel');
  const version = (model: typeof STUDIO_AGENT_MODELS[number]) => model.id === 'auto' ? t('ui.chatModelPicker.costEfficient') : model.version;
  return <Popover.Root open={open && !disabled} onOpenChange={setOpen}>
    <Popover.Trigger asChild><button type="button" disabled={disabled} aria-label={`${label}: ${current.label} ${version(current)}`} className="text-ink-3 hover:text-ink hover:bg-panel-2 inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] disabled:opacity-50">
      {current.label}<ChevronDown size={12} />
    </button></Popover.Trigger>
    <Popover.Portal><Popover.Content side="top" align="end" sideOffset={8} collisionPadding={12} aria-label={label} className="studio-scope bg-panel border-line z-[100] w-52 rounded-xl border p-1.5 shadow-xl">
      <RadioGroup.Root value={value} disabled={disabled} aria-label={label} onValueChange={id => {
        const model = STUDIO_AGENT_MODELS.find(model => model.id === id);
        if (!disabled && model) { onChange(model.id); setOpen(false); }
      }}>{STUDIO_AGENT_MODELS.map(model => <RadioGroup.Item key={model.id} value={model.id} aria-label={`${model.label} ${version(model)}`} className="hover:bg-panel-2 focus-visible:bg-panel-2 text-ink flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs outline-none">
        <span className="flex-1">{model.label}<span className="text-ink-4 ml-2 text-[11px]">{version(model)}</span></span>{model.id === value && <Check size={14} />}
      </RadioGroup.Item>)}</RadioGroup.Root>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
