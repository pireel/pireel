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
9. V1 is dual-read/V2-single-write during rollout: old rows and drafts may be loaded, but every new persistence write is V2.
10. Multi-track UI is an exposure step, not a later schema change.
11. The semantic primary-narrative picture remains Pireel's base canvas. Every non-primary visual,
    graphic and caption track shares one global bottom-to-top stack above it.

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

The migration is deterministic and idempotent. `projectV2ToLegacyComposition` is a temporary read
projection for unchanged panels/preview/export. A compatibility-panel write is reconciled by
`legacy-edit-merge.ts` as a patch over its prior V2 authority; it is never accepted as a wholesale
document replacement. This preserves empty/custom tracks, media clips, track flags, anchors, scenes
and narrative gaps that the projection cannot express.

`project-document.ts` is the shared persisted-data boundary. The historical `studio_projects.comp`
column remains in place, but its value is now `Composition | EditorDocumentV2` on read and
`EditorDocumentV2` on write. The cloud DTO and local draft carry canonical `document`; `comp` is a
temporary, non-persisted compatibility view. Runtime `blob:`/`data:` locators and unknown top-level
keys are removed before hashing or storage.

The optional bulk backfill is `pnpm studio:migrate-documents-v2`. It is dry-run by default and
requires `--apply`; it migrates project and undo-history rows, skips validation errors, and uses a
version compare-and-swap guard for live projects. Lazy migration remains supported, so deployment
does not require a stop-the-world backfill.

## Command boundary

All V2 edits enter through `applyEditorCommand`. The command layer is split by responsibility under `src/editor-document/commands/`:

- `tracks.ts` owns insert/remove/move/flags and semantic-lane invariants;
- `clip-geometry.ts` owns frame/source split and trim math;
- `clip-patch.ts` owns non-geometric clip state such as `enabled`;
- `remove.ts` owns exact identity deletion without moving surviving clips;
- `range.ts` owns lift/ripple, linked expansion, sync-lock and empty-lane pruning;
- `insert.ts` owns overwrite/ripple insertion;
- `split.ts` owns atomic clip/link-group subdivision;
- `narrative-patch.ts` owns normalized framing, grade and shot-audio properties without exposing geometry;
- `managed-captions.ts` derives the semantic caption lane from V2 transcript and clip placement;
- `canvas.ts` owns deliberate output dimensions independently from track/media presence;
- `overlay-patch.ts` owns stable-id timing and payload edits for graphics/caption clips;
- `overlay-move.ts` and `overlay-duplicate.ts` own cross-lane identity placement and cloning;
- `dispatcher.ts` is the single entry used by UI, agents and server tools.

Commands are immutable and atomic. A command that touches a locked lane returns the original document unchanged. Receipts report affected tracks and removed/created/shifted clips so UI selection, undo and agent summaries do not infer changes from ad-hoc array diffs.

The compatibility-only `timeline-ripple.ts` applies matching interval geometry to V1 blocks and audio while the live store is being cut over. It is not a second V2 command engine.

## Implemented foundation

- Native empty V2 creation, complete V1 migration, validation and read-only V1 projection.
- Track CRUD/reordering plus lift, ripple, overwrite and ripple-insert commands.
- Linked-clip expansion, sync-lock, locked-track atomic failure and semantic scene repair.
- Empty-primary playback through a timeline clock, including graphics/audio-only documents.
- Exact V2 clip removal can leave the required primary lane empty without shifting independent sibling lanes.
- Cloud rows and local drafts dual-read V1/V2 and single-write V2; DTOs expose canonical V2 plus a temporary V1 view.
- Cloud undo history restores and rewrites V2, and offline MCP/analysis/import paths share one server adapter instead of casting stored JSON.
- A dry-run-first bulk migration script covers both live project rows and undo history.
- The workbench live store, local/cloud save payloads and undo/redo stacks now own V2 snapshots. Runtime
  media URLs live in a separate asset-resolution map and are reattached only to the compatibility view.
- Native UI mutations have a live `dispatchCommand` gateway; failed commands cannot publish partial state.
- Legacy panels update only clips visible in their prior projection. V2-only tracks/clips and
  unchanged native geometry survive subsequent compatibility edits, so the rollout remains additive.
- Browser, manual timeline and offline-MCP narration range edits now share
  `applyNarrationDocumentEdit`: the V2 command ripples sync-locked/linked lanes atomically, then the
  semantic layer re-derives managed captions. This covers range/transcript cuts, word deletion and
  ordinary trim/scene deletion; locked native lanes fail the whole edit. Deleting the final scene or
  clearing all scenes instead uses exact `clips.remove`, retains every sibling position, clears only
  derived managed captions and keeps the empty primary lane itself.
- Agent transactions snapshot and validate both V2 and the runtime projection, so an error can roll
  back media lanes which `Composition` cannot see.
- Shot splitting now uses the native `clip.split` command. Compatibility playhead points are resolved
  by stable clip lineage plus source seconds, so splitting never collapses a V2 leading gap or targets
  the wrong reused source segment. Linked partners split atomically by default, including locked-lane
  rejection and matching link groups for the newly created right halves.
- Manual panels, browser agents and offline MCP framing/filter/shot-audio edits now use one atomic
  `narrative.patch` command. Framing partners align to native frame geometry, and a locked narrative
  or graphics lane rejects the full update without losing V2-only gaps or tracks.
- `editorDocumentRenderPlan` is the immutable render/read boundary: it preserves every lane (including
  empty lanes), stable stack order, frame/second geometry, track flags and resolved asset metadata.
  The workbench timeline, parent-side video engine, transition preview/bake, Agent frame capture and
  browser export now use its native primary-narrative placements. Leading, middle and trailing gaps
  remain real blank timeline regions; an explicit empty placement list cannot revive stale V1 shots.
- `video-segment-time.ts` is the shared source/timeline mapper. Preview playback, transition handles,
  frame capture, video export and narration mixing therefore respect V2 frame duration even when it
  differs from the source trim duration; the old contiguous 1× behavior remains the explicit fallback.
- Export takes one V2 document snapshot before encoding. Its cache key, placements and total duration
  therefore describe the same revision even if editing continues while an export is running.
- Non-primary visual media now crosses the same render boundary through the focused
  `visual-render-plan.ts` adapter. Preview assembles timed native image/video layers; Agent frame
  capture and browser export composite the same resolved layers in stable track order above the
  primary picture and below Pireel graphics/captions. Source trims and retimes use native V2 clip
  geometry, overlapping video audio joins the timeline mixer, and supplemental `hidden`, `enabled`
  and `muted` flags are enforced without deleting unavailable/offline assets from the document.
- `primary-render-plan.ts` separates the primary lane's full editing geometry from its active media
  projection. Disabled narration clips remain visible at their original timeline range but decode as
  true gaps; primary `hidden` clears only picture and primary `muted` zeros only track audio. Preview,
  transitions, Agent capture and browser export consume the active projection, while the timeline
  consumes all placements. Track eye/speaker controls write native V2 flags, and the clip power
  control uses the atomic `clip.patch` command instead of changing legacy shot payloads.
- `composition-render-view.ts` applies the same split to compatibility graphics, captions and audio.
  Editing panels retain every projected item, while preview/export/Agent capture receive only enabled
  graphics/captions on visible tracks and enabled audio with native track mute applied. Track and clip
  controls therefore never flatten per-item settings or delete hidden material from the V1 patch
  surface.
- `visual-layer-plan.ts` is the shared bottom-to-top compositor plan across native image/video tracks
  and compatibility HTML graphics/captions. Iframe preview, Agent capture and browser export all
  consume the same interleaved passes; adjacent tracks using the same renderer are coalesced. Managed
  captions from V1 migrate above the previous highest graphic track, preserving their old appearance
  without a permanent caption z-order exception. Person matte remains an explicit Pireel semantic
  sandwich over that neutral stack.
- narration ripple edits now finish with the native `captions.relay` command. Managed captions map
  transcript source seconds through V2 clip placement (including gaps and retiming), keep their lane
  flags and anchors, and never remigrate the compatibility Composition back into the document.
- Manual ratio changes plus browser and server `set_canvas` now share one V2 transaction:
  `canvas.patch` marks explicit dimensions, then `captions.relay` reflows the managed lane against the
  new width. A locked caption lane rejects the whole transaction, while unrelated empty/native lanes
  remain untouched.
- Manual timeline plus browser/server block move, resize, placement and deletion now target native
  overlay clip ids. Multi-lane batches remain atomic, locked lanes reject before publication, and
  removal keeps empty lanes/stack order instead of rebuilding them from compatibility `trackIndex`.
- Overlay duplication, cross-track dragging, new-lane insertion and lane reorder now use native track
  ids. Empty graphics lanes remain visible/stable drag targets, and failed compound inserts roll back
  the provisional lane instead of leaking partial layout state.

Consumption by the remaining compatibility tools is the next rollout gate, not schema work. The server
adapter still projects and remigrates results for tools not yet cut over; that path must be removed
before overlapping multi-track editing is exposed because V1 cannot round-trip those states. The
remaining gates must reuse this document, render plan and command layer rather than introduce another
model.

## Rollout gates

The multi-track UI must not ship until all of these are true:

- [x] persistence loads V1/V2 and writes only V2;
- [x] live undo/redo snapshots V2, including cloud-history restore;
- [x] preview, Agent capture and browser export consume the same V2 placement, flags and cross-type
  layer plan;
- browser and server tools use the same V2 command engine;
- no command discovers primary narration via `tracks[0]`;
- audio/graphics/captions follow one declared ripple and anchor policy;
- [x] graphics-only and audio-only playback use the timeline clock;
- migration telemetry has no unresolved validation errors.
