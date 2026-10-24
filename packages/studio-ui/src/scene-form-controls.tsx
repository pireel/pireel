import { useId, type ReactNode } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@pireel/ui/select';
import { Switch } from '@pireel/ui/switch';

/** Shared presentation only; scene and workflow owners retain their own persistence. */
export function SceneSelect<T extends string>({ label, ariaLabel = label, value, options, onChange, disabled = false, footer, portalOwner }: {
  label: string; ariaLabel?: string; value: T; options: readonly { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void; disabled?: boolean;
  /** Extra content under the options inside the open list, e.g. an entry to create a new choice. */
  footer?: ReactNode;
  /** Associates a portaled menu with its enclosing generation popover. */
  portalOwner?: string;
}) {
  return <div className="text-ink flex min-w-0 flex-wrap items-center justify-between gap-3 text-xs">
    <span>{label}</span>
    <Select disabled={disabled} value={value} onValueChange={value => onChange(value as T)}>
      <SelectTrigger aria-label={ariaLabel} className="border-line bg-bg h-8 w-48 max-w-full text-xs shadow-none hover:bg-panel-2"><SelectValue /></SelectTrigger>
      <SelectContent data-scene-select-owner={portalOwner} className={`studio-scope max-h-72 ${portalOwner ? 'z-[140]' : ''}`}>{options.map(option => <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>)}{footer && <div className="border-line mt-1 border-t pt-1">{footer}</div>}</SelectContent>
    </Select>
  </div>;
}

export function SceneRange({ label, value, min, max, step = 1, unit = '', onChange, disabled = false }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void; disabled?: boolean;
}) {
  return <label className="text-ink flex min-w-0 flex-col gap-2 text-xs">
    <span className="flex justify-between gap-3">{label}<span aria-hidden="true" className="text-ink-3 shrink-0 tabular-nums">{value}{unit}</span></span>
    <input type="range" aria-label={label} aria-valuetext={`${value}${unit}`} min={Math.min(min, value)} max={Math.max(max, value)} step={step} value={value} disabled={disabled} onChange={event => onChange(Number(event.target.value))} className="w-full accent-[var(--color-accent)] disabled:opacity-50" />
  </label>;
}

/** An on/off setting: the label leads, the switch sits at the end of the row. */
export function SceneSwitch({ label, checked, onChange, description, disabled = false }: {
  label: string; checked: boolean; onChange: (checked: boolean) => void; description?: ReactNode; disabled?: boolean;
}) {
  const id = useId();
  return <div className="text-ink text-xs leading-relaxed">
    <div className="flex min-w-0 items-center justify-between gap-3">
      <label htmlFor={id} className={'min-w-0 ' + (disabled ? 'opacity-50' : 'cursor-pointer')}>{label}</label>
      <Switch id={id} checked={checked} disabled={disabled} aria-describedby={description ? `${id}-note` : undefined} onCheckedChange={onChange} />
    </div>
    {description && <p id={`${id}-note`} className="text-ink-3 mt-1 text-xs">{description}</p>}
  </div>;
}

const textClass = 'border-line bg-bg text-ink w-full min-w-0 rounded-md border px-3 py-2 text-xs leading-relaxed placeholder:text-ink-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ink-4 disabled:opacity-50';
export function SceneTextField({ label, value, onChange, placeholder, rows, disabled = false }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string; rows?: number; disabled?: boolean;
}) {
  return <label className="text-ink flex min-w-0 flex-col gap-2 text-xs">{label}{rows
    ? <textarea rows={rows} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} className={textClass + ' resize-y'} />
    : <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} className={textClass} />}</label>;
}

export function SceneColor({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-ink flex items-center justify-between gap-2 text-xs">{label}<input type="color" value={value} onChange={event => onChange(event.target.value)} className="border-line bg-panel h-7 w-9 shrink-0 cursor-pointer rounded border p-0.5" /></label>;
}
