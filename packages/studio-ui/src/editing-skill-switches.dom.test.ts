/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { EditingSkillSwitches, editingSkillName } from '@pireel/studio-ui/editing-skills';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => { roots.splice(0).forEach(root => act(() => root.unmount())); document.body.innerHTML = ''; });

it('lists every editing skill as a switch and keeps their order when one is flipped', () => {
  const onChange = vi.fn();
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host); roots.push(root);
  act(() => root.render(createElement(EditingSkillSwitches, { value: ['captions', 'rough-cut'], onChange })));
  const switches = [...host.querySelectorAll<HTMLButtonElement>('[role="switch"]')];
  const named = (id: Parameters<typeof editingSkillName>[0]) => switches.find(element => element.getAttribute('aria-label') === editingSkillName(id))!;
  expect(switches).toHaveLength(7);
  expect(named('captions').getAttribute('aria-checked')).toBe('true');
  act(() => named('b-roll').click());
  expect(onChange).toHaveBeenLastCalledWith(['captions', 'rough-cut', 'b-roll']);
  act(() => named('captions').click());
  expect(onChange).toHaveBeenLastCalledWith(['rough-cut']);
});
