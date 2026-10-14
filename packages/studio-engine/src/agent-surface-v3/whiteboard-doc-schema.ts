/**
 * The whiteboard document format accepted by set_whiteboard.
 *
 * It is not part of the published tool list: set_whiteboard advertises a thin input and hands this
 * format out on request (describe: true), so sessions that never build a board do not carry it.
 * Calls are still validated against it in full (V3_STRICT_INPUT_SCHEMAS in schemas.ts).
 * Kept free of engine imports so the executor and the validator can both read it.
 */

import { PROGRAM_SCHEMA } from '../whiteboard-program';
import { DRAWING_SCHEMA } from './drawing-schema';

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

export const WHITEBOARD_ASPECTS = ['16:9', '9:16', '1:1'] as const;
export const WHITEBOARD_THEMES = ['scrapbook', 'chalkboard', 'blueprint'] as const;
const WHITEBOARD_COLOR = enumOf(['yellow', 'green', 'pink', 'purple', 'blue', 'orange']);
const whiteboardKind = (kind: string) => enumOf([kind]);
const WHITEBOARD_ICON = str('Inline <svg> exactly as returned by get_icons.');
const WHITEBOARD_CONTENT: Schema = {
  anyOf: [
    DRAWING_SCHEMA,
    PROGRAM_SCHEMA,
    obj({ kind: whiteboardKind('headline'), eyebrow: str(), lines: arr(str(), { minItems: 1 }) }, ['kind', 'lines']),
    obj({ kind: whiteboardKind('sticky'), color: WHITEBOARD_COLOR, label: str(), title: str(), body: str(), icon: WHITEBOARD_ICON }, ['kind', 'color', 'title']),
    obj({ kind: whiteboardKind('card'), color: WHITEBOARD_COLOR, title: str(), body: str(), icon: WHITEBOARD_ICON }, ['kind', 'color', 'title']),
    obj({ kind: whiteboardKind('photo'), caption: str(), sub: str(), image: str('Returned prepared image locator, https or data: URL.'), treatment: enumOf(['photo', 'cutout', 'logo']), emoji: str() }, ['kind', 'caption']),
    obj({ kind: whiteboardKind('stat'), value: str(), caption: str(), icon: WHITEBOARD_ICON }, ['kind', 'value']),
    obj({
      kind: whiteboardKind('list'), title: str(), items: arr(str(), { minItems: 1 }), ordered: bool(), color: WHITEBOARD_COLOR, icon: WHITEBOARD_ICON,
    }, ['kind', 'items']),
    obj({ kind: whiteboardKind('icon'), svg: WHITEBOARD_ICON, label: str(), color: enumOf(['ink', 'accent', 'violet']) }, ['kind', 'svg']),
    obj({
      kind: whiteboardKind('chart'), chart: enumOf(['bar', 'line', 'pie']), title: str(), unit: str(),
      data: arr(obj({ label: str(), value: num(), color: WHITEBOARD_COLOR }, ['label', 'value']), { minItems: 1, maxItems: 12 }),
      highlight: int('Data point to emphasise, from 1.', 1),
    }, ['kind', 'chart', 'data']),
    obj({
      kind: whiteboardKind('timeline'), title: str(),
      events: arr(obj({ date: str(), title: str(), body: str(), color: WHITEBOARD_COLOR }, ['date', 'title']), { minItems: 1, maxItems: 8 }),
    }, ['kind', 'events']),
    obj({
      kind: whiteboardKind('cycle'), center: str('Short label in the middle of the loop.'),
      items: arr(obj({ title: str(), body: str(), color: WHITEBOARD_COLOR }, ['title']), { minItems: 2, maxItems: 8 }),
    }, ['kind', 'items']),
    obj({
      kind: whiteboardKind('venn'), overlap: str('Label for the shared region.'),
      sets: arr(obj({ label: str(), color: WHITEBOARD_COLOR }, ['label']), { minItems: 2, maxItems: 3 }),
    }, ['kind', 'sets']),
    obj({ kind: whiteboardKind('shape'), shape: enumOf(['circle', 'rect', 'pill', 'diamond', 'triangle']), text: str(), color: WHITEBOARD_COLOR }, ['kind', 'shape']),
    obj({
      kind: whiteboardKind('code'), code: str('Source text, lines separated by \\n; keep it to a readable excerpt.'), lang: str(), title: str('File name or caption.'),
      highlight: arr({ type: 'integer', minimum: 1 }, { description: 'Line numbers to highlight, from 1.' }),
    }, ['kind', 'code']),
    obj({
      kind: whiteboardKind('sketch'), label: str('Short handwritten caption under the drawing.'),
      strokes: arr(obj({
        points: arr(arr({ type: 'number' }, { minItems: 2, maxItems: 2 }), { minItems: 2, maxItems: 400, description: '[x, y] pairs in any units, y pointing down; the drawing is scaled to fit.' }),
        color: enumOf(['ink', 'accent', 'violet']), width: num('', { min: 1, max: 12 }),
      }, ['points']), { minItems: 1, maxItems: 60, description: 'Pen strokes in drawing order.' }),
    }, ['kind', 'strokes']),
    obj({ kind: whiteboardKind('math'), tex: str('LaTeX without $ delimiters.'), caption: str() }, ['kind', 'tex']),
    obj({
      kind: whiteboardKind('screen'), device: enumOf(['browser', 'phone', 'tv']),
      image: str('https or data: URL of a screenshot or a video poster frame.'), title: str('Address-bar text (browser only).'), caption: str(),
      play: bool('Show a play button where the edit cuts to a video clip.'),
    }, ['kind', 'device']),
    obj({
      kind: whiteboardKind('table'), label: str(),
      columns: arr(obj({ title: str(), items: arr(obj({ title: str(), meta: str(), color: WHITEBOARD_COLOR }, ['title'])) }, ['title', 'items']), { minItems: 1 }),
    }, ['kind', 'columns']),
    obj({ kind: whiteboardKind('comment'), text: str(), author: str() }, ['kind', 'text']),
    obj({ kind: whiteboardKind('handwriting'), text: str(), color: enumOf(['accent', 'ink', 'violet']) }, ['kind', 'text']),
    obj({ kind: whiteboardKind('doodle'), shape: enumOf(['cat', 'star', 'heart', 'bulb', 'spark']) }, ['kind', 'shape']),
  ],
  description: 'headline is typed on; sticky drops in; card is the usual flow box and edge endpoint; icon, doodle, shape and sketch are drawn on; handwriting and math are written on; a screen frames a screenshot or video poster. Items can each be revealed on their own phrase: list items, table rows, chart data points, timeline events, cycle steps, venn sets (the overlap is the last item), code lines and sketch strokes.',
};
const WHITEBOARD_ACTION: Schema = obj({
  op: enumOf(['reveal', 'highlight', 'dim', 'cursor']),
  target: str('Node, edge or group id (an edge reveal draws the arrow).'),
  item: int('reveal only: the item to reveal, from 1 — a list item, table row, chart data point, timeline event, cycle step, venn set (overlap last), code line or sketch stroke. Items without their own reveal appear with the node.', 1),
  effect: enumOf(['auto', 'pop', 'drop', 'type', 'write', 'draw', 'fade'], 'reveal only; auto picks the natural effect for the kind.'),
  mark: enumOf(['circle', 'underline', 'box'], 'highlight only: a hand-drawn mark around or under the target.'),
  color: enumOf(['accent', 'violet']),
  cursor: str('cursor only: which cursor moves to the target.'),
}, ['op', 'target']);

export const WHITEBOARD_DOC_SCHEMA: Schema = obj({
  version: int('Document format version; 1.', 1),
  aspect: enumOf(WHITEBOARD_ASPECTS, 'Match the canvas.'),
  title: str(),
  theme: enumOf(WHITEBOARD_THEMES, 'Visual theme; appearance only, never layout or timing.'),
  chrome: { anyOf: [{ type: 'boolean', enum: [false] }, obj({ title: str('Board name shown in the collaborative-board frame.'), avatars: arr(str()) }, ['title'])], description: 'Decorative shell is ON by default: title bar, toolbar (hidden in portrait), avatars and zoom indicator. Omit to use doc.title and default decorative avatars. Pass an object to customize; avatars: [] hides avatars. Pass false only when a clean board without the shell is explicitly wanted.' },
  narration: obj({
    source: enumOf(['script', 'tts', 'asr']),
    durationSec: num('Voiceover length in seconds; required when sentences carry no words.', { min: 0 }),
    leadInSec: num('Seconds from the board start to the first spoken word.', { min: 0 }),
    sentences: arr(obj({
      id: str(), text: str('The sentence exactly as spoken.'),
      words: arr(obj({ text: str(), start: num(), end: num() }, ['text', 'start', 'end']), { description: 'Optional timed words, seconds from the board start.' }),
    }, ['id', 'text']), { minItems: 1 }),
  }, ['sentences']),
  board: obj({
    nodes: arr(obj({
      id: str(),
      content: WHITEBOARD_CONTENT,
      pos: obj({ x: num(), y: num() }, ['x', 'y']),
      rotate: num('Tilt in degrees; stickies and photos get a slight random tilt by default.'),
      size: obj({ w: num('', { min: 1 }), h: num('', { min: 1 }) }, ['w', 'h']),
    }, ['id', 'content']), { minItems: 1 }),
    edges: arr(obj({ id: str(), from: str('Node or group id.'), to: str('Node or group id.'), kind: enumOf(['arrow', 'line']), label: str('A short verb or relation written on the line.') }, ['id', 'from', 'to'])),
    groups: arr(obj({
      id: str(), label: str(), nodeIds: ids('Nodes the frame surrounds; the frame follows their layout.'),
      color: enumOf(['yellow', 'green', 'pink', 'purple', 'blue', 'orange', 'ink']),
    }, ['id', 'nodeIds']), { description: 'Titled frames around related nodes; reveal, highlight and focus them by id.' }),
  }, ['nodes']),
  scenes: arr(obj({
    id: str(), title: str(),
    nodeIds: arr(str()),
    layout: obj({
      type: enumOf(['free', 'flow', 'grid', 'row'], 'flow = layered along edges; grid/row = even spacing; free = node pos (world pixels; relative to the scene when at is given).'),
      direction: enumOf(['right', 'down']), columns: int('Grid columns.', 1), gap: num(), rankGap: num(),
    }, ['type']),
    at: obj({ x: num(), y: num() }, ['x', 'y']),
  }, ['id', 'nodeIds', 'layout']), { description: 'Regions of one continuous board; the camera travels between them instead of cutting.' }),
  beats: arr(obj({
    id: str(),
    anchor: obj({ sentence: str('Sentence id.'), phrase: str('Substring of that sentence; the beat fires as it is spoken. Omit for the sentence start.'), occurrence: int('Which occurrence of the phrase, from 1.', 1) }, ['sentence']),
    actions: arr(WHITEBOARD_ACTION),
    camera: { anyOf: [enumOf(['overview', 'hold']), obj({
      focus: arr({ anyOf: [str('Node, edge or group id.'), obj({ nodeId: str('A drawing node id.'), elements: ids('Ids of elements inside this drawing to frame together, including related labels. Motion bounds until the next camera beat are included.') }, ['nodeId', 'elements'])] }, { minItems: 1, description: 'Frame whole nodes or a selection inside a drawing. These can be mixed.' }),
      padding: num('Space around the focus.', { min: 0, max: 1 }),
      maxZoom: num('Maximum magnification, not a forced crop. Default 1.7 for whole nodes, 3 for drawing details. Zoom 1 = one design pixel per output pixel at 1080p.', { min: .2, max: 4 }),
      durationSec: num('Optional smooth camera move duration; default adapts to travel distance. Leave time to hold and read.', { min: .3, max: 4 }),
    }, ['focus'])], description: 'Smoothly frame targets at this narration beat, show everything revealed so far (overview), or hold the camera. Zoom back to the drawing node or overview after a detail shot.' },
  }, ['id', 'anchor', 'actions'])),
  cursors: arr(obj({ id: str(), name: str('Label on the pointer.'), color: str('#RRGGBB') }, ['id', 'name', 'color']), { description: 'Named pointers that the cursor action moves to what is being discussed.' }),
}, ['narration', 'board', 'scenes', 'beats']);
