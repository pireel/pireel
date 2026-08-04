# Editor Document V2

Editor Document V2 is Pireel's final multi-track persistence model. Its neutral timeline follows the useful part of a professional NLE's architecture (`Timeline -> Track[] -> Clip[]`), while Pireel's transcript-first workflow remains a separate semantic layer.

## Non-negotiable invariants

1. An empty timeline and an empty primary-narrative track are valid document states.
2. `EditorDocumentV2` is the only in-memory authority after load. V1 projections are read-only adapters.
3. Media identity lives in `assets`; timeline clips reference `assetId`. Runtime blob/object URLs are not identities.
4. Every placed item has explicit `startFrame` and `durationFrames` at the project FPS. Source trims remain source seconds.
5. Primary narration and managed captions are track roles referenced by stable IDs, never track indexes.
6. Transcript and scene semantics live above the timeline and refer to stable asset/clip IDs.
7. Ripple, overwrite and lift will be document commands operating by track/clip ID and sync-lock policy. Feature code must not manually shift sibling arrays.
8. Preview time belongs to the timeline. A video element may discipline the clock when present, but cannot be required for playback.
9. V1 is dual-read/single-write during rollout: old data may be loaded, but new saves will write V2 once the persistence cutover lands.
10. Multi-track UI is an exposure step, not a later schema change.

## Shape

```text
EditorDocumentV2
├── canvas          width, height, FPS, explicitly-configured flag
├── appearance      theme, palette, captions and person styling
├── assets          durable media manifest keyed by assetId
├── timeline
│   └── tracks[]    stable id, type, semantic role, locks, stack order
│       └── clips[] explicit timeline range + typed payload
├── semantics       primary narrative, transcripts, scenes, managed captions
└── processing      document-level media processing settings
```

Clip payloads remain typed:

- `NarrativeTimelineClip` retains shot framing, transitions, person matte and source-audio settings.
- `GraphicTimelineClip` retains Pireel Block payloads and adds timeline/clip/word anchoring.
- `CaptionTimelineClip` retains managed transcript references instead of becoming anonymous text.
- `AudioTimelineClip` retains source trims, gain, fades and speed.
- `MediaTimelineClip` is the neutral visual primitive for future B-roll tracks.

## Migration boundary

`migrateLegacyProjectToV2` consumes the complete V1 project state, not just `Composition`, because media and semantic truth currently spans:

- `Composition.video`, `shots`, `blocks`, and `audioTracks`;
- DTO-level `videoSig` and `videoDurationSec`;
- `context.asr`, `clipAsr`, `plan`, `media`, and `localAssets`.

The migration is deterministic and idempotent. `projectV2ToLegacyComposition` is a temporary read projection for unchanged preview/export code; it cannot represent future overlapping or gapped primary-narrative clips and must not become a write path.

## Command boundary

All V2 edits enter through `applyEditorCommand`. The command layer is split by responsibility under `src/editor-document/commands/`:

- `tracks.ts` owns insert/remove/move/flags and semantic-lane invariants;
- `clip-geometry.ts` owns frame/source split and trim math;
- `range.ts` owns lift/ripple, linked expansion, sync-lock and empty-lane pruning;
- `insert.ts` owns overwrite/ripple insertion;
- `dispatcher.ts` is the single entry used by UI, agents and server tools.

Commands are immutable and atomic. A command that touches a locked lane returns the original document unchanged. Receipts report affected tracks and removed/created/shifted clips so UI selection, undo and agent summaries do not infer changes from ad-hoc array diffs.

The compatibility-only `timeline-ripple.ts` applies matching interval geometry to V1 blocks and audio while the live store is being cut over. It is not a second V2 command engine.

## Implemented foundation

- Native empty V2 creation, complete V1 migration, validation and read-only V1 projection.
- Track CRUD/reordering plus lift, ripple, overwrite and ripple-insert commands.
- Linked-clip expansion, sync-lock, locked-track atomic failure and semantic scene repair.
- Empty-primary playback through a timeline clock, including graphics/audio-only documents.
- V1 range deletion can produce an empty primary lane; browser/server/agent compatibility paths ripple sibling audio and blocks together.

Persistence cutover, V2 undo/redo ownership and direct V2 preview/export consumption remain rollout gates, not schema work. They must reuse this document and command layer rather than introduce another model.

## Rollout gates

The multi-track UI must not ship until all of these are true:

- persistence loads V1/V2 and writes only V2;
- undo/redo snapshots V2;
- preview and export consume V2 or a tested read projection;
- browser and server tools use the same V2 command engine;
- no command discovers primary narration via `tracks[0]`;
- audio/graphics/captions follow one declared ripple and anchor policy;
- graphics-only and audio-only playback use the timeline clock;
- migration telemetry has no unresolved validation errors.
