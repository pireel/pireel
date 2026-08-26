import type { AudioClip } from '@pireel/studio-engine/composition';
import { materializeRemoteMedia, type MaterializedRemoteMedia } from './remote-media';

export type AudioExportEntry = { clip: AudioClip; file: File };
type AudioMaterializer = (
  url: string,
  options: { name?: string; type?: string; sig?: string | null },
) => Promise<MaterializedRemoteMedia>;

const exportFileKey = (clip: AudioClip): string => clip.sig ?? clip.src;

/** Resolve every audible timeline clip to bytes before export. Preview can stream a remote URL,
 * but the offline mixer requires a File; silently omitting an unresolved clip creates a valid yet
 * unexpectedly silent video, so missing audible media is an export error. */
export async function audioExportPayload(
  clips: readonly AudioClip[],
  files: Map<string, File>,
  materialize: AudioMaterializer = materializeRemoteMedia,
): Promise<AudioExportEntry[] | null> {
  const out: AudioExportEntry[] = [];
  for (const clip of clips) {
    if (clip.muted) continue;
    const key = exportFileKey(clip);
    let file = files.get(key) ?? (clip.sig ? files.get(clip.sig) : undefined);
    if (!file && !clip.src.startsWith('blob:')) {
      const resolved = await materialize(clip.src, {
        name: clip.label || 'audio',
        type: 'audio/mpeg',
        sig: clip.sig,
      });
      file = resolved.file;
      files.set(key, file);
      files.set(resolved.sig, file);
    }
    if (file) {
      out.push({ clip, file });
      continue;
    }
    throw new Error(`Audio clip ${clip.label || clip.id} is unavailable for export`);
  }
  return out.length ? out : null;
}
