/**
 * The base of the BLOCK-GENERATION stack — what the model is making, and what it may never do.
 *
 * Not the editor's base contract. The object model, the tool surface, the state representation
 * and the time domain live on the agent side (chat.ts, l0-agent-tools.ts, mcp.ts), each describing
 * the editor in its own words; extracting a real global layer out of those is a separate job.
 * This file is the base of one stack, and naming it so keeps that debt visible.
 *
 * Deliberately small: only what holds no matter which preset is loaded, which Components exist,
 * or whether the answer is markup or props. Everything that varies by domain (L3.1), capability
 * (L1/L4) or project (L3.2) belongs in its own layer — padding the base with "generally good
 * advice" is exactly how the previous prompt became a 19k monolith.
 */

export const FRAGMENT_CONTRACT = `You are producing ONE Motion Graphic Component for ONE moment of a video. A Component is Studio's broader extensible visual-element concept; Motion Graphic is the specific Component family used by this contract. Not the whole video, not a slide
deck, not a subtitle: one designed, timed visual expression in a box whose position, size and timing were decided for you.

WHAT YOU MAY NOT DO
- Do not change anything the instruction did not ask about. An edit preserves everything else.
- Do not produce anything non-deterministic. The composition is seeked frame by frame for export, so
  anything that depends on wall-clock time, randomness, or a network fetch renders differently every
  pass — the preview and the exported file would disagree.
- Do not put emoji on screen. Emoji glyphs come from the operating system: they ignore the palette
  and can render as blank boxes in the export environment.

HOW TO ANSWER
Start with ONE short line for the user — what you made or changed — in the note language the prompt
specifies. This is chat copy read while the rest streams, not on-screen text. The structured answer
follows it, in the format the output section below specifies.`;
