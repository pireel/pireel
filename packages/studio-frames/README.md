# @pireel/studio-frames

Frame runtime contracts and OSS-compatible example content packs for Pireel Studio.

- `content/<id>/frame.md` — optional public/example Frames: browser-safe metadata and tokens in frontmatter plus a rich Markdown visual-directing playbook.
- `src/registry.ts` — pure parser/registry (`createFrameRegistry(files)`) plus layered merging
  (`mergeFrameRegistries(layers)`); feed it any path→raw map.
- `src/vite.ts` — Vite entry that globs `content/` and exports a ready `frameRegistry`.
- `src/dialects/` — per-theme layout dialects used for the live preview wall.
- `src/locales/` — locale adaptation packs for dialect copy.

The public catalog includes `knowledge-cards` / Concept Atlas as a source-led explanatory Frame suited to
talking-head lessons and commentary. It keeps the real speaker or evidence as the anchor while routes,
scale shifts, and sparse corrections make relationships visible.

Hosted products can keep polished Frame content private: import the parser, build a host registry from
private `frame.md` files, then merge the OSS and hosted layers. Third-party packs use the same contract.
Duplicate ids fail by default; intentional replacement requires `onConflict: 'replace'` on that specific
layer, with the later layer winning. The Studio editor and agent tooling do not require concrete hosted playbooks to live in this package.

```ts
const frames = mergeFrameRegistries([
  { source: 'pireel-oss', registry: ossFrames },
  { source: 'my-host', registry: privateFrames, onConflict: 'replace' },
  { source: '@example/studio-frames', registry: communityFrames },
]);
```

Only `my-host` can replace an earlier id here; the community layer can safely append new Frames.

Hosts may preserve a public/example Frame id for saved-project compatibility while replacing its hosted
title, playbook, cover and preview dialect with a deeper private world. Inject the private playbook under
the same id in a later registry layer and opt into replacement. The merged host registry remains the source
of truth for catalog discovery.

Frame selection is user-controlled and orthogonal to Studio Skills. A Skill guides editorial judgment; a Frame guides visual expression. Hosts should not maintain a Skill–Frame compatibility table, infer one from the other, or require a Frame for a complete edit. When the user selects a Frame, apply its language across the chosen edit regardless of which Skill is active.

## What qualifies as a video Frame

A Frame is a complete, recognizable video design system—not an editing technique with colors attached. It should establish one coherent audiovisual world across unrelated content and remain identifiable when the Scene purpose changes.

Use presentation design systems as a completeness reference, not a video template. Palette, typography, composition, image treatment, material language, density, signature elements, and prohibitions remain useful. Slide types, page furniture, fixed content modules, and per-page density formulas do not transfer directly to time-based editing.

A video-native Frame must also direct:

- source-footage relationship: crop, scale, texture, treatment, subject dignity, and when source imagery leads;
- temporal behavior: entrance, hold, transformation, exit, cut energy, transition restraint, and motion temperament;
- sequence contour: how visual pressure, density, contrast, and release vary across several Scenes;
- sound-image relationship: how source sound, music, silence, graphic action, and typography share emphasis;
- captions and identity graphics: how necessary language belongs to the same world without becoming decoration;
- destination adaptation: how the system survives horizontal, vertical, and square canvases without cropping a static layout;
- evidence and accessibility: how truth, readability, brand, permission, and viewer comprehension constrain the style.

Use these boundary tests before adding a Frame:

- If removing its palette, typography, material, and image treatment leaves the main idea intact, it is probably a foundational editing capability rather than a Frame.
- If the same method should work naturally inside several visually unrelated Frames, keep it in editing expertise instead of the Frame catalog.
- If choosing it commits the user to a recognizable visual and temporal world, it may be a Frame.
- If its preview set is mainly a taxonomy of content operations—maps, match cuts, comparisons, evidence labels, timelines—it is not yet a design system.

Plan the Frame portfolio by design-world coverage rather than content category. Evaluate a proposed Frame across independent tensions:

- source relationship: source-led, interleaved, or graphic-led;
- spatial grammar: continuous field, layered depth, collision, or modular division;
- temporal behavior: observational hold, state change, rhythmic cut, echo, or accumulation;
- information pressure: atmospheric, declarative, explanatory, or evidentiary;
- material logic: optical, photographic, printed, drawn, spatial, or screen-native;
- sequence contour: how pressure rises, releases, and returns across several Scenes.

A new Frame should claim a distinct audiovisual world across these dimensions, not merely rename an audience, industry, Studio Skill, or editing capability. Existing public examples are not the roadmap for hosted Frames.

## License

AGPL-3.0-only — see [LICENSE](./LICENSE). © Pireel.
