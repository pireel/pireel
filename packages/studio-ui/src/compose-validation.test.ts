import { describe, expect, it, vi } from 'vitest';
import { acceptGeneratedComponent } from './compose-validation';
import { GeneratedBlockValidationError } from './compose-result';
import { componentContractExample } from '@pireel/studio-engine/component-authoring-contract';

const seed = { id: 'g1', innerHtml: '', timelineBody: '', boxPx: { w: 580, h: 326 } };
const bad = '```html\n<div data-edit="t">Hello</div><script>alert(1)</script>\n```';
const message = (reason: string) => reason;

describe('component model-call budget', () => {
  it.each(['new', 'edit'])('%s: style or missing-property warnings never call the model again', async (mode) => {
    const repair = vi.fn(); const warnings = vi.fn();
    const raw = '```html\n<div data-edit="t" style="font-size:18px">Hello</div>\n```\n```js\n\n```';
    const result = await acceptGeneratedComponent({ seed: { ...seed, innerHtml: mode === 'edit' ? '<b>Old</b>' : '' }, raw, repair, onWarnings: warnings, failureMessage: message });
    expect(result.innerHtml).toContain('Hello');
    expect(repair).not.toHaveBeenCalled();
    expect(warnings).toHaveBeenCalled();
  });
  it.each(['new', 'edit'])('%s: CSS recovery preserves the component without a model repair', async (mode) => {
    const repair = vi.fn(); const warnings = vi.fn();
    const raw = '```html\n<div class="label" data-edit="t">Hello</div><style>???{color:red}.label{color:blue;font-size:36px}</style>\n```';
    const result = await acceptGeneratedComponent({ seed: { ...seed, innerHtml: mode === 'edit' ? '<b>Old</b>' : '' }, raw, repair, onWarnings: warnings, failureMessage: message });
    expect(result.innerHtml).toContain('Hello');
    expect(result.innerHtml).toContain('.label{color:blue');
    expect(repair).not.toHaveBeenCalled();
    expect(warnings).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ code: 'css-recovery' })]));
  });
  it('repairs real contract errors once and excludes quality advice from the repair prompt', async () => {
    const repair = vi.fn().mockResolvedValue(componentContractExample('g1'));
    await acceptGeneratedComponent({ seed, raw: bad, repair, failureMessage: message });
    expect(repair).toHaveBeenCalledTimes(1);
    expect(repair.mock.calls[0]![1]).toContain('must not contain <script>');
    expect(repair.mock.calls[0]![1]).not.toContain('must declare editable properties');
  });
  it('stops after the one repair if the contract is still broken', async () => {
    const repair = vi.fn().mockResolvedValue(bad);
    await expect(acceptGeneratedComponent({ seed, raw: bad, repair, failureMessage: message })).rejects.toBeInstanceOf(GeneratedBlockValidationError);
    expect(repair).toHaveBeenCalledTimes(1);
  });
});
