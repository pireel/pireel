# @pireel/studio-engine

The pure kernel of Pireel Studio. Everything here is framework-free and side-effect-free:

- `composition` / `composition-core` — the composition data model, block/shot math, HTML assembly
- `trim` — edited-timeline ↔ source-clock arithmetic (splits, trims, range removal, block compression)
- `captions-relay` / `caption-presets` / `caption-fx` — the caption layer as a pure function of the transcript
- `build-draft` / `build-blocks` / `plan` — storyboarding from a narration plan
- `prompts` — the full prompt contract stack (block system, planning, chat identity, agent tool schemas)
- `briefs` — BYO-brain brief assembly (bring your own model; the engine never calls an LLM)
- `mcp` / `bridge-do` — MCP protocol core and the browser-bridge Durable Object
- `server-tools` — the offline executor: every data-level tool as a pure `(comp, context) → (comp', result)` function

Consumers inject providers (LLM, ASR, storage, persistence). The engine owns contracts, not services.

## License

AGPL-3.0-only — see [LICENSE](./LICENSE). © Pireel.
