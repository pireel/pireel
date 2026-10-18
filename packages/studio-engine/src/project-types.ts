/** Shared local document metadata. Server save/replay protocols belong to the hosted product. */
import type {WordMask} from './word-masks';
import type {WordDecoration} from './build-blocks';
export type {LocalAssetIndexEntry} from './project-context';
export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  /** Per-word replacements keyed by word index (see word-masks.ts). */
  masks?: Record<string, WordMask>;
  /** Selected-word caption highlights and animations, keyed by source word index. */
  wordDecorations?: Record<string, WordDecoration>;
  /** Spoken language of this sentence (provider-reported or script-detected). */
  lang?: string;
  /** Speaker id (diarization; absent = single speaker / not enabled). */
  speaker?: string;
  words?: { text: string; start: number; end: number; emphasis?: boolean; timing?: 'estimated' }[];
  /** Bilingual whole-sentence translation (shows only when the sentence maps to a single display cue). */
  sub?: string;
  /** Per-cue translations keyed by word range "w0:w1" (UI translate flow / set_caption_translations with a range). */
  cueSubs?: Record<string, string>;
  /** Audience-facing full caption copy after manual cue edits; source transcript text stays unchanged. */
  captionText?: string;
  /** User-locked cue copy keyed by the source word range "w0:w1". */
  cueTexts?: Record<string, string>;
  /** Selected display-word positions per source cue range; independent of immutable ASR tokens. */
  cueEmphasis?: Record<string, { text: string; words: number[] }>;
  /** Stable display-cue boundaries encoded as source word ranges "w0:w1". */
  cueLayout?: string[];
  /** Provisional timing derived from an exact script (TTS text) — no ASR has measured it yet. Once
   *  measured, the script text stays and only the timing changes (script-alignment.ts). */
  scripted?: boolean;
  /** Target language sub/cueSubs were translated into (unset = unknown/legacy — displayed as-is). */
  subLang?: string;
  /** Short-lived extraction-cueing scheme flag (desegmentCues merges these back into sentences on load). */
  cue?: boolean;
}
export interface ProjectCloudMediaIndex {
  video?: { sig: string; key: string };
  clips?: Record<string, { key: string }>;
}
