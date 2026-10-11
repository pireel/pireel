'use client';

/**
 * "Export for other editors": one ZIP the creator unpacks and opens in Premiere Pro, DaVinci Resolve
 * or Final Cut Pro to keep editing. It holds the timeline (xmeml for Premiere/Resolve, FCPXML for
 * Final Cut/Resolve), every media file it uses, each graphic rendered as a transparent movie, the
 * captions as subtitles, and a README saying how to open it and what did not carry over.
 *
 * Paths inside the package are ASCII (archive tools disagree on non-ASCII names). The timelines point
 * at a fixed folder — /Users/Shared/Pireel/<folder>/ on a Mac, C:\Pireel\<folder>\ on Windows — so
 * unpacking there links everything at once; anywhere else, one "locate" relinks the rest.
 */

import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import type { Composition, EditorDocumentV2, EditorMediaAsset } from '@pireel/studio-engine/composition';
import { editorDocumentRenderPlan } from '@pireel/studio-engine/editor-document/render-plan';
import { buildNleTimeline, nleAssetName, toFcpxml, toSrt, toXmeml, type NleMediaFile, type NleNote, type SubtitleCue } from '@pireel/studio-engine/nle-export/index';
import { renderGraphicFramesPng } from './client-export';
import { writeMovPng } from './mov-png-writer';
import { zipStore, type ZipEntry } from './zip-store';
import { t } from './i18n';

export type NleExportStage = 'media' | 'graphics' | 'package';

export interface NlePackageInput {
  document: EditorDocumentV2;
  comp: Composition;
  /** The project's name, shown as the sequence name in the other editor. */
  title: string;
  /** An asset's bytes, wherever they live (local or cloud); null = unavailable. */
  assetFile: (asset: EditorMediaAsset) => Promise<File | null>;
  /** Captions as shown (empty when captions are off), and their translation when there is one. */
  captions: SubtitleCue[];
  translatedCaptions?: SubtitleCue[];
  onProgress?: (stage: NleExportStage, done: number, total: number) => void;
  shouldCancel?: () => boolean;
}

export interface NlePackage {
  blob: Blob;
  fileName: string;
  notes: NleNote[];
}

export class NleExportCanceled extends Error {
  constructor() {
    super('export canceled');
  }
}

const EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-matroska': 'mkv',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/webm': 'webm',
  'image/png': 'png', 'image/jpeg': 'jpg',
};

/** Lowercase ASCII words of a label, for file names inside the package. */
function slug(value: string | undefined, fallback: string): string {
  const ascii = (value ?? '').normalize('NFKD').replace(/[^\x20-\x7e]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return ascii || fallback;
}

function extensionOf(file: File, kind: EditorMediaAsset['kind']): string {
  const byType = EXTENSIONS[file.type.toLowerCase()];
  if (byType) return byType;
  const byName = /\.([a-z0-9]{2,4})$/i.exec(file.name)?.[1]?.toLowerCase();
  if (byName) return byName;
  return kind === 'audio' ? 'm4a' : kind === 'image' ? 'png' : 'mp4';
}

/** Other editors read PNG and JPEG everywhere; anything else (WebP, AVIF, GIF) becomes a PNG. */
async function editorFriendlyImage(file: File): Promise<File> {
  if (file.type === 'image/png' || file.type === 'image/jpeg') return file;
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((out) => (out ? resolve(out) : reject(new Error('PNG encoding failed'))), 'image/png'));
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' });
  } finally {
    bitmap.close();
  }
}

/** Duration, pixel size and sound of a file, for assets whose metadata the document lacks. */
async function probe(file: File): Promise<Pick<NleMediaFile, 'durationSec' | 'width' | 'height' | 'hasAudio'>> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    return {
      durationSec: await input.computeDuration(),
      ...(video ? { width: video.displayWidth, height: video.displayHeight } : {}),
      hasAudio: !!audio,
    };
  } catch {
    return {};
  } finally {
    input.dispose();
  }
}

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

export async function buildNlePackage(input: NlePackageInput): Promise<NlePackage> {
  const { document: doc, comp } = input;
  const cancelCheck = () => { if (input.shouldCancel?.()) throw new NleExportCanceled(); };
  const now = new Date();
  const folder = `Pireel-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const entries: ZipEntry[] = [];

  // 1. Media: every asset a clip uses, under an ASCII name.
  const plan = editorDocumentRenderPlan(doc);
  const used = new Map<string, EditorMediaAsset>();
  for (const track of plan.tracks) for (const entry of track.clips) if (entry.asset) used.set(entry.asset.id, entry.asset);
  const files = new Map<string, NleMediaFile>();
  let index = 0;
  for (const asset of used.values()) {
    cancelCheck();
    index += 1;
    input.onProgress?.('media', index - 1, used.size);
    let file = await input.assetFile(asset).catch(() => null);
    if (!file) continue;
    if (asset.kind === 'image') file = await editorFriendlyImage(file);
    const path = `media/${pad(index)}-${slug(nleAssetName(asset, ''), asset.kind)}.${extensionOf(file, asset.kind)}`;
    const needsProbe = asset.kind !== 'image' && (asset.metadata.durationSec === undefined || (asset.kind === 'video' && !asset.metadata.width));
    files.set(asset.id, { path, ...(needsProbe ? await probe(file) : {}) });
    entries.push({ path: `${folder}/${path}`, data: file });
  }
  input.onProgress?.('media', used.size, used.size);

  // 2. Graphics: each graphic clip alone, as a transparent full-frame movie.
  const graphicPaths = new Map<string, string>();
  const jobs = plan.tracks.flatMap((track) => track.clips.flatMap((entry) => (
    entry.clip.kind === 'graphic' && comp.blocks.some((block) => block.id === entry.clipId)
      ? [{ blockId: entry.clipId, startSec: entry.startSec, durationSec: entry.durationSec, label: entry.clip.block.label }]
      : []
  )));
  if (jobs.length) {
    let graphicIndex = 0;
    await renderGraphicFramesPng({
      comp,
      jobs,
      fps: doc.canvas.fps,
      shouldCancel: input.shouldCancel,
      onProgress: (done, total) => input.onProgress?.('graphics', done, total),
      onGraphic: (blockId, frames) => {
        graphicIndex += 1;
        const job = jobs.find((candidate) => candidate.blockId === blockId);
        const path = `graphics/${pad(graphicIndex)}-${slug(job?.label, 'graphic')}.mov`;
        entries.push({ path: `${folder}/${path}`, data: new Blob([writeMovPng(frames, { width: comp.width, height: comp.height, fps: doc.canvas.fps })], { type: 'video/quicktime' }) });
        graphicPaths.set(blockId, path);
      },
    }).catch((error) => {
      if (input.shouldCancel?.()) throw new NleExportCanceled();
      throw error;
    });
  }
  cancelCheck();

  // 3. Timelines, subtitles and the README.
  input.onProgress?.('package', 0, 1);
  const timeline = buildNleTimeline(doc, {
    name: input.title,
    mediaFile: (asset) => files.get(asset.id) ?? null,
    graphicFile: (clipId) => graphicPaths.get(clipId) ?? null,
  });
  const macRoot = `file:///Users/Shared/Pireel/${folder}/`;
  const windowsRoot = `file://localhost/C:/Pireel/${folder}/`;
  entries.push(
    { path: `${folder}/premiere-davinci-mac.xml`, data: toXmeml(timeline, { rootUrl: macRoot }) },
    { path: `${folder}/premiere-davinci-windows.xml`, data: toXmeml(timeline, { rootUrl: windowsRoot }) },
    { path: `${folder}/final-cut-pro.fcpxml`, data: toFcpxml(timeline, { rootUrl: macRoot }) },
  );
  if (input.captions.length) entries.push({ path: `${folder}/subtitles/captions.srt`, data: toSrt(input.captions) });
  if (input.translatedCaptions?.length) entries.push({ path: `${folder}/subtitles/captions-translation.srt`, data: toSrt(input.translatedCaptions) });
  entries.push({ path: `${folder}/README.txt`, data: `\ufeff${readme(folder, timeline.notes, graphicPaths.size > 0, input.captions.length > 0)}` });

  const blob = await zipStore(entries, now);
  input.onProgress?.('package', 1, 1);
  return { blob, fileName: `${input.title.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Pireel'}-${folder.slice(7)}.zip`, notes: timeline.notes };
}

function readme(folder: string, notes: readonly NleNote[], hasGraphics: boolean, hasCaptions: boolean): string {
  const lines = [
    t('nleExport.readmeTitle'),
    '',
    t('nleExport.readmeContents'),
    `  premiere-davinci-mac.xml / premiere-davinci-windows.xml — ${t('nleExport.readmeXmeml')}`,
    `  final-cut-pro.fcpxml — ${t('nleExport.readmeFcpxml')}`,
    `  media/ — ${t('nleExport.readmeMedia')}`,
    ...(hasGraphics ? [`  graphics/ — ${t('nleExport.readmeGraphics')}`] : []),
    ...(hasCaptions ? [`  subtitles/ — ${t('nleExport.readmeSubtitles')}`] : []),
    '',
    t('nleExport.readmeWhere', { mac: `/Users/Shared/Pireel/${folder}/`, windows: `C:\\Pireel\\${folder}\\` }),
    '',
    t('nleExport.readmePremiere'),
    t('nleExport.readmeResolve'),
    t('nleExport.readmeFinalCut'),
    ...(hasCaptions ? [t('nleExport.readmeCaptions')] : []),
    '',
    t('nleExport.readmeNotesTitle'),
    ...(hasGraphics ? [`- ${t('nleExport.readmeGraphicsFinalCut')}`] : []),
    ...notes.map((note) => `- ${t(`nleExport.note.${note.code.replace(/-/g, '_')}`)}${note.items?.length ? `: ${note.items.join(', ')}` : ''}`),
  ];
  return lines.join('\r\n') + '\r\n';
}
