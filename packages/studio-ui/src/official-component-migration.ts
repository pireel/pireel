import {
  applyOverlayDocumentEdits,
  type Block,
  type Composition,
  type EditorDocumentV2,
  type OverlayDocumentPatch,
} from '@pireel/studio-engine/composition';
import { ELEMENT_TEMPLATES } from './gen-templates';
import { artDirectedTemplateElement } from './gen-templates/element-presets';
import { ART_DIRECTED_PRESET_VERSION } from './gen-templates/element-presets/shared';
import { fitElementDesignBox, type ElementInsertBox } from './element-insert-geometry';

const EDITABLE_FIELD = /<([a-z][\w-]*)([^>]*\bdata-edit="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/gi;
const BAKED_VARS = /<style\s+data-hf-baked[^>]*>[\s\S]*?<\/style>/i;

function copyEditableContent(source: string, target: string): string {
  const values = new Map<string, string>();
  for (const match of source.matchAll(EDITABLE_FIELD)) values.set(match[3]!, match[4]!);
  EDITABLE_FIELD.lastIndex = 0;
  return target.replace(EDITABLE_FIELD, (whole, tag: string, attrs: string, key: string) => {
    const value = values.get(key);
    return value === undefined ? whole : `<${tag}${attrs}>${value}</${tag}>`;
  });
}

function boxesNear(a: ElementInsertBox, b: ElementInsertBox): boolean {
  return Math.abs(a.x - b.x) < 0.035
    && Math.abs(a.y - b.y) < 0.035
    && Math.abs(a.w - b.w) < 0.035
    && Math.abs(a.h - b.h) < 0.035;
}

function migratedBox(block: Block, composition: Composition): Block['box'] {
  if (!block.box) return block.box;
  const base = {
    canvasW: composition.width,
    canvasH: composition.height,
    designW: 1920,
    designH: 1080,
    sourceBox: { x: 0, y: 0, w: 1, h: 1 },
  };
  const legacyDefault = fitElementDesignBox({ ...base, initialScale: 1 });
  if (!boxesNear(block.box, legacyDefault)) return block.box;
  return fitElementDesignBox({ ...base, initialScale: 0.56 });
}

export interface OfficialComponentMigrationResult {
  document: EditorDocumentV2;
  composition: Composition;
  migratedBlockIds: string[];
}

/** One-way data migration for inserted official art cards; current payloads never enter this path. */
export function migrateOfficialComponentPayloads(
  document: EditorDocumentV2,
  composition: Composition,
): OfficialComponentMigrationResult {
  const templatesByPreset = new Map(ELEMENT_TEMPLATES.flatMap((template) => (
    template.presetId ? [[template.presetId, template] as const] : []
  )));
  const updates: OverlayDocumentPatch[] = [];
  const blocks = composition.blocks.map((block) => {
    if (block.templateId !== 'custom') return block;
    const slots = block.slots as { presetId?: unknown; presetVersion?: unknown; innerHtml?: unknown; timelineBody?: unknown };
    const presetId = typeof slots.presetId === 'string' ? slots.presetId : '';
    const sourceHtml = typeof slots.innerHtml === 'string' ? slots.innerHtml : '';
    const template = templatesByPreset.get(presetId);
    const sourceVersion = Number(slots.presetVersion);
    if (!template || (Number.isFinite(sourceVersion) && sourceVersion >= ART_DIRECTED_PRESET_VERSION)) return block;

    const current = artDirectedTemplateElement(template, block.label ?? template.id);
    if (!current) return block;
    let innerHtml = current.innerHtml.replaceAll(current.seedId, block.id);
    innerHtml = copyEditableContent(sourceHtml, innerHtml);
    const bakedVars = sourceHtml.match(BAKED_VARS)?.[0];
    if (bakedVars) innerHtml += `\n${bakedVars}`;
    const nextBox = migratedBox(block, composition);
    const nextSlots = {
      ...block.slots,
      innerHtml,
      timelineBody: current.timelineBody.replaceAll(current.seedId, block.id),
      presetId,
      presetVersion: ART_DIRECTED_PRESET_VERSION,
    };
    const next = { ...block, slots: nextSlots, ...(nextBox ? { box: nextBox } : {}) };
    updates.push({ clipId: block.id, block: { slots: nextSlots, ...(nextBox ? { box: nextBox } : {}) } });
    return next;
  });

  if (!updates.length) return { document, composition, migratedBlockIds: [] };
  const edit = applyOverlayDocumentEdits({ document, updates });
  if (!edit.ok) return { document, composition, migratedBlockIds: [] };
  return {
    document: edit.document,
    composition: { ...composition, blocks },
    migratedBlockIds: updates.map((update) => update.clipId),
  };
}
