import { describe, expect, it } from 'vitest';
import { splitNextSteps } from './chat-next-steps';

describe('next steps in a reply', () => {
  it('takes the offered steps out of the text', () => {
    const { body, steps } = splitNextSteps('Done: captions are on.\n<next>Add a hook in the first 3 seconds</next>\n<next> Tighten the ending </next>');
    expect(body).toBe('Done: captions are on.');
    expect(steps).toEqual(['Add a hook in the first 3 seconds', 'Tighten the ending']);
  });

  it('hides a step still streaming in', () => {
    expect(splitNextSteps('Done.\n<next>Add a ho').body).toBe('Done.');
    expect(splitNextSteps('Done.\n<ne').body).toBe('Done.');
    expect(splitNextSteps('Done.\n<next>Add a ho').steps).toEqual([]);
  });

  it('leaves a reply without steps as it is', () => {
    expect(splitNextSteps('Cut 3 pauses.')).toEqual({ body: 'Cut 3 pauses.', steps: [] });
  });
});
