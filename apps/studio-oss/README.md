# Pireel Studio — OSS shell

A minimal, backend-free shell for the Pireel Studio editor. It mounts the same
editor packages the hosted app uses (`@pireel/studio-ui` + `@pireel/studio-engine`
+ `@pireel/studio-frames` + `@pireel/ui`) as a plain Vite SPA.

## Run

```bash
pnpm install
pnpm --filter @pireel/studio-oss-shell dev
```

## What works out of the box

- **Everything local**: import one or several video sources, edit shots, output
  variants, blocks, captions, timeline and live preview — all in the browser. Drafts persist in
  `localStorage`, video bytes in OPFS. No account, no server.
- **Client export**: WYSIWYG export runs on WebCodecs in Chromium.
- **Frame themes**: the full frame catalog is served from the content package
  (`@pireel/studio-frames`), client-side.
- **Local uploads**: panel image uploads go to a disk-backed route
  (`/local-assets`, see `local-assets-plugin.ts`) — content-addressed files in
  `.local-assets/`, referenced by stable same-origin relative URLs. The local
  counterpart of the hosted R2+CDN upload provider.

## What is intentionally NOT wired

Generation capabilities are injected via `StudioProviders`
(`@pireel/studio-engine/providers`). This shell registers
`unavailableProviders()`, so anything that needs a model or a cloud backend —
block generation, narration planning, transcription, cloud media vault,
cross-device project sync, image/video generation — fails with a hint instead.

Two ways to light them up:

1. **Inject your own providers** in [`src/providers.ts`](src/providers.ts) —
   five small contracts (composer / planner / transcriber / vault / projects),
   point them at whatever backend or local model you like.
2. **Bring your own agent (BYO brain)**: the editor is designed to be driven by
   an external agent over MCP — briefs are assembled by the engine, generation
   happens in the agent's model, results go through the same parse/lint apply
   path. The MCP server itself is part of the hosted deployment; a self-hostable
   MCP entry for this shell is on the roadmap.

## Static asset contract

The engine's preview runtime expects `/vendor/gsap.min.js` same-origin (iframe
srcdoc inherits the parent base) — this shell ships it in `public/vendor/`.
Optional extras a shell MAY serve: `/models/modnet_portrait.onnx` (person
matte; the feature errors gracefully without it).

## Layout

```
src/main.tsx       entry — styles + provider injection, then render
src/providers.ts   capability wiring (the ONLY file to touch for a backend)
src/app.tsx        IntlProvider + workbench + toaster
src/styles.css     Tailwind v4 entry; tokens come from @pireel/ui/theme.css
```
