# @pireel/studio-frames

Theme content packs ("frames") for Pireel Studio.

- `content/<id>/frame.md` — one design system per theme: palette tokens (frontmatter) + an English playbook body the editing agent follows.
- `src/registry.ts` — pure parser/registry (`createFrameRegistry(files)`); feed it any path→raw map.
- `src/vite.ts` — Vite entry that globs `content/` and exports a ready `frameRegistry`.
- `src/dialects/` — per-theme layout dialects used for the live preview wall.
- `src/locales/` — locale adaptation packs for dialect copy.

## License

AGPL-3.0-only — see [LICENSE](./LICENSE). © Pireel.
