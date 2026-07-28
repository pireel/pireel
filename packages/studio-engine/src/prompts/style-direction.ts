/**
 * L3.2 — the project's theme voice.
 *
 * Orthogonal to the preset (any theme × any preset) and the most volatile layer in a session:
 * the user switches themes while everything above stays put. So it goes LAST in the assembled
 * system prompt — switching a theme should invalidate one trailing section, not the whole prefix.
 */

export function withStyleDirection(system: string, voice?: string): string {
  if (!voice?.trim()) return system;
  return `${system}

<style_direction>
${voice.trim()}
</style_direction>
Follow this voice in what you choose and how you word it. It never overrides the length caps or the
"verbatim, never invent" rule.`;
}
