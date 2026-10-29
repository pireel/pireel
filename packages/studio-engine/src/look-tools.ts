/**
 * Agent tools for video-level templates (look.ts):
 *  - set_look: write the output's look — its visual system and parametric pieces;
 *  - place_graphics: place instances of the look's pieces (props + box + time, optionally anchored
 *    to a spoken word so they follow later cuts);
 *  - set_confirm_list: hand the creator what they must confirm (unverified facts, music, voice).
 *
 * Document-only: they return the next document like every other v3 edit, so the tab, the offline
 * executor and server replay run them the same way.
 */

import { fail, freeGraphicsStackOrder, mutation, string, uniqueId, type AgentTimelineOutcome } from '@pireel/studio-engine/agent-timeline';
import { blockId, type Block } from '@pireel/studio-engine/composition-core';
import type { EditorDocumentV2, HandoffItem, TimelineAnchor } from '@pireel/studio-engine/editor-document/types';
import { patchEditorAppearance } from '@pireel/studio-engine/editor-document/commands/appearance';
import { insertOverlayDocumentClip } from '@pireel/studio-engine/overlay-track-edit';
import { lookSourceSyntaxIssues } from '@pireel/studio-engine/look-source-syntax';
import { LOOK_TEMPLATE_PREFIX, normalizeLook } from '@pireel/studio-engine/look';
import { COMPONENT_ROW_FIELDS } from '@pireel/studio-engine/component-property-input';

type Input = Record<string, unknown>;

const isFrame = (value: unknown, min = 0) => Number.isInteger(value) && (value as number) >= min;

/** A short, stable id for a new look: derived from its content, so replaying the same call yields the same id. */
function lookIdFor(value: Input): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `look-${(hash >>> 0).toString(36)}`;
}

/** The first list-row field of a props schema that a tool call cannot carry. */
function listFieldOutsideRows(schema: unknown): { prop: string; field: string } | undefined {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return undefined;
  const record = schema as Input;
  const properties = record.properties && typeof record.properties === 'object' && !Array.isArray(record.properties) ? record.properties as Input : record;
  for (const [prop, field] of Object.entries(properties)) {
    const items = (field as Input | null)?.items as Input | undefined;
    const fields = items?.properties && typeof items.properties === 'object' ? Object.keys(items.properties as Input) : [];
    const outside = fields.find(name => !(COMPONENT_ROW_FIELDS as readonly string[]).includes(name));
    if (outside) return { prop, field: outside };
  }
  return undefined;
}

export function setLookV3(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const raw = input.look && typeof input.look === 'object' && !Array.isArray(input.look) ? (input.look as Input) : null;
  if (!raw) return fail('missing_field', { path: 'look', fix: 'Pass look: { css, pieces: [{ id, label, source, propsSchema }], notes }.' });
  // Pieces arrive as a list (the tool contract has no free-form maps); stored keyed by id.
  let pieces = raw.pieces;
  if (Array.isArray(pieces)) {
    const keyed: Record<string, unknown> = {};
    for (const [index, entry] of pieces.entries()) {
      const piece = (entry ?? {}) as Input;
      const id = string(piece.id);
      if (!id) return fail('missing_field', { path: `look.pieces[${index}].id`, fix: 'Every piece needs an id (lowercase words joined by hyphens).' });
      let propsSchema: unknown = piece.propsSchema;
      if (typeof propsSchema === 'string' && propsSchema.trim()) {
        try { propsSchema = JSON.parse(propsSchema); } catch {
          return fail('invalid_value', { path: `look.pieces[${index}].propsSchema`, fix: 'propsSchema is a JSON object string, e.g. {"title":{"type":"string"}}.' });
        }
      }
      // A list field no tool call can fill would leave the piece unplaceable: refuse it while the look is written.
      const stray = listFieldOutsideRows(propsSchema);
      if (stray) return fail('invalid_value', { path: `look.pieces[${index}].propsSchema.${stray.prop}.items.properties.${stray.field}`, fix: `List rows carry only ${COMPONENT_ROW_FIELDS.join(', ')}; carry ${stray.field} in one of them.` });
      keyed[id] = { label: piece.label, source: piece.source, ...(propsSchema && typeof propsSchema === 'object' ? { propsSchema } : {}) };
    }
    pieces = keyed;
  }
  const candidate = { ...raw, pieces, id: string(raw.id) ?? lookIdFor(raw) };
  const checked = normalizeLook(candidate);
  if (!checked.look) {
    return fail('invalid_look', {
      issues: checked.issues,
      fix: 'Fix exactly the listed issues and call set_look again with the whole look.',
    });
  }
  const look = checked.look;
  const syntaxIssues = Object.entries(look.pieces).flatMap(([id, piece]) => lookSourceSyntaxIssues(piece.source, `look.pieces.${id}.source`));
  if (syntaxIssues.length) return fail('invalid_look', { issues: syntaxIssues, fix: 'Correct the JavaScript syntax and submit the complete look again. The previous look has been preserved.' });
  const patched = patchEditorAppearance(document, { look });
  if (!patched.ok) return fail(patched.error?.message ?? 'look was not applied');
  // Instances of pieces the new look no longer has would render empty: name them.
  const orphaned = document.timeline.tracks.flatMap((track) => track.clips.flatMap((clip) => {
    if (clip.kind !== 'graphic' || !clip.block.templateId.startsWith(LOOK_TEMPLATE_PREFIX)) return [];
    return look.pieces[clip.block.templateId.slice(LOOK_TEMPLATE_PREFIX.length)] ? [] : [clip.id];
  }));
  return mutation(patched.document, `Look ${look.id}: ${Object.keys(look.pieces).length} piece(s)`, [patched.receipt], {
    lookId: look.id,
    pieces: Object.fromEntries(Object.entries(look.pieces).map(([id, piece]) => [id, piece.label])),
    ...(orphaned.length ? { orphanedClipIds: orphaned, note: 'These instances name pieces this look no longer has; they render empty until re-placed or removed.' } : {}),
  });
}

/** A word in a transcript the instance should follow through later cuts. */
function wordAnchor(document: EditorDocumentV2, raw: unknown, path: string): TimelineAnchor | AgentTimelineOutcome {
  const value = raw && typeof raw === 'object' ? (raw as Input) : {};
  const assetId = string(value.assetId);
  const segmentIndex = Number(value.segmentIndex);
  const wordIndex = Number(value.wordIndex);
  if (!assetId || !Number.isInteger(segmentIndex) || !Number.isInteger(wordIndex)) {
    return fail('invalid_value', { path, fix: 'anchor is { assetId, segmentIndex, wordIndex } from get_transcript.' });
  }
  const segment = document.semantics.transcripts[assetId]?.[segmentIndex];
  if (!segment) return fail('unknown_id', { path: `${path}.segmentIndex`, value: segmentIndex, fix: 'Read the source with get_transcript and use its row index.' });
  if (!Array.isArray(segment.words) || !segment.words[wordIndex]) {
    return fail('invalid_value', { path: `${path}.wordIndex`, value: wordIndex, fix: `Row ${segmentIndex} has ${segment.words?.length ?? 0} words.` });
  }
  const offsetFrames = Number.isInteger(value.offsetFrames) ? (value.offsetFrames as number) : 0;
  return { type: 'word', assetId, segmentIndex, wordIndex, offsetFrames };
}

export function placeGraphicsV3(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const look = document.appearance.look;
  if (!look) return fail('no_look', { fix: 'Write the look first with set_look; graphics are instances of its pieces.' });
  const items = Array.isArray(input.items) ? (input.items as Input[]) : [];
  if (!items.length) return fail('missing_field', { path: 'items', fix: 'Pass items: [{ pieceId, props, box, startFrame, durationFrames }].' });
  const fps = document.canvas.fps;
  let next = document;
  const receipts = [];
  const clipIds: string[] = [];
  const used = new Set(next.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  for (const [index, raw] of items.entries()) {
    const item = (raw ?? {}) as Input;
    const path = `items[${index}]`;
    const pieceId = string(item.pieceId);
    if (!pieceId || !look.pieces[pieceId]) {
      return fail('unknown_id', { path: `${path}.pieceId`, value: pieceId, fix: `Pieces in the current look: ${Object.keys(look.pieces).join(', ')}.` });
    }
    if (!isFrame(item.startFrame)) return fail('invalid_value', { path: `${path}.startFrame`, fix: 'An integer timeline frame ≥ 0.' });
    if (!isFrame(item.durationFrames, 1)) return fail('invalid_value', { path: `${path}.durationFrames`, fix: 'An integer frame count ≥ 1.' });
    const boxRaw = item.box && typeof item.box === 'object' ? (item.box as Input) : null;
    const box = boxRaw ? { x: Number(boxRaw.x), y: Number(boxRaw.y), w: Number(boxRaw.w), h: Number(boxRaw.h) } : { x: 0, y: 0, w: 1, h: 1 };
    if (![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.w <= 0 || box.h <= 0) {
      return fail('invalid_value', { path: `${path}.box`, fix: 'box is { x, y, w, h } in canvas units (0–1); omit it for the full frame.' });
    }
    // Props arrive as [{ key, value }] (the same shape set_clip_properties takes); a plain object is accepted too.
    const props: Input = Array.isArray(item.props)
      ? Object.fromEntries((item.props as Input[]).flatMap((row) => (row && typeof row.key === 'string' ? [[row.key, row.value]] : [])))
      : item.props && typeof item.props === 'object' ? (item.props as Input) : {};
    const words = Array.isArray(item.words)
      ? (item.words as unknown[]).flatMap((word) => {
        const w = (word ?? {}) as Input;
        return typeof w.text === 'string' && Number.isFinite(Number(w.start)) && Number.isFinite(Number(w.end))
          ? [{ text: w.text, start: Number(w.start), end: Number(w.end) }]
          : [];
      })
      : [];
    const anchor = item.anchor === undefined ? null : wordAnchor(next, item.anchor, `${path}.anchor`);
    if (anchor && 'ok' in anchor) return anchor;
    const startSec = (item.startFrame as number) / fps;
    const durationSec = (item.durationFrames as number) / fps;
    const id = uniqueId(string(item.id) ?? blockId('look'), used);
    used.add(id);
    const block: Block = {
      id,
      templateId: `${LOOK_TEMPLATE_PREFIX}${pieceId}`,
      slots: { props, lookId: look.id, ...(words.length ? { words } : {}) },
      startSec,
      durationSec,
      trackIndex: freeGraphicsStackOrder(next, startSec, durationSec),
      box,
      label: (string(item.label) ?? look.pieces[pieceId]!.label).slice(0, 24),
    };
    const inserted = insertOverlayDocumentClip({ document: next, block, ...(string(item.trackId) ? { toTrackId: string(item.trackId)! } : {}) });
    if (!inserted.ok) return fail(inserted.error.message, inserted.error);
    next = inserted.document;
    receipts.push(...inserted.receipts);
    if (anchor) {
      next = {
        ...next,
        timeline: {
          ...next.timeline,
          tracks: next.timeline.tracks.map((track) => ({
            ...track,
            clips: track.clips.map((clip) => (clip.id === id ? { ...clip, anchor: anchor as TimelineAnchor } : clip)),
          })),
        },
      };
    }
    clipIds.push(id);
  }
  return mutation(next, `Placed ${clipIds.length} graphic${clipIds.length === 1 ? '' : 's'}`, receipts, { clipIds });
}

const HANDOFF_KINDS = new Set(['fact', 'music', 'voice']);

export function setConfirmListV3(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const rows = Array.isArray(input.items) ? (input.items as Input[]) : null;
  if (!rows) return fail('missing_field', { path: 'items', fix: 'Pass items: [{ kind: "fact" | "music" | "voice", text, ref? }]; an empty list clears it.' });
  const previous = new Map((document.semantics.handoff ?? []).map((item) => [item.id, item]));
  const items: HandoffItem[] = [];
  for (const [index, raw] of rows.slice(0, 30).entries()) {
    const row = (raw ?? {}) as Input;
    const text = string(row.text);
    const kind = string(row.kind) ?? 'fact';
    if (!text) return fail('missing_field', { path: `items[${index}].text`, fix: 'What the creator should confirm, in their language.' });
    if (!HANDOFF_KINDS.has(kind)) return fail('invalid_value', { path: `items[${index}].kind`, value: kind, fix: 'fact, music or voice.' });
    const id = string(row.id) ?? `confirm-${index + 1}`;
    // An item the creator already answered keeps its answer when the agent rewrites the list.
    const kept = previous.get(id);
    items.push({
      id,
      kind: kind as HandoffItem['kind'],
      text: text.slice(0, 400),
      ...(string(row.ref) ? { ref: string(row.ref)!.slice(0, 120) } : {}),
      status: kept?.status ?? 'open',
      ...(kept?.answer ? { answer: kept.answer } : {}),
    });
  }
  const semantics = { ...document.semantics };
  if (items.length) semantics.handoff = items;
  else delete semantics.handoff;
  return mutation({ ...document, semantics }, items.length ? `Confirm list: ${items.length} item(s)` : 'Confirm list cleared', [], { items: items.map(({ id, kind, status }) => ({ id, kind, status })) });
}
