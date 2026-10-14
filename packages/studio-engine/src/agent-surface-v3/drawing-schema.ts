import { DRAWING_COLORS, DRAWING_EASINGS, DRAWING_PROPERTIES } from '../whiteboard-drawing';

type Schema = Record<string, unknown>;
const number = (minimum = -100_000, maximum = 100_000): Schema => ({ type: 'number', minimum, maximum });
const string: Schema = { type: 'string', maxLength: 500 };
const enumeration = (values: readonly string[]): Schema => ({ type: 'string', enum: [...values] });
const object = (properties: Record<string, unknown>, required: string[]): Schema => ({ type: 'object', properties, required, additionalProperties: false });
const points: Schema = { type: 'array', minItems: 2, maxItems: 200, items: { type: 'array', minItems: 2, maxItems: 2, items: number() } };
const shared = {
  id: string, x: number(), y: number(), stroke: enumeration(DRAWING_COLORS), fill: enumeration(DRAWING_COLORS),
  strokeWidth: number(0, 40), roughness: number(0, 3), fillStyle: enumeration(['solid', 'hachure', 'cross-hatch']), opacity: number(0, 1),
  route: { ...points, description: 'Polyline in local drawing coordinates. A progress track moves the element along it by distance; x/y are added as offsets.' },
  tracks: {
    type: 'array', maxItems: DRAWING_PROPERTIES.length,
    items: object({
      property: enumeration(DRAWING_PROPERTIES), beat: { ...string, description: 'Optional existing beat id. Keyframe t is seconds after this beat; otherwise seconds from board start.' },
      ease: enumeration(DRAWING_EASINGS),
      keyframes: { type: 'array', minItems: 2, maxItems: 64, items: object({ t: number(0, 3600), value: number() }, ['t', 'value']) },
    }, ['property', 'keyframes']),
    description: 'One track per property; strictly increasing times. Holds first/last value outside the range. Opacity, draw and progress clamp to 0..1. Scale defaults to 1, rotation is degrees. No autoplay or accumulated state.',
  },
};
const text = { fontSize: number(12, 180), align: enumeration(['start', 'middle', 'end']) };
export const DRAWING_SCHEMA: Schema = object({
  kind: enumeration(['drawing']), width: number(1, 4096), height: number(1, 4096),
  elements: { type: 'array', minItems: 1, maxItems: 160, items: { anyOf: [
    object({ ...shared, shape: enumeration(['ellipse', 'rect']), w: number(1, 4096), h: number(1, 4096) }, ['id', 'shape', 'w', 'h']),
    object({ ...shared, shape: enumeration(['path']), points, closed: { type: 'boolean' } }, ['id', 'shape', 'points']),
    object({ ...shared, ...text, shape: enumeration(['text']), text: string }, ['id', 'shape', 'text']),
    object({ ...shared, ...text, shape: enumeration(['number']), value: number(), decimals: { type: 'integer', minimum: 0, maximum: 4 }, prefix: string, suffix: string }, ['id', 'shape', 'value']),
  ] } },
}, ['kind', 'width', 'height', 'elements']);
DRAWING_SCHEMA.description = 'Custom animated SVG illustration, built from reusable primitives, not raw scripts. Ellipses/rectangles are centered on x/y; paths use local points; text is baseline aligned. Elements paint in array order. Colors follow the board theme. Roughness defaults to 1 for geometry. Use tracks for drawing, movement, squash/stretch, rotation, weight changes, path-following and numeric interpolation. Keep important text >=26px at final size. Finish tracks within the narration and leave a readable final state.';
