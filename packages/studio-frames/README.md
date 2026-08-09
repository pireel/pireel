# @pireel/studio-frames

Frame runtime contracts and OSS-compatible example content packs for Pireel Studio.

- `content/<id>/frame.md` — optional public/example Frames: browser-safe metadata and tokens in frontmatter plus a rich Markdown visual-directing playbook.
- `src/registry.ts` — pure parser/registry (`createFrameRegistry(files)`); feed it any path→raw map.
- `src/vite.ts` — Vite entry that globs `content/` and exports a ready `frameRegistry`.
- `src/dialects/` — per-theme layout dialects used for the live preview wall.
- `src/locales/` — locale adaptation packs for dialect copy.

Hosted products can keep polished Frame content private: import only the parser, build a host registry from private `frame.md` files, and inject that registry into the server routes. The Studio editor and agent tooling do not require concrete hosted playbooks to live in this package.

## License

AGPL-3.0-only — see [LICENSE](./LICENSE). © Pireel.
