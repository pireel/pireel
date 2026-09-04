/**
 * Agent surface v3 — tool descriptions and input schemas.
 *
 * Contract + semantics + routing to neighbours; never craft, never process. Timeline positions are
 * integer frames `[start, end)`; source positions are seconds. Every enum and bound is derived from an
 * engine constant so the schema cannot drift from what the editor accepts (`schemas.test.ts` proves it).
 */

import { CAPTION_PRESETS } from '../caption-presets';
import { CUT_TRANSITION_EFFECTS, MAX_TRANSITION_SEC, PLACE_ANCHORS, SHOT_TREATMENTS } from '../composition-core';
import { DISPLAY_TEXT_ANIMATION_IDS, DISPLAY_TEXT_PRESETS } from '../display-text-presets';

export const CHARGE_MARKER = "[CHARGES the user's Pireel account.]";

type Schema = Record<string, unknown>;

const obj = (properties: Record<string, unknown>, required: string[] = []): Schema => ({
  type: 'object', additionalProperties: false, properties, required,
});
const str = (description?: string): Schema => (description ? { type: 'string', description } : { type: 'string' });
const num = (description?: string, bounds: { min?: number; max?: number } = {}): Schema => ({
  type: 'number', ...(description ? { description } : {}), ...(bounds.min !== undefined ? { minimum: bounds.min } : {}), ...(bounds.max !== undefined ? { maximum: bounds.max } : {}),
});
const int = (description: string, min = 0): Schema => ({ type: 'integer', minimum: min, description });
const bool = (description?: string): Schema => (description ? { type: 'boolean', description } : { type: 'boolean' });
const enumOf = (values: readonly string[], description?: string): Schema => ({ type: 'string', enum: [...values], ...(description ? { description } : {}) });
const arr = (items: Schema, extra: Record<string, unknown> = {}): Schema => ({ type: 'array', items, ...extra });
const ids = (description: string): Schema => arr(str(), { minItems: 1, description });

export const TREATMENT_IDS = SHOT_TREATMENTS.map((entry) => entry.id);
export const TRANSITION_EFFECT_IDS = [...CUT_TRANSITION_EFFECTS.map((entry) => entry.id), 'none'];
export const CAPTION_PRESET_IDS = CAPTION_PRESETS.map((preset) => preset.id);
export const TEXT_PRESET_IDS = DISPLAY_TEXT_PRESETS.map((preset) => preset.id);
export const TEXT_ANIMATION_IDS = [...DISPLAY_TEXT_ANIMATION_IDS];
export const CLIP_ROLES = ['primary', 'broll', 'narration', 'music', 'sfx'] as const;
export const TRACK_TYPES = ['visual', 'graphics', 'audio', 'caption'] as const;
export const TRACK_ROLES = ['broll', 'graphics', 'narration', 'music', 'sfx', 'managedCaptions'] as const;
export const VOICE_LANGUAGES = ['zh', 'yue', 'en', 'pt', 'ko', 'es', 'ja', 'id', 'ru', 'fr', 'it', 'de', 'nl', 'ar', 'tr', 'uk', 'vi'] as const;

const FRAME = (what: string) => int(`${what}, integer timeline frame (fps from get_state).`);
const FRAMES_RANGE = arr({ type: 'integer', minimum: 0 }, { minItems: 2, maxItems: 2, description: 'Half-open [startFrame, endFrame) in timeline frames.' });
const SOURCE_RANGE = arr({ type: 'number', minimum: 0 }, { minItems: 2, maxItems: 2, description: 'Source seconds [inSec, outSec].' });
const BOX = obj({
  x: num('Left edge in canvas units (0–1; may go outside for off-canvas).'),
  y: num('Top edge in canvas units.'),
  w: num('Width in canvas units, > 0.'),
  h: num('Height in canvas units, > 0.'),
}, ['x', 'y', 'w', 'h']);
const FADES = obj({ in: int('Fade-in length in frames.'), out: int('Fade-out length in frames.') });
const PLACEMENT_PCT = obj({ xPct: num(), yPct: num(), widthPct: num(), heightPct: num() }, ['xPct', 'yPct', 'widthPct', 'heightPct']);

export interface V3ToolSchema {
  description: string;
  inputSchema: Schema;
}

export const V3_TOOL_SCHEMAS: Record<string, V3ToolSchema> = {
  /* ------------------------------------------------------------------ state */
  get_state: {
    description:
      'Read the active output: canvas (width, height, fps), durationFrames, playhead, canGenerate, the attached frame, every track with its role and clips, the asset inventory, and the outputs list. Clips carry frames:[start,end), source seconds, non-default properties only; linked audio is folded into its visual clip as audio:{clipId,…}; caption tracks appear as one captions object, never as cue clips. Call once per session, then patch your model from mutation deltas; re-read only when a receipt note or an error says the state is stale. window narrows to tracks and a frame range and adds totalClips per truncated track.',
    inputSchema: obj({
      window: obj({
        tracks: arr(str(), { description: 'Track ids to include; omit for all.' }),
        fromFrame: FRAME('Window start'),
        toFrame: FRAME('Window end (exclusive)'),
      }),
    }),
  },
  get_transcript: {
    description:
      `${CHARGE_MARKER} only when transcription must run. Read spoken words for any speech-bearing asset, clip or track. granularity=segments (default) returns sentence rows with source-second timing — enough for meaning and for remove_words ranges. granularity=words returns stable wordIds with frame positions for exact word cuts; narrow it with clipId plus fromFrame/toFrame or segmentIndexes and page with offset/limit instead of scanning a whole transcript. Transcript positions are source seconds and never move when the timeline is cut. Word ids shift after remove_words — re-read before the next word cut.`,
    inputSchema: obj({
      granularity: enumOf(['segments', 'words'], 'segments (default) for meaning; words for exact wordIds.'),
      assetId: str('Speech-bearing asset; omit to prefer the primary narration.'),
      clipId: str('Narrow to the source behind this clip.'),
      trackId: str('Narrow to one track (segments only).'),
      segmentIndexes: arr({ type: 'integer', minimum: 0 }, { description: 'words only: sentence rows to expand.' }),
      fromFrame: FRAME('words only: window start'),
      toFrame: FRAME('words only: window end (exclusive)'),
      offset: int('words only: paging offset.'),
      limit: int('words only: max words per page.', 1),
    }),
  },
  search_media: {
    description:
      'Find a spoken or visual moment inside the current project when it is not already in your context: a phrase, topic, object or scene. Returns source-clock segments (assetId + seconds) you can pass to add_clips source or remove_words ranges. This searches project media only; use search_assets for reusable library or stock assets, and reason directly over a get_transcript you already hold instead of searching for it.',
    inputSchema: obj({
      query: str('Phrase, object, scene or spoken topic (≤200 characters).'),
      scope: enumOf(['all', 'narrative'], 'all project media (default) or narrative-lane sources only.'),
      clipId: str('Narrow to the source behind this clip.'),
      limit: int('Max distinct segments (default 8, max 20).', 1),
    }, ['query']),
  },
  inspect_media: {
    description:
      `Look at media and components by mode. metadata (default): registered assets or clips — dimensions, duration, transcript coverage, placements, generationStatus for pending generations. frames: the pixels of 1–8 IMAGE assets (a video source is reviewed with editorial, or described with semantic — never frames). component: one graphic clip's markup and animation. generation: status of pending image/video/audio jobs (omit ids for recent history). geometry: free and browser-local — scene cuts, subject tracks and safe regions, one source per step. semantic: ${CHARGE_MARKER} content description, one source per step. editorial: ${CHARGE_MARKER} ONE comparative review of every listed source against a brief — pass all candidates in ids[] in a single call; this is the batch review a montage or B-roll pass needs. brief then labels: BYO visual analysis — the tab returns sample frames, you label them, submit with labels. For the composed timeline use inspect_timeline instead.`,
    inputSchema: obj({
      mode: enumOf(['metadata', 'frames', 'component', 'generation', 'geometry', 'semantic', 'editorial', 'brief', 'labels']),
      ids: arr(str(), { description: 'Asset ids (or one graphic clip id in component mode).' }),
      clipIds: arr(str(), { description: 'metadata: clips whose source to inspect.' }),
      clipId: str('geometry/semantic/editorial: analyse the source behind this clip.'),
      brief: str('editorial: what the review should judge.'),
      compareOpenings: bool('editorial batch only: also rank the opening frame across all sources in one extra vision call (30–90 s). For a montage whose first shot is picture; leave off for B-roll reviews.'),
      maxCandidates: int('geometry/editorial: cap on returned ranges.', 1),
      assessAudio: bool('geometry: also assess audio quality.'),
      labels: arr(obj({
        index: int('Frame index from the brief result.'),
        content: enumOf(['talkinghead', 'screen', 'broll', 'slide', 'other']),
        person: enumOf(['left', 'center', 'right', 'none']),
        safe: enumOf(['left', 'right', 'top', 'bottom', 'full', 'none']),
        has_text: bool(),
        desc: str('Short English sentence.'),
      }, ['index', 'content', 'person', 'safe']), { description: 'labels mode: one entry per frame.' }),
    }),
  },
  inspect_timeline: {
    description:
      'See the composited output — footage with framing, overlays, text, captions — at exact frames[] (1–12) or sampled evenly across [fromFrame, toFrame) with maxFrames. Each image carries its frame number; the receipt lists the clip ids visible on screen so what you see maps back to what you can edit. With no frames the whole output is reviewed as a sequence (every visible clip, or each planned scene when a legacy plan exists; sceneIds narrows that). Use it when a visual could be wrong — a placement, an overlap, a component\'s box, caption legibility — one look at the frames that matter, not after every change; nothing here hears audio — read levels from get_state.',
    inputSchema: obj({
      frames: arr({ type: 'integer', minimum: 0 }, { minItems: 1, maxItems: 12, description: 'Exact timeline frames to render.' }),
      fromFrame: FRAME('Sampling window start'),
      toFrame: FRAME('Sampling window end (exclusive)'),
      maxFrames: int('Frames to sample in the window, 1–12 (default 6).', 1),
      sceneIds: arr(str(), { description: 'Legacy planned scenes to review.' }),
    }),
  },
  get_beat_grid: {
    description:
      'Compute beat times from a known BPM and offset for a music asset (source seconds) or a placed clip (mapped to timeline frames). It does not detect tempo: pass bpm when the asset has none registered. Use the returned times with split_clips and move_clips to cut on beats or downbeats.',
    inputSchema: obj({
      assetId: str('Music asset; times in source seconds.'),
      clipId: str('Placed music clip; times mapped to timeline frames.'),
      bpm: num('Tempo when the asset has none registered.', { min: 30, max: 300 }),
      offsetSec: num('Source-second position of beat zero.'),
      startSec: num('Range start in source seconds.'),
      endSec: num('Range end in source seconds.'),
      subdivision: { type: 'number', enum: [1, 2, 4], description: '1 = beats, 2 = eighths, 4 = sixteenths.' },
    }),
  },
  manage_project: {
    description:
      'Choose what you are editing. scope=project: list, switch, create or rename cloud projects (the newest-touched project is active). scope=output (default): list, create an empty deliverable, duplicate one (the versioning primitive: copy, then edit the copy), switch, rename or delete inside the active project. Switching returns the new get_state; clip and track ids are output-local, so never carry ids across a switch. Works without an open Studio tab.',
    inputSchema: obj({
      scope: enumOf(['project', 'output']),
      action: enumOf(['list', 'create', 'duplicate', 'switch', 'rename', 'delete']),
      id: str('Project or output id.'),
      position: int('Output position (1-based) as an alternative to id.', 1),
      title: str('create / rename / duplicate title.'),
    }, ['action']),
  },

  /* ------------------------------------------------------------------ assets */
  search_assets: {
    description:
      'Find reusable assets in one explicit scope: mine (this project\'s library — the files the user added to this project; get_state already lists them), cloud (the account\'s uploads and generations across all projects), official (curated stickers, music and sound), all (only for a cross-library request), or stock (online Pexels/Pixabay/Commons with author and licence). Omit query to list a scope. Results carry locators to pass to register_media / add_clips; stock results carry an opaque import payload for register_media. Prefer an existing timing-compatible sound or image here before generating one. Device-local bytes are never readable from the server; use import_media for those.',
    inputSchema: obj({
      scope: enumOf(['mine', 'cloud', 'official', 'all', 'stock']),
      query: str('Name, category, mood or use case (≤200 characters); stock needs a concrete visual query.'),
      kind: enumOf(['all', 'image', 'video', 'audio', 'element', 'sticker']),
      page: int('stock only: result page.', 1),
      limit: int('Max results.', 1),
    }, ['scope']),
  },
  register_media: {
    description:
      'Register media identities in the active output without placing them: assets[] from generation receipts or remote urls (pass returned fields unchanged), or stock = one exact import payload from search_assets scope:stock (durably copied to the cloud library, then registered). Registration returns asset ids for add_clips / insert_clips. Never construct a locator by hand.',
    inputSchema: obj({
      assets: arr(obj({
        id: str(), kind: enumOf(['video', 'image', 'audio']), url: str(), cloudKey: str(), localSig: str(),
        label: str(), durationSec: num(), estimatedDurationSec: num(), width: num(), height: num(), hasAudio: bool(),
        description: str(), tags: arr(str()), collection: str(),
        bpm: num('Known tempo for beat grids.'), beatOffsetSec: num('Source-second position of beat zero.'),
        transcriptText: str('Exact known script (e.g. generate_speech input).'),
        transcript: arr(obj({ start: num(), end: num(), text: str() }, ['start', 'end', 'text'])),
      }, ['id']), { description: 'Identities to register.' }),
      stock: obj({ query: str(), kind: enumOf(['image', 'video', 'sticker']), page: int('', 1), limit: int('', 1), assetId: str() }, ['query', 'kind', 'page', 'limit', 'assetId']),
    }),
  },
  import_media: {
    description:
      'Bring LOCAL files into the open Studio tab. Call with no arguments to receive a short-lived import token and the exact base_url, then run the bundled import helper with them and the file paths; bytes stream into the tab and stay device-local. The helper returns registrations — place them with add_clips. Never replace this with a cloud upload. The sig/filename fields are the helper’s registration call, not yours.',
    inputSchema: obj({
      sig: str('Helper only: content signature of already-staged bytes.'),
      filename: str('Helper only.'),
      duration_sec: num(), width: num(), height: num(),
      transcript_segments: arr(obj({ start: num(), end: num(), text: str() }, ['start', 'end', 'text'])),
    }),
  },
  organize_media: {
    description:
      'Batch-update asset metadata: label, description, search tags, collection, and known tempo (bpm, beatOffsetSec) so later search_assets and get_beat_grid calls find and use them. Metadata only; it never touches bytes or placements.',
    inputSchema: obj({
      items: arr(obj({
        assetId: str(), label: str(), description: str(), tags: arr(str()), collection: str(), bpm: num(), beatOffsetSec: num(),
      }, ['assetId']), { minItems: 1 }),
    }, ['items']),
  },
  prepare_local_asset: {
    description:
      'Studio Chat only. Make one exact device-local image usable inside bespoke component markup. Call only when the user asked for that image; listing metadata does not grant access to its bytes, which stay on the device. If access needs a user gesture the call fails with a restore instruction — never substitute another image.',
    inputSchema: obj({ assetId: str('Exact local image asset id from search_assets.') }, ['assetId']),
  },
  get_icons: {
    description:
      'Fetch inline SVG icons for component markup by name: kind=icon (Lucide, kebab-case) or kind=brand (Simple Icons). Unknown names return the closest matches — pick one or design without an icon; never draw semantic icons by hand or use emoji.',
    inputSchema: obj({ names: arr(str(), { minItems: 1, maxItems: 8 }), kind: enumOf(['icon', 'brand']) }, ['names']),
  },
  create_browser_handoff: {
    description:
      'Mint a single-use, pre-signed-in url (about 60 s) that opens the Studio editor on a project in your own embedded browser, so the user watches edits land live and byte-bound tools (import, capture, export) become available. Open it yourself immediately; never print it to the user or open it in their default browser. Omit project_id for a fresh project.',
    inputSchema: obj({ project_id: str('Existing project id; omit to start a fresh one.') }),
  },

  /* ------------------------------------------------------------------ clips */
  add_clips: {
    description:
      'Place registered assets on the timeline without opening time (existing material is untouched). role picks the lane: primary is the full-frame story spine, broll the B-roll lane, narration/music/sfx the typed audio lanes; omit trackId to reuse or create the role lane. A full-frame B-roll video that overlaps another full-frame B-roll video is refused and nothing is placed — fix the frames or remove_clips the old clip first; only an explicit trackId overwrites that lane. Boxed (PiP) clips and images may sit over other B-roll. Timing is startFrame + durationFrames (defaults to the source remainder) with optional source [inSec,outSec]. duplicate[] copies existing graphic clips to a new start. One call, many clips, one undo step.',
    inputSchema: obj({
      clips: arr(obj({
        id: str('Optional new clip id.'), assetId: str(), trackId: str(), role: enumOf(CLIP_ROLES),
        startFrame: FRAME('Start'), durationFrames: int('Initial duration in frames.', 1), source: SOURCE_RANGE,
        fit: enumOf(['contain', 'cover']), box: BOX, anchorX: num('Cover-crop anchor 0–1.', { min: 0, max: 1 }), anchorY: num('Cover-crop anchor 0–1.', { min: 0, max: 1 }),
        opacity: num('0–1.', { min: 0, max: 1 }), enabled: bool(), linkGroupId: str(),
        volumeDb: num('Initial level; omit for the role default.', { min: -60, max: 20 }), fades: FADES, speed: num('0.25–4.', { min: 0.25, max: 4 }), mute: bool(),
      }, ['assetId'])),
      duplicate: arr(obj({ clipId: str('Graphic clip to copy.'), startFrame: FRAME('New start') }, ['clipId'])),
      atFrame: FRAME('Default start for clips that omit startFrame'),
      includeLinked: bool('Default true: linked partners move together.'),
      targetDurationFrames: FRAME('Picture target length when no narration defines it (a silent montage cut to a user spec); ignored while narration is on the timeline'),
    }),
  },
  assemble_from_review: {
    description:
      'Build the primary picture track from the reviewed pool in one call (montage work; B-roll over a talking head is add_clips). clips[] are your ordered picks from inspect_media mode:editorial — source [inSec,outSec] inside accepted ranges — placed as written and snapped to legal action boundaries at most; the remaining target time is completed from unclaimed reviewed capacity at natural speed; the current primary picture is replaced (one undo step). Target = targetDurationFrames, else the narration on the timeline. Receipt: coverage {targetDurationSec, actualDurationSec, shortfallSec, covered} and placed[] (each clip with origin batch|pool and its review evidence). A shortfall means the reviewed pool is exhausted — repeating cannot add coverage; ask the user for more footage or a shorter script. Omit clips to let the review\'s opening choice lead.',
    inputSchema: obj({
      clips: arr(obj({ assetId: str(), startFrame: FRAME('Start'), source: SOURCE_RANGE }, ['assetId'])),
      assetIds: arr(str('Restrict the pool to these reviewed sources.')),
      targetDurationFrames: FRAME('Picture length when no narration is on the timeline'),
    }),
  },
  insert_clips: {
    description:
      'Insert registered assets and push later material on sync-locked lanes to make room (ripple). Same clip shape as add_clips. Use add_clips when nothing should shift.',
    inputSchema: obj({
      clips: arr(obj({
        id: str(), assetId: str(), trackId: str(), role: enumOf(CLIP_ROLES),
        startFrame: FRAME('Start'), durationFrames: int('Initial duration in frames.', 1), source: SOURCE_RANGE,
        fit: enumOf(['contain', 'cover']), box: BOX, anchorX: num('', { min: 0, max: 1 }), anchorY: num('', { min: 0, max: 1 }),
        opacity: num('', { min: 0, max: 1 }), enabled: bool(), linkGroupId: str(), volumeDb: num('', { min: -60, max: 20 }), fades: FADES, speed: num('', { min: 0.25, max: 4 }), mute: bool(),
      }, ['assetId']), { minItems: 1 }),
      atFrame: FRAME('Insertion point for clips that omit startFrame'),
      includeLinked: bool(),
    }, ['clips']),
  },
  move_clips: {
    description:
      'Move clips to new start frames, optionally onto another compatible track. Linked partners move by the same delta unless includeLinked=false. Anchored graphics keep following their anchor; move the anchor clip instead of the graphic when the footage moves.',
    inputSchema: obj({
      items: arr(obj({ clipId: str(), startFrame: FRAME('New start'), trackId: str('Destination track.') }, ['clipId', 'startFrame']), { minItems: 1 }),
      includeLinked: bool(),
    }, ['items']),
  },
  remove_clips: {
    description:
      'Remove clips of any kind. Default leaves a gap (later material stays put); ripple=true closes the gap on sync-locked lanes, which for story-spine clips means later footage plays earlier. Linked partners go with the clip unless includeLinked=false. To turn captions off use set_captions {on:false}.',
    inputSchema: obj({
      clipIds: ids('Clips to remove.'),
      ripple: bool('Close the gap on sync-locked lanes.'),
      includeLinked: bool(),
    }, ['clipIds']),
  },
  split_clips: {
    description:
      'Insert cut points without removing or moving anything. Give clipId + atFrame per item; omit clipId to split the story spine at that frame. purpose=framing marks splits made only to change framing so stable-subject guards apply. Batch every point into one call.',
    inputSchema: obj({
      items: arr(obj({ clipId: str(), atFrame: FRAME('Cut point') }, ['atFrame']), { minItems: 1, maxItems: 24 }),
      purpose: enumOf(['editing', 'framing']),
      includeLinked: bool(),
    }, ['items']),
  },
  ripple_delete_ranges: {
    description:
      'Cut timeline ranges [fromFrame, toFrame) out of the output and close the gaps: later material shifts earlier on sync-locked lanes, overlays and captions re-lay. Ranges may span clips; they must not overlap each other. For spoken passages prefer remove_words (it addresses the transcript, not frames).',
    inputSchema: obj({ ranges: arr(FRAMES_RANGE, { minItems: 1 }) }, ['ranges']),
  },
  set_clip_properties: {
    description:
      'Patch properties on clips in one undo step: source [inSec,outSec] retrims, durationFrames, speed (0.25–4; the spine ripples by default, other lanes do not), volumeDb (−60…+20, 0 = source level), mute, fades {in,out} in frames, opacity, filter {brightness,contrast,saturate} (1 = untouched), enabled, box, and assetId to swap the clip’s media while keeping its geometry. Layout and framing belong to set_clip_framing; timing moves to move_clips.',
    inputSchema: obj({
      items: arr(obj({
        clipId: str(), assetId: str('Swap the media identity.'), source: SOURCE_RANGE, durationFrames: int('New duration in frames.', 1),
        speed: num('', { min: 0.25, max: 4 }), ripple: bool('speed on the spine: shift later material (default true).'),
        volumeDb: num('', { min: -60, max: 20 }), mute: bool(), fades: FADES, opacity: num('', { min: 0, max: 1 }),
        filter: obj({ brightness: num(), contrast: num(), saturate: num() }),
        enabled: bool(), box: BOX,
      }, ['clipId']), { minItems: 1 }),
    }, ['items']),
  },
  set_clip_framing: {
    description:
      `Decide where a clip sits in the picture. Media clips take a treatment recipe (${TREATMENT_IDS.join(' / ')}) with size, crop, scale (1–4) and subject anchorX/anchorY, or an exact transform {scale, offsetX, offsetY} and cropInsets {top,right,bottom,left} in 0–1 fractions. Graphic and text clips take box {x,y,w,h} in canvas units, a 3×3 anchor, or scale. For several clips sharing one arrangement (PiP, split, grid) use apply_layout.`,
    inputSchema: obj({
      items: arr(obj({
        clipId: str(),
        treatment: enumOf(TREATMENT_IDS), size: num('Treatment size 0–100.', { min: 0, max: 100 }), crop: num('Split crop position 0–100.', { min: 0, max: 100 }),
        scale: num('Media: zoom 1–4; graphics: multiply box size.'), anchorX: num('Subject x 0–1.', { min: 0, max: 1 }), anchorY: num('Subject y 0–1.', { min: 0, max: 1 }),
        coordinateSpace: enumOf(['source-normalized']), resetPrecision: bool('Drop exact scale/anchor overrides.'),
        transform: obj({ scale: num('', { min: 0.05, max: 20 }), offsetX: num(), offsetY: num(), reset: bool() }),
        cropInsets: obj({ top: num('', { min: 0, max: 1 }), right: num('', { min: 0, max: 1 }), bottom: num('', { min: 0, max: 1 }), left: num('', { min: 0, max: 1 }), reset: bool() }),
        box: BOX, anchor: enumOf(PLACE_ANCHORS),
      }, ['clipId']), { minItems: 1, maxItems: 120 }),
    }, ['items']),
  },
  apply_layout: {
    description:
      'Arrange 1–4 graphic clips with the footage into one named layout — picture-in-picture, split-left-right, split-top-bottom or grid — in one step; the engine computes every box. videoPosition says where the footage sits in a split. Use it instead of hand-placing boxes and screenshot-checking alignment.',
    inputSchema: obj({
      layout: enumOf(['picture-in-picture', 'split-left-right', 'split-top-bottom', 'grid']),
      blockIds: ids('Graphic clips to arrange.'),
      shotId: str('Footage clip to compose with; default the clip under the first graphic.'),
      videoPosition: enumOf(['left', 'right', 'top', 'bottom']),
    }, ['layout', 'blockIds']),
  },
  set_keyframes: {
    description:
      'Replace or clear the keyframe track of one visual property (box or opacity) on one clip. Keyframe times are clip-relative seconds; an empty list clears the track. For static values use set_clip_framing / set_clip_properties.',
    inputSchema: obj({
      clipId: str(), property: enumOf(['box', 'opacity']),
      keyframes: arr(obj({ atSec: num('Clip-relative seconds.'), x: num(), y: num(), w: num(), h: num(), value: num() }, ['atSec'])),
    }, ['clipId', 'property', 'keyframes']),
  },
  manage_tracks: {
    description:
      `Create, update, reorder or remove one typed track. type is one of ${TRACK_TYPES.join(' / ')}; role (${TRACK_ROLES.join(' / ')}) decides which lane add_clips uses and how the mix treats it; order is the stacking order (larger renders above). syncLocked=true makes ripple edits move this track. Removing a track removes its clips.`,
    inputSchema: obj({
      action: enumOf(['create', 'update', 'move', 'remove']),
      trackId: str(), toIndex: int('move: destination index.'),
      type: enumOf(TRACK_TYPES), role: enumOf(TRACK_ROLES), name: str(),
      muted: bool(), hidden: bool(), locked: bool(), syncLocked: bool(), order: num('Stacking order.'),
    }, ['action']),
  },
  manage_clip_links: {
    description:
      'link joins clips into one editing group so moves, trims and removals apply together; unlink separates them; sync aligns clips to a reference by matching clip-local marker times (a clap, a word) and links the result unless link=false. Use sync for camera + external audio.',
    inputSchema: obj({
      action: enumOf(['link', 'unlink', 'sync']),
      clipIds: arr(str(), { description: 'link / unlink.' }), groupId: str(),
      referenceClipId: str('sync: the reference clip.'), referenceMarkerSec: num('sync: clip-local marker in the reference (default 0).'),
      targets: arr(obj({ clipId: str(), markerSec: num('Clip-local marker time.') }, ['clipId', 'markerSec']), { description: 'sync: clips to align.' }),
      link: bool('sync: link the aligned group (default true).'),
    }, ['action']),
  },
  add_transition: {
    description:
      `Set, restyle or remove the transition at a cut between two story-spine clips (the footage hands over; this is not an overlay). atFrame must be an existing boundary. effect is one of ${TRANSITION_EFFECT_IDS.join(' / ')}; none removes. durationFrames is the total length across both sides, at most ${MAX_TRANSITION_SEC} s, clamped by the neighbouring clips. direction applies to directional / directionalwipe.`,
    inputSchema: obj({
      atFrame: FRAME('Cut boundary'),
      effect: enumOf(TRANSITION_EFFECT_IDS),
      direction: enumOf(['up', 'down', 'left', 'right']),
      durationFrames: int('Total transition length in frames.', 1),
    }, ['atFrame']),
  },
  set_canvas: {
    description:
      'Change the output canvas. preset source/auto/follow-source matches the first placed video (the default), or choose portrait 9:16, landscape 16:9, square 1:1, or exact width×height (240–7680). Normalized boxes are preserved; after a ratio change one look at a busy frame is enough.',
    inputSchema: obj({
      preset: enumOf(['source', 'auto', 'follow-source', 'portrait', 'vertical', '9:16', 'landscape', 'horizontal', '16:9', 'square', '1:1']),
      width: num('', { min: 240, max: 7680 }), height: num('', { min: 240, max: 7680 }),
    }),
  },

  /* ------------------------------------------------------------------ speech */
  remove_silence: {
    description:
      'Remove dead air from the narration by analysing the actual audio — no transcript needed, so run it first when tightening pacing. minimumPauseSec (0.25–3, default 0.5) is the shortest pause treated as dead air; speechPaddingSec (0–0.5, default 0.15) stays on each edge next to speech. Overlays, captions and later material re-lay.',
    inputSchema: obj({
      minimumPauseSec: num('', { min: 0.25, max: 3 }),
      speechPaddingSec: num('', { min: 0, max: 0.5 }),
    }),
  },
  remove_words: {
    description:
      'Cut spoken content by the transcript, in one call for all cuts. ranges are source-second spans from get_transcript segments (whole ideas, retakes, dead passages); wordIds are stable ids from get_transcript words for exact words. keepGapSec leaves that much breathing room at each seam (default 0.35). The tool converts to the timeline, cuts the footage, re-lays overlays and captions. Word ids and positions shift afterwards — re-read get_transcript before another cut. Never place spoken content by frames; this is the editing surface for speech.',
    inputSchema: obj({
      ranges: arr(SOURCE_RANGE, { description: 'Source-second spans to remove.' }),
      wordIds: arr(str(), { description: 'Exact words to remove.' }),
      keepGapSec: num('Breathing room kept at each seam.', { min: 0, max: 2 }),
    }),
  },
  denoise_audio: {
    description:
      'Bake a speech-denoise pass on the narration (on-device model; runs in the background). strength is the dry/wet blend 0–1 (default 0.6); lower it if the voice sounds thin. off=true removes the pass. Re-tuning is fast — the inference is cached per source.',
    inputSchema: obj({ strength: num('', { min: 0, max: 1 }), off: bool() }),
  },

  /* ------------------------------------------------------------------ components */
  compose_component: {
    description:
      'Get the generation contract {system, prompt, target} for one Motion Graphic component, assembled from the live output: the real box, the backdrop under it, the active frame and the spoken beats in its window. Decide atFrame, durationFrames, placement and backdrop first; pass clipId to rewrite an existing component (its timing and box are supplied). Generate the response yourself with your own model, then submit it with apply_component. No credits are charged here.',
    inputSchema: obj({
      instruction: str('What the component must communicate, in one concrete sentence.'),
      clipId: str('Existing graphic clip to rewrite.'),
      atFrame: FRAME('New component start'), durationFrames: int('New component duration in frames.', 1),
      placement: PLACEMENT_PCT, backdrop: str('What sits under the box and which zones must stay clear.'),
      format: enumOf(['html', 'kit'], 'html = bespoke markup; kit = a registered component (JSON props).'),
    }, ['instruction']),
  },
  apply_component: {
    description:
      `Validate and place the component you generated from compose_component: pass raw (your full generated text) with the target clipId, atFrame, durationFrames and placement copied unchanged. Lint rejections list exact issues — fix only those and re-apply with the same clipId. generate=true instead asks Pireel's own model to author or rewrite from instruction (${CHARGE_MARKER} use only when the BYO path fails repeatedly).`,
    inputSchema: obj({
      raw: str('Your full generated text in the contract compose_component returned.'),
      clipId: str('Target from compose_component, or the graphic clip to edit.'),
      atFrame: FRAME('Start'), durationFrames: int('Duration in frames.', 1),
      placement: PLACEMENT_PCT, label: str('Short timeline label.'),
      generate: bool('Hosted generator fallback.'), instruction: str('generate: what to author or change.'), backdrop: str('generate: what sits under the box.'),
    }),
  },
  set_texts: {
    description:
      `Add or update native display-text components in one call: items without id are added (text + startFrame required), items with id update that clip. preset (${TEXT_PRESET_IDS.join(' / ')}) chooses the typography, animation (${TEXT_ANIMATION_IDS.join(' / ')}) the entrance; omit both for the preset default. placement is a percent box; color/accentColor/fontSize (24–180)/fontWeight/fontFamily/align are optional overrides. Simple hooks, labels and CTAs belong here, not in a bespoke component.`,
    inputSchema: obj({
      items: arr(obj({
        id: str('Existing text clip to update.'), text: str(),
        startFrame: FRAME('Start'), durationFrames: int('Duration in frames.', 1), trackId: str(),
        preset: enumOf(TEXT_PRESET_IDS), animation: enumOf(TEXT_ANIMATION_IDS),
        color: str('#RGB / #RRGGBB'), accentColor: str('#RGB / #RRGGBB'), fontSize: num('', { min: 24, max: 180 }), fontWeight: num('', { min: 300, max: 950 }),
        fontFamily: enumOf(['preset', 'sans', 'serif', 'mono']), align: enumOf(['left', 'center', 'right']),
        placement: PLACEMENT_PCT,
      }), { minItems: 1 }),
    }, ['items']),
  },
  set_captions: {
    description:
      `Drive the managed subtitle layer as one object. on turns it on or off; preset (${CAPTION_PRESET_IDS.length} built-in styles from get_state’s caption catalog), yPct (baseline % from the top) and scale restyle it; source picks the transcript (auto, or a trackId / clipId); corrections fix caption wording by transcript row without touching the spoken audio; translations {lang, items} add a second line per row (clear removes all); relayout regenerates cue boundaries after canvas or font changes. Cues re-derive after every cut — never edit them individually.`,
    inputSchema: obj({
      on: bool(),
      preset: enumOf(CAPTION_PRESET_IDS), yPct: num('', { min: 0, max: 100 }), scale: num('', { min: 0.5, max: 2 }),
      font: str('Caption font: sans | serif | mono | web:<library id> | local:<family>; "preset" restores the preset\'s own font.'),
      script: str('Silent montage only (no spoken transcript): the caption copy, one line per caption, timed across the placed picture by character share; the copy becomes the transcript truth of those clips.'),
      source: obj({ trackId: str(), clipId: str() }),
      clipId: str('corrections / translations: an inserted clip’s transcript instead of the main narration.'),
      corrections: arr(obj({ index: int('Transcript row.'), text: str('Complete corrected sentence.') }, ['index', 'text'])),
      translations: obj({ lang: str('Target language name.'), items: arr(obj({ index: int('Transcript row.'), text: str('Translation; empty removes.') }, ['index', 'text'])), clear: bool() }),
      relayout: bool(),
    }),
  },
  manage_frame: {
    description:
      'Visual direction. list returns the available frames (design-system content packs); attach applies one by id, filling unspecified art-direction decisions while the user’s explicit choices and manual project values stay authoritative; read returns the attached frame’s playbook to design against. A frame never authorises resetting palette, captions or layout the user set by hand.',
    inputSchema: obj({ action: enumOf(['list', 'attach', 'read']), id: str('Frame id for attach / read.') }, ['action']),
  },

  /* ------------------------------------------------------------------ generation */
  list_models: {
    description:
      'List the enabled hosted generation models for a kind, with stable ids and capability notes such as supported sizes and durations. Call it before passing a non-default modelId to generate_image, generate_video or lip_sync; omit modelId to use the catalog default.',
    inputSchema: obj({ kind: enumOf(['image', 'video', 'all']) }),
  },
  generate_image: {
    description:
      `${CHARGE_MARKER} Start one hosted image generation and return a job id; poll inspect_media mode:generation, then register_media and add_clips. prompt is a production-ready visual brief (subject, action, environment, camera, light, composition, exclusions); referenceImages carry identity or product constraints. Works without an open tab.`,
    inputSchema: obj({
      prompt: str(), modelId: str('From list_models; omit for the default.'),
      size: str('e.g. 1440x2560, 2560x1440, 2048x2048.'), quality: str('Model-specific tier.'),
      referenceImages: arr(str(), { maxItems: 9 }),
    }, ['prompt']),
  },
  generate_video: {
    description:
      `${CHARGE_MARKER} Start one hosted video generation (4–15 s) and return a job id; poll inspect_media mode:generation, then register_media and add_clips. prompt names camera movement, subject action and sound; aspectRatio and resolution are explicit user overrides only (default: follow the canvas). Reference images/videos/audios carry consistency. Do not poll in the same turn.`,
    inputSchema: obj({
      prompt: str(), modelId: str(), durationSec: num('4–15.', { min: 4, max: 15 }),
      aspectRatio: enumOf(['9:16', '16:9', '1:1']), resolution: enumOf(['480p', '720p', '1080p']),
      referenceImages: arr(str(), { maxItems: 9 }), referenceVideos: arr(str(), { maxItems: 3 }), referenceAudios: arr(str(), { maxItems: 3 }),
    }, ['prompt']),
  },
  generate_audio: {
    description:
      `${CHARGE_MARKER} Generate one audio asset from text and return it registered-ready. kind=music: an instrumental bed, 30–300 s, prompt = genre/instrumentation + energy + role under the picture + constraints. kind=sfx: one sound effect 0.5–22 s for off-screen or editorial sound (whoosh, ping, stinger, ambience) — describe the sound, not the scene; promptInfluence 0–1 (default 0.3), loop for seamless beds. Then register_media and add_clips with role music or sfx. Picture-synchronous sound is generate_foley. Search official assets first.`,
    inputSchema: obj({
      kind: enumOf(['music', 'sfx']),
      prompt: str(),
      durationSec: num('music 30–300; sfx 0.5–22.', { min: 0.5, max: 300 }),
      promptInfluence: num('sfx only, 0–1.', { min: 0, max: 1 }),
      loop: bool('sfx only: seamless loop.'),
    }, ['kind', 'prompt']),
  },
  generate_speech: {
    description:
      `${CHARGE_MARKER} Synthesize narration from exact clean text with an explicit voiceId from manage_voices list. Returns an audio asset with transcriptText and measured durationSec — not placed: register_media then add_clips role narration. Keep the text verbatim; put delivery direction in instruction (required when emotion, pauseStyle or pauses are set). Reuse an existing generated narration asset instead of regenerating the same script.`,
    inputSchema: obj({
      text: str('1–5000 characters.'), voiceId: str(),
      speed: num('', { min: 0.5, max: 2 }), instruction: str('User-visible delivery direction.'),
      emotion: enumOf(['auto', 'calm', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised']),
      pauseStyle: enumOf(['natural', 'tight', 'spacious', 'dramatic']),
      pauses: arr(obj({ afterText: str(), durationSec: num('', { min: 0.1, max: 2 }), occurrence: int('1-based occurrence.', 1) }, ['afterText', 'durationSec']), { maxItems: 24 }),
      name: str('Library label.'),
    }, ['text', 'voiceId']),
  },
  generate_foley: {
    description:
      `${CHARGE_MARKER} Studio Chat only. Generate picture-synchronous Foley for up to 8 exact source spans (1–30 s each) of video assets: it shows the event list and cost, waits for approval, uploads only those spans, generates, and saves each result to the reusable audio library with eventType/material/reusePolicy. Prompts name only audible events grounded in the picture. Then register_media and place all results in one add_clips call with role sfx and no trackId.`,
    inputSchema: obj({
      items: arr(obj({
        sourceAssetId: str(), sourceUrl: str(), sourceInSec: num(), sourceOutSec: num(),
        prompt: str('Audible events in the span.'), negativePrompt: str(), name: str(), eventType: str(), material: str(),
        reusePolicy: enumOf(['generic', 'timing-compatible', 'exact-shot-only']),
      }, ['sourceInSec', 'sourceOutSec', 'prompt']), { minItems: 1, maxItems: 8 }),
    }, ['items']),
  },
  lip_sync: {
    description:
      `${CHARGE_MARKER} Start one asynchronous lip-sync video (4–15 s) from an audio url plus exactly one portrait image or one source video. Returns a job id for inspect_media mode:generation; it does not place anything. aspectRatio / resolution are explicit user overrides only.`,
    inputSchema: obj({
      audioUrl: str(), sourceImageUrl: str(), sourceVideoUrl: str(),
      durationSec: num('4–15.', { min: 4, max: 15 }), aspectRatio: enumOf(['9:16', '16:9', '1:1']), resolution: enumOf(['480p', '720p', '1080p']),
      modelId: str(), name: str(),
    }, ['audioUrl']),
  },
  manage_voices: {
    description:
      `Voices for generate_speech. list returns candidates with stable voiceIds (filter by language or query) and the account’s clone/design prices. clone (${CHARGE_MARKER}) creates a voice from an owned audio asset and requires consentConfirmed=true after the user explicitly confirmed ownership; design (${CHARGE_MARKER}) creates one from a text description; delete removes a user voice. Surface the price and wait for approval before clone or design.`,
    inputSchema: obj({
      action: enumOf(['list', 'clone', 'design', 'delete']),
      language: enumOf(VOICE_LANGUAGES), query: str(), limit: int('list: max results.', 1),
      audioAssetId: str('clone: owned audio asset.'), name: str(), consentConfirmed: bool('clone: explicit user consent.'), preprocess: bool('clone: denoise a noisy sample.'),
      prompt: str('design: 1–200 characters.'),
      voiceId: str('delete.'),
    }, ['action']),
  },

  /* ------------------------------------------------------------------ session */
  list_skills: {
    description:
      'List Studio Skills: Pireel’s official craft playbooks (the same files the Studio chat reads) and the account’s private/community skills — metadata only. Before a complete edit of a speech-led video, a montage, or sound work, read the matching official skill with read_skill.',
    inputSchema: obj({ query: str('Title / summary filter.'), limit: int('Max results.', 1) }),
  },
  read_skill: {
    description:
      'Read one Studio Skill as a complete Markdown playbook by exact id from list_skills. Apply it as editorial judgment over these tools; it never introduces tools of its own. speech-cleanup is the official decision policy for filler, retake and dead-air cuts.',
    inputSchema: obj({ id: str('Exact skill id.') }, ['id']),
  },
  preview: {
    description:
      'Steer what the user sees in the open Studio tab: focus selects an element and moves the playhead to it (do this after creating or changing something visible); seek moves the playhead to a frame; play runs the preview from frame (to toFrame); pause stops it. Needs an open tab.',
    inputSchema: obj({
      action: enumOf(['focus', 'seek', 'play', 'pause']),
      id: str('focus: clip id.'), frame: FRAME('seek / play start'), toFrame: FRAME('play end (exclusive)'),
    }, ['action']),
  },
  undo: {
    description:
      'Revert the latest change — one step per call — ONLY when the user explicitly asks to undo. Never undo on your own: when a result is wrong or the user wants something different, make the forward edit instead (set the value again, move the clip, or re-insert a removed source span from the delta’s removedSource). The history is shared with the user’s own edits, so an unrequested undo can erase their work; in offline mode it reverts the latest cloud version, which may be their own save. Re-read get_state afterwards: the state is restored, not patched, and ids may differ.',
    inputSchema: obj({}),
  },
  ask_user: {
    description:
      'Studio Chat only. kind=question renders a small set of clickable options for a decision only the user can make; kind=approval pauses for consent before a consequential or paid proposal (title + content). Ask one thing at a time and stop the turn after asking.',
    inputSchema: obj({
      kind: enumOf(['question', 'approval']),
      question: str(), options: arr(str(), { maxItems: 6 }), multiSelect: bool(),
      title: str('approval'), content: str('approval: what will happen and what it costs.'),
    }),
  },
  export: {
    description:
      'start renders the active output as a file (adaptive source-quality settings; resolution / fps / format are explicit user overrides only; sink_url sends the file to the export-sink helper instead of a browser download). status reports the running export: running | done | idle with progress. Export only when the user asks for a deliverable; the editable output is the default result of an edit.',
    inputSchema: obj({
      action: enumOf(['start', 'status']),
      resolution: { type: 'number', enum: [2160, 1440, 1080, 720, 540] }, fps: { type: 'number', enum: [24, 30, 60] }, format: enumOf(['mp4', 'webm', 'mov']),
      sink_url: str('Loopback receiver from the export-sink helper.'),
    }),
  },
};
