/**
 * The host's neutral visual-craft baseline — the quality floor for a component when the video has no
 * authored Frame (hierarchy, placement, restraint, legibility, anti-slop rules like "don't default to
 * a filled card"). The server compose route folds this into every brief via assembleComposeBrief; the
 * in-chat BYO path assembles the brief in the browser, so the shell injects the same text here once at
 * startup and the compose_component step passes it through.
 *
 * It is not kept in the OSS tree as text (the shell owns it) and it is not a secret: the assembled
 * brief already ships it to the browser for BYO generation. Empty when the shell injects nothing (an
 * open-source shell) — assembleComposeBrief simply omits the baseline layer, keeping the technical
 * contract intact.
 */
let baseline = '';

/** Called once by the shell (providers) with the host visual-craft baseline. */
export function setVisualCraftBaseline(text: string): void {
  baseline = text.trim();
}

export function visualCraftBaseline(): string {
  return baseline;
}
