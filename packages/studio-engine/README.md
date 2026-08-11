# @pireel/studio-engine

The pure kernel of Pireel Studio. Everything here is framework-free and side-effect-free:

- `composition` / `composition-core` — the composition data model, block/shot math, HTML assembly
- `trim` — edited-timeline ↔ source-clock arithmetic (splits, trims, range removal, block compression)
- `captions-relay` / `caption-presets` / `caption-fx` — the caption layer as a pure function of the transcript
- `build-blocks` / `graphics-layout` — transcript-derived blocks and geometry-aware overlay placement
- `prompts` — the prompt contract stack (block system, chat identity, agent tool schemas)
- `briefs` — BYO-brain brief assembly (bring your own model; the engine never calls an LLM)
- `mcp` / `bridge-do` — MCP protocol core and the browser-bridge Durable Object
- `server-tools` — the offline executor: every data-level tool as a pure `(comp, context) → (comp', result)` function

Consumers inject providers (LLM, ASR, storage, persistence). The engine owns contracts, not services.

## Studio Skills

The package ships one public baseline Skill, `talking-head-edit`, plus the parser, registry, merge,
and prompt seams needed by hosts and ecosystem packages:

- `scenario-skills/vite` exposes the ready OSS registry and localized picker metadata to Vite shells.
- `createStudioScenarioSkillRegistry(files)` parses raw `SKILL.md` content from any runtime.
- `mergeStudioScenarioSkillRegistries(layers)` combines OSS, host, and third-party layers.
- Duplicate ids fail by default. A host must explicitly set `onConflict: 'replace'` on the one later
  layer that may replace a baseline implementation; following third-party layers remain protected.

Hosts resolve the selected id on the server and pass the complete playbook into `buildChatSystem`.
Skill Markdown remains high-freedom editorial guidance; it is not a workflow graph or component bundle.
The hosted Pireel catalog may add or replace Skills without changing the OSS/editor contracts.

```ts
const skills = mergeStudioScenarioSkillRegistries([
  { source: 'pireel-oss', registry: ossStudioScenarioSkillRegistry },
  { source: 'my-host', registry: privateSkills, onConflict: 'replace' },
  { source: '@example/studio-skills', registry: communitySkills },
]);
```

Only `my-host` has replacement authority in this example; a colliding community id still fails fast.

## License

AGPL-3.0-only — see [LICENSE](./LICENSE). © Pireel.
