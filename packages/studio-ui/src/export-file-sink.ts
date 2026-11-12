'use client';

/**
 * Where an export's file goes while it is encoded.
 *
 * A finished video used to be assembled in memory and handed over at the end: a 45-minute 1080p
 * export held about 2 GB while encoding and 4–5 GB at the end (measured in Chrome), which fills a
 * tab. Here the muxer writes straight to a file, so memory stays flat whatever the length:
 *
 *   chosen   a file the user picked in the save dialog — written in place, nothing to download
 *   private  a file in the browser's private storage — returned as a disk-backed File to download
 *   memory   no writable file storage in this browser: assembled in memory, as before
 *
 * A private file lives until its export is released (`releaseExportFile`) or, failing that, a day.
 */

import { BufferTarget, StreamTarget, type StreamTargetChunk, type Target } from 'mediabunny';

export interface ExportFileSink {
  target: Target;
  /** The file goes to disk as it is encoded (so the muxer must not hold it back for an index). */
  streamed: boolean;
  /** Close the file and return it. */
  finish(): Promise<Blob>;
  /** Drop what was written: the export failed or was cancelled. */
  discard(): Promise<void>;
}

const EXPORT_DIR = 'exports';
const STALE_MS = 24 * 60 * 60 * 1000;

/** Private files behind finished exports, and how to remove each. */
const privateFiles = new WeakMap<Blob, () => Promise<void>>();
/** Finished exports that already sit in the file the user chose. */
const chosenFiles = new WeakSet<Blob>();

/** True when this export was written to the file the user picked: there is nothing left to download. */
export function exportSavedToChosenFile(blob: Blob): boolean {
  return chosenFiles.has(blob);
}

/** The export is no longer needed (replaced by a newer one, project closed): free its private file. */
export function releaseExportFile(blob: Blob | null | undefined): void {
  if (!blob) return;
  const remove = privateFiles.get(blob);
  if (!remove) return;
  privateFiles.delete(blob);
  void remove().catch(() => {});
}

/** A kept export can lose its file (the user moved it, another tab cleared old exports). */
export async function exportFileReadable(blob: Blob): Promise<boolean> {
  try {
    await blob.slice(0, 1).arrayBuffer();
    return true;
  } catch {
    return false;
  }
}

const canWriteFiles = () =>
  typeof FileSystemFileHandle !== 'undefined' && typeof FileSystemFileHandle.prototype.createWritable === 'function';

/** The muxer's writes, each at its own position, onto a file. */
function fileTarget(writable: FileSystemWritableFileStream): Target {
  return new StreamTarget(
    new WritableStream<StreamTargetChunk>({
      write: (chunk) => writable.write(chunk),
    }),
    { chunked: true },
  );
}

async function privateDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory || !canWriteFiles()) return null;
    return await (await navigator.storage.getDirectory()).getDirectoryHandle(EXPORT_DIR, { create: true });
  } catch {
    return null;
  }
}

/** Exports nobody released (a closed tab, a crash) are removed after a day. */
async function clearStalePrivateFiles(directory: FileSystemDirectoryHandle): Promise<void> {
  try {
    const names = (directory as unknown as { keys?: () => AsyncIterable<string> }).keys?.();
    if (!names) return;
    const cutoff = Date.now() - STALE_MS;
    for await (const name of names) {
      try {
        const file = await (await directory.getFileHandle(name)).getFile();
        if (file.lastModified < cutoff) await directory.removeEntry(name);
      } catch { /* in use, or already gone */ }
    }
  } catch { /* housekeeping only */ }
}

async function chosenFileSink(handle: FileSystemFileHandle): Promise<ExportFileSink | null> {
  let writable: FileSystemWritableFileStream;
  let createdHere = false;
  try {
    // The save dialog creates the file when the name is new; an empty file is ours to remove again.
    createdHere = (await handle.getFile()).size === 0;
    writable = await handle.createWritable();
  } catch {
    return null;
  }
  return {
    target: fileTarget(writable),
    streamed: true,
    finish: async () => {
      await writable.close();
      const file = await handle.getFile();
      chosenFiles.add(file);
      return file;
    },
    discard: async () => {
      // Aborting leaves the file as it was before the export; a file the dialog just created goes too.
      await writable.abort().catch(() => {});
      if (createdHere) await (handle as FileSystemFileHandle & { remove?: () => Promise<void> }).remove?.().catch(() => {});
    },
  };
}

async function privateFileSink(mime: string, extension: string): Promise<ExportFileSink | null> {
  const directory = await privateDirectory();
  if (!directory) return null;
  void clearStalePrivateFiles(directory);
  const name = `export-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  let writable: FileSystemWritableFileStream;
  let handle: FileSystemFileHandle;
  try {
    handle = await directory.getFileHandle(name, { create: true });
    writable = await handle.createWritable();
  } catch {
    await directory.removeEntry(name).catch(() => {});
    return null;
  }
  const remove = () => directory.removeEntry(name);
  return {
    target: fileTarget(writable),
    streamed: true,
    finish: async () => {
      await writable.close();
      const stored = await handle.getFile();
      // Same bytes on disk, with the type the caller asked for (uploads and downloads read it).
      const file = stored.type === mime ? stored : new File([stored], name, { type: mime, lastModified: stored.lastModified });
      privateFiles.set(file, remove);
      return file;
    },
    discard: async () => {
      await writable.abort().catch(() => {});
      await remove().catch(() => {});
    },
  };
}

function memorySink(mime: string): ExportFileSink {
  const target = new BufferTarget();
  return {
    target,
    streamed: false,
    finish: async () => new Blob([target.buffer!], { type: mime }),
    discard: async () => {},
  };
}

/**
 * Open the file an export is written to: the one the user chose when given, else a private file,
 * else memory. A chosen file that cannot be written (permission gone) falls through the same way,
 * and `exportSavedToChosenFile` then says the result still has to be downloaded.
 */
export async function openExportFileSink(options: { mime: string; extension: string; saveTo?: FileSystemFileHandle | null }): Promise<ExportFileSink> {
  const chosen = options.saveTo && canWriteFiles() ? await chosenFileSink(options.saveTo) : null;
  return chosen ?? (await privateFileSink(options.mime, options.extension)) ?? memorySink(options.mime);
}

/**
 * Room for the index of a streamed MP4/MOV, reserved before the first sample: the most packets a
 * track of this length can hold. AAC packs 1024 samples a packet at up to 48 kHz; the margin covers
 * encoder priming and padding at joins. Exceeding it fails the export, so it errs high — each spare
 * packet costs a few dozen bytes of padding.
 */
export const exportVideoPacketLimit = (frames: number) => frames + 64;
export const exportAudioPacketLimit = (durationSec: number) => Math.ceil((Math.max(0, durationSec) * 48000) / 1024 * 1.5) + 1024;
