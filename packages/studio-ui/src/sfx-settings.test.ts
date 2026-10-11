// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SfxSettings } from './sfx-settings';
import { DEFAULT_SFX_OPTIONS } from '@pireel/studio-engine/sfx-task';
it('offers only three density choices and supports keyboard selection and disabled state', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container); const change = vi.fn();
  const render = async (disabled: boolean) => act(async () => root.render(createElement(SfxSettings, { value: DEFAULT_SFX_OPTIONS, onChange: change, disabled, locale: 'zh' })));
  try {
    await render(false);
    const choices = [...container.querySelectorAll<HTMLButtonElement>('[role=radio]')]; expect(choices).toHaveLength(3);
    expect(choices.map(button => button.textContent)).toEqual(['低', '中', '高']);
    expect(choices[1].getAttribute('aria-checked')).toBe('true');
    expect(container.querySelector('input,select,textarea')).toBeNull(); expect(container.textContent).not.toContain('风格');
    await act(async () => choices[2].click()); expect(change).toHaveBeenLastCalledWith({ density: 'high' });
    await act(async () => choices[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    expect(change).toHaveBeenLastCalledWith({ density: 'low' }); expect(document.activeElement).toBe(choices[0]);
    await render(true); change.mockClear(); await act(async () => choices[2].click()); expect(change).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
});
