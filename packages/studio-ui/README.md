# @pireel/studio-ui

The Pireel Studio editor UI: the workbench (preview-as-editor, timeline, shot framing), caption/frame/person-fx panels, agent chat, client-side export, person matte, and the external-agent bridge.

Boundaries:
- **Capabilities** (LLM, ASR, storage, persistence, uploads) are injected via `@pireel/studio-engine/providers` — call `setStudioProviders(...)` in your shell before rendering.
- **Host-specific UI and catalogs** (billing cards, generation model params, browser-safe Skill metadata, curated-assets panels) are injected via `StudioShellProvider` (`shell-context`) and degrade gracefully when absent.
- **Private content stays outside this package**: the UI receives only Skill labels/ids; full Markdown is resolved by the host server. Curated asset data/search comes from optional host providers and slots.

## License

AGPL-3.0-only — see [LICENSE](./LICENSE). © Pireel.
