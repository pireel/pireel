/**
 * L0, the tool surface — the editor's VERBS, next to l0-editor.ts's nouns.
 *
 * One layer, two files, and the split is mechanical, not conceptual: l0-editor.ts is prose every
 * surface splices into its system text, while this file is DATA (JSON schemas + descriptions) that
 * hosts attach as tools. Both describe the same editor, and both are single-source across surfaces:
 * the in-app chat attaches these via streamText, the MCP server exposes the same table (with
 * per-surface description overrides where a mechanism doesn't exist there — see mcp.ts), and the
 * client executes via onToolCall. A tool that existed in one surface's copy but not the other's
 * would be the drift L0 exists to prevent.
 *
 * (Previous header follows — the operational contract for adding tools is unchanged.)
 */
/**
 * Studio editing expert toolset — defined once, shared by server and client.
 *
 * Key design: these tools are NOT executed on the server. The server only uses their
 * JSON schema to attach tools to streamText (the model emits tool-calls from that);
 * actual execution happens on the CLIENT — studio-chat's useChat.onToolCall receives
 * a tool-call and calls the workbench-provided runTool to mutate the React Composition
 * state directly (move block / trim / reframe…), then addToolOutput feeds the result
 * back and the model continues/finishes. Block content generation (add_block /
 * edit_block) still reuses /api/studio/compose.
 *
 * So this file must be client-safe: zero server deps, schema is plain JSON (no zod).
 */

import { CAPTION_PRESETS } from '../caption-presets';
import { PLACE_ANCHORS } from '../composition-core';
import { BROLL_DECISIONS, NARRATIVE_ROLES, SCENE_FAMILIES, VIEWER_TASKS } from '../director-plan';

export type StudioToolKind = 'badge' | 'card';

/**
 * Public contract for tool names that may be written into a reusable Studio Skill.
 *
 * A missing contract means the tool is an implementation detail and Skill authors must
 * describe the intent instead of depending on its current name or payload. Stable contracts
 * are append-only within one version: optional inputs may be added, but existing names,
 * meanings, enums and accepted payloads must remain valid. Breaking changes require a new
 * capability id or a higher contract version with an explicit compatibility path.
 */
export interface StudioSkillCapabilityContract {
  version: number;
  stability: 'stable' | 'experimental';
}

export interface StudioToolDef {
  id: string;
  /** badge = instant state change (small badge); card = needs generation, slower (card shows note). */
  kind: StudioToolKind;
  /** Small icon in the feed (emoji). */
  icon: string;
  /** UI label (used for progress / card title). */
  label: string;
  /** Default busy text while running (shown on the card before any streamed note/stage progress — don't leave the user staring at static text). */
  busyText?: string;
  /** English agent instruction (goes into system prompt + tool description). */
  description: string;
  /** JSON schema — server wraps it via jsonSchema() into tool(); client only reads input, no validation. */
  inputSchema: Record<string, unknown>;
  /** Opt-in public contract for reusable Skills. Unset tools are not safe to name in a Skill. */
  skillContract?: StudioSkillCapabilityContract;
  /** Chat-surface only: not exposed on MCP (external agents bring their own vision via capture_frame/review_sequence). */
  chatOnly?: boolean;
}

const TREATMENTS = ['full', 'punch-in', 'corner-tl', 'corner-tr', 'corner-bl', 'corner-br', 'split-l', 'split-r', 'split-t', 'split-b'] as const;
const AGENT_MEDIA_BOX_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    x: { type: 'number', description: 'Left edge in canvas units; may be below 0 or above 1 for off-canvas placement.' },
    y: { type: 'number', description: 'Top edge in canvas units; may be below 0 or above 1 for off-canvas placement.' },
    w: { type: 'number', description: 'Positive width in canvas units; may exceed 1.' },
    h: { type: 'number', description: 'Positive height in canvas units; may exceed 1.' },
  },
  required: ['x', 'y', 'w', 'h'],
} as const;
const SHOT_FRAMING_PROPERTIES = {
  shotId: { type: 'string' },
  atSec: { type: 'number', description: 'Edited-timeline point inside the target shot; useful after split_shot when new ids are unknown.' },
  treatment: { type: 'string', enum: [...TREATMENTS] },
  size: { type: 'number', description: 'Treatment size 0..100.' },
  crop: { type: 'number', description: 'Split crop position 0..100.' },
  scale: { type: 'number', description: 'Exact zoom 1..4 relative to minimum cover fit; full/punch-in only.' },
  anchorX: { type: 'number', description: 'Subject x, normalized 0..1 in the declared coordinate space.' },
  anchorY: { type: 'number', description: 'Subject y, normalized 0..1 in the declared coordinate space.' },
  coordinateSpace: { type: 'string', enum: ['source-normalized'], description: 'Use only for anchors measured on the original source frame.' },
  resetPrecision: { type: 'boolean', description: 'true removes exact scale/anchor override.' },
} as const;

const AGENT_CLIP_ITEM_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string', description: 'Optional new clip id; omit to allocate one.' },
    assetId: { type: 'string', description: 'Exact registered asset id.' },
    trackId: { type: 'string', description: 'Optional exact target track. Omit to reuse/create the semantic role lane.' },
    role: { type: 'string', enum: ['primary', 'broll', 'narration', 'music', 'sfx'], description: 'Semantic lane role. Use primary for the continuous full-frame video story spine; use broll only for concurrent overlay/PiP evidence. Audio defaults to narration and visual media defaults to broll when omitted.' },
    sceneId: { type: 'string', description: 'Director scene that owns this visual clip. For a planned edit, pass the exact scene id; audio clips ignore it.' },
    startSec: { type: 'number', description: 'Edited-timeline start in seconds.' },
    durationSec: { type: 'number', description: 'Initial timeline duration. Defaults to the registered source remainder; when source duration is unavailable it starts at an editable 5s. Five seconds is a default, never a limit.' },
    sourceInSec: { type: 'number' }, sourceOutSec: { type: 'number' },
    fit: { type: 'string', enum: ['contain', 'cover'] },
    box: AGENT_MEDIA_BOX_SCHEMA,
    anchorX: { type: 'number', description: 'Cover-crop source anchor 0..1, left to right.' },
    anchorY: { type: 'number', description: 'Cover-crop source anchor 0..1, top to bottom.' },
    opacity: { type: 'number', description: 'Visual opacity 0..1.' },
    enabled: { type: 'boolean' }, linkGroupId: { type: 'string' },
    volumeDb: { type: 'number', description: 'Initial level. Omit for semantic defaults: narration is lifted for clarity and music starts safely under narration; adjust later only after a deliberate mix decision.' }, fadeInSec: { type: 'number' }, fadeOutSec: { type: 'number' },
    speed: { type: 'number' }, muted: { type: 'boolean' },
  },
  required: ['assetId'],
} as const;

const AGENT_CLIP_PROPERTY_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    clipId: { type: 'string' }, startSec: { type: 'number' }, enabled: { type: 'boolean' },
    fit: { type: 'string', enum: ['contain', 'cover'] },
    box: AGENT_MEDIA_BOX_SCHEMA,
    anchorX: { type: 'number' }, anchorY: { type: 'number' }, opacity: { type: 'number' },
    volumeDb: { type: 'number' }, fadeInSec: { type: 'number' }, fadeOutSec: { type: 'number' },
    speed: { type: 'number' }, muted: { type: 'boolean' }, sourceInSec: { type: 'number' }, sourceOutSec: { type: 'number' },
  },
  required: ['clipId'],
} as const;

/** Helper: build an object schema. */
function obj(
  properties: Record<string, unknown>,
  required: string[],
): Record<string, unknown> {
  return { type: 'object', additionalProperties: false, properties, required };
}

export const STUDIO_TOOLS: StudioToolDef[] = [
  /* ---------- visual direction (server-owned Frame playbook; client only renders the card) ---------- */
  {
    id: 'read_frame',
    kind: 'card',
    busyText: 'tools.read_frame.busy',
    icon: '🎨',
    label: 'tools.read_frame.label',
    description:
      "Load the attached Frame's professional art-direction playbook. Carry its shape language, material and image treatment, typography personality, color-role relationships, spatial tension, motion temperament and sparse sound texture across the edit; explicit palette, caption and layout controls override fixed assumptions. When <frame_attached> appears, call this ONCE before planning or generating. Named situations and showcases are reference vocabulary, never Scene categories, layouts, media decisions or templates. The Skill and Director own story and Scene strategy; the persisted Scene design interprets the Frame for actual evidence and footage. If its result already exists in history, do NOT call again. No input needed.",
    inputSchema: obj({}, []),
  },
  {
    id: 'attach_frame',
    kind: 'badge',
    busyText: 'tools.attach_frame.busy',
    icon: '🖼️',
    label: 'tools.attach_frame.label',
    description:
      "Attach a professional visual direction by Frame id. Its transferable art-direction principles apply across the edit; it does not choose story, Scene type, footage, layout or a template. Palette, captions and layout remain independent project controls. <frame_attached> will then tell you to read_frame. Call only after the user chooses a direction or delegates the choice. Skill and visual direction are independent. Also usable to switch directions when requested.",
    inputSchema: obj({ frame_id: { type: 'string', description: 'Frame id from the catalog, e.g. "biennale-poster"' } }, ['frame_id']),
  },
  {
    id: 'set_director_plan',
    kind: 'badge',
    icon: '🎬',
    label: 'tools.set_director_plan.label',
    description:
      'Save or replace the editing expert\'s whole-video design contract for a broad request or explicitly requested COMPLETE edit, after reading the relevant transcript/footage evidence, honoring the user\'s independent Frame state (attached or themeless), and receiving Approve from request_approval for the exact current proposal. The contract has three levels: one creative thesis, one whole-film rhythm arc, and one shared video design system; chronological Semantic Scenes then vary that system around their actual source evidence and viewer task. Saving creates real editable boundaries on the primary visual lane without removing content and binds timeline clips to Scenes. Save the approved contract before other timeline mutations; replace it only when later evidence materially changes the design or scene structure. This is an editable decision artifact, NOT a macro, checklist, Component recipe or substitute for judgment. Do not call it for a local change. Every later scene starts at or after the previous scene ends. Times use the edited timeline in seconds.',
    inputSchema: obj(
      {
        goal: { type: 'string', description: 'Concrete viewer or business outcome for this output.' },
        creativeThesis: { type: 'string', description: 'One concise directing idea that governs pacing, evidence and visual contrast.' },
        rhythmArc: { type: 'string', description: 'Whole-film progression of pace, density, pressure, release and final hold. Describe contrast over time rather than a constant tempo.' },
        deliverySafety: { type: 'string', description: 'Target platform/placement and ratio; platform chrome, caption, crop and edge-copy zones that must remain clear; the protected region for faces, products, evidence, prices, terms and CTA. If the platform is unknown, state that and use a conservative central safe region rather than inventing exact chrome.' },
        designSystem: {
          type: 'object',
          additionalProperties: false,
          description: 'One shared video design system for the complete output. It is derived from source material, user choices and the attached Frame when present; scenes inherit it instead of inventing independent styles.',
          properties: {
            visualConcept: { type: 'string', description: 'The memorable visual idea and intended level of restraint/intensity.' },
            composition: { type: 'string', description: 'Spatial hierarchy, negative-space policy, source/graphic relationship and layout rhythm.' },
            typography: { type: 'string', description: 'Display/body/number roles, hierarchy, casing and emphasis behavior.' },
            colorAndMaterial: { type: 'string', description: 'Ground, ink, accent and material behavior. Preserve explicit project palette choices.' },
            imagery: { type: 'string', description: 'Treatment of real footage, screenshots, photography, generated imagery, crops and evidence.' },
            motion: { type: 'string', description: 'Camera and graphic movement, easing, energy, transition, hold and clear behavior.' },
            sound: { type: 'string', description: 'Dialogue hierarchy, source sound, music, silence and sparse graphic punctuation.' },
          },
          required: ['visualConcept', 'composition', 'typography', 'colorAndMaterial', 'imagery', 'motion', 'sound'],
        },
        skillId: { type: 'string', description: 'Selected Studio Skill id when one is active; independent of frameId.' },
        frameId: { type: 'string', description: 'User-selected Frame id when one is attached; independent of skillId.' },
        audience: { type: 'string', description: 'Intended viewer, when known.' },
        scenes: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          description: 'Chronological, non-overlapping scene intervals. Each next startSec must be at or after the previous scene end.',
          items: obj(
            {
              id: { type: 'string', description: 'Short stable id unique inside this plan.' },
              label: { type: 'string', description: 'Short human-readable scene name.' },
              startSec: { type: 'number', description: 'Edited-timeline start in seconds. After the first scene, this must be >= previous startSec + previous durationSec.' },
              durationSec: { type: 'number', description: 'Positive duration in seconds; the interval must end no later than the next scene starts.' },
              viewerTask: { type: 'string', enum: [...VIEWER_TASKS] },
              narrativeRole: { type: 'string', enum: [...NARRATIVE_ROLES] },
              sceneFamily: { type: 'string', enum: [...SCENE_FAMILIES], description: 'Shared scene vocabulary, not a Motion Graphic or layout selector. Use custom when the edit needs another family.' },
              customFamily: { type: 'string', description: 'Free-form family name; required only when sceneFamily is custom.' },
              purpose: { type: 'string', description: 'Why this scene exists and what should change for the viewer.' },
              evidence: { type: 'array', items: { type: 'string' }, description: 'Transcript/footage/product/asset facts that support this scene.' },
              treatmentId: { type: 'string', description: 'Concise kebab-case name for this content-specific Scene treatment. Derive it from the purpose, evidence and complete composition; do not select a Frame showcase, broad family or generic shell such as top-label or CTA-card.' },
              visualAnchor: { type: 'string', description: 'Concrete subject, action, evidence, or relationship that must dominate and remain unobscured.' },
              visualTreatment: { type: 'string', description: 'Executable source-aware composition: framing/crop, Motion-Graphic-to-footage relationship, hierarchy, placement/safe zones, density and exit state. When a Motion Graphic is earned, name the content-specific communicative form (for example matched comparison, causal flow, real browser proof, code execution, share chart or identity overlay), not merely a broad family. Capability names are landmarks, never literal boxes or a closed enum.' },
              motionPlan: { type: 'string', description: 'How the scene enters, develops with exact speech/action beats, reaches a visual payoff, holds, and clears/exits; use the Frame motion grammar.' },
              soundPlan: { type: 'string', description: 'How voice, source sound, music, silence and any sparse graphic cue support this scene.' },
              assetStrategy: { type: 'string', description: 'Choose the strongest primary visual medium and why it beats the nearest materially different alternative: keep source; user/project/official asset; credible search; generated image; editable graphic; or none. Real people/products/events/interfaces/evidence prefer truthful source/search material. Generation may create an authored/stylized scene, controlled composition, illustrative subject, concept, physical metaphor, atmosphere, transition plate or otherwise unavailable shot; never use it as invented proof or quota filler. The Frame shapes its visual language but never decides whether generation is allowed.' },
              brollDecision: { type: 'string', enum: [...BROLL_DECISIONS], description: 'none keeps A-roll/source continuity; source uses supplied footage; search retrieves truthful external material; generate creates the strongest non-evidentiary visual for the beat when available alternatives are weaker.' },
              brollRationale: { type: 'string', description: 'Why this moment earns or rejects a picture change. Prefer cognitive anchors—evidence, process, relation, state change, or a sharp metaphor—not decoration or coverage quotas.' },
              visualMetaphor: { type: 'string', description: 'Optional one-sentence visual proposition for metaphorical B-roll: one idea, one physical action/relation, normally 3–6 meaningful objects.' },
            },
            ['id', 'label', 'startSec', 'durationSec', 'viewerTask', 'narrativeRole', 'sceneFamily', 'purpose', 'treatmentId', 'visualAnchor', 'visualTreatment', 'motionPlan', 'soundPlan', 'assetStrategy', 'brollDecision', 'brollRationale'],
          ),
        },
      },
      ['goal', 'creativeThesis', 'rhythmArc', 'deliverySafety', 'designSystem', 'scenes'],
    ),
  },
  {
    id: 'set_scene_designs',
    kind: 'badge',
    icon: '◫',
    label: 'tools.set_scene_designs.label',
    description:
      'Author or revise the persistent spatial-temporal design for one or more approved Director Scenes. This is the open design layer between whole-film direction and atomic timeline tools—not a layout, transition, Component or Motion Graphic selector. Work progressively from actual transcript/footage/image evidence and current timeline state. Describe the complete canvas, including simultaneous relationships between source footage, secondary media, typography, captions and Motion Graphics; describe how that combined state establishes, develops, pays off, holds, clears and hands material across the Scene boundary. Do not add layers to satisfy a count: a deliberately clean source-led Scene is valid when it is the strongest design. Call before planned visual mutations for that Scene; call again only when new evidence or rendered review materially changes the design. It does not require another user approval after the whole-film proposal was approved.',
    inputSchema: obj({
      scenes: {
        type: 'array',
        minItems: 1,
        maxItems: 24,
        description: 'A progressive batch of complete Scene designs. Later calls replace matching sceneIds and preserve other Scenes.',
        items: obj({
          sceneId: { type: 'string', description: 'Exact id from the saved Director Plan.' },
          designIntent: { type: 'string', description: 'One content-specific visual argument and memorable payoff; not a style label or Component name.' },
          composition: { type: 'string', description: 'Whole-canvas hierarchy and simultaneous spatial relationships. Name the visual anchor, supporting layers, scale/overlap/negative space and why they form one shot. Inherit the Director Plan delivery safe area; mention only a Scene-specific protected subject or deliberate decorative bleed instead of repeating the whole platform specification.' },
          choreography: { type: 'string', description: 'Temporal design of the complete composition: establishment, development, emphasis/payoff, readable hold and clear. Tie changes to exact speech/action/evidence beats when available.' },
          continuity: { type: 'string', description: 'How picture, motion and sound arrive from the previous Scene and what remains, transforms or exits to motivate the next Scene. A hard cut is valid only when its contrast is intentional.' },
          successCriteria: { type: 'string', description: 'Observable rendered conditions for hierarchy, legibility, evidence, rhythm, coherence and continuity. State what must be visible/audible, not which tool must be called.' },
        }, ['sceneId', 'designIntent', 'composition', 'choreography', 'continuity', 'successCriteria']),
      },
    }, ['scenes']),
  },
  /* ---------- speech-editing playbook (separate skill content pack; server-executed, client only renders the card, no runTool impl) ---------- */
  {
    id: 'read_editing_guide',
    kind: 'card',
    busyText: 'tools.read_editing_guide.busy',
    icon: '✂️',
    label: 'tools.read_editing_guide.label',
    description:
      'Load the A-roll speech-cleanup decision policy. Call ONCE before judgment-based cleanup, de-filler, tightening, or highlight selection, then apply only the relevant guidance. An exact passage the user explicitly identified does not need it. If its result is already in the conversation history, do NOT call it again.',
    inputSchema: obj({}, []),
  },
  /* ---------- project deliverables (one project, multiple independently editable outputs) ---------- */
  {
    id: 'list_outputs',
    kind: 'badge',
    icon: '🎞️',
    label: 'tools.list_outputs.label',
    description:
      'List every deliverable in this project and identify the active one. Each row includes a live one-based position for phrases like "the second output" and a stable id. Positions are recomputed after deletion; ids never change.',
    inputSchema: obj({}, []),
  },
  {
    id: 'create_output',
    kind: 'badge',
    icon: '➕',
    label: 'tools.create_output.label',
    description:
      'Create and switch to an EMPTY independently editable deliverable. It keeps only the current canvas format and theme; it does not copy timeline clips, media, captions, assets, or cover. Use duplicate_output when a copy is intended. Needs the studio tab open.',
    inputSchema: obj(
      {
        title: { type: 'string', description: 'Short human-readable output name, e.g. "Hook 1 · 30s".' },
        skill: { type: 'string', description: 'Optional scenario skill id that is producing it, e.g. pireel-long-to-shorts.' },
      },
      ['title'],
    ),
  },
  {
    id: 'duplicate_output',
    kind: 'badge',
    icon: '⧉',
    label: 'tools.duplicate_output.label',
    description:
      'Copy the active output by default and switch to the copy. Supply a stable output_id or live one-based position only when the user explicitly identifies another source output. This is distinct from create_output, which starts empty. Needs the studio tab open.',
    inputSchema: obj(
      {
        output_id: { type: 'string', description: 'Optional exact stable id of the source output.' },
        position: { type: 'number', description: 'Optional current one-based position of the source output.' },
        title: { type: 'string', description: 'Short human-readable name for the copy.' },
      },
      ['title'],
    ),
  },
  {
    id: 'switch_output',
    kind: 'badge',
    icon: '↔️',
    label: 'tools.switch_output.label',
    description:
      'Switch the checked-out deliverable using either its stable id or its current one-based position. The current timeline is snapshotted before the target loads. Re-read state after switching because all unqualified edits and @ references now target the newly active output. Needs the studio tab open.',
    inputSchema: obj(
      {
        output_id: { type: 'string', description: 'Exact stable id from list_outputs.' },
        position: { type: 'number', description: 'Current one-based position, e.g. 2 for "the second output".' },
      },
      [],
    ),
  },
  {
    id: 'rename_output',
    kind: 'badge',
    icon: '✏️',
    label: 'tools.rename_output.label',
    description: 'Rename the active output by default. Supply either a stable output_id or a live one-based position only when the user explicitly names another output. Needs the studio tab open.',
    inputSchema: obj(
      {
        output_id: { type: 'string', description: 'Optional exact stable id from list_outputs.' },
        position: { type: 'number', description: 'Optional current one-based position.' },
        title: { type: 'string' },
      },
      ['title'],
    ),
  },
  {
    id: 'delete_output',
    kind: 'badge',
    icon: '🗑️',
    label: 'tools.delete_output.label',
    description:
      'Delete the active output by default. Supply either a stable output_id or a live one-based position only when the user explicitly names another output. At least one output is retained. Deleting the active output opens the nearest survivor. This cannot delete the project itself. Needs the studio tab open.',
    inputSchema: obj(
      {
        output_id: { type: 'string', description: 'Optional exact stable id from list_outputs.' },
        position: { type: 'number', description: 'Optional current one-based position.' },
      },
      [],
    ),
  },
  /* ---------- media analysis (card · slow) ---------- */
  {
    id: 'read_script',
    skillContract: { version: 1, stability: 'stable' },
    kind: 'card',
    busyText: 'tools.read_script.busy',
    icon: '📖',
    label: 'tools.read_script.label',
    description:
      "Get spoken transcripts grouped by equal-standing source. If the requested source already has a transcript, return it immediately; otherwise transcribe its actual audio and return measured timed sentences/words. With no input, get every transcript-bearing narrative/audio source and transcribe only what is missing. For an unplaced device-local video/audio returned by list_assets/search_assets, first honor analyze_visual's local PCM/RNNoise audioAssessment: never call this for no-audio, effectively-silent, or non-speech-or-noise; call it for speech-likely only when existing spoken wording matters. Pass its exact assetId directly: project-library membership is enough, and the asset must NOT be registered or placed on the timeline first. If byte access is unavailable, ask the user to restore access in Materials rather than placing the asset. An explicit @asset_… pill may also be passed in assetId and is resolved to that project-local asset. contentSig/localSig is a legacy compatibility locator and can be ambiguous when identical files were imported more than once. For a registered speech-bearing audio/video source, pass its exact assetId or placed clipId. A known TTS/user script is semantic text truth and is returned without ASR unless measured timing, pauses, performed wording, karaoke/caption sync or another audio-derived fact requires transcription. Ordinary short/medium projects arrive in full; genuinely long transcripts are explicitly marked truncated and can be supplemented with search_media. Every section uses that source's own clock and carries CURRENT edit state. It does NOT add captions, register media, place assets, or cut clips.",
    inputSchema: obj({
      localSig: { type: 'string', description: 'Legacy compatibility only: an unambiguous device-local content signature.' },
      assetId: { type: 'string', description: 'Exact project-local asset id from list_assets/search_assets (or its @asset_… token), or a registered speech-bearing asset id.' },
      clipId: { type: 'string', description: 'Optional exact placed speech-bearing audio or video clip id; resolves its asset automatically.' },
      measuredTiming: { type: 'boolean', description: 'Default false: reuse any stored transcript. Set true only when a supplied/TTS script exists but the task specifically needs measured performed-audio word timing, pauses or delivery.' },
    }, []),
  },
  {
    id: 'list_words',
    skillContract: { version: 1, stability: 'stable' },
    kind: 'badge',
    icon: '🔤',
    label: 'tools.list_words.label',
    description:
      'Resolve an ALREADY IDENTIFIED transcript passage into STABLE wordIds and source timestamps for exact text-based editing. This is an address resolver before delete_words, NOT a content-search tool: first reason over the read_script transcript, choose the relevant sentenceIndexes or source fromSec/toSec, then call this exactly once with that narrow range. sentenceIndexes accepts every chosen non-contiguous row in one array; NEVER issue several list_words calls in parallel or one call per sentence. Never call it unfiltered to scan the whole transcript, and never invent or cache positional word indexes. Pass shotId only when the chosen passage belongs to an inserted clip. IDs survive timeline cuts because they address the source transcript, not edited positions.',
    inputSchema: obj(
      {
        shotId: { type: 'string', description: "A shot id whose source transcript to list. Omit for main narration." },
        sentenceIndexes: { type: 'array', items: { type: 'number' }, description: 'Chosen read_script/search_media sentence row indexes. Required unless both fromSec and toSec are supplied.' },
        fromSec: { type: 'number', description: 'Chosen source-clock lower bound. Must be paired with toSec unless sentenceIndexes is supplied.' },
        toSec: { type: 'number', description: 'Chosen source-clock upper bound. Must be paired with fromSec unless sentenceIndexes is supplied.' },
        offset: { type: 'number', description: 'Pagination offset (default 0).' },
        limit: { type: 'number', description: 'Max words returned (default 300, max 1000).' },
      },
      [],
    ),
  },
  {
    id: 'analyze_visual',
    kind: 'card',
    busyText: 'tools.analyze_visual.busy',
    icon: '🎬',
    label: 'tools.analyze_visual.label',
    description:
      'Analyze one video. mode="geometry" is token-free and browser-local: real scene cuts, ranked qualityWindows from dense sharpness/exposure/stability measurements, plus MediaPipe subject/face tracks and representative empty regions. qualityWindows are a technical shortlist with conservative weak-frame scoring; subjectPresence is reported separately, so apply semantic/editorial judgment before choosing a shot. Use geometry mode when the decision is only technical source quality, crop, framing, placement or safe space. mode="semantic" (default) adds sparse hosted VLM content/text descriptions and is required when planning needs to know what the footage depicts, selecting evidence/B-roll, judging design, or building a complete edit. Long takes are sampled across time even without hard cuts; semantic intervals are observations, while only sceneCutsSec are real cut points. Never substitute geometry for semantic understanding merely to save tokens. For an unplaced device-local video, pass its exact assetId from list_assets/search_assets directly: project-library membership is sufficient, so never register it, promote it to primary, or place it on the timeline merely for analysis. If byte access is unavailable, ask the user to restore access in Materials; timeline placement cannot restore access. Its result normally includes local PCM/RNNoise audioAssessment: no-audio, effectively-silent, and non-speech-or-noise must not be followed by transcript tools; only speech-likely may justify read_script, and only when existing spoken wording matters. Pass assessAudio=false when the workflow intentionally discards source audio, such as a narrated ad remix whose footage will be muted; this skips local speech classification and forbids transcript tools for that source. Otherwise omit selectors when the project has one video or pass an exact registered assetId/clipId. Audio-led projects may analyze their B-roll video directly; it does not need to be promoted to the primary lane. Returns source-normalized subjectTracks already clustered locally; consume them directly and do not create cuts where the track remains stable. This does not review the rendered result; complete edits still require review_visuals.',
    inputSchema: obj({
      mode: { type: 'string', enum: ['geometry', 'semantic'], description: 'geometry = local measurements only; semantic = measurements plus sparse hosted content understanding (default).' },
      assessAudio: { type: 'boolean', description: 'false skips local source-speech classification when source audio is intentionally discarded; do not call transcript tools afterward.' },
      localSig: { type: 'string', description: 'Legacy compatibility only: an unambiguous device-local content signature.' },
      assetId: { type: 'string', description: 'Exact project-local asset id from list_assets/search_assets, or an exact registered video asset id.' },
      clipId: { type: 'string', description: 'Exact timeline clip id whose video asset should be analyzed.' },
    }, []),
  },
  /* ---------- block content (generated via compose, card) ---------- */
  {
    id: 'add_block',
    kind: 'card',
    busyText: 'tools.add_block.busy',
    icon: '✨',
    label: 'tools.add_block.label',
    description:
      'Add a NEW Motion Graphic Component as one layer of a composed video Scene. Component is the upper-level extensible element concept; this tool currently authors its Motion Graphic family. Name the content-specific communicative job and evidence, then provide the intended placement BEFORE generation so typography, density and layout are designed for the real occupied region instead of generated as a generic card and resized afterward. For work over footage, describe the observed backdrop and protected subject/caption zones. Runtime injects the saved Scene plus the whole-film design system and binds the result back to that Scene. Registered families are references, not a closed menu; the active Frame owns visual language. Set timing to the complete thought it supports. Use full canvas only when the approved Scene intentionally becomes a full-field chapter, explanation or payoff. A planned placement may still be revised later with place_block, but do not generate first and discover the composition afterward.',
    inputSchema: obj(
      {
        instruction: { type: 'string', description: 'Instruction describing the Motion Graphic: type, exact content, source-aware layout, style, primary motion idea, payoff and clear/exit.' },
        sceneId: { type: 'string', description: 'Exact scene id from the saved Director Plan. Required for planned full-draft graphics; omit for an unplanned local edit.' },
        atSec: { type: 'number', description: 'Timeline start in seconds. Omit to use the playhead.' },
        durationSec: { type: 'number', description: 'On-screen duration in seconds (>= 0.3). Omit only for an intentional 3-second element.' },
        placement: {
          type: 'object',
          additionalProperties: false,
          description: 'Intended canvas-relative region decided as part of Scene composition BEFORE generation. Values are percentages. Use {xPct:0,yPct:0,widthPct:100,heightPct:100} only for an intentional full-field Scene.',
          properties: {
            xPct: { type: 'number', description: 'Top-left X as 0–100% of canvas width.' },
            yPct: { type: 'number', description: 'Top-left Y as 0–100% of canvas height.' },
            widthPct: { type: 'number', description: 'Width as 4–100% of canvas width.' },
            heightPct: { type: 'number', description: 'Height as 3–100% of canvas height.' },
          },
          required: ['xPct', 'yPct', 'widthPct', 'heightPct'],
        },
        backdrop: { type: 'string', description: 'What is actually behind this region at this time: subject position, motion/detail level, dominant light/dark values, burned-in text and protected caption/product/face zones. Omit only on a flat full-field Scene.' },
      },
      ['instruction', 'placement'],
    ),
  },
  {
    id: 'edit_block',
    kind: 'card',
    busyText: 'tools.edit_block.busy',
    icon: '🎨',
    label: 'tools.edit_block.label',
    description:
      "Edit ONE existing Component's content, visual composition or animation. For a Motion Graphic Component, preserve its communicative job unless the user asks to change it, and keep a readable payoff/hold/clear lifecycle. Pass the target `blockId` (from <composition_state>; if the user wrote @id use that) and a concrete `instruction`. Do NOT use this for moving/resizing: timeline timing is move_block/resize_block, on-screen position/size is place_block.",
    inputSchema: obj(
      {
        blockId: { type: 'string', description: 'Target block id from <composition_state>.' },
        instruction: { type: 'string', description: 'Instruction describing the change.' },
      },
      ['blockId', 'instruction'],
    ),
  },

  /* ---------- block timing/position (instant, badge) ---------- */
  {
    id: 'move_block',
    kind: 'badge',
    icon: '↔️',
    label: 'tools.move_block.label',
    description:
      'Move an overlay block to a new start time on the timeline (keeps its duration). `startSec` is the new absolute start in seconds.',
    inputSchema: obj(
      {
        blockId: { type: 'string' },
        startSec: { type: 'number', description: 'New absolute start in seconds (>= 0).' },
      },
      ['blockId', 'startSec'],
    ),
  },
  {
    id: 'resize_block',
    kind: 'badge',
    icon: '⌛',
    label: 'tools.resize_block.label',
    description:
      "Change an overlay block's start and/or duration on the timeline. Provide the full new `startSec` and `durationSec` (seconds).",
    inputSchema: obj(
      {
        blockId: { type: 'string' },
        startSec: { type: 'number' },
        durationSec: { type: 'number', description: 'New duration in seconds (>= 0.3).' },
      },
      ['blockId', 'startSec', 'durationSec'],
    ),
  },
  {
    id: 'place_block',
    kind: 'badge',
    icon: '📐',
    label: 'tools.place_block.label',
    description:
      "Reposition/resize an overlay block ON SCREEN (canvas space) — where it sits in the picture, not when it plays (timing is move_block/resize_block). Position: give ONE of `anchor` (snap into a canvas region, keeps size), `xPct`+`yPct` (absolute top-left, % of canvas), or `dxPct`/`dyPct` (relative nudge, % of canvas — e.g. move it down a bit = dyPct 8). Size: use `scale` for proportional resizing, or `widthPct`/`heightPct` to set either canvas-relative dimension independently. Size inputs resize around the current center and combine with position inputs. The box is clamped fully on-canvas. Each block's current zone shows in the state snapshot. NOT for the sentence-caption layer (that's set_captions yPct/scale).",
    inputSchema: obj(
      {
        blockId: { type: 'string' },
        anchor: { type: 'string', enum: [...PLACE_ANCHORS], description: 'Canvas region to snap into (3×3 grid, small safe margin).' },
        xPct: { type: 'number', description: 'Absolute: box top-left X, % of canvas width (0–100).' },
        yPct: { type: 'number', description: 'Absolute: box top-left Y, % of canvas height (0–100).' },
        dxPct: { type: 'number', description: 'Relative nudge right (+) / left (−), % of canvas width.' },
        dyPct: { type: 'number', description: 'Relative nudge down (+) / up (−), % of canvas height.' },
        scale: { type: 'number', description: 'Multiply current box size (0.4–2). 1 = keep size.' },
        widthPct: { type: 'number', description: 'Set box width independently, % of canvas width (clamped 4–100).' },
        heightPct: { type: 'number', description: 'Set box height independently, % of canvas height (clamped 3–100).' },
      },
      ['blockId'],
    ),
  },
  {
    id: 'delete_block',
    kind: 'badge',
    icon: '🗑️',
    label: 'tools.delete_block.label',
    description: 'Delete an overlay block entirely.',
    inputSchema: obj({ blockId: { type: 'string' } }, ['blockId']),
  },
  {
    id: 'delete_blocks',
    kind: 'badge',
    icon: '🗑️',
    label: 'tools.delete_blocks.label',
    description: 'Delete SEVERAL overlay blocks in one call (e.g. clearing every caption-like block at once). Pass all target ids.',
    inputSchema: obj({ blockIds: { type: 'array', items: { type: 'string' } } }, ['blockIds']),
  },
  {
    id: 'duplicate_block',
    kind: 'badge',
    icon: '⧉',
    label: 'tools.duplicate_block.label',
    description:
      'Duplicate an overlay block (same content/box/track, new id). `atSec` = where the copy starts; omit to place it right after the original. Its Semantic Scene is inferred from the new placement; when executing a Director Plan, pass the exact sceneId to resolve a shared boundary deliberately. Use then edit_block to vary the copy.',
    inputSchema: obj({ blockId: { type: 'string' }, atSec: { type: 'number' }, sceneId: { type: 'string', description: 'Exact Director Plan scene id for a planned duplicate.' } }, ['blockId']),
  },
  {
    id: 'get_block',
    kind: 'badge',
    icon: '🔍',
    label: 'tools.get_block.label',
    description:
      "INSPECT one overlay block: returns its timing/track/box plus its actual content (HTML + animation, truncated). Use BEFORE edit_block when you need to know what's inside (e.g. to answer questions about it, or to make a precise change), or to debug why something looks wrong.",
    inputSchema: obj({ blockId: { type: 'string' } }, ['blockId']),
  },
  {
    id: 'review_visuals',
    skillContract: { version: 1, stability: 'stable' },
    kind: 'card',
    busyText: 'tools.review_visuals.busy',
    icon: '🔎',
    label: 'tools.review_visuals.label',
    chatOnly: true,
    description:
      "LOOK at the rendered result with a scene-level viewing-experience QA pass (your delegated eyes — you cannot see frames yourself). For a broad complete edit, omit atSecs: the runtime samples each Scene across entrance, development, payoff and exit when duration allows, runs local structure and audible-audio checks, then sends the ordered temporal states together so vision can judge development, layered hierarchy and Scene handoffs—not merely a good midpoint thumbnail. This pass catches loading flashes, every layer appearing fully formed at once, animation that never resolves, unreadable holds, overlays that fail to clear, abrupt boundaries, fragmented layer design, an approved source/search/generated visual omitted from its Scene, and an approved sound plan whose voice/source sound is absent or muted. Use sceneIds to review only repaired Semantic Scenes. For a local change, supply exact atSecs; those local samples may be deduplicated unless forceCloudAll=true. The result detects repeated graphic geometry, missing planned visuals or source evidence, missing audible audio, caption/subject collision, Frame drift, unsafe delivery crops, missing temporal development, abrupt handoffs, design fragmentation and unmotivated motion, and returns an exact repairScope. Repair ONLY the listed Semantic Scenes, preserve unaffected scenes, then recheck repaired moments and their immediate boundaries at normal playback speed. It also describes what each moment actually shows; answer from returned scenes, never imagination. Skip it for one small edit.",
    inputSchema: obj(
      {
        atSecs: { type: 'array', items: { type: 'number' }, description: 'Optional edited-timeline candidate moments for a local review. Omit for automatic Director Scene sampling (max 18).' },
        sceneIds: { type: 'array', items: { type: 'string' }, description: 'Optional exact Semantic Scene ids. Use after repair to limit re-review to affected scenes; requires a saved Director Plan.' },
        forceCloudAll: { type: 'boolean', description: 'Bypass local similarity filtering only for explicit per-moment comparison/inspection.' },
      },
      [],
    ),
  },
  /* ---------- neutral timeline atoms (one contract: live, offline and MCP) ---------- */
  {
    id: 'get_timeline', kind: 'badge', icon: '🧭', label: 'tools.get_timeline.label',
    skillContract: { version: 1, stability: 'stable' },
    description:
      'Read the canonical typed timeline: canvas, duration, assets, semantic roles, every track and every clip with both frame and second geometry. Use before generic editing when ids or lane roles are not already present in context. Works live, offline, and through MCP.',
    inputSchema: obj({}, []),
  },
  {
    id: 'read_director_plan', kind: 'badge', icon: '📄', label: 'tools.read_director_plan.label',
    description:
      'Load the active output\'s human-readable director-plan.md on demand. The ordinary composition snapshot carries only a lightweight plan index. For scene-level work pass only the affected sceneIds: the result keeps the complete whole-film design system and delivery-safety contract but omits unrelated Scenes. Omit sceneIds only for a genuine whole-plan audit. It is read-only and works live, offline, and through MCP.',
    inputSchema: obj({ sceneIds: { type: 'array', maxItems: 24, items: { type: 'string' }, description: 'Optional exact Scene ids to load with the shared whole-film contract.' } }, []),
  },
  {
    id: 'read_scene_designs', kind: 'badge', icon: '◫', label: 'tools.read_scene_designs.label',
    description:
      'Load the active output\'s scene-designs.md. It contains the progressive whole-canvas spatial-temporal designs that atomic timeline operations must execute. Pass only the affected sceneIds for ordinary scene-level work; omit them only for a whole-edit audit. This avoids spending context on unrelated Scenes.',
    inputSchema: obj({ sceneIds: { type: 'array', maxItems: 24, items: { type: 'string' }, description: 'Optional exact Scene ids to load.' } }, []),
  },
  {
    id: 'register_media', kind: 'badge', icon: '📎', label: 'tools.register_media.label',
    description:
      'Register a NEW generated/remote media identity in the active output without placing it. Do NOT call this for a device-local result already returned by list_assets/search_assets: pass that exact assetId directly to add_clips/insert_clips and the runtime resolves its private byte locator automatically. If register_media is redundantly called with a known local asset id, id alone is sufficient and the runtime hydrates kind/local access; never copy, print, or guess contentSig/localSig. For generated/TTS media, pass the returned id, kind, url and metadata unchanged, including transcriptText and durationSec, so semantic work and ordinary captions can start immediately; read_script reuses that text unless the task genuinely needs measured audio timing. MCP local-file import remains import_media.',
    inputSchema: obj({
      assets: {
        type: 'array', items: { type: 'object', additionalProperties: false, properties: {
          id: { type: 'string' }, kind: { type: 'string', enum: ['video', 'image', 'audio'] }, url: { type: 'string' }, cloudKey: { type: 'string' }, localSig: { type: 'string' },
          label: { type: 'string' }, durationSec: { type: 'number' }, estimatedDurationSec: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' }, hasAudio: { type: 'boolean' },
          description: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, collection: { type: 'string' },
          bpm: { type: 'number', description: 'Known/precomputed tempo for musical beat-grid operations.' }, beatOffsetSec: { type: 'number', description: 'Source-second position of beat zero.' },
          transcriptText: { type: 'string', description: 'Exact known spoken script, especially generate_speech input.' },
          transcript: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { start: { type: 'number' }, end: { type: 'number' }, text: { type: 'string' } }, required: ['start', 'end', 'text'] } },
        }, required: ['id'] },
      },
    }, ['assets']),
  },
  {
    id: 'inspect_media', kind: 'badge', icon: '🔬', label: 'tools.inspect_media.label',
    skillContract: { version: 1, stability: 'stable' },
    description: 'Inspect registered media metadata, transcript coverage, and every placed occurrence. Omit ids to inspect the whole active project manifest. This is read-only and never analyzes pixels or spends model credits.',
    inputSchema: obj({ assetIds: { type: 'array', items: { type: 'string' } }, clipIds: { type: 'array', items: { type: 'string' } } }, []),
  },
  {
    id: 'inspect_images', kind: 'card', busyText: 'tools.inspect_images.busy', icon: '👁️', label: 'tools.inspect_images.label',
    skillContract: { version: 1, stability: 'stable' },
    chatOnly: true,
    description:
      'Inspect the ACTUAL PIXELS of up to 8 still images before choosing, describing, or placing them. Pass exact project-local assetIds returned by list_assets/search_assets, or exact registered image asset ids from inspect_media. Returns one grounded visual description per image, including visible subject, composition, text/data and likely editorial use. Use this instead of inferring image contents from filenames or dimensions. This sends compressed inspection copies to the configured vision service but does not upload the source files to the media library.',
    inputSchema: obj({
      refs: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' }, description: 'Exact project-local or registered image asset id. Maximum 8.' },
    }, ['refs']),
  },
  {
    id: 'organize_media', kind: 'badge', icon: '🏷️', label: 'tools.organize_media.label',
    description: 'Batch-update project media labels, descriptions, search tags, and collection metadata. It never changes bytes or timeline placement.',
    inputSchema: obj({
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            assetId: { type: 'string' }, label: { type: 'string' }, description: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } }, collection: { type: 'string' }, bpm: { type: 'number' }, beatOffsetSec: { type: 'number' },
          },
          required: ['assetId'],
        },
      },
    }, ['items']),
  },
  {
    id: 'swap_clip_media', kind: 'badge', icon: '🔄', label: 'tools.swap_clip_media.label',
    description: 'Replace one clip\'s asset identity while preserving its timeline geometry, lane, links, anchors, and typed properties. The replacement kind must be compatible (audio↔audio, narrative↔video, visual media↔image/video).',
    inputSchema: obj({ clipId: { type: 'string' }, assetId: { type: 'string' } }, ['clipId', 'assetId']),
  },
  {
    id: 'add_texts', kind: 'badge', icon: 'T', label: 'tools.add_texts.label',
    skillContract: { version: 1, stability: 'stable' },
    description: 'Add one or more ordinary title/subtitle text Components as native graphic blocks. This is the atomic text primitive; use a generated Motion Graphic Component only when custom composition or animation is actually needed.',
    inputSchema: obj({
      items: { type: 'array', items: {
        type: 'object', additionalProperties: false,
        properties: {
          id: { type: 'string' }, text: { type: 'string' }, sub: { type: 'string' }, startSec: { type: 'number' },
          durationSec: { type: 'number' }, trackId: { type: 'string' }, trackIndex: { type: 'number' },
          sceneId: { type: 'string', description: 'Exact Director scene id for planned text.' },
        },
        required: ['text', 'startSec'],
      } },
    }, ['items']),
  },
  {
    id: 'update_text', kind: 'badge', icon: '✏️', label: 'tools.update_text.label',
    skillContract: { version: 1, stability: 'stable' },
    description: 'Batch-update native title text Components by stable clip id: main text, subtitle, start, and duration. It does not rewrite arbitrary custom HTML Components such as Motion Graphics.',
    inputSchema: obj({
      items: { type: 'array', items: {
        type: 'object', additionalProperties: false,
        properties: { clipId: { type: 'string' }, text: { type: 'string' }, sub: { type: 'string' }, startSec: { type: 'number' }, durationSec: { type: 'number' } },
        required: ['clipId'],
      } },
    }, ['items']),
  },
  {
    id: 'add_clips', kind: 'badge', icon: '➕', label: 'tools.add_clips.label',
    skillContract: { version: 1, stability: 'stable' },
    description: 'Place one or more registered assets without opening timeline time. Device-local image, audio, and video bytes are prepared before commit; unavailable access fails without changing the timeline. Use role=primary for the continuous full-frame video story spine; use role=broll only for deliberate concurrent overlay/PiP evidence. When trackId is omitted, overlapping broll and overlapping role=sfx audio are placed on free semantic lanes so every item is preserved; non-overlapping SFX reuse an existing free SFX lane. Pass an exact trackId only when replacement is intentional. The receipt returns the actual placed timeline/source ranges and any overwritten clip ids. A 5-second fallback is only an editable initial duration, never proof of source length or coverage. Reuse is valid only when the repeated occurrence has a distinct editorial job or treatment; inspect the source, pass deliberate duration/source ranges, and verify placements instead of looping one span as filler. Use insert_clips to open time. Each clip is typed from its asset; missing semantic lanes are created transactionally. Planned visual clips must pass their exact sceneId. Audio must declare narration/music/sfx when the default narration role is not intended. Omit initial volumeDb unless the user specified a level: narration defaults to a clarity lift, and music is capped to a speech-safe bed while narration exists. One output may mix BGM/source sound with narration, but it cannot contain time-overlapping audible narration tracks. Replace or remove the current narration; if the user requested another finished version, create and switch to its independent output before placing that version\'s narration.',
    inputSchema: obj({ clips: { type: 'array', items: AGENT_CLIP_ITEM_SCHEMA }, atSec: { type: 'number' }, includeLinked: { type: 'boolean' } }, ['clips']),
  },
  {
    id: 'insert_clips', kind: 'badge', icon: '↪️', label: 'tools.insert_clips.label',
    skillContract: { version: 1, stability: 'stable' },
    description: 'Insert one or more registered assets and ripple later material on sync-locked/linked lanes while keeping Director scene intervals aligned. Planned visual clips must pass their exact sceneId. Use add_clips when replacement rather than timeline opening is intended.',
    inputSchema: obj({ clips: { type: 'array', items: AGENT_CLIP_ITEM_SCHEMA }, atSec: { type: 'number' }, includeLinked: { type: 'boolean' } }, ['clips']),
  },
  {
    id: 'move_clips', kind: 'badge', icon: '↔️', label: 'tools.move_clips.label',
    skillContract: { version: 1, stability: 'stable' },
    description: 'Move exact clip identities to edited-timeline starts, optionally across compatible tracks. Linked partners move by the same delta unless includeLinked=false.',
    inputSchema: obj({ items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { clipId: { type: 'string' }, startSec: { type: 'number' }, toTrackId: { type: 'string' } }, required: ['clipId', 'startSec'] } }, includeLinked: { type: 'boolean' } }, ['items']),
  },
  {
    id: 'remove_clips', kind: 'badge', icon: '🗑️', label: 'tools.remove_clips.label',
    skillContract: { version: 1, stability: 'stable' },
    description: 'Remove exact clip identities without shifting surviving material. Linked partners are included by default.',
    inputSchema: obj({ clipIds: { type: 'array', items: { type: 'string' } }, includeLinked: { type: 'boolean' } }, ['clipIds']),
  },
  {
    id: 'split_clips', kind: 'badge', icon: '✂️', label: 'tools.split_clips.label',
    skillContract: { version: 1, stability: 'stable' },
    description: 'Split exact typed clips at edited-timeline seconds. Linked partners crossing the same moment split together by default.',
    inputSchema: obj({ items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { clipId: { type: 'string' }, atSec: { type: 'number' } }, required: ['clipId', 'atSec'] } }, includeLinked: { type: 'boolean' } }, ['items']),
  },
  {
    id: 'set_clip_properties', kind: 'badge', icon: '🎚️', label: 'tools.set_clip_properties.label',
    skillContract: { version: 1, stability: 'stable' },
    description: 'Batch patch common typed clip properties. sourceInSec/sourceOutSec precisely retrim placed video or audio to new source-clock boundaries; startSec repositions it on the edited timeline. Also supports enabled for all clips; canvas-relative box for primary and ordinary video/image clips (it may extend outside the canvas); fit, cover-crop anchor, and opacity for ordinary visual media; and level/fades/speed/mute for audio. The box is the atomic canvas placement primitive; source framing/crop remains independent.',
    inputSchema: obj({ items: { type: 'array', items: AGENT_CLIP_PROPERTY_SCHEMA } }, ['items']),
  },
  {
    id: 'set_media_transform', kind: 'badge', icon: '↗', label: 'tools.set_media_transform.label',
    skillContract: { version: 1, stability: 'stable' },
    description: 'Patch the atomic layer transform for one or many narrative/video/image clips. scale is uniform around the layer centre; offsetX/offsetY are fractions of the untransformed layer width/height. This does not change timeline timing, source crop, or clip.box placement. Presets such as split/corner compile into this same transform; use reset=true to restore only the transform atom.',
    inputSchema: obj({
      items: { type: 'array', minItems: 1, maxItems: 120, items: obj({
        clipId: { type: 'string' },
        scale: { type: 'number', description: 'Uniform layer scale, 0.05..20.' },
        offsetX: { type: 'number', description: 'Horizontal offset in layer-width units.' },
        offsetY: { type: 'number', description: 'Vertical offset in layer-height units.' },
        reset: { type: 'boolean', description: 'Restore scale=1 and zero offsets while preserving crop.' },
      }, ['clipId']) },
    }, ['items']),
  },
  {
    id: 'set_media_crop', kind: 'badge', icon: '⌗', label: 'tools.set_media_crop.label',
    skillContract: { version: 1, stability: 'stable' },
    description: 'Patch normalized layer-local crop insets for one or many narrative/video/image clips. top/right/bottom/left are 0..<1 fractions; opposing sides must leave visible content. This is the atomic crop primitive used by split presets and is independent from clip.box placement. Use reset=true to clear only crop.',
    inputSchema: obj({
      items: { type: 'array', minItems: 1, maxItems: 120, items: obj({
        clipId: { type: 'string' },
        top: { type: 'number' }, right: { type: 'number' }, bottom: { type: 'number' }, left: { type: 'number' },
        reset: { type: 'boolean', description: 'Clear all crop insets while preserving transform.' },
      }, ['clipId']) },
    }, ['items']),
  },
  {
    id: 'set_keyframes', kind: 'badge', icon: '◆', label: 'tools.set_keyframes.label',
    description: 'Replace or clear ONE visual media keyframe track. Keyframe times are clip-local seconds and interpolate linearly. box animates canvas-relative x/y/w/h and may extend outside the canvas; opacity animates 0..1. An empty keyframes array clears only that property. Use split_clips for semantic shot changes rather than pretending every edit needs animation.',
    inputSchema: obj({
      clipId: { type: 'string' },
      property: { type: 'string', enum: ['box', 'opacity'] },
      keyframes: { type: 'array', items: {
        type: 'object', additionalProperties: false,
        properties: { atSec: { type: 'number' }, x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' }, value: { type: 'number' } },
        required: ['atSec'],
      } },
    }, ['clipId', 'property', 'keyframes']),
  },
  {
    id: 'manage_tracks', kind: 'badge', icon: '☰', label: 'tools.manage_tracks.label',
    description: 'Create, update, reorder, or remove one typed timeline track. Roles are semantic, not display names; primaryNarrative cannot be removed or recreated.',
    inputSchema: obj({
      action: { type: 'string', enum: ['create', 'update', 'move', 'remove'] }, trackId: { type: 'string' }, toIndex: { type: 'number' },
      type: { type: 'string', enum: ['visual', 'graphics', 'audio', 'caption'] }, role: { type: 'string', enum: ['broll', 'graphics', 'narration', 'music', 'sfx', 'managedCaptions'] },
      name: { type: 'string' }, muted: { type: 'boolean' }, hidden: { type: 'boolean' }, locked: { type: 'boolean' }, syncLocked: { type: 'boolean' }, stackOrder: { type: 'number' },
    }, ['action']),
  },
  {
    id: 'manage_clip_links', kind: 'badge', icon: '🔗', label: 'tools.manage_clip_links.label',
    description: 'Link two or more clips into one editing group, or unlink selected clips. Later move/split/remove/ripple operations honor link groups by default.',
    inputSchema: obj({ action: { type: 'string', enum: ['link', 'unlink'] }, clipIds: { type: 'array', items: { type: 'string' } }, groupId: { type: 'string' } }, ['action', 'clipIds']),
  },
  {
    id: 'sync_clips', kind: 'badge', icon: '⇆', label: 'tools.sync_clips.label',
    description: 'Align clips by explicit matching clip-local marker times, in one transaction. Use transcript/capture/analysis results to identify the same clap, word, or event in each source; this primitive performs exact timeline geometry and optional linking, not hidden audio correlation. If alignment would go before zero, the whole group shifts right together.',
    inputSchema: obj({
      referenceClipId: { type: 'string' },
      referenceMarkerSec: { type: 'number', description: 'Clip-local marker time in the reference; default 0.' },
      targets: { type: 'array', items: {
        type: 'object', additionalProperties: false,
        properties: { clipId: { type: 'string' }, markerSec: { type: 'number', description: 'Matching clip-local marker time.' } },
        required: ['clipId', 'markerSec'],
      } },
      link: { type: 'boolean', description: 'Link the aligned group after moving; default true.' },
    }, ['referenceClipId', 'targets']),
  },
  {
    id: 'get_transcript', kind: 'badge', icon: '📝', label: 'tools.get_transcript.label',
    description: 'Read transcript truth for any registered speech-bearing asset, clip, or track, including audio-only timelines. Omit selectors to prefer primary narration and otherwise return available transcripts. This never performs paid ASR; absent coverage is reported explicitly.',
    inputSchema: obj({ assetId: { type: 'string' }, clipId: { type: 'string' }, trackId: { type: 'string' } }, []),
  },
  {
    id: 'get_beat_grid', kind: 'badge', icon: '♩', label: 'tools.get_beat_grid.label',
    description: 'Calculate a musical beat grid from known/precomputed BPM and offset, either in source seconds for an asset or mapped through a placed clip into timeline seconds/frames. This does NOT decode audio or pretend to detect tempo: provide bpm explicitly when metadata is absent. Use the returned exact times with move_clips, split_clips, or set_keyframes.',
    inputSchema: obj({
      assetId: { type: 'string' }, clipId: { type: 'string' }, bpm: { type: 'number' }, offsetSec: { type: 'number' },
      startSec: { type: 'number' }, endSec: { type: 'number' }, subdivision: { type: 'number', enum: [1, 2, 4], description: '1=quarter-note beats, 2=eighths, 4=sixteenths.' },
    }, []),
  },
  {
    id: 'list_assets',
    kind: 'badge',
    icon: '🗂️',
    label: 'tools.list_assets.label',
    description:
      "List one explicit user-asset scope (most recent first). `mine` = device-local project-library index and is the least-privilege default; its exact asset id is the complete logical reference used by Chat, direct analysis/transcription, and placement. Pass it directly to analyze_visual/read_script without registering or placing it first. Pass it to add_clips/insert_clips only when the requested edit actually needs it on the timeline. The runtime resolves private byte locators on demand for every media kind. Never print, copy, or guess locator.contentSig/sig/localSig; those fields are private compatibility data, not model inputs. Inspect pixels, action, speech, or timing only when that evidence affects the editorial decision. Use prepare_local_image only when embedding a local image inside generated Motion Graphic HTML; use add_clips with role=primary for selected local video in the main narrative sequence, or insert_clips when it must open timeline time. `cloud` = uploaded assets with direct urls. Never switch scopes or substitute another asset unless the user asks. Also returns this project's video-source summary.",
    inputSchema: obj(
      {
        scope: { type: 'string', enum: ['mine', 'cloud'], description: 'Asset scope. Defaults to mine; use cloud only when the user explicitly refers to cloud/uploaded/generated material.' },
        kind: { type: 'string', enum: ['all', 'image', 'video', 'audio'], description: 'Filter by asset kind (default all).' },
        limit: { type: 'number', description: 'Max rows per kind (default 30, max 100).' },
      },
      [],
    ),
  },
  {
    id: 'search_assets',
    kind: 'badge',
    icon: '🔍',
    label: 'tools.search_assets.label',
    description:
      "Search one EXPLICIT ASSET LIBRARY scope by natural-language metadata: mine=device-local indexed files; cloud=uploads, this project's generation history, and saved Motion Graphics; official=curated stickers, BGM, and Motion Graphic presets; all=only when the user explicitly asks to search every library. Scope is a permission boundary: never retry or substitute from another scope. Device-local results expose only stable project assetIds; their storage locators stay private and placement resolves them automatically. Cloud/official results carry the exact reusable url/component/template locator when needed. Official semantic search uses only its precomputed index. This does NOT search inside videos or the web.",
    inputSchema: obj(
      {
        query: { type: 'string', description: 'Natural-language asset description, name, category, mood, or use case (max 200 characters).' },
        scope: { type: 'string', enum: ['mine', 'cloud', 'official', 'all'], description: 'Required scope. Use mine for local/device/my, cloud only for explicit cloud/uploaded/generated material, official for curated Motion Graphics/media, and all only for an explicit cross-library request.' },
        kind: { type: 'string', enum: ['all', 'image', 'video', 'audio', 'element'], description: 'Optional asset-kind filter.' },
        limit: { type: 'number', description: 'Maximum matches (default 12, max 30).' },
      },
      ['query', 'scope'],
    ),
  },
  /* ---------- hosted image/video generation primitives ---------- */
  {
    id: 'list_models',
    kind: 'badge',
    icon: '◈',
    label: 'tools.list_models.label',
    description:
      'List enabled user-facing image/video generation models. Provider details stay server-private. Omit kind only when both catalogs are needed; callers may omit modelId from generation to use the current catalog default.',
    inputSchema: obj({ kind: { type: 'string', enum: ['image', 'video'] } }, []),
  },
  {
    id: 'generate_image',
    kind: 'card',
    busyText: 'tools.generate_image.busy',
    icon: '🎨',
    label: 'tools.generate_image.label',
    description:
      "Start ONE hosted image generation task (CHARGES the user's Pireel account). In a requested complete creative edit, use it without a separate permission pause whenever generated imagery is the strongest medium for the Director Scene: an authored/stylized scene, controlled composition, illustrative subject, concept, physical metaphor, atmosphere, transition plate or otherwise unavailable non-evidentiary shot. The active Frame governs visual language, not permission. Never generate documentary/product evidence or filler. This is an atomic media operation: it returns an asynchronous creation id in the active project's generation history and does NOT insert the result into the edit. Use returned/supplied asset URLs as references; never invent locators. Do not poll repeatedly in the same turn.",
    inputSchema: obj({
      prompt: { type: 'string', description: 'Production-ready visual prompt: narrative job and relationship to the surrounding cut; exact subject + physical action/relation; environment and truth boundary; camera distance/angle/lens, lighting and depth; composition, subject placement, destination ratio, crop-safe overscan and negative space; relevant active-Frame image treatment/palette/material/texture/visual-world traits expressed as visible properties; identity/product consistency; and exclusions (normally no embedded text, logos, watermarks, fake UI or invented evidence). Prefer one strong proposition over keyword soup.' },
      modelId: { type: 'string', description: 'Optional stable id from list_models; omit for the catalog default.' },
      size: { type: 'string', description: 'Output dimensions, e.g. 1440x2560, 2560x1440, or 2048x2048.' },
      quality: { type: 'string', description: 'Optional model-specific quality tier.' },
      referenceImages: { type: 'array', items: { type: 'string' }, description: 'Up to 9 exact image URLs returned by an asset/generation tool.' },
    }, ['prompt']),
  },
  {
    id: 'generate_video',
    kind: 'card',
    busyText: 'tools.generate_video.busy',
    icon: '🎬',
    label: 'tools.generate_video.label',
    description:
      "Start ONE hosted video generation task (CHARGES the user's Pireel account). Omit aspectRatio and resolution for the ordinary path: the runtime matches the active canvas and chooses the nearest source-quality tier automatically. Never ask the user to choose them; pass either field only when the user explicitly supplied an exact spec. This is an atomic media operation: it returns an asynchronous creation id in the active project's generation history and does NOT insert the result into the edit. Compose it with get_generation_jobs, register_media, and add_clips across turns; do not poll repeatedly in the same turn.",
    inputSchema: obj({
      prompt: { type: 'string', description: 'Concrete motion, camera, subject, and style prompt.' },
      modelId: { type: 'string', description: 'Optional stable id from list_models; omit for the catalog default.' },
      durationSec: { type: 'number', description: 'Requested duration, clamped to 4–15 seconds.' },
      aspectRatio: { type: 'string', enum: ['9:16', '16:9', '1:1'], description: 'Explicit user override only; omit to follow the active canvas.' },
      resolution: { type: 'string', enum: ['480p', '720p', '1080p'], description: 'Explicit user override only; omit for the adaptive source-quality tier.' },
      referenceImages: { type: 'array', items: { type: 'string' }, description: 'Up to 9 exact image URLs.' },
      referenceVideos: { type: 'array', items: { type: 'string' }, description: 'Up to 3 exact video URLs.' },
      referenceAudios: { type: 'array', items: { type: 'string' }, description: 'Up to 3 exact audio URLs.' },
    }, ['prompt']),
  },
  {
    id: 'generate_music',
    kind: 'card',
    busyText: 'tools.generate_music.busy',
    icon: '🎵',
    label: 'tools.generate_music.label',
    description:
      "Generate ONE hosted instrumental background-music asset (CHARGES the user's Pireel account). This is a media primitive and does NOT place or mix it. To use it, register_media with the returned id/url, then add_clips with role=music and set_clip_properties for level/fades. Use generate_speech for narration; never mount speech as music.",
    inputSchema: obj({
      prompt: { type: 'string', description: 'Music mood, genre, energy, instrumentation, and intended scene.' },
      durationSec: { type: 'number', description: 'Approximate duration, clamped to 10–300 seconds.' },
    }, ['prompt']),
  },
  {
    id: 'generate_foley',
    kind: 'card',
    busyText: 'tools.generate_foley.busy',
    icon: '🔉',
    label: 'tools.generate_foley.label',
    chatOnly: true,
    description:
      'Generate a BATCH of picture-synchronous Foley/SFX assets with MMAudio V2. It first shows the exact event list, uploaded source spans, and generated seconds, then waits for user approval. Reject means no source upload or generation. For a short-ad montage after picture lock, treat each selected span with one coherent visible physical action as one candidate by default; merge continuous actions and skip static, speech-only, decorative, misleading, or cluttering events. Preserve known-useful source sound and search/reuse timing-compatible audio first. If any real action candidate remains unresolved, call one batch so the user actually sees this approval card; unassessed source audio is not a reason to skip it. Each approved item uploads only its exact source span, generates sound, extracts an independent AAC track in the browser, saves it to the cross-project audio library with reuse metadata, and returns registration fields. It does NOT place anything; register_media, then place all matching assets in one add_clips call with role=sfx and no trackId so the collision allocator preserves overlaps on parallel SFX lanes. Never use it for narration or background music.',
    inputSchema: obj({
      items: {
        type: 'array', minItems: 1, maxItems: 8,
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            sourceAssetId: { type: 'string', description: 'Exact device-local or registered video asset id. Preferred over sourceUrl.' },
            sourceUrl: { type: 'string', description: 'Exact owned/public source video URL when no project asset id exists.' },
            sourceInSec: { type: 'number', description: 'Inclusive source start in seconds.' },
            sourceOutSec: { type: 'number', description: 'Exclusive source end in seconds; span must be 1–30 seconds.' },
            prompt: { type: 'string', description: 'Only audible events grounded in the span: action, material, intensity, perspective, room, and timing. Do not request speech or music.' },
            negativePrompt: { type: 'string', description: 'Optional sounds to exclude, usually speech, music, ambience, or unrelated impacts.' },
            name: { type: 'string', description: 'Short reusable library label, e.g. Cardboard box opening — close.' },
            eventType: { type: 'string', description: 'Searchable action family such as unboxing, pour, click, tear, or impact.' },
            material: { type: 'string', description: 'Searchable material/object, e.g. cardboard, water, plastic seal, glass.' },
            reusePolicy: { type: 'string', enum: ['generic', 'timing-compatible', 'exact-shot-only'], description: 'How safely this sound may be reused. Default timing-compatible.' },
          },
          required: ['sourceInSec', 'sourceOutSec', 'prompt'],
        },
      },
    }, ['items']),
  },
  {
    id: 'get_generation_jobs',
    kind: 'badge',
    icon: '⏳',
    label: 'tools.get_generation_jobs.label',
    description:
      'Read image/video/music generation status from the active project. Prefer exact creation ids returned earlier; omit ids only when the user asks for recent generation history. Succeeded rows include reusable asset URLs for register_media.',
    inputSchema: obj({ ids: { type: 'array', items: { type: 'string' }, description: 'Up to 30 exact creation ids.' } }, []),
  },
  {
    id: 'prepare_local_image',
    kind: 'badge',
    icon: '🖼️',
    label: 'tools.prepare_local_image.label',
    chatOnly: true,
    description:
      'Prepare ONE exact device-local image for durable use inside generated Motion Graphic HTML. Call only when the user explicitly asked to use that local image, and pass its exact assetId from list_assets/search_assets. Listing metadata does NOT grant access to its bytes. The bytes and private locator remain on this device, never in R2 or model-visible output. If local bytes need a user gesture, it fails with a restore-access instruction; never upload or replace it with another image. The sig field remains accepted only for old cached calls.',
    inputSchema: obj({
      assetId: { type: 'string', description: 'Exact project-local image asset id returned by list_assets/search_assets.' },
      sig: { type: 'string', description: 'Legacy compatibility only; new calls use assetId.' },
    }, ['assetId']),
  },
  /* ---------- reusable voice / portrait animation primitives ---------- */
  {
    id: 'list_voices',
    kind: 'badge',
    icon: '🔊',
    label: 'tools.list_voices.label',
    description:
      "List available official and user-created voice CANDIDATES, including stable voiceId, source (designed or cloned), language, style, scene, readiness, and sampleUrl when a matching audition exists. The result also includes customVoiceAccess with membership eligibility and the current clone/design credit price. Use language/query to avoid returning the entire catalog. A user's stored default is preference metadata, never approval for this generation and never a recommendation. Before generate_speech, show a short relevant candidate set with ask_user: copy each exact voiceId into option.value; copy sampleUrl into option.previewUrl only when the result includes it. Obtain the user's explicit choice unless the user already named and approved one. It is server-direct and works with Studio closed.",
    inputSchema: obj(
      {
        language: { type: 'string', enum: ['zh', 'yue', 'en', 'pt', 'ko', 'es', 'ja', 'id', 'ru', 'fr', 'it', 'de', 'nl', 'ar', 'tr', 'uk', 'vi'], description: 'Optional supported-language filter.' },
        query: { type: 'string', description: 'Optional name, vocal trait, or use-case search, such as 新闻播报 or warm.' },
        limit: { type: 'number', description: 'Maximum results, default 20 and maximum 100.' },
      },
      [],
    ),
  },
  {
    id: 'clone_voice',
    kind: 'card',
    busyText: 'tools.clone_voice.busy',
    icon: '🧬',
    label: 'tools.clone_voice.label',
    description:
      "Create one reusable cloned voice from an audio asset already owned by the user (CHARGES the user's Pireel account). This is an atomic voice-asset operation and does not generate speech or video. Before calling, use list_voices to read the exact current cloneCredits price and obtain explicit approval for that charge. SAFETY: also require the user to explicitly confirm they own the voice or have permission to clone it; never infer consent. Pass the exact audioAssetId returned by list_assets/search_assets, not a guessed URL. A clean 3–30 second MP3/M4A/WAV sample works best. Deployment may be asynchronous; use list_voices later to check readiness.",
    inputSchema: obj(
      {
        audioAssetId: { type: 'string', description: 'Owned audio asset id from list_assets/search_assets.' },
        name: { type: 'string', description: 'User-facing name for this voice.' },
        language: { type: 'string', enum: ['zh', 'yue', 'en', 'pt', 'ko', 'es', 'ja', 'id', 'ru', 'fr', 'it', 'de', 'nl', 'ar', 'tr', 'uk', 'vi'], description: 'Language spoken in the sample (default zh).' },
        consentConfirmed: { type: 'boolean', description: 'Must be true only after explicit user confirmation of ownership/permission.' },
        preprocess: { type: 'boolean', description: 'Enable denoise/enhancement for a noisy sample; leave false for a clean recording.' },
      },
      ['audioAssetId', 'name', 'consentConfirmed'],
    ),
  },
  {
    id: 'design_voice',
    kind: 'card',
    busyText: 'tools.design_voice.busy',
    icon: '✨',
    label: 'tools.design_voice.label',
    description:
      "Create one reusable custom voice from an exact text description (CHARGES the user's Pireel account). This is an atomic voice-asset operation and does not generate the user's narration. Before calling, use list_voices to read the exact current designCredits price, show the final voice description/language, and obtain explicit approval for that charge. Do not silently turn a general narration request into voice design: use an official or existing custom voice unless the user explicitly asks for a new voice or approves this concrete design.",
    inputSchema: obj(
      {
        prompt: { type: 'string', description: 'Exact approved voice description, 1–200 characters: language, age impression, vocal texture, delivery style, and intended use.' },
        name: { type: 'string', description: 'Optional user-facing name. Omit to derive a short name from the prompt.' },
        language: { type: 'string', enum: ['zh', 'yue', 'en', 'pt', 'ko', 'es', 'ja', 'id', 'ru', 'fr', 'it', 'de', 'nl', 'ar', 'tr', 'uk', 'vi'], description: 'Language for the generated audition (default zh).' },
      },
      ['prompt'],
    ),
  },
  {
    id: 'delete_voice',
    kind: 'badge',
    icon: '🗑️',
    label: 'tools.delete_voice.label',
    description: 'Permanently delete one user-created voice by its stable voiceId. System voices cannot be deleted. Ask for confirmation before deleting unless the same user message explicitly requested it.',
    inputSchema: obj({ voiceId: { type: 'string', description: 'Custom voiceId returned by list_voices.' } }, ['voiceId']),
  },
  {
    id: 'generate_speech',
    kind: 'card',
    busyText: 'tools.generate_speech.busy',
    icon: '🎙️',
    label: 'tools.generate_speech.label',
    description:
      "Generate a reusable spoken-audio asset from EXACT approved text with an EXACT approved voiceId (hosted TTS; CHARGES the user's Pireel account). Script approval and concrete voice selection are separate decisions: do not call this after approving only a general voice requirement, and never infer consent from the user's stored default. The tool shows the exact script, voice, delivery settings and current credit charge in a final approval card; rejection generates nothing and charges nothing. This atomic operation returns an audio asset plus transcriptText and initial durationSec and does NOT place it. To use it as timeline narration: pass the returned asset fields unchanged to register_media, then add_clips with role=narration; NEVER use set_bgm for spoken narration. The script is enough for meaning; call read_script with the exact assetId only when real performed-audio timing is required. For a speaking portrait/video, pass the returned url to lip_sync. Keep user wording verbatim unless rewriting was explicitly requested.",
    inputSchema: obj(
      {
        text: { type: 'string', description: 'Exact text to speak (1–5000 characters).' },
        voiceId: { type: 'string', description: 'Exact stable voiceId explicitly selected or confirmed by the user after list_voices.' },
        speed: { type: 'number', description: 'Speaking speed multiplier, 0.5–2.0 (default 1).' },
        instruction: { type: 'string', description: 'Optional natural-language delivery direction for emotion, dialect, role, or tone. Do not put replacement speech text here.' },
        name: { type: 'string', description: 'Optional asset label shown in the library.' },
      },
      ['text', 'voiceId'],
    ),
  },
  {
    id: 'lip_sync',
    kind: 'card',
    busyText: 'tools.lip_sync.busy',
    icon: '👄',
    label: 'tools.lip_sync.label',
    description:
      "Create ONE asynchronous lip-synced video task from an existing audio url plus exactly ONE portrait image OR source video (hosted video generation; CHARGES the user's Pireel account). This is an atomic media operation: it returns a pending creation id in the project's existing generation history and does NOT insert the result into the edit. Preserve identity, background, framing, and source performance; add only natural mouth motion, blinks, and subtle head movement. Compose it with generate_speech when TTS is needed; do not invent a monolithic digital-human action.",
    inputSchema: obj(
      {
        audioUrl: { type: 'string', description: 'Audio asset url returned by generate_speech or found via search_assets/list_assets.' },
        sourceImageUrl: { type: 'string', description: 'Portrait/source image url. Mutually exclusive with sourceVideoUrl.' },
        sourceVideoUrl: { type: 'string', description: 'Source performance video url. Mutually exclusive with sourceImageUrl.' },
        durationSec: { type: 'number', description: 'Output duration, integer 4–15 seconds. Use generate_speech.estimatedDurationSec when available; default 10.' },
        aspectRatio: { type: 'string', enum: ['9:16', '16:9', '1:1'], description: 'Explicit user override only; omit to follow the active canvas.' },
        resolution: { type: 'string', enum: ['480p', '720p', '1080p'], description: 'Explicit user override only; omit for the adaptive source-quality tier.' },
        modelId: { type: 'string', description: 'Optional enabled video catalog model id. Omit to prefer the configured Seedance model.' },
        name: { type: 'string', description: 'Optional label for the pending generation.' },
      },
      ['audioUrl'],
    ),
  },
  {
    id: 'search_media',
    kind: 'badge',
    icon: '🔎',
    label: 'tools.search_media.label',
    description:
      "Retrieve SOURCE-CLOCK segments from equal-standing narrative-lane sources in the CURRENT project when the needed evidence is not already visible in this conversation. If a read_script transcript in the current context contains the requested spoken topic, reason over those numbered rows directly and do not call this tool. Use this bounded retrieval fallback for a cold/truncated transcript, several attached sources, or visual moments that require stored visual-analysis labels. It is not the user's general asset library and never searches the web. Results carry stable segmentIds, source ranges, and every surviving edited-timeline occurrence; compose later edits from atomic tools yourself. Coverage says which sources have transcript/visual evidence; if required evidence is missing, call read_script for the missing sources and/or analyze_visual first, then search again.",
    inputSchema: obj(
      {
        query: { type: 'string', description: 'Natural-language description, phrase, object, scene, or spoken topic to find (max 200 characters).' },
        scope: { type: 'string', enum: ['all', 'narrative'], description: 'Search all project media evidence (default) or only equal-standing narrative-lane sources.' },
        shotId: { type: 'string', description: 'Optional: narrow to the source that owns this shot id.' },
        limit: { type: 'number', description: 'Maximum distinct source segments to return (default 8, max 20).' },
      },
      ['query'],
    ),
  },
  {
    id: 'focus_element',
    kind: 'badge',
    icon: '🎯',
    label: 'tools.focus_element.label',
    description:
      'SHOW the user an element: select it and move the playhead/preview to it. Use when you reference something the user should look at, or after creating/changing an element so the user sees the result.',
    inputSchema: obj({ id: { type: 'string', description: 'block or shot id' } }, ['id']),
  },

  {
    id: 'seek',
    kind: 'badge',
    icon: '⏱️',
    label: 'tools.seek.label',
    description:
      'Move the playhead (and the preview) to `toSec` on the EDITED timeline. Use for jump-to-a-moment asks, or to park the playhead where playhead-defaulting tools (add_block / split_shot / trim_shot) should act. To show a specific element or shot, prefer focus_element.',
    inputSchema: obj({ toSec: { type: 'number', description: 'Target time in edited seconds (0 = start; clamped to the video length).' } }, ['toSec']),
  },
  {
    id: 'play',
    kind: 'badge',
    icon: '▶️',
    label: 'tools.play.label',
    description:
      "Start playback in the preview. Optional `fromSec` = jump there first; optional `toSec` = auto-pause there. ONLY when the user asks to play or preview something — never auto-play after an edit; playback is the user's to start (receipts already park the playhead at the change).",
    inputSchema: obj(
      {
        fromSec: { type: 'number', description: 'Start playing from here (edited seconds). Omit = current playhead.' },
        toSec: { type: 'number', description: 'Auto-pause when playback reaches this time (edited seconds). Omit = play to the end.' },
      },
      [],
    ),
  },
  {
    id: 'pause',
    kind: 'badge',
    icon: '⏸️',
    label: 'tools.pause.label',
    description: 'Pause playback (the playhead stays where it is). No input.',
    inputSchema: obj({}, []),
  },

  /* ---------- captions (global preset layer: full-line captions / per-word emphasis, laid from the transcript, one setting applies to the whole video) ---------- */
  {
    id: 'set_captions',
    skillContract: { version: 1, stability: 'stable' },
    kind: 'card',
    busyText: 'tools.set_captions.busy',
    icon: '💬',
    label: 'tools.set_captions.label',
    description:
      "Turn sentence captions ON and/or restyle/reposition the GLOBAL subtitle layer from transcript truth. Source defaults to auto: placed visual speech first, then narration audio, then the longest transcript-bearing media lane. To caption a specific audio/video source pass source=track with trackId or source=clip with clipId. TTS audio should be registered with its exact transcriptText before placement, avoiding another paid ASR call. ONE setting styles the whole managed layer; turn it off with remove_captions.",
    inputSchema: obj(
      {
        preset: { type: 'string', enum: CAPTION_PRESETS.map((p) => p.id), description: 'Caption style id from <caption_catalog>. Omit to only reposition/resize the current captions.' },
        yPct: { type: 'number', description: "Caption baseline's % from the top (smaller = higher). Omit to keep." },
        scale: { type: 'number', description: 'Size multiplier, 1 = preset default. Omit to keep.' },
        source: { type: 'string', enum: ['auto', 'track', 'clip'], description: 'Caption source selector. Omit to preserve the current selection, or auto-select on first use.' },
        trackId: { type: 'string', description: 'Required with source=track.' },
        clipId: { type: 'string', description: 'Required with source=clip.' },
      },
      [],
    ),
  },
  {
    id: 'relayout_captions',
    kind: 'badge',
    icon: '↔️',
    label: 'tools.relayout_captions.label',
    description:
      'Explicitly regenerate every caption cue boundary from the CURRENT canvas width, caption font, size, weight, and backdrop. Corrected caption copy is retained and remapped, then the new boundaries are locked again. Use ONLY when the user explicitly asks to re-layout/reflow/re-segment captions; ordinary caption text edits and style changes intentionally preserve existing boundaries.',
    inputSchema: obj({}, []),
  },
  {
    id: 'remove_captions',
    kind: 'badge',
    icon: '🚫',
    label: 'tools.remove_captions.label',
    description:
      'Remove the whole sentence-caption layer (turn subtitles off). Does not touch keyword overlay elements (delete those with delete_block).',
    inputSchema: obj({}, []),
  },
  {
    id: 'edit_caption_text',
    kind: 'badge',
    icon: '✏️',
    label: 'tools.edit_caption_text.label',
    description:
      'Correct MAIN caption copy without changing the spoken transcript, word timing, current cue count, or any cue start/end boundary. Workflow: read_script first, then pass the complete corrected sentence text as {index, text}; the editor apportions it across that sentence\'s EXISTING cues and locks those cue ranges. Batch every correction for the same source in ONE items[] call. Main narration by default; pass shotId only for an inserted clip. This is caption copy editing, not cutting speech, translating captions, styling, or automatic re-layout.',
    inputSchema: obj(
      {
        items: {
          type: 'array',
          description: 'Corrected transcript sentences; index = the row number shown by read_script, text = the complete corrected sentence.',
          items: obj(
            {
              index: { type: 'number', description: 'Sentence row number from read_script.' },
              text: { type: 'string', description: 'Complete corrected main-caption sentence (must not be empty).' },
            },
            ['index', 'text'],
          ),
        },
        shotId: { type: 'string', description: "An inserted-clip shot id — targets that clip's transcript. Omit for the main narration." },
      },
      ['items'],
    ),
  },
  {
    id: 'set_caption_translations',
    kind: 'badge',
    icon: '🌐',
    label: 'tools.set_caption_translations.label',
    description:
      'Add a translation line under the sentence captions (bilingual subtitles) — YOU do the translating, this tool only stores it. Workflow: read_script → translate each numbered sentence yourself → pass `items` as {index (the row number from read_script), text}. Translations attach to the transcript and survive cuts/restyles. Main narration by default; pass `shotId` to translate an inserted clip\'s own transcript instead. `text: ""` removes one line; `clear: true` removes all. Pass `lang` (the target language you translated into) so a later language switch can tell your translations apart from stale ones.',
    inputSchema: obj(
      {
        items: {
          type: 'array',
          description: 'Per-sentence translations; index = the transcript row number shown by read_script.',
          items: obj({ index: { type: 'number' }, text: { type: 'string', description: 'Your translation of that sentence (empty string removes it).' } }, ['index', 'text']),
        },
        lang: { type: 'string', description: "Target language of these translations (e.g. 'English'). Recommended — untagged translations can't be told apart from stale ones after a language switch." },
        shotId: { type: 'string', description: "An inserted-clip shot id — targets that clip's transcript. Omit for the main narration." },
        clear: { type: 'boolean', description: 'true = remove every translation (all sources); items is then ignored.' },
      },
      [],
    ),
  },

  /* ---------- video track shots (instant, badge) ---------- */
  {
    id: 'set_canvas',
    skillContract: { version: 1, stability: 'stable' },
    kind: 'badge',
    icon: '▣',
    label: 'tools.set_canvas.label',
    description:
      'Change the composition canvas while preserving normalized block/layout coordinates. Use preset source/auto/follow-source to match the first placed video clip (the normal default when no exact delivery ratio was requested); later mixed-ratio clips do not change it. Or use portrait/9:16 (1080×1920), landscape/16:9 (1920×1080), square/1:1 (1080×1080), or custom even codec-safe width+height. This does NOT auto-reframe every shot; follow with set_shot_framing/apply_layout as needed.',
    inputSchema: obj(
      {
        preset: { type: 'string', enum: ['source', 'auto', 'follow-source', 'portrait', 'vertical', '9:16', 'landscape', 'horizontal', '16:9', 'square', '1:1'] },
        width: { type: 'number', description: 'Custom width, 240..7680. Use together with height.' },
        height: { type: 'number', description: 'Custom height, 240..7680. Use together with width.' },
      },
      [],
    ),
  },
  {
    id: 'set_shot_framing',
    skillContract: { version: 1, stability: 'stable' },
    kind: 'badge',
    icon: '🎯',
    label: 'tools.set_shot_framing.label',
    description:
      'Apply one or many familiar video-clip framing recipes on any visual lane. Stable shotId values address primary or multi-track video clips; atSec resolves only the semantic primary story lane because parallel tracks do not form one serial timeline. The recipe is immediately materialized into the same atomic media transform/crop used by renderers; it is not a second visual layer. For 2+ clips, ALWAYS collect them into ONE updates[] call. treatment/size/crop cover intent presets; source-normalized scale plus anchorX/anchorY handles subject-aware full/punch framing. Use set_media_transform and set_media_crop when you need custom atoms rather than a preset. Set the canvas first; split_shot only where framing actually changes.',
    inputSchema: obj(
      {
        ...SHOT_FRAMING_PROPERTIES,
        updates: {
          type: 'array',
          minItems: 1,
          maxItems: 120,
          description: 'Batch of independent shot framing rows. Prefer this whenever more than one shot changes.',
          items: obj({ ...SHOT_FRAMING_PROPERTIES }, []),
        },
      },
      [],
    ),
  },
  {
    id: 'apply_layout',
    skillContract: { version: 1, stability: 'stable' },
    kind: 'badge',
    icon: '▦',
    label: 'tools.apply_layout.label',
    description:
      'Apply one intent-level normalized layout to 1–4 existing blocks: picture-in-picture, split-left-right, split-top-bottom, or grid. Optional shotId makes the same transaction frame the video and place blocks in its actual vacancy; videoPosition chooses the video side. Use stable block/shot ids, never hand-calculate pixels.',
    inputSchema: obj(
      {
        layout: { type: 'string', enum: ['picture-in-picture', 'split-left-right', 'split-top-bottom', 'grid'] },
        blockIds: { type: 'array', items: { type: 'string' } },
        shotId: { type: 'string' },
        videoPosition: { type: 'string', enum: ['left', 'right', 'top', 'bottom'] },
      },
      ['layout', 'blockIds'],
    ),
  },
  {
    id: 'set_shot_treatment',
    kind: 'badge',
    icon: '🎯',
    label: 'tools.set_shot_treatment.label',
    description:
      'Set how one video clip on any visual lane is framed: full (full screen), punch-in (zoom in for emphasis), corner-tl/corner-tr/corner-bl/corner-br (shrink to one corner while another visual owns the field), or split-l/split-r/split-t/split-b (the video occupies that named half). Choose the side and treatment from the observed subject/action, evidence, negative space, delivery-safe zones and authored Scene design—not from aspect ratio alone. Framing applies to the WHOLE clip; split the clip first when only one span should change.',
    inputSchema: obj(
      {
        shotId: { type: 'string' },
        treatment: { type: 'string', enum: [...TREATMENTS] },
      },
      ['shotId', 'treatment'],
    ),
  },
  {
    id: 'set_video_filter',
    skillContract: { version: 1, stability: 'stable' },
    kind: 'badge',
    icon: '🎨',
    label: 'tools.set_video_filter.label',
    description:
      "Color-grade ONE video clip on any visual lane: brightness / contrast / saturate coefficients (1 = untouched). The values you pass REPLACE that clip's whole grade — omit a field to reset it, pass no fields to remove the grade. Whole clip, snaps at its edges — split a primary shot first to grade only part. Recipes: brighter → brightness 1.1–1.2; vivid → saturate 1.2–1.4; black & white → saturate 0; muted gray → saturate 0.7–0.85.",
    inputSchema: obj(
      {
        shotId: { type: 'string' },
        brightness: { type: 'number', description: 'Brightness coefficient, 1 = untouched (clamped 0.2–3).' },
        contrast: { type: 'number', description: 'Contrast coefficient, 1 = untouched (clamped 0.2–3).' },
        saturate: { type: 'number', description: 'Saturation coefficient, 1 = untouched, 0 = grayscale (clamped 0–3).' },
      },
      ['shotId'],
    ),
  },
  {
    id: 'set_shot_audio',
    skillContract: { version: 1, stability: 'stable' },
    kind: 'badge',
    icon: '🔊',
    label: 'tools.set_shot_audio.label',
    description:
      "Set video clips' own source audio across all visual lanes: volumeDb sets the footage's level (0 = source level, -60 = silent, up to +20 to lift a quiet recording), mute true/false hard-silences while remembering the previous volume, fadeInSec/fadeOutSec fade that clip's audio at its own edges (0 = hard cut, ≤10s — use it for the piece's opening/ending, not on every clip). Whole clip, switches at its edges — split a primary shot first for a partial change. Batch with shotIds (the stable clip ids) or all:true, which means every video clip on every visual lane. Omit a field to leave it unchanged.",
    inputSchema: obj(
      {
        shotIds: { type: 'array', items: { type: 'string' }, description: 'Target shot ids (omit when using all).' },
        all: { type: 'boolean', description: 'true = apply to every video clip on every visual lane.' },
        volumeDb: { type: 'number', description: 'dB, clamped -60..+20; 0 resets to source level, -60 = silent.' },
        mute: { type: 'boolean', description: 'Hard-silence toggle (independent of volumeDb).' },
        fadeInSec: { type: 'number', description: "Fade this shot's audio in over N seconds (0 = none)." },
        fadeOutSec: { type: 'number', description: "Fade this shot's audio out over N seconds (0 = none)." },
      },
      [],
    ),
  },
  {
    id: 'set_video_speed',
    skillContract: { version: 1, stability: 'stable' },
    kind: 'badge',
    icon: '⏩',
    label: 'tools.set_video_speed.label',
    description:
      "Set constant playback speed for video clips on any visual lane. The source range stays fixed while timeline duration, picture, and the clip's own audio retime together. Batch with shotIds or all:true. speed accepts 0.25..4. ripple defaults to true for primary narrative clips and false for B-roll/overlay video; set it explicitly to override. This is constant speed only; speed ramps are not supported.",
    inputSchema: obj(
      {
        shotIds: { type: 'array', items: { type: 'string' }, description: 'Target video clip ids (omit when using all).' },
        all: { type: 'boolean', description: 'true = apply to every video clip on every visual lane.' },
        speed: { type: 'number', description: 'Constant playback speed, 0.25..4.' },
        ripple: { type: 'boolean', description: 'Shift later sync-locked clips with the changed out-point. Defaults to true for primary narrative and false for B-roll/overlay video.' },
      },
      ['speed'],
    ),
  },
  {
    id: 'denoise_audio',
    kind: 'badge',
    icon: '🎙️',
    label: 'tools.denoise_audio.label',
    description:
      'Remove background noise from the MAIN narration (on-device speech-denoise model, bakes in the background — takes a moment on long videos). strength 0..1 = dry/wet blend (default 0.6; lower it if the voice sounds thin). off:true restores the original audio. Preview and export both play the denoised result once baking finishes.',
    inputSchema: obj(
      {
        strength: { type: 'number', description: 'Blend 0..1 (default 0.6). Re-tuning is fast — inference is cached per source.' },
        off: { type: 'boolean', description: 'true = turn denoise off.' },
      },
      [],
    ),
  },
  {
    id: 'set_bgm',
    skillContract: { version: 1, stability: 'stable' },
    kind: 'badge',
    icon: '🎵',
    label: 'tools.set_bgm.label',
    description:
      "Audio tracks on the music lane (plain clips: no looping, no auto-ducking; overlapping clips sum). Add: pass url (audio on Pireel storage / a generated track) + optional startSec — the initial level auto-balances against the measured narration loudness; the receipt returns trackId. Adjust: pass trackId (or omit when exactly one track exists) + any of volumeDb (-60..+20; 0 = source level, -60 = silent), fadeInSec, fadeOutSec (≤10s each), speed (0.5..2, pitch shifts), startSec, mute. Shorten a track: headSec/tailSec move that EDGE to a timeline second, dropping the audio outside it (a bed that outruns the video: pass tailSec = the video's duration). splitAtSec cuts one track into two independent ones at that second — the way to give the halves different levels or drop the middle. Remove: off:true with trackId (or without = remove all). Current tracks show in the snapshot; users' own uploads appear in list_assets.",
    inputSchema: obj(
      {
        url: { type: 'string', description: 'Audio url to ADD as a new track. Omit to adjust an existing one.' },
        trackId: { type: 'string', description: 'Target track id (from the snapshot / add receipt).' },
        startSec: { type: 'number', description: 'Position on the edited timeline (seconds).' },
        volumeDb: { type: 'number', description: 'Level dB, clamped -60..+20 (0 = source level, -60 = silent). Omit on add = auto level from loudness measurement.' },
        fadeInSec: { type: 'number' },
        fadeOutSec: { type: 'number' },
        speed: { type: 'number', description: 'Playback-rate multiplier 0.5..2 (changes pitch on purpose — matches export).' },
        mute: { type: 'boolean', description: 'Silence the track while keeping it (and its level) in place.' },
        headSec: { type: 'number', description: 'Move the track\'s START to this edited-timeline second, trimming the audio before it.' },
        tailSec: { type: 'number', description: 'Move the track\'s END to this edited-timeline second, trimming the audio after it.' },
        splitAtSec: { type: 'number', description: 'Split the track in two at this edited-timeline second (returns the new track id).' },
        off: { type: 'boolean', description: 'true = remove the track (all tracks when trackId omitted).' },
      },
      [],
    ),
  },
  {
    id: 'split_shot',
    skillContract: { version: 1, stability: 'stable' },
    kind: 'badge',
    icon: '✂️',
    label: 'tools.split_shot.label',
    description:
      'Split the video into independently editable shots without removing content. Use atSec for one edited-timeline point, or collect 2–24 points into ONE atSecs[] call (one transaction/card/undo); never emit one call per point. For aspect/crop work pass purpose="framing": when local visual analysis shows the subject remains stable across a requested point, the split is rejected instead of creating redundant shots. Omit time only for one manual playhead split. Do not mix atSec and atSecs.',
    inputSchema: obj(
      {
        atSec: { type: 'number', description: 'One edited-timeline split point.' },
        atSecs: { type: 'array', minItems: 1, maxItems: 24, items: { type: 'number' }, description: 'Batch of edited-timeline split points.' },
        purpose: { type: 'string', enum: ['editing', 'framing'], description: 'Use framing for canvas/crop reframing so stable-subject guards apply.' },
      },
      [],
    ),
  },
  {
    id: 'trim_shot',
    skillContract: { version: 1, stability: 'stable' },
    kind: 'badge',
    icon: '🔪',
    label: 'tools.trim_shot.label',
    description:
      'Trim away footage to one side of a point, within that point\'s shot. `side` = "left" or "right". Optional `atSec` = the anchor (edited timeline seconds); omit to use the playhead. Everything after shifts left to close the gap.',
    inputSchema: obj(
      {
        side: { type: 'string', enum: ['left', 'right'] },
        atSec: { type: 'number', description: 'Anchor in edited seconds. Omit to use the playhead.' },
      },
      ['side'],
    ),
  },
  {
    id: 'delete_shot',
    skillContract: { version: 1, stability: 'stable' },
    kind: 'badge',
    icon: '🚫',
    label: 'tools.delete_shot.label',
    description: 'Remove a whole video shot (its source footage is cut; later shots shift earlier). Works on inserted other-source segments too.',
    inputSchema: obj({ shotId: { type: 'string' } }, ['shotId']),
  },
  {
    id: 'cut_range',
    skillContract: { version: 1, stability: 'stable' },
    kind: 'badge',
    icon: '✂️',
    label: 'tools.cut_range.label',
    description:
      'Remove a TIME RANGE of footage by EDITED-timeline seconds (can span shots; later content shifts left, overlay blocks compress). To cut BY THE SCRIPT (remove the passage that says X) use cut_narration instead. cut_range is also the way to cut inside an inserted [clip X] segment (it runs on its own clock). Preferred over split+split+delete.',
    inputSchema: obj(
      {
        fromSec: { type: 'number', description: 'Edited-timeline start of the cut (seconds).' },
        toSec: { type: 'number', description: 'Edited-timeline end of the cut (seconds).' },
      },
      ['fromSec', 'toSec'],
    ),
  },
  {
    id: 'remove_silence',
    skillContract: { version: 1, stability: 'stable' },
    kind: 'card',
    busyText: 'tools.remove_silence.busy',
    icon: '✂️',
    label: 'tools.remove_silence.label',
    description:
      'Remove narration dead air from the ACTUAL AUDIO, without transcript timing. The live editor decodes the primary source, combines on-device voice activity with waveform energy, removes only spans that are BOTH quiet and non-speech, and ripples linked footage/overlays in one undoable edit. Music or loud ambience is preserved. Run this FIRST for pacing/dead-air cleanup; use list_words/delete_words for fillers and cut_narration for semantic passages. `minimumPauseSec` = how long quiet must last before it qualifies; `speechPaddingSec` = protection kept on EACH speech-facing edge.',
    inputSchema: obj(
      {
        minimumPauseSec: { type: 'number', description: '0.25–3.0 seconds. Default 0.5.' },
        speechPaddingSec: { type: 'number', description: '0–0.5 seconds kept on EACH edge next to speech. Default 0.15.' },
      },
      [],
    ),
  },
  {
    id: 'cut_narration',
    skillContract: { version: 1, stability: 'stable' },
    kind: 'badge',
    icon: '✂️',
    label: 'tools.cut_narration.label',
    description:
      'Delete spoken passages BY THE TRANSCRIPT — the remove-what-was-said cut. Pass MAIN-narration SOURCE-second timestamps straight from read_script: the tool converts clocks itself, cuts the footage, compresses overlays and re-lays captions. `ranges` = one or more {fromSec,toSec} removed in ONE call. This is for semantic passages, false starts and retakes; dead-air/pacing cleanup belongs to remove_silence because transcript boundaries are not acoustic cut points. The receipt returns data.cuts (final-timeline seam positions + seconds ACTUALLY removed). MAIN narration only — inserted [clip X] segments run on their own clock: cut those with cut_range or delete_shot.',
    inputSchema: obj(
      {
        ranges: {
          type: 'array',
          description: 'Narration source-second ranges to remove (from read_script timestamps).',
          items: obj({ fromSec: { type: 'number' }, toSec: { type: 'number' } }, ['fromSec', 'toSec']),
        },
      },
      ['ranges'],
    ),
  },
  {
    id: 'delete_words',
    skillContract: { version: 1, stability: 'stable' },
    kind: 'badge',
    icon: '⌫',
    label: 'tools.delete_words.label',
    description:
      'Delete exact spoken words by stable IDs returned by list_words. The operation resolves source words onto every surviving edited occurrence, cuts all ranges atomically, ripples overlays, and re-lays captions. Any unknown/stale id rejects the whole operation. Use cut_narration for broader sentence/passages and pause tightening.',
    inputSchema: obj(
      {
        wordIds: { type: 'array', items: { type: 'string' }, description: 'Stable ids copied from list_words.' },
      },
      ['wordIds'],
    ),
  },
  {
    id: 'insert_clip',
    kind: 'card',
    busyText: 'tools.insert_clip.busy',
    icon: '🎞️',
    label: 'tools.insert_clip.label',
    description:
      "Insert a B-roll video segment into the main track. For a LOCAL file, run the asset-import helper with --broll and pass its `sig`; the bytes stay in this device's Studio OPFS and are resolved locally. For cloud-library/generated media, pass its Pireel CDN `url`; arbitrary external URLs are rejected. For a saved Director Plan, choose the asset from that scene's evidence + assetStrategy and pass the exact sceneId; the scene expands around the inserted interval, later scenes shift right, and the new Clip is bound back to it. Inserts at `atSec` (snaps to the nearest shot boundary, shifts later overlays right). The segment is a full peer: framing, captions, its own audio and on-demand transcript. Needs the studio tab open.",
    inputSchema: obj(
      {
        sig: { type: 'string', description: 'Device-local media fingerprint returned by the asset-import helper --broll flow.' },
        url: { type: 'string', description: "URL of a video already on the user's Pireel storage/CDN." },
        atSec: { type: 'number', description: 'Edited-timeline insertion point (defaults to the playhead; snaps to the nearest cut).' },
        sceneId: { type: 'string', description: 'Exact scene id from the saved Director Plan. Required for planned B-roll; omit for an unplanned local insertion.' },
      },
      [],
    ),
  },
  {
    id: 'add_transition',
    skillContract: { version: 1, stability: 'stable' },
    kind: 'badge',
    icon: '🎬',
    label: 'tools.add_transition.label',
    description:
      "Set/replace/remove the CONTENT transition at a cut between two shots (the footage hands over — not an overlay). `atSec` must be a shot boundary (±0.3s snap; anything else is rejected). One transition per cut, symmetric around it. `effect`: fade (cross-fade, the default), fadeblack (dip to black), directional (push), directionalwipe (wipe), circleopen (iris), windowslice (blinds), crosszoom (zoom punch), rotatescale, glitch, dreamy; 'none' removes. Use sparingly — hard jump-cuts are the default look.",
    inputSchema: obj(
      {
        atSec: { type: 'number', description: 'A shot-boundary time (edited seconds).' },
        effect: { type: 'string', enum: ['fade', 'fadeblack', 'directional', 'directionalwipe', 'circleopen', 'windowslice', 'crosszoom', 'rotatescale', 'glitch', 'dreamy', 'none'], description: "Transition style (default dissolve); 'none' removes." },
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'directional/directionalwipe only: travel direction of the incoming footage (default left).' },
        durationSec: { type: 'number', description: 'TOTAL length in seconds, max 4, clamped by both shots (default 1; keeps the current value when re-styling).' },
      },
      ['atSec'],
    ),
  },
  {
    id: 'undo',
    kind: 'badge',
    icon: '↩️',
    label: 'tools.undo.label',
    description:
      'Undo the last composition change (one step per call). Use when the user rejects a change or asks to roll back / re-do something differently — undo first, then redo it the new way; NEVER declare a state unreachable without trying undo. When the session stack is exhausted (page refreshed, device switched), it falls back to the project\'s cloud history and rolls back one saved version (coarser: one autosave step, not one tool step). After ANY undo, re-read state (get_state / read_script) before editing again.',
    inputSchema: obj({}, []),
  },

  /* ---------- ask the user for approval of a model-authored proposal (chat surface only) ---------- */
  {
    id: 'request_approval',
    kind: 'card',
    icon: '✋',
    label: 'tools.request_approval.label',
    chatOnly: true,
    description:
      "Pause for approval before carrying out a consequential proposal. You decide what the user needs to review from the current request, inspected material, selected Skill/Frame, and intended edit; write that proposal in `content` instead of filling a host-defined checklist. Keep it concrete and proportionate: explain the intended result, the important editorial/visual choices, material use or gaps, and any meaningful consequences only when they matter to THIS proposal. The host renders your content verbatim with generic Reject and Approve actions. After Approve, continue from the approved proposal. After Reject, do not execute it; ask one focused follow-up or present a revised proposal. Use this for broad whole-video plans, batch/pilot plans, or other changes where proceeding first would create substantial rework. Do not use it for small reversible edits or named-choice questions; use ask_user for those.",
    inputSchema: obj(
      {
        title: { type: 'string', description: "Short proposal title in the user's language." },
        content: {
          type: 'string',
          description:
            "The complete user-facing proposal in the user's language. Its structure and contents are yours to decide from the actual task. Prefer concise headings, short paragraphs, and bullet lines; do not emit JSON or a fixed template.",
        },
      },
      ['content'],
    ),
  },
  /* ---------- ask the user a structured question (chat surface only) ---------- */
  {
    id: 'ask_user',
    kind: 'card',
    icon: '💬',
    label: 'tools.ask_user.label',
    chatOnly: true,
    description:
      "Ask the user a question with a small set of concrete OPTIONS, rendered as clickable choices parked inline — use it whenever the next step needs a decision the user should make (which theme, portrait vs landscape, which of several directions). Each option needs a short `label` plus a one-line `description` of what it means / the trade-off; both in the user's language. The chosen label(s) come back in `data.selected`; stable machine values come back in `data.selectedValues`. For voice choices, copy the exact list_voices voiceId into `value` and its exact sampleUrl into `previewUrl`; never invent either. Don't use it for open-ended input or things you can reasonably decide yourself — only for a genuine pick between a few named choices.",
    inputSchema: obj(
      {
        question: { type: 'string', description: "The question, in the user's language." },
        options: {
          type: 'array',
          description: '2–4 choices.',
          items: obj(
            {
              label: { type: 'string', description: 'Short choice label (shown on the chip, and returned as the answer).' },
              description: { type: 'string', description: 'One line: what this choice means or its trade-off.' },
              value: { type: 'string', description: 'Optional stable machine value returned in data.selectedValues; for a voice option use its exact voiceId.' },
              previewUrl: { type: 'string', description: 'Optional exact media preview URL rendered as a play button; for a voice use its exact sampleUrl from list_voices.' },
            },
            ['label'],
          ),
        },
        multiSelect: { type: 'boolean', description: 'Allow picking more than one (default false = single choice).' },
      },
      ['question', 'options'],
    ),
  },
  /* ---------- export (local client-side compositing, card · slow) ---------- */
  {
    id: 'export_video',
    kind: 'card',
    busyText: 'tools.export_video.busy',
    icon: '🎞️',
    label: 'tools.export_video.label',
    description:
      "Export the final video with adaptive source-quality settings. Never ask the user to choose resolution, fps, or format: the runtime preserves the current canvas, caps resolution to source quality, and uses 30fps MP4 by default. Pass an exact spec only when the user explicitly supplied it. In Studio chat, a compact one-click Export card starts the local render/download; it shows the adaptive spec but has no settings chooser. Via MCP, the call starts directly with adaptive or explicit settings. Rendering is local in the user's open Studio tab (roughly realtime: a 3-min video takes ~3 min), nothing is uploaded, and the tab must stay open. In chat do not poll after starting; use track_export only when the user asks. Via MCP poll about every 15s. Headless/embedded browsers often discard downloads, so run the export-sink helper first and pass its sink_url.",
    inputSchema: obj(
      {
        resolution: { type: 'number', description: 'Explicit user override only. Output short-side pixels: 2160 / 1440 / 1080 / 720 / 540. Omit for adaptive source quality.' },
        fps: { type: 'number', description: 'Explicit user override only: 24 / 30 / 60. Omit for adaptive 30fps.' },
        format: { type: 'string', enum: ['mp4', 'webm', 'mov'], description: 'Explicit user override only. Omit for adaptive MP4.' },
        confirmed: { type: 'boolean', description: 'Deprecated compatibility field; adaptive export no longer needs a settings confirmation handshake.' },
        sink_url: { type: 'string', description: 'Loopback receiver URL from the export-sink helper (scripts/export-sink.mjs) — the finished file is PUT there instead of a browser download. Use when driving a headless/embedded browser.' },
      },
      [],
    ),
  },
  {
    id: 'track_export',
    kind: 'badge',
    icon: '⏳',
    label: 'tools.track_export.label',
    description:
      "Check the running export: returns {status: running|done|idle, progress %, filename when done}. Poll every ~15s after export_video. When done, the file was already saved by the browser's download (Downloads folder by default) — locate it there by the returned filename (watch for an in-progress .crdownload first) and confirm the path to the user.",
    inputSchema: obj({}, []),
  },
];

export const STUDIO_TOOL_MAP: Record<string, StudioToolDef> = Object.fromEntries(
  STUDIO_TOOLS.map((d) => [d.id, d]),
);

export interface StudioSkillCapability {
  id: string;
  version: number;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Stable, Skill-safe capability catalog derived from the same table used by Chat, MCP and UI. */
export const STUDIO_SKILL_CAPABILITIES: readonly StudioSkillCapability[] = STUDIO_TOOLS
  .filter((tool): tool is StudioToolDef & { skillContract: StudioSkillCapabilityContract } => (
    tool.skillContract?.stability === 'stable'
  ))
  .map((tool) => ({
    id: tool.id,
    version: tool.skillContract.version,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));

export const STUDIO_SKILL_CAPABILITY_MAP: Readonly<Record<string, StudioSkillCapability>> =
  Object.fromEntries(STUDIO_SKILL_CAPABILITIES.map((capability) => [capability.id, capability]));

/** Compact prompt catalog; exact parameter contracts remain available through attached tool schemas. */
export const STUDIO_SKILL_CAPABILITY_CATALOG = STUDIO_SKILL_CAPABILITIES
  .map((capability) => `- ${capability.id}@${capability.version}`)
  .join('\n');

/** Tool result (client runTool returns → addToolOutput → shared by model + card render). */
export interface StudioToolResult {
  ok: boolean;
  /** One-line summary (shown on card/badge on success, also fed to the model for continuation). */
  summary?: string;
  /** Failure reason. */
  error?: string;
  /** Structured data for query tools (for the model, e.g. get_block's block detail; not rendered on the card). */
  data?: unknown;
  /** Captured-frame image (base64, no data: prefix) — MCP side turns it into image content for the external agent to "see". */
  image?: { data: string; mimeType: string };
  /** Multiple images (visual_brief sampled frames) — MCP side converts each into image content. */
  images?: { data: string; mimeType: string }[];
}
