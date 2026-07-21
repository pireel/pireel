# @pireel/studio-ui

The Pireel Studio editor UI: the workbench (preview-as-editor, timeline, shot framing), caption/frame/person-fx panels, agent chat, client-side export, person matte, and the external-agent bridge.

Boundaries:
- **Capabilities** (LLM, ASR, storage, persistence, uploads) are injected via `@pireel/studio-engine/providers` — call `setStudioProviders(...)` in your shell before rendering.
- **SaaS-specific UI** (billing cards, generation model params) is injected via `StudioShellProvider` (`shell-context`) and degrades gracefully when absent.

## License

AGPL-3.0-only — see [LICENSE](./LICENSE). © Pireel.
