<div align="center">

# Pireel Studio

**An open-source AI video editor built for humans and AI agents.**

[English](README.md) · [简体中文](README.zh-CN.md)

Start with one clip, a collection of media, or a blank video. Edit directly on
the canvas and timeline, or describe the result you want.

<img src="https://cdn.pireel.com/static/landing/editorial-scenes/chat-editing-hero-dark-v8.jpg" alt="Pireel Studio video editing workspace" width="880" />

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Agent plugin](https://img.shields.io/badge/Agent-plugin-8b5cf6.svg)](https://github.com/pireel/pireel-agent)

[Try Pireel](https://pireel.com) · [Connect an agent](https://pireel.com/connect-agent.md)

</div>

---

Pireel brings AI into a real editing workspace. AI can help make the first cut,
but you stay in control of the canvas, timeline, captions, graphics, audio, and
final export.

## What you can create

- Talking-head videos with cleaner pacing and readable captions
- Short clips made from longer recordings
- Product demos, tutorials, explainers, and marketing videos
- Multi-source edits combining video, images, audio, and graphics
- Multiple versions for different platforms, formats, and audiences
- Videos shaped with reusable editing Skills and visual Frames

## Edit your way

- **Directly in Studio** for hands-on canvas and timeline editing
- **With Chat** by describing cuts, pacing, captions, layouts, and visual ideas
- **With an AI agent** such as Codex or Claude Code
- **Any combination of the three** as the project develops

## Run the open-source editor

```bash
git clone https://github.com/pireel/pireel.git
cd pireel
corepack enable
pnpm install
pnpm dev
```

Open the URL shown in the terminal and import your media.

The open-source edition focuses on local editing. For the complete hosted
experience, including built-in Chat and connected services, visit
[pireel.com](https://pireel.com).

## Connect an AI agent

Install the public Pireel agent plugin:

```bash
npx skills add pireel/pireel-agent
```

Then ask your agent to set up Pireel. See the
[connection guide](https://pireel.com/connect-agent.md) for supported agents.

## License

[AGPL-3.0-only](LICENSE). The separate agent plugin is licensed under Apache-2.0.
