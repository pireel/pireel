import confirmation_001 from './sfx-library-assets/confirmation_001.wav?url';
import confirmation_002 from './sfx-library-assets/confirmation_002.wav?url';
import confirmation_003 from './sfx-library-assets/confirmation_003.wav?url';
import confirmation_004 from './sfx-library-assets/confirmation_004.wav?url';
import glass_001 from './sfx-library-assets/glass_001.wav?url';
import glass_002 from './sfx-library-assets/glass_002.wav?url';
import glass_003 from './sfx-library-assets/glass_003.wav?url';
import glass_004 from './sfx-library-assets/glass_004.wav?url';
import pluck_001 from './sfx-library-assets/pluck_001.wav?url';
import pluck_002 from './sfx-library-assets/pluck_002.wav?url';
import open_001 from './sfx-library-assets/open_001.wav?url';
import open_002 from './sfx-library-assets/open_002.wav?url';
import close_001 from './sfx-library-assets/close_001.wav?url';
import close_002 from './sfx-library-assets/close_002.wav?url';
import maximize_001 from './sfx-library-assets/maximize_001.wav?url';
import maximize_003 from './sfx-library-assets/maximize_003.wav?url';
import maximize_006 from './sfx-library-assets/maximize_006.wav?url';
import minimize_001 from './sfx-library-assets/minimize_001.wav?url';
import minimize_003 from './sfx-library-assets/minimize_003.wav?url';
import minimize_006 from './sfx-library-assets/minimize_006.wav?url';
import click_001 from './sfx-library-assets/click_001.wav?url';
import drop_001 from './sfx-library-assets/drop_001.wav?url';
import drop_002 from './sfx-library-assets/drop_002.wav?url';
import drop_003 from './sfx-library-assets/drop_003.wav?url';
import question_001 from './sfx-library-assets/question_001.wav?url';
import question_002 from './sfx-library-assets/question_002.wav?url';
import back_003 from './sfx-library-assets/back_003.wav?url';
import select_003 from './sfx-library-assets/select_003.wav?url';
import select_004 from './sfx-library-assets/select_004.wav?url';
import switch_001 from './sfx-library-assets/switch_001.wav?url';
import switch_003 from './sfx-library-assets/switch_003.wav?url';
import bong_001 from './sfx-library-assets/bong_001.wav?url';
import { sfxPackUrl, type SfxSoundId } from '@pireel/studio-engine/sfx-library';
/** Bundled interface cues; the short-video pack is hosted (sfxPackUrl). */
export const SFX_LIBRARY_URLS: Partial<Record<SfxSoundId, string>> = {
  'confirmation-001': confirmation_001,
  'confirmation-002': confirmation_002,
  'confirmation-003': confirmation_003,
  'confirmation-004': confirmation_004,
  'glass-001': glass_001,
  'glass-002': glass_002,
  'glass-003': glass_003,
  'glass-004': glass_004,
  'pluck-001': pluck_001,
  'pluck-002': pluck_002,
  'open-001': open_001,
  'open-002': open_002,
  'close-001': close_001,
  'close-002': close_002,
  'maximize-001': maximize_001,
  'maximize-003': maximize_003,
  'maximize-006': maximize_006,
  'minimize-001': minimize_001,
  'minimize-003': minimize_003,
  'minimize-006': minimize_006,
  'click-001': click_001,
  'drop-001': drop_001,
  'drop-002': drop_002,
  'drop-003': drop_003,
  'question-001': question_001,
  'question-002': question_002,
  'back-003': back_003,
  'select-003': select_003,
  'select-004': select_004,
  'switch-001': switch_001,
  'switch-003': switch_003,
  'bong-001': bong_001,
};

import { decodeAudioFile, toMono } from './audio-decode';
const cache = new Map<string, Float32Array>();
export async function loadSfxLibrarySound(id: SfxSoundId, signal: AbortSignal) {
  signal.throwIfAborted();
  const cached = cache.get(id); if (cached) return cached;
  const url = SFX_LIBRARY_URLS[id] ?? sfxPackUrl(id); if (!url) throw new Error('音效资源不存在。');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('音效资源加载失败，请重试。');
  const pcm = await toMono(await decodeAudioFile(await response.blob()), 48000); signal.throwIfAborted();
  cache.set(id, pcm); return pcm;
}
