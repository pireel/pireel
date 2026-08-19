/** The general theme's structural design brief for the LLM (colors derived from the footage, structure fixed). */

export const THEME_GENERAL_BRIEF = `# General — STRUCTURAL design system (colors come from the footage, structure is fixed)

WHAT YOU MAKE
- Design-forward visual layers for the actual canvas and authored Scene. A layer may annotate source footage, share a split composition, join other media in one hierarchy, or intentionally lead a full-field moment. It is NOT automatically a card, slide, subtitle, or full-screen answer.
- Give each layer one clear communicative job. Its scale, density and reading time come from the Scene design, delivery size and available duration rather than a fixed portrait-video template.

STRUCTURE (this is what the theme fixes)
- Align to an implied grid. Generous internal padding; honest whitespace. Left-align by default; center only single hero numbers/words.
- Strong typographic CONTRAST is the main tool: ONE oversized focal element (a number var(--font-num), a keyword, a node) against small calm labels var(--muted). Reduce CJK headline size one tier vs latin — CJK reads heavy.
- Hairlines, not boxes-everywhere: 1px var(--line) dividers/rules; var(--grid) for chart axes. Corners var(--radius) (or square for a stricter look). Restraint beats flashiness — remove anything that isn't carrying meaning.
- Label things like an editorial/data deck: a small kicker (index "03", a section tag) + the content + a tiny source/unit line.

COLOR — tokens ONLY, never invent hex
- Ink var(--fg); secondary var(--muted). Surfaces var(--panel) / var(--panel-2). Lines var(--line) / var(--grid).
- ONE accent var(--accent) does the work (active value, key bar, highlighted node, underline); var(--accent-2) only for a true second series. Charts: var(--up)/var(--down). The accent + panel tint are DERIVED FROM THE FOOTAGE — trust the tokens; never hardcode colors.

TYPOGRAPHY
- Headings/keywords var(--font-head) weight 800, tight leading. Numbers/stats var(--font-num), oversized, tabular. Body/labels var(--font-body), short.

MOTION (structural reveal, calm)
- Reveal the STRUCTURE: bars grow from baseline, lines/connectors draw (stroke-dashoffset), nodes/rows stagger in (0.05–0.12s), numbers can count up. power3.out / back.out(1.4), quick (0.25–0.6s). One hero motion; everything else settles and stays still. Never bouncy-cute, never drifting.

DON'T
- No default subtitles / lower-third running text. No generic centered paragraph. No rainbow (the accent does the work). No skeuomorphism, no drop-shadow soup, no decorative gradients. Never cover the primary subject, action, interface, product identity or evidence named by the Scene design.
- Don't wrap every fragment in a filled panel: over footage, well-chosen high-contrast ink on strong type IS the separation — panels/scrims are for dense structured content, not a reflex.`;
