<div align="center">

# Pireel Studio

**An open-source, backend-free AI video editor for talking-head video.**

Import a clip and the canvas follows your footage — editing, storyboarding,
designed graphics, kinetic captions, themes, live preview, timeline and export
all run **fully in the browser**. No account, no server.

<img src="https://cdn.pireel.com/static/landing/hero.png" alt="Pireel Studio editor" width="880" />

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Agent plugin](https://img.shields.io/badge/Agent-plugin-8b5cf6.svg)](https://github.com/pireel/pireel-agent)
&nbsp;·&nbsp; [pireel.com](https://pireel.com)

</div>

---

This repository is the source for the editor packages plus a minimal shell that
mounts them as a plain Vite app. It is synced one-way from the Pireel monorepo;
develop against the hosted product at [pireel.com](https://pireel.com).

## Quick start

The fastest way to drive Pireel is from your AI coding agent (Codex / Claude
Code) — install the plugin and it connects the editor over MCP:

```bash
npx skills add pireel/pireel-agent
```

Or run the editor shell locally:

```bash
pnpm install
pnpm dev
```

Open the printed URL, drop in a video, and start editing. Drafts persist in
`localStorage`, video bytes in OPFS — nothing leaves the browser.

## Themes

Every video can wear a full design system — palette, type and layout dialect.
Dozens ship in `@pireel/studio-frames`; here are a few.

<div align="center">

<img src="https://cdn.pireel.com/static/landing/frame-covers/cinema-frame.webp" alt="Cinema Frame" width="210" />
<img src="https://cdn.pireel.com/static/landing/frame-covers/neon-runner.webp" alt="Neon Runner" width="210" />
<img src="https://cdn.pireel.com/static/landing/frame-covers/noir-gold.webp" alt="Noir Gold" width="210" />
<img src="https://cdn.pireel.com/static/landing/frame-covers/glass-tech.webp" alt="Glass Tech" width="210" />
<br />
<img src="https://cdn.pireel.com/static/landing/frame-covers/memphis-pop.webp" alt="Memphis Pop" width="210" />
<img src="https://cdn.pireel.com/static/landing/frame-covers/y2k-chrome.webp" alt="Y2K Chrome" width="210" />
<img src="https://cdn.pireel.com/static/landing/frame-covers/botanic-press.webp" alt="Botanic Press" width="210" />
<img src="https://cdn.pireel.com/static/landing/frame-covers/paper-cut.webp" alt="Paper Cut" width="210" />

</div>

## What works with no backend

- **Local editing**: talking-head track, blocks, captions, timeline, live
  preview — all client-side.
- **Client export**: WYSIWYG export on WebCodecs (Chromium).
- **Frame themes**: the full catalog is served from `@pireel/studio-frames`.
- **Local uploads**: a disk-backed dev route (`/local-assets`) stores
  content-addressed files, the local counterpart of the hosted upload provider.

## What needs providers

Generation (block composition, narration planning, transcription, cloud media
vault, cross-device sync, image/video generation) is injected through
`StudioProviders`. The shell registers `unavailableProviders()`, so those paths
fail with a hint until you wire them up. Two ways to light them:

1. **Inject your own providers** in
   [`apps/studio-oss/src/providers.ts`](apps/studio-oss/src/providers.ts) — five
   small contracts (composer / planner / transcriber / vault / projects) you can
   point at any backend or local model.
2. **Bring your own agent**: the editor is designed to be driven by an external
   agent over MCP. See the
   [agent plugin](https://github.com/pireel/pireel-agent) and the connect guide
   at [pireel.com/connect-agent.md](https://pireel.com/connect-agent.md).

## Layout

```
apps/studio-oss/        minimal Vite shell that mounts the editor
packages/studio-ui/     editor UI (workbench, panels, timeline, client export)
packages/studio-engine/ composition core, briefs, prompts, video-edit utilities
packages/studio-frames/ frame themes (design systems) + content
packages/ui/            shared primitives, brand mark, theme tokens
```

## License

[AGPL-3.0-only](LICENSE).
